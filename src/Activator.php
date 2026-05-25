<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker;

use LRob\QRCodeMaker\Library\Schema;

/**
 * Runs on plugin activation. Grants the plugin capability, seeds default
 * options, creates DB tables for the admin QR library + scan tracking.
 */
final class Activator
{
    public const CAPABILITY = 'manage_lrob_qrm';

    public const OPTION_DB_VERSION = 'lrob_qrm_db_version';

    public const OPTION_UNINSTALL_MODE = 'lrob_qrm_uninstall_mode';

    public const OPTION_SETTINGS = 'lrob_qrm_settings';

    /** Default uninstall mode: keep all data. See uninstall.php for the others. */
    public const UNINSTALL_MODE_DEFAULT = 'keep';

    public static function activate(): void
    {
        self::grant_capability();
        self::seed_uninstall_mode();
        self::seed_settings();
        Schema::install();
        // dbDelta is idempotent and adds new columns on upgrades automatically;
        // calling install() on every activation (incl. plugin updates) is the
        // migration path until we need something dbDelta can't do.
        update_option(self::OPTION_DB_VERSION, LROB_QRM_VERSION);
        // Flush rewrite rules so the /qr/{slug} tracking endpoint resolves
        // on the very next request. Tracking\Router registers the rule on
        // 'init'; flushing here picks it up.
        flush_rewrite_rules(false);
    }

    /**
     * Idempotent capability self-heal. Recovers from delete+file-copy
     * reinstalls where uninstall.php stripped the cap but the activation
     * hook never re-fired. Hooked on admin_init.
     */
    public static function ensure_capability(): void
    {
        self::grant_capability();
    }

    private static function grant_capability(): void
    {
        $role = get_role('administrator');
        if ($role instanceof \WP_Role && !$role->has_cap(self::CAPABILITY)) {
            $role->add_cap(self::CAPABILITY);
        }
    }

    private static function seed_uninstall_mode(): void
    {
        if (false === get_option(self::OPTION_UNINSTALL_MODE)) {
            add_option(self::OPTION_UNINSTALL_MODE, self::UNINSTALL_MODE_DEFAULT);
        }
    }

    private static function seed_settings(): void
    {
        if (false === get_option(self::OPTION_SETTINGS)) {
            add_option(self::OPTION_SETTINGS, [
                // Tracking redirect slug prefix — public URL is /{tracking_path}/{slug}.
                'tracking_path'        => 'qr',
                // Default size + format used by the Export modal when opened.
                'default_export_size'  => 1024,
                'default_export_format' => 'webp',
            ]);
        }
    }
}
