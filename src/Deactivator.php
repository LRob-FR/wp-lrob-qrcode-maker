<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker;

/**
 * Runs on plugin deactivation. Clears scheduled cron events. Does NOT drop any
 * data — that is handled by uninstall.php when the plugin is deleted.
 */
final class Deactivator
{
    public static function deactivate(): void
    {
        self::clear_scheduled_events();
        flush_rewrite_rules(false);
    }

    private static function clear_scheduled_events(): void
    {
        $crons = _get_cron_array();
        if (!is_array($crons)) {
            return;
        }

        foreach ($crons as $hooks) {
            if (!is_array($hooks)) {
                continue;
            }
            foreach (array_keys($hooks) as $hook) {
                if (is_string($hook) && str_starts_with($hook, 'lrob_qrm_')) {
                    wp_clear_scheduled_hook($hook);
                }
            }
        }
    }
}
