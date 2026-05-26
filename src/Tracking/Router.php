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
            wp_die(
                esc_html__('QR code not found.', 'lrob-qrcode-maker'),
                esc_html__('Not Found', 'lrob-qrcode-maker'),
                ['response' => 404]
            );
        }

        if (!empty($row['tracking_enabled'])) {
            (new Repository())->bump_scan_count((int) $row['id']);
        }

        $target = (string) $row['target_url'];

        // vCard payload (BEGIN:VCARD…END:VCARD) → serve as a downloadable .vcf
        // so the phone treats it as a contact file and prompts "Add to
        // Contacts" instead of rendering raw text in a browser tab. The
        // accent-handling fallback that motivated tracking for vCards.
        if (preg_match('#^BEGIN:VCARD#i', $target)) {
            nocache_headers();
            header('Content-Type: text/vcard; charset=utf-8');
            header('Content-Disposition: attachment; filename="contact.vcf"');
            header('Content-Length: ' . strlen($target));
            echo $target;
            exit;
        }

        // HTTP(S) target → 302 to the destination.
        if (preg_match('#^https?://#i', $target)) {
            nocache_headers();
            wp_redirect(esc_url_raw($target), 302);
            exit;
        }

        // Anything else is either a plain-text tracked QR or legacy data
        // from before we restricted tracking to url/text/vcard. Render a
        // minimal noindex landing page so search engines don't archive
        // private contact / Wi-Fi credentials harvested from old QRs.
        status_header(200);
        nocache_headers();
        echo '<!doctype html><html><head><meta charset="utf-8">'
            . '<meta name="robots" content="noindex,nofollow">'
            . '<title>' . esc_html__('QR target', 'lrob-qrcode-maker') . '</title>'
            . '</head><body><pre>' . esc_html($target) . '</pre></body></html>';
        exit;
    }

    private function tracking_path(): string
    {
        $settings = get_option(Activator::OPTION_SETTINGS, []);
        $path = isset($settings['tracking_path']) ? (string) $settings['tracking_path'] : 'qr';
        $path = preg_replace('/[^a-z0-9-]/', '', strtolower($path)) ?: 'qr';
        return $path;
    }

}
