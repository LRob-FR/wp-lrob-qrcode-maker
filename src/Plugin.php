<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker;

use LRob\QRCodeMaker\Admin\Menu;
use LRob\QRCodeMaker\Admin\SettingsPage;
use LRob\QRCodeMaker\AutoUpdate\Updater;
use LRob\QRCodeMaker\Block\Maker as MakerBlock;
use LRob\QRCodeMaker\REST\LibraryController;
use LRob\QRCodeMaker\Tracking\Router as TrackingRouter;

/**
 * Main plugin singleton. Wires up the Gutenberg block, the admin library
 * CRUD endpoints, the tracking redirect, and the admin menu.
 *
 * QR rendering is entirely client-side via the vendored qr-code-styling
 * JS library — no PHP renderer, no REST /render endpoint. The server only
 * stores QR metadata (label, target_url, design spec, logo attachment) and
 * handles the /qr/{slug} tracking redirect.
 */
final class Plugin
{
    private static ?self $instance = null;

    private Container $container;

    private bool $booted = false;

    private function __construct()
    {
        $this->container = new Container();
    }

    public static function instance(): self
    {
        return self::$instance ??= new self();
    }

    public function container(): Container
    {
        return $this->container;
    }

    public function boot(): void
    {
        if ($this->booted) {
            return;
        }
        $this->booted = true;

        add_action('init', [$this, 'load_textdomain']);

        (new MakerBlock())->register();
        (new LibraryController())->register();
        (new TrackingRouter())->register();

        // Self-hosted updater runs in every context — wp_update_plugins() can
        // be triggered by wp-cron from a frontend visitor's request when
        // DISABLE_WP_CRON is set, and we'd miss the chance to inject our
        // update entry if we scoped this to is_admin().
        (new Updater())->register();

        if (is_admin()) {
            add_action('admin_init', [Activator::class, 'ensure_capability']);
            add_action('admin_init', [$this, 'maybe_migrate_schema']);
            add_action('admin_init', [$this, 'maybe_flush_stale_rewrites']);
            (new Menu())->register();
            SettingsPage::register_handler();
        }
    }

    /**
     * Detect a stale rewrite-rules cache (our /qr/{slug} pattern missing) and
     * trigger a flush. Cheap O(1) lookup on every admin page load. Catches the
     * cases where the version-bump migration doesn't fire (e.g. someone
     * uploads the same version zip again, or the tracking path was changed
     * by another mechanism).
     */
    public function maybe_flush_stale_rewrites(): void
    {
        $rules = get_option('rewrite_rules');
        if (!is_array($rules) || empty($rules)) {
            // No cache yet — WP will build the rules on the next front-end
            // request, picking up our add_rewrite_rule() call naturally.
            return;
        }
        $settings = get_option(Activator::OPTION_SETTINGS, []);
        $path = isset($settings['tracking_path']) ? (string) $settings['tracking_path'] : 'qr';
        $pattern = '^' . preg_quote($path, '#') . '/([a-z0-9]{1,32})/?$';
        if (!isset($rules[$pattern])) {
            flush_rewrite_rules(false);
        }
    }

    /**
     * Run dbDelta + flush rewrite rules when the stored db_version doesn't
     * match the plugin version. `register_activation_hook` only fires on the
     * very first activation, NOT on subsequent plugin updates via zip upload,
     * so the tracking rewrite for /qr/{slug} would stay stale after an update.
     * This catches both schema changes (new columns) and rewrite changes.
     */
    public function maybe_migrate_schema(): void
    {
        $stored = (string) get_option(Activator::OPTION_DB_VERSION, '');
        if ($stored === LROB_QRM_VERSION) {
            return;
        }
        \LRob\QRCodeMaker\Library\Schema::install();
        // The Tracking\Router's add_rewrite_rule call has already run on init
        // (before admin_init), so flushing here persists the current rule set.
        flush_rewrite_rules(false);
        update_option(Activator::OPTION_DB_VERSION, LROB_QRM_VERSION);
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain(
            'lrob-qrcode-maker',
            false,
            dirname(LROB_QRM_BASENAME) . '/languages'
        );
    }
}
