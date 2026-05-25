<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\Block;

/**
 * Public-facing Gutenberg block `lrob-qrm/maker` — the QR code maker that
 * visitors interact with. Server-renders a minimal shell (no rendered QR
 * markup, no preloaded library); the frontend JS hydrates it with the
 * qr-code-styling preview and wires the export button to the REST endpoint.
 *
 * Block attributes let the author pre-seed the initial design (default
 * colors / shapes) so the block can carry a site's visual identity.
 */
final class Maker
{
    public const BLOCK_NAME = 'lrob-qrm/maker';

    public function register(): void
    {
        add_action('init', [$this, 'register_block'], 20);
        add_action('enqueue_block_editor_assets', [$this, 'enqueue_editor_assets']);
    }

    public function register_block(): void
    {
        register_block_type(self::BLOCK_NAME, [
            'attributes'      => [
                'fgColor'         => ['type' => 'string',  'default' => '#000000'],
                'bgColor'         => ['type' => 'string',  'default' => '#ffffff'],
                'eyeColor'        => ['type' => 'string',  'default' => '#000000'],
                'eyeShape'        => ['type' => 'string',  'default' => 'square'],
                'defaultData'     => ['type' => 'string',  'default' => ''],
                'defaultFormat'   => ['type' => 'string',  'default' => 'webp'],
                'defaultSize'     => ['type' => 'integer', 'default' => 1024],
                'theme'           => ['type' => 'string',  'default' => 'auto'],
                'showCredit'      => ['type' => 'boolean', 'default' => true],
                'layout'          => ['type' => 'string',  'default' => 'preview-right'],
                'customSurface'     => ['type' => 'string',  'default' => '#ffffff'],
                'customSurfaceSoft' => ['type' => 'string',  'default' => '#f6f7f7'],
                'customInputBg'     => ['type' => 'string',  'default' => '#ffffff'],
                'customText'        => ['type' => 'string',  'default' => '#1d2327'],
                'customMuted'       => ['type' => 'string',  'default' => '#646970'],
                'customAccent'      => ['type' => 'string',  'default' => '#1a73e8'],
            ],
            'render_callback' => [self::class, 'render'],
            'supports'        => [
                'html'      => false,
                'inserter'  => true,
                'align'     => ['wide', 'full'],
                'anchor'    => true,
            ],
        ]);

        // Enqueue the frontend script + style only when the block actually
        // appears on the rendered page (registered as block-scoped).
        wp_register_script(
            'qr-code-styling',
            LROB_QRM_URL . 'vendor/qr-code-styling/qr-code-styling.js',
            [],
            '1.9.2',
            true
        );
        wp_register_script(
            'lrob-qrm-content-types',
            LROB_QRM_URL . 'assets/js/content-types.js',
            [],
            self::asset_version('assets/js/content-types.js'),
            true
        );
        wp_register_script(
            'lrob-qrm-maker',
            LROB_QRM_URL . 'assets/js/maker.js',
            ['qr-code-styling', 'wp-i18n', 'lrob-qrm-content-types'],
            self::asset_version('assets/js/maker.js'),
            true
        );
        wp_register_style(
            'lrob-qrm-maker',
            LROB_QRM_URL . 'assets/css/maker.css',
            [],
            self::asset_version('assets/css/maker.css')
        );
        wp_set_script_translations('lrob-qrm-maker', 'lrob-qrcode-maker');
    }

    /**
     * @param array<string, mixed> $attributes
     */
    public static function render(array $attributes): string
    {
        wp_enqueue_script('lrob-qrm-maker');
        wp_enqueue_style('lrob-qrm-maker');

        $config = [
            'defaults'    => [
                'data'      => (string) ($attributes['defaultData'] ?? ''),
                'size'      => (int) ($attributes['defaultSize'] ?? 1024),
                'format'    => (string) ($attributes['defaultFormat'] ?? 'webp'),
                'fgColor'   => (string) ($attributes['fgColor'] ?? '#000000'),
                'bgColor'   => (string) ($attributes['bgColor'] ?? '#ffffff'),
                'eyeColor'  => (string) ($attributes['eyeColor'] ?? '#000000'),
                'eyeShape'  => (string) ($attributes['eyeShape'] ?? 'square'),
            ],
            'i18n'        => [
                'data'           => __('URL, text, or contact info', 'lrob-qrcode-maker'),
                'dataPlaceholder'=> __('https://example.com', 'lrob-qrcode-maker'),
                'contentType'    => __('Content type', 'lrob-qrcode-maker'),
                'foreground'     => __('Foreground', 'lrob-qrcode-maker'),
                'background'     => __('Background', 'lrob-qrcode-maker'),
                'eyeColor'       => __('Eye color', 'lrob-qrcode-maker'),
                'transparent'    => __('Transparent background', 'lrob-qrcode-maker'),
                'dotShape'       => __('Dot shape', 'lrob-qrcode-maker'),
                'eyeShape'       => __('Eye shape', 'lrob-qrcode-maker'),
                'square'         => __('Square', 'lrob-qrcode-maker'),
                'rounded'        => __('Rounded', 'lrob-qrcode-maker'),
                'dots'           => __('Dots', 'lrob-qrcode-maker'),
                'logo'           => __('Logo (optional)', 'lrob-qrcode-maker'),
                'logoHelp'       => __('PNG, JPEG, or WebP. Stays in your browser, never uploaded.', 'lrob-qrcode-maker'),
                'logoBackground' => __('Clear QR modules behind logo', 'lrob-qrcode-maker'),
                'logoSize'       => __('Logo size', 'lrob-qrcode-maker'),
                'design'         => __('Design', 'lrob-qrcode-maker'),
                'logo'           => __('Logo', 'lrob-qrcode-maker'),
                'cancel'         => __('Cancel', 'lrob-qrcode-maker'),
                'close'          => __('Close', 'lrob-qrcode-maker'),
                'size'           => __('Size', 'lrob-qrcode-maker'),
                'exportTitle'    => __('Export QR Code', 'lrob-qrcode-maker'),
                'Square'         => __('Square', 'lrob-qrcode-maker'),
                'Rounded'        => __('Rounded', 'lrob-qrcode-maker'),
                'Extra rounded'  => __('Extra rounded', 'lrob-qrcode-maker'),
                'Dots'           => __('Dots', 'lrob-qrcode-maker'),
                'Circle'         => __('Circle', 'lrob-qrcode-maker'),
                'Classy'         => __('Classy', 'lrob-qrcode-maker'),
                'Classy rounded' => __('Classy rounded', 'lrob-qrcode-maker'),
                'export'         => __('Export', 'lrob-qrcode-maker'),
                'size'           => __('Size (px)', 'lrob-qrcode-maker'),
                'format'         => __('Format', 'lrob-qrcode-maker'),
                'custom'         => __('Custom…', 'lrob-qrcode-maker'),
                'customSize'     => __('Custom size (px)', 'lrob-qrcode-maker'),
                'download'       => __('Export QR Code', 'lrob-qrcode-maker'),
                'downloading'    => __('Generating…', 'lrob-qrcode-maker'),
                'errorGeneric'   => __('Sorry, something went wrong. Please retry.', 'lrob-qrcode-maker'),
                'showAdvanced'   => __('Show advanced options', 'lrob-qrcode-maker'),
                'hideAdvanced'   => __('Hide advanced options', 'lrob-qrcode-maker'),
                'creditPrefix'   => __('QR Code generator by LRob,', 'lrob-qrcode-maker'),
                'creditLink'     => __('WordPress web hosting specialist', 'lrob-qrcode-maker'),
                'statsTemplate'  => __('QR v%v · %m×%m modules · %b bytes · EC %e', 'lrob-qrcode-maker'),
                'statsLengthWarn'        => __('Past ~200 bytes, some smartphones may fail to scan the QR. Shorten the content for maximum compatibility.', 'lrob-qrcode-maker'),
                'statsLengthWarnVcardSuffix' => __('For a contact card, hosting the .vcf file and encoding its URL keeps the QR much shorter.', 'lrob-qrcode-maker'),
                'statsOverflow'  => __('Content too large to encode as a QR (max 2953 bytes at EC L). Shorten the content.', 'lrob-qrcode-maker'),
            ],
        ];

        $align = !empty($attributes['align']) ? ' align' . preg_replace('/[^a-z]/', '', (string) $attributes['align']) : '';
        $anchor = !empty($attributes['anchor']) ? ' id="' . esc_attr((string) $attributes['anchor']) . '"' : '';

        $theme = (string) ($attributes['theme'] ?? 'auto');
        if (!in_array($theme, ['light', 'dark', 'auto', 'site', 'custom'], true)) {
            $theme = 'auto';
        }
        $theme_class = ' lrob-qrm-maker-theme-' . $theme;

        $layout = (string) ($attributes['layout'] ?? 'preview-right');
        if (!in_array($layout, ['preview-right', 'preview-left', 'stacked'], true)) {
            $layout = 'preview-right';
        }
        // CSS classes the dead-scan picks up via these literal mentions:
        // lrob-qrm-maker-layout-preview-right, lrob-qrm-maker-layout-preview-left,
        // lrob-qrm-maker-layout-stacked
        $layout_class = ' lrob-qrm-maker-layout-' . $layout;

        // Custom theme: inject the user's chosen colors as inline CSS variables
        // on the wrapper. Six knobs cover every visible surface so users can
        // theme even the trickier elements (card containers, select bg, etc.)
        // that previously fell back to hardcoded defaults.
        $inline_style = '';
        if ($theme === 'custom') {
            $surface      = self::sanitize_hex_color((string) ($attributes['customSurface']     ?? '#ffffff'), '#ffffff');
            $surface_soft = self::sanitize_hex_color((string) ($attributes['customSurfaceSoft'] ?? '#f6f7f7'), '#f6f7f7');
            $input_bg     = self::sanitize_hex_color((string) ($attributes['customInputBg']     ?? '#ffffff'), '#ffffff');
            $text         = self::sanitize_hex_color((string) ($attributes['customText']        ?? '#1d2327'), '#1d2327');
            $muted        = self::sanitize_hex_color((string) ($attributes['customMuted']       ?? '#646970'), '#646970');
            $accent       = self::sanitize_hex_color((string) ($attributes['customAccent']      ?? '#1a73e8'), '#1a73e8');
            $inline_style = sprintf(
                ' style="'
                . '--lrob-qrm-surface:%1$s;'
                . '--lrob-qrm-surface-soft:%2$s;'
                . '--lrob-qrm-input-bg:%3$s;'
                . '--lrob-qrm-text:%4$s;'
                . '--lrob-qrm-muted:%5$s;'
                . '--lrob-qrm-accent:%6$s;'
                . '"',
                esc_attr($surface),
                esc_attr($surface_soft),
                esc_attr($input_bg),
                esc_attr($text),
                esc_attr($muted),
                esc_attr($accent)
            );
        }

        $config['showCredit']   = !empty($attributes['showCredit']);
        $config['contentTypes'] = \LRob\QRCodeMaker\Support\ContentTypes::definitions();

        ob_start();
        ?>
        <div class="wp-block-lrob-qrm-maker lrob-qrm-maker<?php echo esc_attr($align . $theme_class . $layout_class); ?>"<?php echo $anchor; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php echo $inline_style; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
             data-config="<?php echo esc_attr(wp_json_encode($config)); ?>">
            <noscript>
                <p><?php esc_html_e('The QR code maker requires JavaScript to run in your browser.', 'lrob-qrcode-maker'); ?></p>
            </noscript>
            <div class="lrob-qrm-maker-skeleton" aria-hidden="true"></div>
        </div>
        <?php
        return (string) ob_get_clean();
    }

    private static function sanitize_hex_color(string $raw, string $default): string
    {
        $raw = trim($raw);
        if (!preg_match('/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $raw, $m)) {
            return $default;
        }
        $hex = $m[1];
        if (strlen($hex) === 3) {
            $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        }
        return '#' . strtolower($hex);
    }

    public function enqueue_editor_assets(): void
    {
        $deps_js = ['wp-blocks', 'wp-element', 'wp-components', 'wp-block-editor', 'wp-i18n'];
        wp_enqueue_script(
            'lrob-qrm-block-editor',
            LROB_QRM_URL . 'assets/js/block-editor.js',
            $deps_js,
            self::asset_version('assets/js/block-editor.js'),
            true
        );
        wp_enqueue_style(
            'lrob-qrm-block-editor',
            LROB_QRM_URL . 'assets/css/block-editor.css',
            ['wp-edit-blocks'],
            self::asset_version('assets/css/block-editor.css')
        );
        wp_set_script_translations('lrob-qrm-block-editor', 'lrob-qrcode-maker');
    }

    private static function asset_version(string $relative): string
    {
        // Always append the file's mtime so browser caches drop when the file
        // changes — even when LROB_QRM_VERSION hasn't been bumped.
        $version = LROB_QRM_VERSION;
        $full = LROB_QRM_PATH . ltrim($relative, '/');
        if (is_file($full)) {
            $version .= '.' . filemtime($full);
        }
        return $version;
    }
}
