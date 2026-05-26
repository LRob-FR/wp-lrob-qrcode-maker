<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\Admin;

use LRob\QRCodeMaker\Activator;

/**
 * Registers the top-level "QR Codes" admin menu and its submenus.
 *
 * Submenu order matters for the inferred default page: WP picks the first
 * registered submenu as the destination for the top-level click, so we add
 * Library first.
 */
final class Menu
{
    public const PARENT_SLUG = 'lrob-qrm';

    public function register(): void
    {
        add_action('admin_menu', [$this, 'register_pages']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    public function register_pages(): void
    {
        $cap = Activator::CAPABILITY;

        add_menu_page(
            __('QR Codes', 'lrob-qrcode-maker'),
            __('QR Codes', 'lrob-qrcode-maker'),
            $cap,
            self::PARENT_SLUG,
            [LibraryPage::class, 'render'],
            'dashicons-camera-alt',
            58
        );

        add_submenu_page(
            self::PARENT_SLUG,
            __('QR Library', 'lrob-qrcode-maker'),
            __('Library', 'lrob-qrcode-maker'),
            $cap,
            self::PARENT_SLUG,
            [LibraryPage::class, 'render']
        );

        add_submenu_page(
            self::PARENT_SLUG,
            __('Settings', 'lrob-qrcode-maker'),
            __('Settings', 'lrob-qrcode-maker'),
            $cap,
            self::PARENT_SLUG . '-settings',
            [SettingsPage::class, 'render']
        );
    }

    public function enqueue(string $hook): void
    {
        if (!is_string($hook) || !str_contains($hook, self::PARENT_SLUG)) {
            return;
        }
        // wp.media (Media Library frame) for the logo picker — only loaded
        // on plugin pages, not site-wide.
        wp_enqueue_media();

        wp_enqueue_style(
            'lrob-qrm-admin',
            LROB_QRM_URL . 'admin/css/admin.css',
            [],
            self::asset_version('admin/css/admin.css')
        );
        // WP core's color picker (jQuery-based, admin pages). Single widget
        // exposing both hex and RGB inputs in a compact popover.
        wp_enqueue_style('wp-color-picker');
        wp_enqueue_script('wp-color-picker');

        wp_enqueue_script(
            'lrob-qrm-content-types',
            LROB_QRM_URL . 'assets/js/content-types.js',
            [],
            self::asset_version('assets/js/content-types.js'),
            true
        );
        wp_enqueue_script(
            'lrob-qrm-engine',
            LROB_QRM_URL . 'assets/js/qr-engine.js',
            ['lrob-qrm-content-types'],
            self::asset_version('assets/js/qr-engine.js'),
            true
        );
        wp_enqueue_script(
            'lrob-qrm-admin',
            LROB_QRM_URL . 'admin/js/admin.js',
            ['wp-i18n', 'media-upload', 'lrob-qrm-content-types', 'lrob-qrm-engine', 'wp-color-picker', 'jquery'],
            self::asset_version('admin/js/admin.js'),
            true
        );
        wp_enqueue_script(
            'qr-code-styling',
            LROB_QRM_URL . 'vendor/qr-code-styling/qr-code-styling.js',
            [],
            '1.9.2',
            true
        );
        $settings = get_option(\LRob\QRCodeMaker\Activator::OPTION_SETTINGS, []);
        $tracking_path = isset($settings['tracking_path']) ? (string) $settings['tracking_path'] : 'qr';

        wp_localize_script('lrob-qrm-admin', 'lrobQrmAdmin', [
            'restLibrary'    => esc_url_raw(rest_url('lrob-qrm/v1/library')),
            'nonce'          => wp_create_nonce('wp_rest'),
            'trackingBase'   => esc_url_raw(home_url('/' . $tracking_path . '/')),
            'exportDefaults' => [
                'size'   => (int) ($settings['default_export_size'] ?? 1024),
                'format' => (string) ($settings['default_export_format'] ?? 'webp'),
            ],
            'contentTypes'   => \LRob\QRCodeMaker\Support\ContentTypes::definitions(),
            'lrobPromos'     => self::lrob_promo_messages(),
            'i18n'        => [
                'confirmDelete' => __('Delete this QR code? This cannot be undone.', 'lrob-qrcode-maker'),
                'cardTarget'      => __('Target', 'lrob-qrcode-maker'),
                'cardTrackingUrl' => __('Tracking URL', 'lrob-qrcode-maker'),
                'cardScansLabel'  => __('Scans', 'lrob-qrcode-maker'),
                /* translators: %d: number of scans */
                'cardScanSingular'=> __('%d scan', 'lrob-qrcode-maker'),
                /* translators: %d: number of scans */
                'cardScansPlural' => __('%d scans', 'lrob-qrcode-maker'),
                'cardTracking'    => __('Tracking', 'lrob-qrcode-maker'),
                'cardOff'         => __('Off', 'lrob-qrcode-maker'),
                'cardExport'      => __('Generate image', 'lrob-qrcode-maker'),
                'cardEdit'        => __('Edit', 'lrob-qrcode-maker'),
                'cardDelete'      => __('Delete', 'lrob-qrcode-maker'),
                'saving'        => __('Saving…', 'lrob-qrcode-maker'),
                'saved'         => __('Saved', 'lrob-qrcode-maker'),
                'error'         => __('Error', 'lrob-qrcode-maker'),
                'pickLogo'      => __('Pick logo from Media Library', 'lrob-qrcode-maker'),
                'changeLogo'    => __('Change logo', 'lrob-qrcode-maker'),
                'removeLogo'    => __('Remove logo', 'lrob-qrcode-maker'),
                'mediaTitle'    => __('Choose a logo image', 'lrob-qrcode-maker'),
                'mediaButton'   => __('Use this logo', 'lrob-qrcode-maker'),
                'trackingHint'  => __('Slug allocated on save', 'lrob-qrcode-maker'),
                'saveDirty'     => __('Unsaved changes', 'lrob-qrcode-maker'),
                'saveSaving'    => __('Saving…', 'lrob-qrcode-maker'),
                /* translators: %d is the number of seconds since last save. */
                'saveSaved'     => __('Saved %ds ago', 'lrob-qrcode-maker'),
                'saveSavedNow'  => __('Saved just now', 'lrob-qrcode-maker'),
                'saveError'     => __('Save failed', 'lrob-qrcode-maker'),
                'saveErrorOnExit' => __('The QR code could not be saved. Exit anyway?', 'lrob-qrcode-maker'),
                /* translators: JS template tokens (not sprintf): {m} = module side count, {b} = encoded byte length, {e} = effective EC level (L/M/Q/H). */
                'statsTemplate'  => __('{m}×{m} modules · {b} bytes · EC {e}', 'lrob-qrcode-maker'),
                /* translators: JS template tokens: {lw}×{lh} = logo size in QR modules, {lp} = actual coverage % of QR area. Leading separator part of the format. */
                'statsLogoSuffix' => __(' · Logo {lw}×{lh} ({lp}%)', 'lrob-qrcode-maker'),
                'statsDensityWarn'       => __('Past ~512 bytes the QR gets dense — print it large (≥ 4 cm) for reliable scans, especially at high error correction.', 'lrob-qrcode-maker'),
                'statsLengthWarn'        => __('Past ~1024 bytes the QR may be unscannable on many phones — shorten the content for reliable scans.', 'lrob-qrcode-maker'),
                'statsLengthWarnVcardSuffix' => __('Tick Tracking above — the QR will then encode a short /qr/… URL and the contact card will be served as a downloadable .vcf file (works on every scanner).', 'lrob-qrcode-maker'),
                'statsOverflow'  => __('Content too large to encode as a QR (max 2953 bytes at EC L). Shorten the content.', 'lrob-qrcode-maker'),
            ],
        ]);
        wp_set_script_translations('lrob-qrm-admin', 'lrob-qrcode-maker');
    }

    /**
     * Marketing message pool for the LRob promo strip in the admin (Library +
     * Settings pages). One item is picked at random on page load and the strip
     * auto-rotates through them. Each message has a different anchor keyword
     * so the backlink carries varied SEO weight rather than a single phrase.
     *
     * @return array<int, array{icon:string, text:string, link:string}>
     */
    private static function lrob_promo_messages(): array
    {
        return [
            [
                'icon' => '⚡',
                'text' => __('Your website is too slow?', 'lrob-qrcode-maker'),
                'link' => __('Get the fastest WordPress hosting', 'lrob-qrcode-maker'),
            ],
            [
                'icon' => '🏢',
                'text' => __('Managing multiple websites?', 'lrob-qrcode-maker'),
                'link' => __('Centralized WordPress hosting for agencies', 'lrob-qrcode-maker'),
            ],
            [
                'icon' => '🧑‍💼',
                'text' => __('Tired of robotic support chatbots?', 'lrob-qrcode-maker'),
                'link' => __('Get human WordPress support by LRob', 'lrob-qrcode-maker'),
            ],
            [
                'icon' => '🛡️',
                'text' => __('Worried about WordPress attacks?', 'lrob-qrcode-maker'),
                'link' => __('Hardened WordPress hosting with WAF', 'lrob-qrcode-maker'),
            ],
            [
                'icon' => '💾',
                'text' => __('Backups shouldn’t be an extra.', 'lrob-qrcode-maker'),
                'link' => __('WordPress hosting with 1-year backups included', 'lrob-qrcode-maker'),
            ],
            [
                'icon' => '🌿',
                'text' => __('Going green?', 'lrob-qrcode-maker'),
                'link' => __('Eco-friendly WordPress hosting', 'lrob-qrcode-maker'),
            ],
            [
                'icon' => '🇫🇷',
                'text' => __('Need data sovereignty?', 'lrob-qrcode-maker'),
                'link' => __('French WordPress hosting, EU data residency', 'lrob-qrcode-maker'),
            ],
            [
                'icon' => '🚚',
                'text' => __('Stuck on a slow host?', 'lrob-qrcode-maker'),
                'link' => __('Switch to LRob — migration included', 'lrob-qrcode-maker'),
            ],
        ];
    }

    /** Small "by LRob" credit fragment appended to each admin page title. */
    public static function page_credit_html(): string
    {
        return ' <small class="lrob-qrm-page-credit">'
            . esc_html__('by', 'lrob-qrcode-maker') . ' '
            . '<a href="https://www.lrob.fr" target="_blank" rel="noopener noreferrer">LRob</a>'
            . '</small>';
    }

    public static function asset_version(string $relative): string
    {
        // Always append the file's mtime so browser caches drop when the file
        // changes — even when LROB_QRM_VERSION hasn't been bumped (which is
        // the common case during iterative stabilisation).
        $version = LROB_QRM_VERSION;
        $full = LROB_QRM_PATH . ltrim($relative, '/');
        if (is_file($full)) {
            $version .= '.' . filemtime($full);
        }
        return $version;
    }
}
