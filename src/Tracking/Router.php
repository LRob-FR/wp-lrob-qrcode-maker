<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\Tracking;

use LRob\QRCodeMaker\Activator;
use LRob\QRCodeMaker\Library\Repository;

/**
 * Public scan-tracking redirect. A QR with tracking on encodes the URL
 *   {home_url}/{tracking_path}/{slug}
 * Hitting that path looks the QR up, anonymises + logs the visitor, and
 * 302s to the real target. If tracking is off for a QR, no row exists →
 * the path 404s (which is fine — the QR was encoded with the direct URL
 * in the first place).
 *
 * Implementation uses a rewrite rule + query var (`lrob_qrm_slug`) so the
 * URL is canonical and crawlable. The rule is registered on `init`; flushed
 * once on plugin activation (and again when the tracking path setting
 * changes — see SettingsPage::maybe_save).
 */
final class Router
{
    public const QUERY_VAR = 'lrob_qrm_slug';

    public function register(): void
    {
        add_action('init', [$this, 'register_rewrite']);
        add_filter('query_vars', [$this, 'register_query_var']);
        add_action('template_redirect', [$this, 'maybe_redirect']);
    }

    public function register_rewrite(): void
    {
        $path = $this->tracking_path();
        add_rewrite_rule(
            '^' . preg_quote($path, '#') . '/([a-z0-9]{1,32})/?$',
            'index.php?' . self::QUERY_VAR . '=$matches[1]',
            'top'
        );
    }

    public function register_query_var(array $vars): array
    {
        $vars[] = self::QUERY_VAR;
        return $vars;
    }

    public function maybe_redirect(): void
    {
        $slug = (string) get_query_var(self::QUERY_VAR);
        if ($slug === '') {
            return;
        }

        $row = (new Repository())->find_by_slug($slug);
        if ($row === null || empty($row['target_url'])) {
            status_header(404);
            nocache_headers();
            return;
        }

        // Only log the scan when tracking is on for the QR. Bots requesting
        // the slug while tracking is off would otherwise inflate the table.
        if (!empty($row['tracking_enabled'])) {
            (new Repository())->log_scan(
                (int) $row['id'],
                self::anonymize_ip(self::client_ip()),
                self::short_ua((string) ($_SERVER['HTTP_USER_AGENT'] ?? '')),
                self::short_referer((string) ($_SERVER['HTTP_REFERER'] ?? ''))
            );
        }

        $target = (string) $row['target_url'];
        // Bare strings (vCard, plain text, etc.) shouldn't trip the redirect —
        // a tracked QR only makes sense for an http(s) target. Fall through
        // to a generic landing page if not a URL.
        if (!preg_match('#^https?://#i', $target)) {
            status_header(200);
            nocache_headers();
            echo '<!doctype html><meta charset="utf-8"><title>QR target</title><pre>'
                . esc_html($target) . '</pre>';
            exit;
        }

        nocache_headers();
        wp_redirect(esc_url_raw($target), 302);
        exit;
    }

    private function tracking_path(): string
    {
        $settings = get_option(Activator::OPTION_SETTINGS, []);
        $path = isset($settings['tracking_path']) ? (string) $settings['tracking_path'] : 'qr';
        $path = preg_replace('/[^a-z0-9-]/', '', strtolower($path)) ?: 'qr';
        return $path;
    }

    private static function client_ip(): string
    {
        $candidates = [
            $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
            $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '',
            $_SERVER['REMOTE_ADDR']           ?? '',
        ];
        foreach ($candidates as $raw) {
            if (!is_string($raw) || $raw === '') {
                continue;
            }
            $first = trim(explode(',', $raw)[0]);
            if (filter_var($first, FILTER_VALIDATE_IP)) {
                return $first;
            }
        }
        return '';
    }

    /**
     * Truncate v4 to /24 and v6 to /48 — enough for "rough geography" while
     * not personally identifiable on its own.
     */
    private static function anonymize_ip(string $ip): string
    {
        if ($ip === '') {
            return '';
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $parts = explode('.', $ip);
            $parts[3] = '0';
            return implode('.', $parts);
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $expanded = inet_ntop(inet_pton($ip) ?: '');
            if (!is_string($expanded)) {
                return '';
            }
            $blocks = explode(':', $expanded);
            // Keep first 3 hextets (/48), zero the rest.
            for ($i = 3; $i < count($blocks); $i++) {
                $blocks[$i] = '0';
            }
            return implode(':', $blocks);
        }
        return '';
    }

    private static function short_ua(string $ua): string
    {
        $ua = trim($ua);
        return substr($ua, 0, 120);
    }

    private static function short_referer(string $ref): string
    {
        if ($ref === '') {
            return '';
        }
        $parts = wp_parse_url($ref);
        if (!is_array($parts) || empty($parts['host'])) {
            return '';
        }
        return substr((string) $parts['host'], 0, 255);
    }
}
