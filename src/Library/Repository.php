<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\Library;

/**
 * Data access for the admin QR library + scan log. Thin wrapper over wpdb
 * with prepared statements everywhere — callers get back plain arrays and
 * trust the data (numeric IDs cast, JSON design decoded).
 */
final class Repository
{
    private string $codes_table;

    private string $scans_table;

    public function __construct()
    {
        global $wpdb;
        $this->codes_table = $wpdb->prefix . Schema::TABLE_CODES;
        $this->scans_table = $wpdb->prefix . Schema::TABLE_SCANS;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function all(int $limit = 200): array
    {
        global $wpdb;
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$this->codes_table} ORDER BY created_at DESC LIMIT %d",
                $limit
            ),
            ARRAY_A
        );
        return array_map([$this, 'inflate'], is_array($rows) ? $rows : []);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        global $wpdb;
        $row = $wpdb->get_row(
            $wpdb->prepare("SELECT * FROM {$this->codes_table} WHERE id = %d", $id),
            ARRAY_A
        );
        return is_array($row) ? $this->inflate($row) : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find_by_slug(string $slug): ?array
    {
        if ($slug === '') {
            return null;
        }
        global $wpdb;
        $row = $wpdb->get_row(
            $wpdb->prepare("SELECT * FROM {$this->codes_table} WHERE slug = %s", $slug),
            ARRAY_A
        );
        return is_array($row) ? $this->inflate($row) : null;
    }

    /**
     * @param array<string, mixed> $data Validated/sanitized payload.
     * @return int Inserted ID, or 0 on failure.
     */
    public function create(array $data): int
    {
        global $wpdb;
        $now = current_time('mysql', true);
        $row = [
            'slug'               => !empty($data['tracking_enabled']) ? $this->unique_slug() : null,
            'label'              => (string) ($data['label'] ?? ''),
            'target_url'         => (string) ($data['target_url'] ?? ''),
            'tracking_enabled'   => !empty($data['tracking_enabled']) ? 1 : 0,
            'scan_count'         => 0,
            'design_json'        => isset($data['design']) ? wp_json_encode($data['design']) : null,
            'logo_attachment_id' => isset($data['logo_attachment_id']) && (int) $data['logo_attachment_id'] > 0
                ? (int) $data['logo_attachment_id'] : null,
            'created_at'         => $now,
            'updated_at'         => $now,
            'created_by'         => (int) (get_current_user_id() ?: 0),
        ];
        $ok = $wpdb->insert($this->codes_table, $row);
        return $ok ? (int) $wpdb->insert_id : 0;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        global $wpdb;
        $existing = $this->find($id);
        if ($existing === null) {
            return false;
        }
        $update = ['updated_at' => current_time('mysql', true)];
        foreach (['label', 'target_url'] as $col) {
            if (array_key_exists($col, $data)) {
                $update[$col] = (string) $data[$col];
            }
        }
        if (array_key_exists('design', $data)) {
            $update['design_json'] = wp_json_encode($data['design']);
        }
        if (array_key_exists('logo_attachment_id', $data)) {
            $aid = (int) $data['logo_attachment_id'];
            $update['logo_attachment_id'] = $aid > 0 ? $aid : null;
        }
        if (array_key_exists('tracking_enabled', $data)) {
            $new_tracking = !empty($data['tracking_enabled']);
            $update['tracking_enabled'] = $new_tracking ? 1 : 0;
            // Allocate a slug the first time tracking is turned on; keep the
            // existing slug if it was already set (so QR codes already in the
            // wild keep working).
            if ($new_tracking && empty($existing['slug'])) {
                $update['slug'] = $this->unique_slug();
            }
        }
        $ok = $wpdb->update($this->codes_table, $update, ['id' => $id]);
        return $ok !== false;
    }

    public function delete(int $id): bool
    {
        global $wpdb;
        $wpdb->delete($this->scans_table, ['qr_id' => $id]);
        return (bool) $wpdb->delete($this->codes_table, ['id' => $id]);
    }

    /**
     * Atomically log a scan and bump the parent counter. Called from the
     * tracking router — keep it lean: no PII beyond anonymised IP, no log
     * row at all if tracking is disabled.
     */
    public function log_scan(int $qr_id, string $ip_anon, string $ua_short, string $referer): void
    {
        global $wpdb;
        $wpdb->insert($this->scans_table, [
            'qr_id'      => $qr_id,
            'scanned_at' => current_time('mysql', true),
            'ip_anon'    => substr($ip_anon, 0, 45),
            'ua_short'   => substr($ua_short, 0, 120),
            'referer'    => substr($referer, 0, 255),
        ]);
        $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$this->codes_table} SET scan_count = scan_count + 1 WHERE id = %d",
                $qr_id
            )
        );
    }

    /**
     * @return array<int, array{bucket:string,count:int}>
     */
    public function scan_buckets(int $qr_id, int $days = 30): array
    {
        global $wpdb;
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT DATE(scanned_at) AS bucket, COUNT(*) AS count
                 FROM {$this->scans_table}
                 WHERE qr_id = %d AND scanned_at >= DATE_SUB(NOW(), INTERVAL %d DAY)
                 GROUP BY bucket
                 ORDER BY bucket ASC",
                $qr_id,
                $days
            ),
            ARRAY_A
        );
        if (!is_array($rows)) {
            return [];
        }
        return array_map(
            static fn (array $r) => ['bucket' => (string) $r['bucket'], 'count' => (int) $r['count']],
            $rows
        );
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function inflate(array $row): array
    {
        $row['id']                 = (int) $row['id'];
        $row['scan_count']         = (int) $row['scan_count'];
        $row['tracking_enabled']   = (bool) ((int) $row['tracking_enabled']);
        $row['created_by']         = (int) $row['created_by'];
        $row['logo_attachment_id'] = isset($row['logo_attachment_id']) && $row['logo_attachment_id'] !== null
            ? (int) $row['logo_attachment_id'] : null;
        $row['design']             = null;
        if (!empty($row['design_json']) && is_string($row['design_json'])) {
            $decoded = json_decode($row['design_json'], true);
            if (is_array($decoded)) {
                $row['design'] = $decoded;
            }
        }
        unset($row['design_json']);
        // Convenience for the JS: a ready-to-use logo URL (full size).
        $row['logo_url'] = null;
        if ($row['logo_attachment_id'] !== null) {
            $url = wp_get_attachment_image_url($row['logo_attachment_id'], 'full');
            if (is_string($url)) {
                $row['logo_url'] = $url;
            }
        }
        return $row;
    }

    /**
     * 8-char base36 slug, collision-checked. Picking from base36 keeps URLs
     * easy to read aloud. Birthday-collision odds at 8 chars are negligible
     * for the kind of volume a single-site QR library sees.
     */
    private function unique_slug(): string
    {
        global $wpdb;
        for ($i = 0; $i < 5; $i++) {
            $candidate = '';
            for ($j = 0; $j < 8; $j++) {
                $candidate .= base_convert((string) random_int(0, 35), 10, 36);
            }
            $exists = $wpdb->get_var(
                $wpdb->prepare("SELECT id FROM {$this->codes_table} WHERE slug = %s", $candidate)
            );
            if (!$exists) {
                return $candidate;
            }
        }
        // Vanishingly unlikely fallback — append a timestamp suffix.
        return substr(base_convert((string) time(), 10, 36), -8);
    }
}
