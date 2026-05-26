<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\Library;

/**
 * DB schema for the admin QR library.
 *
 * One table:
 *   - {prefix}lrob_qrm_codes  — one row per saved QR.
 *       Holds the encoded payload, the design spec (JSON), the optional
 *       tracking slug and a hit counter for tracked QRs.
 *
 * `install()` is idempotent — runs on activation and again any time we bump
 * `OPTION_DB_VERSION` for an additive change. It also drops the legacy
 * `lrob_qrm_scans` table from earlier versions (the per-scan log was
 * never surfaced in the UI; we now keep only the counter on the codes row).
 */
final class Schema
{
    public const TABLE_CODES = 'lrob_qrm_codes';

    public static function install(): void
    {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset_collate = $wpdb->get_charset_collate();
        $codes = $wpdb->prefix . self::TABLE_CODES;

        // `slug` is the public path component on /qr/{slug}. NULL when
        // tracking is disabled (the QR encodes the target URL directly).
        $sql_codes = "CREATE TABLE {$codes} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            slug VARCHAR(32) NULL,
            label VARCHAR(255) NOT NULL DEFAULT '',
            target_url TEXT NOT NULL,
            tracking_enabled TINYINT(1) NOT NULL DEFAULT 0,
            scan_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
            design_json LONGTEXT NULL,
            logo_attachment_id BIGINT UNSIGNED NULL DEFAULT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            created_by BIGINT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY  (id),
            UNIQUE KEY slug (slug),
            KEY created_at (created_at),
            KEY created_by (created_by),
            KEY logo_attachment_id (logo_attachment_id)
        ) {$charset_collate};";

        dbDelta($sql_codes);

        $legacy_scans = $wpdb->prefix . 'lrob_qrm_scans';
        $wpdb->query("DROP TABLE IF EXISTS `{$legacy_scans}`");
    }
}
