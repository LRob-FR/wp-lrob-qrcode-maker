<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\AutoUpdate;

/**
 * Self-hosted plugin updater — surfaces GitHub releases as WordPress updates.
 *
 * Two filters do the work:
 *   1. pre_set_site_transient_update_plugins — when WP decides which plugins
 *      need updating, we hit the GitHub API, compare versions, and inject our
 *      entry if a newer release is published.
 *   2. plugins_api — the "View details" modal on the Plugins / Updates screens
 *      pulls release info from GitHub (changelog from the release body,
 *      formatted via a minimal Markdown → HTML conversion).
 *
 * The GitHub API response is cached in a 1-hour transient. On the Updates
 * page itself the cache is bypassed: the admin is there *because* they want
 * to know if there are updates, so we ask GitHub directly.
 *
 * No external library. Mirrors the wp-lrob-email-toolkit updater.
 */
final class Updater
{
    public const TRANSIENT_KEY      = 'lrob_qrm_gh_release';
    public const TRANSIENT_TTL      = HOUR_IN_SECONDS;
    public const TRANSIENT_TTL_FAIL = HOUR_IN_SECONDS;
    public const PLUGIN_SLUG        = 'lrob-qrcode-maker';

    public function register(): void
    {
        add_filter('pre_set_site_transient_update_plugins', [$this, 'check_for_update']);
        add_filter('plugins_api',                           [$this, 'plugin_info'], 10, 3);
    }

    /**
     * @param mixed $transient
     * @return mixed
     */
    public function check_for_update($transient)
    {
        if (empty($transient) || !is_object($transient)) {
            return $transient;
        }

        $release = $this->get_release();
        if ($release === null) {
            return $transient;
        }

        $remote_version = $this->normalize_version((string) ($release['tag_name'] ?? ''));
        if ($remote_version === '') {
            return $transient;
        }
        if (version_compare(LROB_QRM_VERSION, $remote_version, '>=')) {
            return $transient;
        }

        $zip_url = $this->find_asset_url($release);
        if ($zip_url === null) {
            // No zip asset attached — skip rather than pointing WP at the
            // GitHub-generated source tarball (commit-hash folder name →
            // installs side-by-side, doesn't replace).
            return $transient;
        }

        $update = (object) [
            'slug'         => self::PLUGIN_SLUG,
            'plugin'       => LROB_QRM_BASENAME,
            'new_version'  => $remote_version,
            'url'          => LROB_QRM_GITHUB_URL,
            'package'      => $zip_url,
            'tested'       => $this->tested_wp_version(),
            'requires_php' => '8.4',
            'icons'        => [],
            'banners'      => [],
        ];

        if (!isset($transient->response) || !is_array($transient->response)) {
            $transient->response = [];
        }
        $transient->response[LROB_QRM_BASENAME] = $update;
        return $transient;
    }

    /**
     * @param false|object|array $result
     * @param string             $action
     * @param object             $args
     * @return false|object|array
     */
    public function plugin_info($result, $action, $args)
    {
        if ($action !== 'plugin_information') {
            return $result;
        }
        if (!isset($args->slug) || $args->slug !== self::PLUGIN_SLUG) {
            return $result;
        }

        $release = $this->get_release();
        if ($release === null) {
            return $result;
        }

        $remote_version = $this->normalize_version((string) ($release['tag_name'] ?? ''));
        $zip_url        = $this->find_asset_url($release);

        return (object) [
            'name'          => 'LRob - QR Code Maker',
            'slug'          => self::PLUGIN_SLUG,
            'version'       => $remote_version,
            'author'        => '<a href="https://www.lrob.fr">LRob</a>',
            'homepage'      => defined('LROB_QRM_PLUGIN_URL') ? LROB_QRM_PLUGIN_URL : LROB_QRM_GITHUB_URL,
            'requires'      => '7.0',
            'requires_php'  => '8.4',
            'tested'        => $this->tested_wp_version(),
            'last_updated'  => (string) ($release['published_at'] ?? ''),
            'download_link' => (string) $zip_url,
            'sections'      => [
                'description' => __('Customizable QR codes for WordPress — public Gutenberg block for visitors, admin library with optional scan tracking.', 'lrob-qrcode-maker'),
                'changelog'   => $this->markdown_to_html((string) ($release['body'] ?? '')),
            ],
        ];
    }

    public static function flush_cache(): void
    {
        delete_transient(self::TRANSIENT_KEY);
    }

    /* ─── Internals ──────────────────────────────────────────────────── */

    /**
     * @return array<string, mixed>|null
     */
    private function get_release(): ?array
    {
        $force = $this->is_force_refresh();
        if (!$force) {
            $cached = get_transient(self::TRANSIENT_KEY);
            if ($cached === 'none') {
                return null;
            }
            if (is_array($cached) && !empty($cached)) {
                return $cached;
            }
        }

        $api_url = 'https://api.github.com/repos/' . $this->github_repo() . '/releases/latest';
        $response = wp_remote_get($api_url, [
            'timeout' => 8,
            'headers' => [
                'Accept'     => 'application/vnd.github+json',
                'User-Agent' => 'WordPress/' . get_bloginfo('version') . '; ' . home_url(),
            ],
        ]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            set_transient(self::TRANSIENT_KEY, 'none', self::TRANSIENT_TTL_FAIL);
            return null;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($body) || empty($body['tag_name'])) {
            set_transient(self::TRANSIENT_KEY, 'none', self::TRANSIENT_TTL_FAIL);
            return null;
        }

        set_transient(self::TRANSIENT_KEY, $body, self::TRANSIENT_TTL);
        return $body;
    }

    private function is_force_refresh(): bool
    {
        if (!is_admin()) {
            return false;
        }
        if (isset($_GET['force-check']) && (string) $_GET['force-check'] === '1') {
            return true;
        }
        $pagenow = $GLOBALS['pagenow'] ?? '';
        return $pagenow === 'update-core.php';
    }

    private function github_repo(): string
    {
        $url = defined('LROB_QRM_GITHUB_URL') ? LROB_QRM_GITHUB_URL : '';
        if (preg_match('#github\.com/([^/]+/[^/]+?)/?$#', $url, $m)) {
            return $m[1];
        }
        return 'LRob-FR/wp-lrob-qrcode-maker';
    }

    private function normalize_version(string $tag): string
    {
        return ltrim($tag, 'vV');
    }

    /**
     * Find the plugin zip on the release. release.sh produces
     * `lrob-qrcode-maker-<version>.zip`; admin uploads it as a release
     * asset with `gh release create`.
     *
     * @param array<string, mixed> $release
     */
    private function find_asset_url(array $release): ?string
    {
        $assets = $release['assets'] ?? [];
        if (!is_array($assets)) {
            return null;
        }
        foreach ($assets as $asset) {
            $name = (string) ($asset['name'] ?? '');
            $url  = (string) ($asset['browser_download_url'] ?? '');
            if ($url === '') {
                continue;
            }
            if (str_starts_with($name, self::PLUGIN_SLUG . '-') && str_ends_with($name, '.zip')) {
                return $url;
            }
        }
        return null;
    }

    private function tested_wp_version(): string
    {
        return get_bloginfo('version');
    }

    private function markdown_to_html(string $md): string
    {
        $md = trim($md);
        if ($md === '') {
            return '';
        }

        $html = esc_html($md);

        $html = (string) preg_replace('/^### (.+)$/m', '<h4>$1</h4>', $html);
        $html = (string) preg_replace('/^## (.+)$/m',  '<h3>$1</h3>', $html);
        $html = (string) preg_replace('/\*\*(.+?)\*\*/s', '<strong>$1</strong>', $html);
        $html = (string) preg_replace('/`([^`]+)`/', '<code>$1</code>', $html);
        $html = (string) preg_replace_callback(
            '/\[([^\]]+)\]\(([^)\s]+)\)/',
            static fn (array $m): string => '<a href="' . esc_url($m[2]) . '" target="_blank" rel="noopener">' . $m[1] . '</a>',
            $html
        );
        $html = (string) preg_replace_callback(
            '/(?:^- .+(?:\n|$))+/m',
            static function (array $m): string {
                $items = (string) preg_replace('/^- (.+)$/m', '<li>$1</li>', trim($m[0]));
                return '<ul>' . $items . '</ul>';
            },
            $html
        );
        $blocks = preg_split('/\n{2,}/', $html) ?: [];
        $blocks = array_map(static function (string $b): string {
            $b = trim($b);
            if ($b === '') {
                return '';
            }
            if (preg_match('/^<(h[1-6]|ul|ol|p|pre|blockquote)\b/i', $b)) {
                return $b;
            }
            return '<p>' . str_replace("\n", '<br>', $b) . '</p>';
        }, $blocks);
        return implode("\n", $blocks);
    }
}
