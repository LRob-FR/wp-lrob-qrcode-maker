<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\Admin;

use LRob\QRCodeMaker\Activator;

/**
 * Plugin settings: tracking path prefix + uninstall mode.
 * POSTs back to admin-post with a nonce — server-rendered, no AJAX.
 */
final class SettingsPage
{
    public const ACTION = 'lrob_qrm_save_settings';

    public static function render(): void
    {
        if (!current_user_can(Activator::CAPABILITY)) {
            wp_die(esc_html__('Insufficient permissions.', 'lrob-qrcode-maker'));
        }
        self::maybe_save();

        $settings = get_option(Activator::OPTION_SETTINGS, []);
        $uninstall = get_option(Activator::OPTION_UNINSTALL_MODE, Activator::UNINSTALL_MODE_DEFAULT);
        ?>
        <div class="lrob-qrm lrob-qrm-page">
            <header class="lrob-qrm-page-header">
                <h1>
                    <?php esc_html_e('QR Code Settings', 'lrob-qrcode-maker'); ?>
                    <?php echo Menu::page_credit_html(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                </h1>
            </header>
            <?php if (isset($_GET['saved'])) : ?>
                <div class="notice notice-success is-dismissible"><p><?php esc_html_e('Settings saved.', 'lrob-qrcode-maker'); ?></p></div>
            <?php endif; ?>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="lrob-qrm-settings-form">
                <?php wp_nonce_field(self::ACTION); ?>
                <input type="hidden" name="action" value="<?php echo esc_attr(self::ACTION); ?>">

                <h2><?php esc_html_e('Tracking', 'lrob-qrcode-maker'); ?></h2>
                <label class="lrob-qrm-field">
                    <span><?php esc_html_e('Tracking URL prefix', 'lrob-qrcode-maker'); ?></span>
                    <input type="text" name="tracking_path" pattern="[a-z0-9-]{1,32}"
                           value="<?php echo esc_attr((string) ($settings['tracking_path'] ?? 'qr')); ?>">
                    <small><?php esc_html_e('Used as the first path segment of tracked QR URLs, e.g. /qr/abc123', 'lrob-qrcode-maker'); ?></small>
                </label>

                <h2><?php esc_html_e('Export defaults', 'lrob-qrcode-maker'); ?></h2>
                <p class="description">
                    <?php esc_html_e('Pre-fill the Export modal with these values when opened.', 'lrob-qrcode-maker'); ?>
                </p>
                <label class="lrob-qrm-field">
                    <span><?php esc_html_e('Default export size (px)', 'lrob-qrcode-maker'); ?></span>
                    <select name="default_export_size">
                        <?php
                        $current_size = (int) ($settings['default_export_size'] ?? 1024);
                        foreach ([256, 512, 1024, 2048, 4096] as $opt) :
                            ?>
                            <option value="<?php echo (int) $opt; ?>" <?php selected($current_size, $opt); ?>>
                                <?php echo (int) $opt; ?> × <?php echo (int) $opt; ?>
                            </option>
                            <?php
                        endforeach;
                        ?>
                    </select>
                </label>
                <label class="lrob-qrm-field">
                    <span><?php esc_html_e('Default export format', 'lrob-qrcode-maker'); ?></span>
                    <select name="default_export_format">
                        <?php
                        $current_format = (string) ($settings['default_export_format'] ?? 'webp');
                        foreach (['webp' => 'WebP', 'png' => 'PNG', 'jpeg' => 'JPEG'] as $value => $label) :
                            ?>
                            <option value="<?php echo esc_attr($value); ?>" <?php selected($current_format, $value); ?>>
                                <?php echo esc_html($label); ?>
                            </option>
                            <?php
                        endforeach;
                        ?>
                    </select>
                </label>

                <h2><?php esc_html_e('Uninstall behaviour', 'lrob-qrcode-maker'); ?></h2>
                <p class="description">
                    <?php esc_html_e('What happens when this plugin is deleted from the WordPress admin.', 'lrob-qrcode-maker'); ?>
                </p>
                <label class="lrob-qrm-field">
                    <span><?php esc_html_e('Uninstall mode', 'lrob-qrcode-maker'); ?></span>
                    <select name="uninstall_mode">
                        <option value="keep"    <?php selected($uninstall, 'keep'); ?>>
                            <?php esc_html_e('Keep everything (recommended)', 'lrob-qrcode-maker'); ?>
                        </option>
                        <option value="archive" <?php selected($uninstall, 'archive'); ?>>
                            <?php esc_html_e('Drop settings, keep QR codes + scan history', 'lrob-qrcode-maker'); ?>
                        </option>
                        <option value="wipe"    <?php selected($uninstall, 'wipe'); ?>>
                            <?php esc_html_e('Wipe everything', 'lrob-qrcode-maker'); ?>
                        </option>
                    </select>
                </label>

                <p><button type="submit" class="button button-primary"><?php esc_html_e('Save settings', 'lrob-qrcode-maker'); ?></button></p>
            </form>

            <!-- Rotating LRob promo strip — same one as on the Library page. -->
            <aside class="lrob-qrm-promo" data-role="lrob-promo" aria-label="<?php esc_attr_e('Sponsor message', 'lrob-qrcode-maker'); ?>"></aside>
        </div>
        <?php
    }

    public static function register_handler(): void
    {
        add_action('admin_post_' . self::ACTION, [self::class, 'maybe_save_post']);
    }

    public static function maybe_save_post(): void
    {
        self::maybe_save();
        wp_safe_redirect(add_query_arg('saved', '1', admin_url('admin.php?page=' . Menu::PARENT_SLUG . '-settings')));
        exit;
    }

    private static function maybe_save(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            return;
        }
        if (!isset($_POST['action']) || $_POST['action'] !== self::ACTION) {
            return;
        }
        check_admin_referer(self::ACTION);
        if (!current_user_can(Activator::CAPABILITY)) {
            wp_die(esc_html__('Insufficient permissions.', 'lrob-qrcode-maker'));
        }

        $allowed_sizes = [256, 512, 1024, 2048, 4096];
        $size = (int) ($_POST['default_export_size'] ?? 1024);
        if (!in_array($size, $allowed_sizes, true)) {
            $size = 1024;
        }
        $format = strtolower((string) ($_POST['default_export_format'] ?? 'webp'));
        if (!in_array($format, ['webp', 'png', 'jpeg'], true)) {
            $format = 'webp';
        }

        $settings = [
            'tracking_path'         => preg_replace('/[^a-z0-9-]/', '', strtolower((string) ($_POST['tracking_path'] ?? 'qr'))) ?: 'qr',
            'default_export_size'   => $size,
            'default_export_format' => $format,
        ];
        update_option(Activator::OPTION_SETTINGS, $settings);

        $mode = (string) ($_POST['uninstall_mode'] ?? 'keep');
        if (in_array($mode, ['keep', 'archive', 'wipe'], true)) {
            update_option(Activator::OPTION_UNINSTALL_MODE, $mode);
        }

        // Tracking path change may need a rewrite flush.
        flush_rewrite_rules(false);
    }
}
