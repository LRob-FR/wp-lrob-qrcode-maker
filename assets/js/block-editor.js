/* LRob QR Code Maker — Gutenberg editor block.
 *
 * The block on the editor side renders a Placeholder + InspectorControls
 * panel where the author seeds defaults (default URL, color scheme, what
 * the visitor can edit). The actual maker UI is the frontend script —
 * inside the editor we just preview what the visitor will see.
 *
 * Pure vanilla wp.element / wp.blocks. No JSX, no build pipeline.
 */
(function (wp) {
    'use strict';
    if (!wp || !wp.blocks || !wp.element) return;

    var blocks = wp.blocks;
    var el = wp.element.createElement;
    var Fragment = wp.element.Fragment;
    var __ = (wp.i18n && wp.i18n.__) ? wp.i18n.__ : function (s) { return s; };
    var components = wp.components || {};
    var blockEditor = wp.blockEditor || wp.editor || {};

    var InspectorControls = blockEditor.InspectorControls;
    var useBlockProps = blockEditor.useBlockProps;
    var TextControl = components.TextControl;
    var SelectControl = components.SelectControl;
    var ToggleControl = components.ToggleControl;
    var BaseControl = components.BaseControl;

    var useState = wp.element.useState;
    var useEffect = wp.element.useEffect;

    /** Color swatch + hex text input, side by side and kept in sync. The
     *  swatch is the native browser picker (familiar, free); the text field
     *  accepts pasted hex codes from a brand palette. Three- and six-digit
     *  hex are accepted, the `#` is auto-prefixed, only valid values are
     *  pushed to the parent block attribute. Visual styling lives in
     *  block-editor.css under .lrob-qrm-block-color-row so it follows the
     *  block-editor sidebar's foreground/background CSS variables. */
    function ColorRow(label, value, onChange) {
        var state = useState(value || '#000000');
        var local = state[0];
        var setLocal = state[1];
        useEffect(function () { setLocal(value || '#000000'); }, [value]);

        function commit(raw) {
            setLocal(raw);
            var v = String(raw).trim();
            if (v && v[0] !== '#') v = '#' + v;
            if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) {
                if (v.length === 4) {
                    v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
                }
                onChange(v.toLowerCase());
            }
        }

        return el(
            BaseControl,
            { label: label, className: 'lrob-qrm-block-color-control' },
            el('div', { className: 'lrob-qrm-block-color-row' },
                el('input', {
                    type: 'color',
                    value: value || '#000000',
                    onChange: function (e) { commit(e.target.value); },
                    className: 'lrob-qrm-block-color-swatch',
                    'aria-label': label
                }),
                el('input', {
                    type: 'text',
                    value: local,
                    onChange: function (e) { commit(e.target.value); },
                    placeholder: '#000000',
                    spellCheck: false,
                    maxLength: 7,
                    className: 'lrob-qrm-block-color-hex'
                })
            )
        );
    }

    function Edit(props) {
        var a = props.attributes;
        var set = props.setAttributes;
        var blockProps = useBlockProps ? useBlockProps({ className: 'lrob-qrm-block-edit' }) : {};

        var preview = el(
            'div',
            { className: 'lrob-qrm-block-preview' },
            el('div', { className: 'lrob-qrm-block-preview-frame' },
                el('div', {
                    className: 'lrob-qrm-block-preview-sample',
                    style: {
                        background: a.bgColor,
                        color: a.fgColor
                    }
                }, 'QR'),
                el('p', { className: 'lrob-qrm-block-preview-caption' },
                    __('QR Code Maker — visitors will interact with the live form on the frontend.', 'lrob-qrcode-maker')
                )
            )
        );

        // All settings live flat in the inspector — no PanelBody groupings.
        // The block has few enough controls that categorisation is overhead.
        var inspector = InspectorControls && el(
            InspectorControls,
            null,
            el('div', { className: 'lrob-qrm-block-settings' },
                el(TextControl, {
                    label: __('Default URL or text', 'lrob-qrcode-maker'),
                    help: __('Pre-fill the input on first load (leave empty for a blank form).', 'lrob-qrcode-maker'),
                    value: a.defaultData,
                    onChange: function (v) { set({ defaultData: v }); }
                }),
                el(SelectControl, {
                    label: __('Default format', 'lrob-qrcode-maker'),
                    value: a.defaultFormat,
                    options: [
                        { label: 'WebP', value: 'webp' },
                        { label: 'PNG',  value: 'png' },
                        { label: 'JPEG', value: 'jpeg' }
                    ],
                    onChange: function (v) { set({ defaultFormat: v }); }
                }),
                el(SelectControl, {
                    label: __('Default size (px)', 'lrob-qrcode-maker'),
                    value: String(a.defaultSize),
                    options: [
                        { label: '256 × 256',   value: '256' },
                        { label: '512 × 512',   value: '512' },
                        { label: '1024 × 1024', value: '1024' },
                        { label: '2048 × 2048', value: '2048' },
                        { label: '4096 × 4096', value: '4096' }
                    ],
                    onChange: function (v) { set({ defaultSize: parseInt(v, 10) || 1024 }); }
                }),
                ColorRow(__('Foreground', 'lrob-qrcode-maker'), a.fgColor, function (v) { set({ fgColor: v }); }),
                ColorRow(__('Background', 'lrob-qrcode-maker'), a.bgColor, function (v) { set({ bgColor: v }); }),
                ColorRow(__('Eye color', 'lrob-qrcode-maker'), a.eyeColor, function (v) { set({ eyeColor: v }); }),
                el(SelectControl, {
                    label: __('Eye shape', 'lrob-qrcode-maker'),
                    value: a.eyeShape,
                    options: [
                        { label: __('Square', 'lrob-qrcode-maker'),  value: 'square' },
                        { label: __('Rounded', 'lrob-qrcode-maker'), value: 'rounded' },
                        { label: __('Dots', 'lrob-qrcode-maker'),    value: 'dots' }
                    ],
                    onChange: function (v) { set({ eyeShape: v }); }
                }),
                el(SelectControl, {
                    label: __('Maker layout', 'lrob-qrcode-maker'),
                    value: a.layout || 'preview-right',
                    options: [
                        { label: __('Preview right (default)', 'lrob-qrcode-maker'), value: 'preview-right' },
                        { label: __('Preview left',  'lrob-qrcode-maker'),          value: 'preview-left' },
                        { label: __('Stacked (preview on top)', 'lrob-qrcode-maker'), value: 'stacked' }
                    ],
                    onChange: function (v) { set({ layout: v }); }
                }),
                el(SelectControl, {
                    label: __('Color scheme', 'lrob-qrcode-maker'),
                    value: a.theme || 'auto',
                    options: [
                        { label: __('Auto (follow visitor’s OS preference)', 'lrob-qrcode-maker'), value: 'auto' },
                        { label: __('Light', 'lrob-qrcode-maker'),  value: 'light' },
                        { label: __('Dark', 'lrob-qrcode-maker'),   value: 'dark' },
                        { label: __('Inherit from site theme (FSE)', 'lrob-qrcode-maker'), value: 'site' },
                        { label: __('Custom', 'lrob-qrcode-maker'), value: 'custom' }
                    ],
                    help: a.theme === 'site'
                        ? __('Maps the maker colors to your block theme’s palette (--wp--preset--color--background, --foreground, --primary, --secondary). Falls back to defaults on classic themes.', 'lrob-qrcode-maker')
                        : undefined,
                    onChange: function (v) { set({ theme: v }); }
                }),
                (a.theme === 'custom') && ColorRow(__('Surface (shell background)', 'lrob-qrcode-maker'), a.customSurface     || '#ffffff', function (v) { set({ customSurface: v }); }),
                (a.theme === 'custom') && ColorRow(__('Soft surface (cards)', 'lrob-qrcode-maker'),       a.customSurfaceSoft || '#f6f7f7', function (v) { set({ customSurfaceSoft: v }); }),
                (a.theme === 'custom') && ColorRow(__('Select / input background', 'lrob-qrcode-maker'),  a.customInputBg     || '#ffffff', function (v) { set({ customInputBg: v }); }),
                (a.theme === 'custom') && ColorRow(__('Text', 'lrob-qrcode-maker'),                       a.customText        || '#1d2327', function (v) { set({ customText: v }); }),
                (a.theme === 'custom') && ColorRow(__('Muted text', 'lrob-qrcode-maker'),                 a.customMuted       || '#646970', function (v) { set({ customMuted: v }); }),
                (a.theme === 'custom') && ColorRow(__('Accent (download button)', 'lrob-qrcode-maker'),   a.customAccent      || '#1a73e8', function (v) { set({ customAccent: v }); }),
                el(ToggleControl, {
                    label: __('Show credit footer', 'lrob-qrcode-maker'),
                    help: __('Small "QR Code generator by LRob" line + backlink at the bottom of the maker.', 'lrob-qrcode-maker'),
                    checked: !!a.showCredit,
                    onChange: function (v) { set({ showCredit: v }); }
                })
            )
        );

        return el(Fragment, null, inspector, el('div', blockProps, preview));
    }

    blocks.registerBlockType('lrob-qrm/maker', {
        apiVersion: 3,
        title: __('QR Code Maker', 'lrob-qrcode-maker'),
        description: __('Let visitors design and download their own QR codes.', 'lrob-qrcode-maker'),
        category: 'widgets',
        icon: 'camera-alt',
        keywords: [__('qr', 'lrob-qrcode-maker'), __('qrcode', 'lrob-qrcode-maker'), __('barcode', 'lrob-qrcode-maker')],
        supports: { html: false, anchor: true, align: ['wide', 'full'] },
        edit: Edit,
        save: function () { return null; } // server-rendered
    });
})(window.wp);
