<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\Library;

/**
 * DB schema for the admin QR library + scan tracking.
 *
 * Two tables:
 *   - {prefix}lrob_qrm_codes  — one row per saved QR.
 *       Holds the encoded payload, the design spec (JSON), the optional
 *       tracking slug and counter, label + author for the admin list view.
 *   - {prefix}lrob_qrm_scans  — one row per scan when tracking is enabled.
 *       Anonymised IP (truncated to /24 for v4, /48 for v6) and shortened
 *       user-agent. Not a full analytics product — just enough for a graph.
 *
 * `install()` is idempotent — runs on activation and again any time we bump
 * `OPTION_DB_VERSION` for an additive change.
 */
final class Schema
{
    public const TABLE_CODES = 'lrob_qrm_codes';

    public const TABLE_SCANS = 'lrob_qrm_scans';

    public static function install(): void
    {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset_collate = $wpdb->get_charset_collate();
        $codes = $wpdb->prefix . self::TABLE_CODES;
        $scans = $wpdb->prefix . self::TABLE_SCANS;

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

        $sql_scans = "CREATE TABLE {$scans} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            qr_id BIGINT UNSIGNED NOT NULL,
            scanned_at DATETIME NOT NULL,
            ip_anon VARCHAR(45) NOT NULL DEFAULT '',
            ua_short VARCHAR(120) NOT NULL DEFAULT '',
            referer VARCHAR(255) NOT NULL DEFAULT '',
            PRIMARY KEY  (id),
            KEY qr_id (qr_id),
            KEY scanned_at (scanned_at)
        ) {$charset_collate};";

        dbDelta($sql_codes);
        dbDelta($sql_scans);
    }
}
