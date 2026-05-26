<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\Admin;

use LRob\QRCodeMaker\Activator;
use LRob\QRCodeMaker\Library\Repository;
use LRob\QRCodeMaker\Support\ContentTypes;

/**
 * Card-grid view of saved QR codes + a modal editor for create/edit. All
 * mutations go through the REST library endpoints. The cards each carry a
 * `data-qr` attribute the JS uses to render a small qr-code-styling preview
 * on mount, so the grid is genuinely visual.
 */
final class LibraryPage
{
    /**
     * Translate a shape value to its human label. Switch is intentional so
     * `wp i18n make-pot` extracts every literal string. The matching value
     * set in `dot_shapes()` / `eye_shapes()` below MUST agree with this.
     */
    private static function shape_label(string $value): string
    {
        return match ($value) {
            'square'         => __('Square', 'lrob-qrcode-maker'),
            'rounded'        => __('Rounded', 'lrob-qrcode-maker'),
            'extra-rounded'  => __('Extra rounded', 'lrob-qrcode-maker'),
            'dots'           => __('Dots', 'lrob-qrcode-maker'),
            'dot'            => __('Circle', 'lrob-qrcode-maker'),
            'classy'         => __('Classy', 'lrob-qrcode-maker'),
            'classy-rounded' => __('Classy rounded', 'lrob-qrcode-maker'),
            default          => $value,
        };
    }

    /** Dot shape options — values match qr-code-styling's dotsOptions.type. */
    private const DOT_SHAPES = [
        'square'         => 'square',
        'rounded'        => 'rounded',
        'extra-rounded'  => 'extra-rounded',
        'dots'           => 'dots',
        'classy'         => 'classy',
        'classy-rounded' => 'classy-rounded',
    ];

    /*
     * Shape-icon CSS classes used via dynamic concatenation below:
     *   lrob-qrm-shape-icon-square, lrob-qrm-shape-icon-rounded,
     *   lrob-qrm-shape-icon-extra-rounded, lrob-qrm-shape-icon-dots,
     *   lrob-qrm-shape-icon-dot, lrob-qrm-shape-icon-classy,
     *   lrob-qrm-shape-icon-classy-rounded
     * Listed here so the release.sh dead-css scan can find them.
     */

    /** Eye shape options — values match qr-code-styling's cornersSquareOptions.type. */
    private const EYE_SHAPES = [
        'square'         => 'square',
        'extra-rounded'  => 'extra-rounded',
        'dot'            => 'dot',
        'classy'         => 'classy',
        'classy-rounded' => 'classy-rounded',
    ];

    /** Hover-help badge — small "(?)" with a native title tooltip. */
    private static function info(string $help): string
    {
        return ' <span class="lrob-qrm-info" tabindex="0" title="' . esc_attr($help) . '">(?)</span>';
    }

    /**
     * True for content whose native scheme would break under HTTP redirect
     * (Wi-Fi / mailto / sms / tel / geo). Falls back to a target-prefix
     * regex for legacy rows that predate the contentType column. Mirrors
     * `NON_TRACKABLE_TYPES` in admin/js/admin.js — keep them in sync.
     *
     * @param array<string, mixed> $code
     */
    private static function is_non_trackable(array $code): bool
    {
        $type = isset($code['design']['contentType']) ? (string) $code['design']['contentType'] : '';
        if (in_array($type, ['wifi', 'email', 'sms', 'tel', 'geo'], true)) {
            return true;
        }
        if ($type === '') {
            return (bool) preg_match('#^(WIFI:|sms:|smsto:|tel:|geo:|mailto:)#i', (string) ($code['target_url'] ?? ''));
        }
        return false;
    }

    public static function render(): void
    {
        if (!current_user_can(Activator::CAPABILITY)) {
            wp_die(esc_html__('Insufficient permissions.', 'lrob-qrcode-maker'));
        }

        $repo = new Repository();
        $codes = $repo->all();
        $settings = get_option(Activator::OPTION_SETTINGS, []);
        $tracking_path = isset($settings['tracking_path']) ? (string) $settings['tracking_path'] : 'qr';

        ?>
        <div class="lrob-qrm lrob-qrm-page">
            <header class="lrob-qrm-page-header">
                <h1>
                    <?php esc_html_e('QR Code Library', 'lrob-qrcode-maker'); ?>
                    <?php echo Menu::page_credit_html(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                </h1>
                <button type="button" class="button button-primary" data-action="new-qr">
                    <?php esc_html_e('Create new QR code', 'lrob-qrcode-maker'); ?>
                </button>
            </header>

            <section class="lrob-qrm-grid" data-role="grid">
                <?php if (empty($codes)) : ?>
                    <p class="lrob-qrm-empty">
                        <?php esc_html_e('No QR codes saved yet. Click "Create new QR code" to start.', 'lrob-qrcode-maker'); ?>
                    </p>
                <?php else : ?>
                    <?php foreach ($codes as $code) :
                        $card_data = [
                            'target' => (string) $code['target_url'],
                            'design' => is_array($code['design']) ? $code['design'] : [],
                            'logoUrl' => $code['logo_url'] ?? null,
                            'trackingUrl' => $code['tracking_enabled'] && !empty($code['slug'])
                                ? home_url('/' . $tracking_path . '/' . $code['slug'])
                                : null,
                        ];
                        $card_data['encoded'] = $card_data['trackingUrl'] ?? $card_data['target'];
                        $label = $code['label'] !== '' ? $code['label'] : $code['target_url'];
                        $is_non_trackable = self::is_non_trackable($code);
                    ?>
                        <article class="lrob-qrm-card" data-id="<?php echo (int) $code['id']; ?>"
                                 data-qr="<?php echo esc_attr(wp_json_encode($card_data)); ?>">
                            <div class="lrob-qrm-card-preview" data-role="card-preview"></div>
                            <div class="lrob-qrm-card-body">
                                <h3 class="lrob-qrm-card-title"><?php echo esc_html($label); ?></h3>
                                <dl class="lrob-qrm-card-info">
                                    <dt><?php esc_html_e('Target', 'lrob-qrcode-maker'); ?></dt>
                                    <dd>
                                        <?php
                                        // Make the target clickable when it's actually a URL.
                                        // For vCard/Wi-Fi/etc. payloads, render as plain <code>.
                                        $is_url = preg_match('#^https?://#i', (string) $code['target_url']);
                                        if ($is_url) :
                                            ?>
                                            <a class="lrob-qrm-card-url" href="<?php echo esc_url($code['target_url']); ?>" target="_blank" rel="noopener">
                                                <?php echo esc_html($code['target_url']); ?>
                                            </a>
                                        <?php else : ?>
                                            <code class="lrob-qrm-card-url"><?php echo esc_html($code['target_url']); ?></code>
                                        <?php endif; ?>
                                    </dd>
                                    <?php if ($card_data['trackingUrl']) : ?>
                                        <dt><?php esc_html_e('Tracking URL', 'lrob-qrcode-maker'); ?></dt>
                                        <dd>
                                            <a class="lrob-qrm-card-url" href="<?php echo esc_url($card_data['trackingUrl']); ?>" target="_blank" rel="noopener">
                                                <?php echo esc_html($card_data['trackingUrl']); ?>
                                            </a>
                                        </dd>
                                        <dt><?php esc_html_e('Scans', 'lrob-qrcode-maker'); ?></dt>
                                        <dd>
                                            <?php
                                            printf(
                                                /* translators: %d: number of scans */
                                                esc_html(_n('%d scan', '%d scans', (int) $code['scan_count'], 'lrob-qrcode-maker')),
                                                (int) $code['scan_count']
                                            );
                                            ?>
                                        </dd>
                                    <?php elseif (!$is_non_trackable) : ?>
                                        <dt><?php esc_html_e('Tracking', 'lrob-qrcode-maker'); ?></dt>
                                        <dd>
                                            <span class="lrob-qrm-pill lrob-qrm-pill-muted">
                                                <?php esc_html_e('Off', 'lrob-qrcode-maker'); ?>
                                            </span>
                                        </dd>
                                    <?php endif; ?>
                                </dl>
                            </div>
                            <footer class="lrob-qrm-card-actions">
                                <button type="button" class="button button-primary lrob-qrm-card-export" data-action="download">
                                    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
                                        <path fill="currentColor" d="M10 3a1 1 0 0 1 1 1v6.6l1.3-1.3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 10.6V4a1 1 0 0 1 1-1zM4 15a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H4z"/>
                                    </svg>
                                    <?php esc_html_e('Generate image', 'lrob-qrcode-maker'); ?>
                                </button>
                                <button type="button" class="button" data-action="edit"
                                        title="<?php esc_attr_e('Edit', 'lrob-qrcode-maker'); ?>">
                                    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
                                        <path fill="currentColor" d="M14.7 3.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L7.4 15H4v-3.4l9.3-9.3.4-.3.6.3.4.3zM4 17h12v1H4v-1z"/>
                                    </svg>
                                    <?php esc_html_e('Edit', 'lrob-qrcode-maker'); ?>
                                </button>
                                <button type="button" class="button lrob-qrm-icon-button lrob-qrm-icon-button-delete" data-action="delete"
                                        aria-label="<?php esc_attr_e('Delete', 'lrob-qrcode-maker'); ?>"
                                        title="<?php esc_attr_e('Delete', 'lrob-qrcode-maker'); ?>">
                                    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                                        <path fill="currentColor" d="M7 3h6l1 2h3v1H3V5h3l1-2zm-2 4h10l-1 11H6L5 7zm3 2v7h1V9H8zm3 0v7h1V9h-1z"/>
                                    </svg>
                                </button>
                            </footer>
                        </article>
                    <?php endforeach; ?>
                <?php endif; ?>
            </section>

            <!-- Rotating LRob promo strip — random message on load, fades through
                 the whole pool every ~10s. Same set is shown on the Settings page. -->
            <aside class="lrob-qrm-promo" data-role="lrob-promo" aria-label="<?php esc_attr_e('Sponsor message', 'lrob-qrcode-maker'); ?>"></aside>

            <!-- Editor modal: hidden by default, opened by "Create new" or any card's Edit button. -->
            <div class="lrob-qrm-modal" data-role="editor" hidden>
                <div class="lrob-qrm-modal-backdrop" data-action="cancel" aria-hidden="true"></div>
                <form class="lrob-qrm-modal-panel" data-role="form" role="dialog" aria-modal="true" aria-label="<?php esc_attr_e('Designer', 'lrob-qrcode-maker'); ?>">
                    <header class="lrob-qrm-modal-header">
                        <input type="text" name="label" class="lrob-qrm-editor-label" placeholder="<?php esc_attr_e('Label', 'lrob-qrcode-maker'); ?>" aria-label="<?php esc_attr_e('Label', 'lrob-qrcode-maker'); ?>" title="<?php esc_attr_e('Your private name for this QR — helps you find it in the library. Never appears on the QR itself.', 'lrob-qrcode-maker'); ?>" maxlength="255">
                        <span class="lrob-qrm-save-status" data-role="save-status" aria-live="polite"></span>
                        <button type="button" class="lrob-qrm-modal-close" data-action="cancel" aria-label="<?php esc_attr_e('Close', 'lrob-qrcode-maker'); ?>">&times;</button>
                    </header>
                    <div class="lrob-qrm-editor-grid">
                        <div class="lrob-qrm-editor-fields">
                            <label class="lrob-qrm-field">
                                <span>
                                    <?php esc_html_e('Content type', 'lrob-qrcode-maker'); ?>
                                    <?php echo self::info(__('What the QR encodes. Each type composes the correct payload format: URL, vCard 3.0 contact, Wi-Fi credentials, mailto:, SMS, tel:, geo:, plain text.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                                </span>
                                <select name="contentType" data-role="content-type">
                                    <?php foreach (ContentTypes::definitions() as $value => $def) : ?>
                                        <option value="<?php echo esc_attr($value); ?>"<?php selected($value, 'url'); ?>>
                                            <?php echo esc_html($def['label']); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </label>
                            <!-- The actual encoded payload — JS composes this from the
                                 content-type fields below. Kept as the canonical "data"
                                 field that the rest of the form already serialises. -->
                            <input type="hidden" name="data" data-role="data-encoded" value="">
                            <div class="lrob-qrm-content-fields" data-role="content-fields"></div>

                            <h3 class="lrob-qrm-section-title">
                                <?php esc_html_e('Tracking', 'lrob-qrcode-maker'); ?>
                                <?php echo self::info(__('Replaces the encoded payload with a short /qr/{slug} URL that redirects to your target. Lets you change the destination after the QR has been printed, and counts scans per QR. Recommended for vCards with accents — works around scanner bugs by serving a .vcf file.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                            </h3>
                            <div class="lrob-qrm-section">
                                <label class="lrob-qrm-field-inline">
                                    <input type="checkbox" name="tracking_enabled" value="1">
                                    <span>
                                        <?php
                                        printf(
                                            /* translators: %s: tracking URL prefix, e.g. /qr/ */
                                            esc_html__('Use a short %s URL and count scans', 'lrob-qrcode-maker'),
                                            '<code>/' . esc_html($tracking_path) . '/…</code>' // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                                        );
                                        ?>
                                    </span>
                                </label>
                                <p class="lrob-qrm-tracking-preview" data-role="tracking-preview" hidden>
                                    <span class="lrob-qrm-field-label"><?php esc_html_e('Will resolve to', 'lrob-qrcode-maker'); ?>:</span>
                                    <code data-role="tracking-url"></code>
                                </p>
                                <p class="lrob-qrm-tracking-warning notice notice-warning inline" data-role="tracking-incompatible" hidden>
                                    <?php esc_html_e('Tracking is only available for URL, plain text, and vCard content. Wi-Fi, email, SMS, Tel and Geo encode native schemes that scanners act on directly — an HTTP redirect would break the QR.', 'lrob-qrcode-maker'); ?>
                                </p>
                            </div>

                            <h3 class="lrob-qrm-section-title"><?php esc_html_e('Design', 'lrob-qrcode-maker'); ?></h3>
                            <div class="lrob-qrm-section">
                                <div class="lrob-qrm-field-grid">
                                    <!-- Color fields use <div> (not <label>) because wpColorPicker
                                         injects its own DOM around the input — a wrapping <label>
                                         confuses the picker's click/focus model and can hide the
                                         caption. The visible caption is a plain <span>, with
                                         aria-label on the input for accessibility. -->
                                    <div class="lrob-qrm-field lrob-qrm-color-field">
                                        <span>
                                            <?php esc_html_e('Foreground', 'lrob-qrcode-maker'); ?>
                                            <?php echo self::info(__('Color of the QR modules (the dark squares that encode data). High contrast vs the background is critical — pure black is the most reliable.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                                        </span>
                                        <input type="text" name="fgColor" value="#000000" class="lrob-qrm-color-picker" data-default-color="#000000" aria-label="<?php esc_attr_e('Foreground', 'lrob-qrcode-maker'); ?>">
                                    </div>
                                    <div class="lrob-qrm-field lrob-qrm-color-field" data-role="bgcolor-field">
                                        <span>
                                            <?php esc_html_e('Background', 'lrob-qrcode-maker'); ?>
                                            <?php echo self::info(__('Color behind the modules. White or very light is best; coloured backgrounds reduce contrast and can break scanning on cheap phones.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                                        </span>
                                        <input type="text" name="bgColor" value="#ffffff" class="lrob-qrm-color-picker" data-default-color="#ffffff" aria-label="<?php esc_attr_e('Background', 'lrob-qrcode-maker'); ?>">
                                    </div>
                                    <div class="lrob-qrm-field lrob-qrm-color-field">
                                        <span>
                                            <?php esc_html_e('Eye color', 'lrob-qrcode-maker'); ?>
                                            <?php echo self::info(__('Color of the three big corner finder patterns. Usually matches the foreground; a different color is decorative but should still contrast strongly with the background.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                                        </span>
                                        <input type="text" name="eyeColor" value="#000000" class="lrob-qrm-color-picker" data-default-color="#000000" aria-label="<?php esc_attr_e('Eye color', 'lrob-qrcode-maker'); ?>">
                                    </div>
                                    <label class="lrob-qrm-field lrob-qrm-field-inline">
                                        <input type="checkbox" name="bgTransparent" value="1">
                                        <span>
                                            <?php esc_html_e('Transparent background', 'lrob-qrcode-maker'); ?>
                                            <?php echo self::info(__('Drops the background fill so the underlying page or photo shows through. The QR scans only if the surface behind it is uniform and light — patterned or dark backgrounds will break it.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                                        </span>
                                    </label>
                                </div>

                                <fieldset class="lrob-qrm-shape-picker">
                                    <legend>
                                        <?php esc_html_e('Dot shape', 'lrob-qrcode-maker'); ?>
                                        <?php echo self::info(__('Visual style of the data modules. Square is the most scannable; rounded and classy shapes look softer but slightly reduce module-edge contrast.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                                    </legend>
                                    <?php foreach (self::DOT_SHAPES as $value => $icon) :
                                        $label = self::shape_label($value);
                                    ?>
                                        <label class="lrob-qrm-shape-tile" title="<?php echo esc_attr($label); ?>" aria-label="<?php echo esc_attr($label); ?>">
                                            <input type="radio" name="dotShape" value="<?php echo esc_attr($value); ?>"
                                                   <?php checked($value, 'square'); ?>>
                                            <span class="lrob-qrm-shape-icon lrob-qrm-shape-icon-<?php echo esc_attr($icon); ?> lrob-qrm-shape-icon-filled"></span>
                                        </label>
                                    <?php endforeach; ?>
                                </fieldset>

                                <fieldset class="lrob-qrm-shape-picker">
                                    <legend>
                                        <?php esc_html_e('Eye shape', 'lrob-qrcode-maker'); ?>
                                        <?php echo self::info(__('Visual style of the three big corner patterns. Square is the standard QR look; the others are decorative variations on the same finder geometry.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                                    </legend>
                                    <?php foreach (self::EYE_SHAPES as $value => $icon) :
                                        $label = self::shape_label($value);
                                    ?>
                                        <label class="lrob-qrm-shape-tile" title="<?php echo esc_attr($label); ?>" aria-label="<?php echo esc_attr($label); ?>">
                                            <input type="radio" name="eyeShape" value="<?php echo esc_attr($value); ?>"
                                                   <?php checked($value, 'square'); ?>>
                                            <span class="lrob-qrm-shape-icon lrob-qrm-shape-icon-<?php echo esc_attr($icon); ?> lrob-qrm-shape-icon-outline"></span>
                                        </label>
                                    <?php endforeach; ?>
                                </fieldset>

                            </div>

                            <h3 class="lrob-qrm-section-title">
                                <?php esc_html_e('Error correction', 'lrob-qrcode-maker'); ?>
                                <span class="lrob-qrm-info" tabindex="0" title="<?php esc_attr_e('Lets scanners read the QR even if it’s partly damaged or covered by a logo. Higher levels tolerate more damage but make the QR denser. Auto picks the best level for your case.', 'lrob-qrcode-maker'); ?>">(?)</span>
                            </h3>
                            <div class="lrob-qrm-section">
                                <fieldset class="lrob-qrm-toggle-picker">
                                    <legend class="screen-reader-text"><?php esc_html_e('Error correction', 'lrob-qrcode-maker'); ?></legend>
                                    <?php foreach ([
                                        'auto' => [__('Auto', 'lrob-qrcode-maker'),   __('Picks the best level for your case: highest EC that doesn’t enlarge the QR if no logo, biggest possible logo if one is attached.', 'lrob-qrcode-maker')],
                                        'L'    => [__('Min', 'lrob-qrcode-maker'),    __('Level L · 7% damage recovery. Smallest, densest QR — fragile if printed small or scanned at an angle. Use for short URLs in ideal conditions.', 'lrob-qrcode-maker')],
                                        'M'    => [__('Low', 'lrob-qrcode-maker'),    __('Level M · 15% damage recovery. Slightly bigger QR. Solid default for screen display and clean prints.', 'lrob-qrcode-maker')],
                                        'Q'    => [__('Medium', 'lrob-qrcode-maker'), __('Level Q · 25% damage recovery. Tolerates moderate dirt, glare or partial logo overlap. Good for print on uncoated paper.', 'lrob-qrcode-maker')],
                                        'H'    => [__('High', 'lrob-qrcode-maker'),   __('Level H · 30% damage recovery. Biggest QR for the same data, most robust, allows the largest logo. Use for outdoor or rough-environment prints.', 'lrob-qrcode-maker')],
                                    ] as $value => $opt) : ?>
                                        <label class="lrob-qrm-toggle-tile" title="<?php echo esc_attr($opt[1]); ?>">
                                            <input type="radio" name="ecMode" value="<?php echo esc_attr($value); ?>" <?php checked($value, 'auto'); ?>>
                                            <span><?php echo esc_html($opt[0]); ?></span>
                                        </label>
                                    <?php endforeach; ?>
                                </fieldset>
                            </div>

                            <h3 class="lrob-qrm-section-title">
                                <?php esc_html_e('Logo', 'lrob-qrcode-maker'); ?>
                                <?php echo self::info(__('Overlay an image at the QR’s center — a logo, mascot, etc. The chosen Error correction level determines how much of the QR can be safely covered. The image is stored with the QR card and reused on every export.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                            </h3>
                            <div class="lrob-qrm-section">
                                <div class="lrob-qrm-logo-picker" data-role="logo-picker">
                                    <input type="hidden" name="logo_attachment_id" value="0">
                                    <img class="lrob-qrm-logo-thumb" data-role="logo-thumb" alt="" hidden>
                                    <button type="button" class="button" data-action="pick-logo">
                                        <?php esc_html_e('Pick logo from Media Library', 'lrob-qrcode-maker'); ?>
                                    </button>
                                    <button type="button" class="button-link" data-action="remove-logo" hidden>
                                        <?php esc_html_e('Remove logo', 'lrob-qrcode-maker'); ?>
                                    </button>
                                </div>
                                <small data-role="logo-hint"><?php esc_html_e('PNG, JPEG, or WebP from the Media Library. Saved with the QR code.', 'lrob-qrcode-maker'); ?></small>
                                <div data-role="logo-settings" hidden>
                                    <label class="lrob-qrm-field-inline">
                                        <input type="checkbox" name="logoBackground" value="1" checked>
                                        <span>
                                            <?php esc_html_e('Clear QR modules behind logo', 'lrob-qrcode-maker'); ?>
                                            <?php echo self::info(__('Erases the QR modules under the logo so it sits cleanly on the background color. Always on for opaque logos; uncheck only for transparent PNGs where you want the modules to show through the empty parts of the image.', 'lrob-qrcode-maker')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                                        </span>
                                    </label>
                                    <fieldset class="lrob-qrm-toggle-picker">
                                        <legend>
                                            <?php esc_html_e('Logo size', 'lrob-qrcode-maker'); ?>
                                            <span class="lrob-qrm-info" tabindex="0" title="<?php esc_attr_e('How much of the QR the logo covers. Safe leaves an extra margin for damaged prints; Max uses the full coverage the chosen error correction allows.', 'lrob-qrcode-maker'); ?>">(?)</span>
                                        </legend>
                                        <?php foreach ([
                                            'safe'   => [__('Safe', 'lrob-qrcode-maker'),   __('~50% of the computed safe area. Extra margin for damaged or low-quality prints.', 'lrob-qrcode-maker')],
                                            'medium' => [__('Medium', 'lrob-qrcode-maker'), __('~80% of the safe area. Mid-point between Safe and Max — clearly visible logo with a bit of scan headroom.', 'lrob-qrcode-maker')],
                                            'max'    => [__('Max', 'lrob-qrcode-maker'),    __('Full safe area for the chosen error correction. Largest logo the QR can support without losing scannability under good conditions.', 'lrob-qrcode-maker')],
                                        ] as $value => $opt) : ?>
                                            <label class="lrob-qrm-toggle-tile" title="<?php echo esc_attr($opt[1]); ?>">
                                                <input type="radio" name="logoSize" value="<?php echo esc_attr($value); ?>" <?php checked($value, 'max'); ?>>
                                                <span><?php echo esc_html($opt[0]); ?></span>
                                            </label>
                                        <?php endforeach; ?>
                                    </fieldset>
                                </div>
                            </div>

                        </div>
                        <div class="lrob-qrm-editor-preview-wrap">
                            <div class="lrob-qrm-editor-preview" data-role="preview"></div>
                            <button type="button" class="button button-primary lrob-qrm-editor-export" data-action="download">
                                <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
                                    <path fill="currentColor" d="M10 3a1 1 0 0 1 1 1v6.6l1.3-1.3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 10.6V4a1 1 0 0 1 1-1zM4 15a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H4z"/>
                                </svg>
                                <?php esc_html_e('Generate image', 'lrob-qrcode-maker'); ?>
                            </button>
                            <p class="lrob-qrm-editor-stats" data-role="stats"></p>
                            <p class="lrob-qrm-editor-stats-notice" data-role="stats-notice" hidden></p>
                        </div>
                    </div>
                </form>
            </div>

            <!-- Export modal: opened by every "Export QR Code" button (cards + designer).
                 Layout: QR preview LEFT, settings stacked vertically RIGHT. -->
            <div class="lrob-qrm-modal" data-role="export-modal" hidden>
                <div class="lrob-qrm-modal-backdrop" data-action="export-cancel" aria-hidden="true"></div>
                <div class="lrob-qrm-modal-panel" role="dialog" aria-modal="true" aria-labelledby="lrob-qrm-export-title">
                    <header class="lrob-qrm-modal-header">
                        <h2 id="lrob-qrm-export-title"><?php esc_html_e('Generate image', 'lrob-qrcode-maker'); ?></h2>
                        <button type="button" class="lrob-qrm-modal-close" data-action="export-cancel" aria-label="<?php esc_attr_e('Close', 'lrob-qrcode-maker'); ?>">&times;</button>
                    </header>
                    <div class="lrob-qrm-export-grid">
                        <div class="lrob-qrm-export-preview-wrap">
                            <div class="lrob-qrm-export-preview" data-role="export-preview"></div>
                        </div>
                        <form class="lrob-qrm-export-form" data-role="export-form">
                            <label class="lrob-qrm-field">
                                <span><?php esc_html_e('Size', 'lrob-qrcode-maker'); ?></span>
                                <select name="size" data-role="export-size-select">
                                    <option value="256">256 × 256</option>
                                    <option value="512">512 × 512</option>
                                    <option value="1024" selected>1024 × 1024</option>
                                    <option value="2048">2048 × 2048</option>
                                    <option value="4096">4096 × 4096</option>
                                    <option value="custom"><?php esc_html_e('Custom…', 'lrob-qrcode-maker'); ?></option>
                                </select>
                            </label>
                            <label class="lrob-qrm-field" data-role="export-custom-size-field" hidden>
                                <span><?php esc_html_e('Custom size (px)', 'lrob-qrcode-maker'); ?></span>
                                <input type="number" name="customSize" min="64" max="8192" step="1" value="1024">
                            </label>
                            <label class="lrob-qrm-field">
                                <span><?php esc_html_e('Format', 'lrob-qrcode-maker'); ?></span>
                                <select name="format" data-role="export-format-select">
                                    <option value="webp" selected>WebP</option>
                                    <option value="png">PNG</option>
                                    <option value="jpeg">JPEG</option>
                                </select>
                            </label>
                            <p class="lrob-qrm-export-warning">
                                <?php esc_html_e('Always scan-test the QR with a real phone before printing at scale — colours, logo overlap and print quality can affect readability.', 'lrob-qrcode-maker'); ?>
                            </p>
                            <footer class="lrob-qrm-export-actions">
                                <button type="button" class="button" data-action="export-cancel">
                                    <?php esc_html_e('Cancel', 'lrob-qrcode-maker'); ?>
                                </button>
                                <button type="button" class="button button-primary" data-action="export-confirm">
                                    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
                                        <path fill="currentColor" d="M10 3a1 1 0 0 1 1 1v6.6l1.3-1.3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 10.6V4a1 1 0 0 1 1-1zM4 15a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H4z"/>
                                    </svg>
                                    <?php esc_html_e('Generate image', 'lrob-qrcode-maker'); ?>
                                </button>
                            </footer>
                        </form>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
}
