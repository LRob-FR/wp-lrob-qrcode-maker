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
                <h1><?php esc_html_e('QR Code Library', 'lrob-qrcode-maker'); ?></h1>
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
                                    <?php else : ?>
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
                                    <?php esc_html_e('Export QR Code', 'lrob-qrcode-maker'); ?>
                                </button>
                                <button type="button" class="button lrob-qrm-icon-button" data-action="edit"
                                        aria-label="<?php esc_attr_e('Edit', 'lrob-qrcode-maker'); ?>"
                                        title="<?php esc_attr_e('Edit', 'lrob-qrcode-maker'); ?>">
                                    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                                        <path fill="currentColor" d="M14.7 3.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L7.4 15H4v-3.4l9.3-9.3.4-.3.6.3.4.3zM4 17h12v1H4v-1z"/>
                                    </svg>
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

            <!-- Editor modal: hidden by default, opened by "Create new" or any card's Edit button. -->
            <div class="lrob-qrm-modal" data-role="editor" hidden>
                <div class="lrob-qrm-modal-backdrop" data-action="cancel" aria-hidden="true"></div>
                <div class="lrob-qrm-modal-panel" role="dialog" aria-modal="true" aria-labelledby="lrob-qrm-modal-title">
                    <header class="lrob-qrm-modal-header">
                        <h2 id="lrob-qrm-modal-title"><?php esc_html_e('Designer', 'lrob-qrcode-maker'); ?></h2>
                        <button type="button" class="lrob-qrm-modal-close" data-action="cancel" aria-label="<?php esc_attr_e('Close', 'lrob-qrcode-maker'); ?>">&times;</button>
                    </header>
                    <div class="lrob-qrm-editor-grid">
                        <div class="lrob-qrm-editor-preview-wrap">
                            <div class="lrob-qrm-editor-preview" data-role="preview"></div>
                        </div>
                        <form class="lrob-qrm-editor-form" data-role="form">
                            <label class="lrob-qrm-field">
                                <span><?php esc_html_e('Label', 'lrob-qrcode-maker'); ?></span>
                                <input type="text" name="label" maxlength="255">
                            </label>
                            <label class="lrob-qrm-field">
                                <span><?php esc_html_e('Content type', 'lrob-qrcode-maker'); ?></span>
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

                            <h3 class="lrob-qrm-section-title"><?php esc_html_e('Tracking', 'lrob-qrcode-maker'); ?></h3>
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
                            </div>

                            <h3 class="lrob-qrm-section-title"><?php esc_html_e('Design', 'lrob-qrcode-maker'); ?></h3>
                            <div class="lrob-qrm-section">
                                <div class="lrob-qrm-field-grid">
                                    <label class="lrob-qrm-field">
                                        <span><?php esc_html_e('Foreground', 'lrob-qrcode-maker'); ?></span>
                                        <input type="color" name="fgColor" value="#000000">
                                    </label>
                                    <label class="lrob-qrm-field" data-role="bgcolor-field">
                                        <span><?php esc_html_e('Background', 'lrob-qrcode-maker'); ?></span>
                                        <input type="color" name="bgColor" value="#ffffff">
                                    </label>
                                    <label class="lrob-qrm-field">
                                        <span><?php esc_html_e('Eye color', 'lrob-qrcode-maker'); ?></span>
                                        <input type="color" name="eyeColor" value="#000000">
                                    </label>
                                    <label class="lrob-qrm-field lrob-qrm-field-inline">
                                        <input type="checkbox" name="bgTransparent" value="1">
                                        <span><?php esc_html_e('Transparent background', 'lrob-qrcode-maker'); ?></span>
                                    </label>
                                </div>

                                <fieldset class="lrob-qrm-shape-picker">
                                    <legend><?php esc_html_e('Dot shape', 'lrob-qrcode-maker'); ?></legend>
                                    <?php foreach (self::DOT_SHAPES as $value => $icon) : ?>
                                        <label class="lrob-qrm-shape-tile">
                                            <input type="radio" name="dotShape" value="<?php echo esc_attr($value); ?>"
                                                   <?php checked($value, 'square'); ?>>
                                            <span class="lrob-qrm-shape-icon lrob-qrm-shape-icon-<?php echo esc_attr($icon); ?> lrob-qrm-shape-icon-filled"></span>
                                            <span class="lrob-qrm-shape-label"><?php echo esc_html(self::shape_label($value)); ?></span>
                                        </label>
                                    <?php endforeach; ?>
                                </fieldset>

                                <fieldset class="lrob-qrm-shape-picker">
                                    <legend><?php esc_html_e('Eye shape', 'lrob-qrcode-maker'); ?></legend>
                                    <?php foreach (self::EYE_SHAPES as $value => $icon) : ?>
                                        <label class="lrob-qrm-shape-tile">
                                            <input type="radio" name="eyeShape" value="<?php echo esc_attr($value); ?>"
                                                   <?php checked($value, 'square'); ?>>
                                            <span class="lrob-qrm-shape-icon lrob-qrm-shape-icon-<?php echo esc_attr($icon); ?> lrob-qrm-shape-icon-outline"></span>
                                            <span class="lrob-qrm-shape-label"><?php echo esc_html(self::shape_label($value)); ?></span>
                                        </label>
                                    <?php endforeach; ?>
                                </fieldset>

                                <label class="lrob-qrm-field">
                                    <span>
                                        <?php esc_html_e('Error correction', 'lrob-qrcode-maker'); ?>
                                        <span class="lrob-qrm-help-tip" tabindex="0"
                                              title="<?php esc_attr_e('Higher levels stay scannable when partially obscured (e.g. logo overlay), at the cost of denser modules. H is required for large logos.', 'lrob-qrcode-maker'); ?>">?</span>
                                    </span>
                                    <select name="ecLevel">
                                        <option value="L">L — <?php esc_html_e('7% recovery', 'lrob-qrcode-maker'); ?></option>
                                        <option value="M" selected>M — <?php esc_html_e('15% recovery', 'lrob-qrcode-maker'); ?></option>
                                        <option value="Q">Q — <?php esc_html_e('25% recovery', 'lrob-qrcode-maker'); ?></option>
                                        <option value="H">H — <?php esc_html_e('30% recovery', 'lrob-qrcode-maker'); ?></option>
                                    </select>
                                </label>
                            </div>

                            <h3 class="lrob-qrm-section-title"><?php esc_html_e('Logo', 'lrob-qrcode-maker'); ?></h3>
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
                                <small><?php esc_html_e('PNG, JPEG, or WebP from the Media Library. Saved with the QR code.', 'lrob-qrcode-maker'); ?></small>
                                <label class="lrob-qrm-field-inline">
                                    <input type="checkbox" name="logoBackground" value="1" checked>
                                    <span><?php esc_html_e('Clear QR modules behind logo', 'lrob-qrcode-maker'); ?></span>
                                </label>
                                <label class="lrob-qrm-field">
                                    <span>
                                        <?php esc_html_e('Logo size', 'lrob-qrcode-maker'); ?>
                                        <span class="lrob-qrm-range-value" data-role="logo-size-value">20%</span>
                                    </span>
                                    <input type="range" name="logoSizeRatio" min="0.1" max="0.3" step="0.01" value="0.2">
                                </label>
                            </div>

                            <footer class="lrob-qrm-editor-actions">
                                <button type="button" class="button" data-action="cancel">
                                    <?php esc_html_e('Cancel', 'lrob-qrcode-maker'); ?>
                                </button>
                                <button type="button" class="button" data-action="download">
                                    <?php esc_html_e('Export QR Code', 'lrob-qrcode-maker'); ?>
                                </button>
                                <button type="button" class="button button-primary" data-action="save">
                                    <?php esc_html_e('Save to library', 'lrob-qrcode-maker'); ?>
                                </button>
                            </footer>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Export modal: opened by every "Export QR Code" button (cards + designer).
                 Layout: QR preview LEFT, settings stacked vertically RIGHT. -->
            <div class="lrob-qrm-modal" data-role="export-modal" hidden>
                <div class="lrob-qrm-modal-backdrop" data-action="export-cancel" aria-hidden="true"></div>
                <div class="lrob-qrm-modal-panel" role="dialog" aria-modal="true" aria-labelledby="lrob-qrm-export-title">
                    <header class="lrob-qrm-modal-header">
                        <h2 id="lrob-qrm-export-title"><?php esc_html_e('Export QR Code', 'lrob-qrcode-maker'); ?></h2>
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
                                    <!-- AVIF added by JS only when the browser can encode it. -->
                                </select>
                            </label>
                            <footer class="lrob-qrm-export-actions">
                                <button type="button" class="button" data-action="export-cancel">
                                    <?php esc_html_e('Cancel', 'lrob-qrcode-maker'); ?>
                                </button>
                                <button type="button" class="button button-primary" data-action="export-confirm">
                                    <?php esc_html_e('Export QR Code', 'lrob-qrcode-maker'); ?>
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
