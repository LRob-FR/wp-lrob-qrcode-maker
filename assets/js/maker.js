/* LRob QR Code Maker — frontend maker UI.
 *
 * Per-instance flow:
 *   hydrate(root)
 *     ├─ read config from root[data-config]
 *     ├─ build state (Object.assign of defaults + extras) — created BEFORE
 *     │   buildUi so the content-type renderer's onChange callback can
 *     │   safely write to state.data on its initial fire
 *     ├─ buildUi(config, defaults, L, state) — assembles the shell, form
 *     │   columns, shape radio tiles, content-type fields, logo picker,
 *     │   advanced design controls, and an Export QR Code action.
 *     ├─ instantiate qr-code-styling preview attached to ui.previewBox
 *     ├─ refreshPreview() reads state, calls preview.update()
 *     └─ ui.bind(state, refreshPreview) wires the form events
 *
 * Export goes through a dedicated modal (size + format + custom) — same UX
 * as the admin library. The modal lives inside the maker root so it inherits
 * the theme + custom CSS variables.
 */
(function () {
    'use strict';

    var i18n = (window.wp && window.wp.i18n && window.wp.i18n.__) ? window.wp.i18n.__ : function (s) { return s; };

    /* Shape-icon CSS classes used via dynamic concatenation below — listed
     * here as literals so the release.sh dead-css scan finds them:
     *   lrob-qrm-maker-shape-icon-square, lrob-qrm-maker-shape-icon-rounded,
     *   lrob-qrm-maker-shape-icon-extra-rounded, lrob-qrm-maker-shape-icon-dots,
     *   lrob-qrm-maker-shape-icon-dot, lrob-qrm-maker-shape-icon-classy,
     *   lrob-qrm-maker-shape-icon-classy-rounded
     */

    /* ─── Shape definitions (mirror the admin set) ────────────────────── */

    var DOT_SHAPES = [
        ['square',         'Square'],
        ['rounded',        'Rounded'],
        ['extra-rounded',  'Extra rounded'],
        ['dots',           'Dots'],
        ['classy',         'Classy'],
        ['classy-rounded', 'Classy rounded']
    ];
    var EYE_SHAPES = [
        ['square',         'Square'],
        ['extra-rounded',  'Rounded'],
        ['dot',            'Circle'],
        ['classy',         'Classy'],
        ['classy-rounded', 'Classy rounded']
    ];

    function hydrate(root) {
        if (!buildQrConfig) throw new Error('lrobQrmEngine missing');
        var raw = root.getAttribute('data-config') || '{}';
        var config;
        try { config = JSON.parse(raw); } catch (e) { config = {}; }

        var defaults = Object.assign({
            data: '', size: 1024, format: 'webp',
            fgColor: '#000000', bgColor: '#ffffff', eyeColor: '#000000',
            dotShape: 'square', eyeShape: 'square'
        }, config.defaults || {});
        var t = config.i18n || {};
        var L = function (k) { return t[k] || k; };

        // State exists before buildUi — content-type renderer's initial onChange writes state.data.
        var state = Object.assign({}, defaults, {
            logoFile: null,
            logoBackground: true,
            logoSize: 'max',
            ecMode: 'auto',
            bgTransparent: false,
            logoAspect: 1,
            logoNaturalW: 0,
            logoNaturalH: 0,
            margin: 4
        });

        root.innerHTML = '';
        var ui = buildUi(config, defaults, L, state);
        root.appendChild(ui.shell);

        if (root.classList.contains('lrob-qrm-maker-theme-site')) {
            ui.exportBtn.classList.add('wp-element-button');
        }

        if (!window.QRCodeStyling) {
            ui.previewBox.textContent = L('errorGeneric');
            return;
        }

        function currentParams(data) {
            var hasLogo = !!state.logoDataUrl;
            return resolveQrParams(data, state.logoSize, state.logoAspect, state.ecMode, hasLogo);
        }

        function specFromState(data, params) {
            return {
                width: 240, data: data, ec: params.ec,
                fgColor: state.fgColor, bgColor: state.bgColor, eyeColor: state.eyeColor,
                bgTransparent: state.bgTransparent,
                dotShape: state.dotShape, eyeShape: state.eyeShape,
                logoUrl: state.logoDataUrl, logoBackground: state.logoBackground,
                imageSize: params.imageSize
            };
        }

        var initialData = encodedData(state);
        var initialParams = currentParams(initialData);
        var preview = new window.QRCodeStyling(buildQrConfig(specFromState(initialData, initialParams)));
        preview.append(ui.previewBox);
        renderStats(ui, initialData, initialParams, t);
        syncLogoSettingsVisibility(ui, state);

        var lastSpecKey = '';
        function refreshPreview() {
            if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
            lastRefreshAt = Date.now();
            var data = encodedData(state);
            var params = currentParams(data);
            var config = buildQrConfig(specFromState(data, params));
            // Dedup: skip the lib re-render when nothing changed (blur after
            // a debounced refresh would otherwise re-paint the same SVG).
            var key = JSON.stringify(config);
            if (key === lastSpecKey) return;
            lastSpecKey = key;
            preview.update(config);
            renderStats(ui, data, params, t);
            syncLogoSettingsVisibility(ui, state);
        }

        // Adaptive refresh: leading edge if we haven't rendered in the last
        // 500 ms (one-off edits feel instant), trailing edge while inside the
        // window (rapid typing batches into a single render after the pause).
        var REFRESH_DEBOUNCE_MS = 500;
        var refreshTimer = null;
        var lastRefreshAt = 0;
        function refreshPreviewSoon() {
            var now = Date.now();
            if (now - lastRefreshAt >= REFRESH_DEBOUNCE_MS) {
                refreshPreview();
            } else {
                if (refreshTimer) clearTimeout(refreshTimer);
                refreshTimer = setTimeout(refreshPreview, REFRESH_DEBOUNCE_MS);
            }
        }

        ui.bind(state, refreshPreview, refreshPreviewSoon);

        ui.exportBtn.addEventListener('click', function () {
            openExportModal(ui, state, L);
        });

        if (config.showCredit) {
            var credit = document.createElement('p');
            credit.className = 'lrob-qrm-maker-credit';
            var prefix = L('creditPrefix') || 'QR Code generator by';
            var anchorText = L('creditLink') || 'LRob, WordPress web hosting specialist';
            credit.innerHTML = escapeHtml(prefix) + ' <a href="https://www.lrob.fr" target="_blank" rel="noopener nofollow">'
                + escapeHtml(anchorText) + '</a>';
            ui.shell.appendChild(credit);
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Shape normalisation + qr-code-styling config builder live in qr-engine.js.
    var buildQrConfig = (window.lrobQrmEngine || {}).buildQrConfig;

    /* The composed encoded payload comes from the content-type renderer.
     * Empty payload falls back to lrob.fr so the preview shows something
     * instead of a blank QR. */
    function encodedData(state) {
        var d = state.data ? state.data.trim() : '';
        return d || 'https://www.lrob.fr';
    }

    // EC + logo coverage pipeline lives in assets/js/qr-engine.js (shared
     // with the admin library). Thin shim so existing call sites stay clean.
    function resolveQrParams(data, logoSize, aspect, ecMode, hasLogo) {
        return window.lrobQrmEngine.resolveQrParams(data, logoSize, aspect, ecMode, hasLogo);
    }

    /* ─── UI builder ──────────────────────────────────────────────────── */

    function buildUi(config, defaults, L, state) {
        var shell = document.createElement('div');
        shell.className = 'lrob-qrm-maker-shell';

        var grid = document.createElement('div');
        grid.className = 'lrob-qrm-maker-grid';
        shell.appendChild(grid);

        // Preview column (its CSS `order` flips based on layout class on the
        // root). Always contains the QR canvas + the Export QR Code button.
        var previewCol = document.createElement('div');
        previewCol.className = 'lrob-qrm-maker-preview-col';
        grid.appendChild(previewCol);

        var formCol = document.createElement('div');
        formCol.className = 'lrob-qrm-maker-form-col';
        grid.appendChild(formCol);

        var previewWrap = document.createElement('div');
        previewWrap.className = 'lrob-qrm-maker-preview-wrap';
        var previewBox = document.createElement('div');
        previewBox.className = 'lrob-qrm-maker-preview';
        previewWrap.appendChild(previewBox);

        var status = document.createElement('p');
        status.className = 'lrob-qrm-maker-status';
        status.setAttribute('role', 'status');
        previewWrap.appendChild(status);

        var exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'lrob-qrm-maker-download';
        exportBtn.textContent = L('download') || 'Generate image';
        previewWrap.appendChild(exportBtn);

        var stats = document.createElement('p');
        stats.className = 'lrob-qrm-maker-stats';
        stats.setAttribute('aria-live', 'polite');
        previewWrap.appendChild(stats);

        // Contextual notice — payload overflow or scan-reliability warning
        // past ~1000 bytes (with vCard-specific tracking-endpoint hint).
        var statsNotice = document.createElement('p');
        statsNotice.className = 'lrob-qrm-maker-stats-notice';
        statsNotice.hidden = true;
        previewWrap.appendChild(statsNotice);

        previewCol.appendChild(previewWrap);

        /* ── Content type select + dynamic fields ── */
        var typeField = field(L('contentType') || 'Content type', L('contentTypeHelp'));
        var typeSelect = document.createElement('select');
        var typeDefs = (config && config.contentTypes) || {};
        Object.keys(typeDefs).forEach(function (k) {
            var o = document.createElement('option');
            o.value = k; o.textContent = typeDefs[k].label || k;
            typeSelect.appendChild(o);
        });
        typeSelect.value = 'url';
        typeField.appendChild(typeSelect);
        formCol.appendChild(typeField);

        var contentFields = document.createElement('div');
        contentFields.className = 'lrob-qrm-maker-content-fields';
        formCol.appendChild(contentFields);

        var contentRenderer = null;
        var onChangeBound = null; // set by bind()
        function renderContent(typeKey, values) {
            if (!window.lrobQrmContent) return;
            contentRenderer = window.lrobQrmContent.render(
                contentFields, typeKey, typeDefs, values || {},
                function (encoded) {
                    state.data = encoded;
                    if (onChangeBound) onChangeBound();
                },
                // Use the maker-scoped field classes so the modern inline
                // styling actually applies to these dynamic fields.
                {
                    fieldClass: 'lrob-qrm-maker-field',
                    inlineFieldClass: 'lrob-qrm-maker-field lrob-qrm-maker-field-inline'
                }
            );
        }
        renderContent('url', defaults.data ? { url: defaults.data } : {});
        typeSelect.addEventListener('change', function () {
            renderContent(typeSelect.value, {});
        });

        /* ── Design section ── */
        var designTitle = sectionTitle(L('design') || 'Design');
        formCol.appendChild(designTitle);

        var colorsRow = document.createElement('div');
        colorsRow.className = 'lrob-qrm-maker-row';
        formCol.appendChild(colorsRow);

        var fgField = colorField(L('foreground'), defaults.fgColor, L('foregroundHelp'));
        colorsRow.appendChild(fgField.field);
        var bgField = colorField(L('background'), defaults.bgColor, L('backgroundHelp'));
        colorsRow.appendChild(bgField.field);
        var eyeField = colorField(L('eyeColor'), defaults.eyeColor, L('eyeColorHelp'));
        colorsRow.appendChild(eyeField.field);

        var transparentField = inlineCheckbox(L('transparent'), L('transparentHelp'));
        formCol.appendChild(transparentField.field);

        // Grey out (rather than hide) the bg color picker when transparent is on.
        transparentField.input.addEventListener('change', function () {
            bgField.field.classList.toggle('lrob-qrm-maker-field-disabled', transparentField.input.checked);
            bgField.input.disabled = transparentField.input.checked;
        });

        var dotPicker = shapePicker(L('dotShape'), 'dotShape', DOT_SHAPES, 'filled', defaults.dotShape, L, L('dotShapeHelp'));
        formCol.appendChild(dotPicker.field);

        var eyePicker = shapePicker(L('eyeShape'), 'eyeShape', EYE_SHAPES, 'outline', defaults.eyeShape, L, L('eyeShapeHelp'));
        formCol.appendChild(eyePicker.field);

        /* ── Error correction section (own group, between Design and Logo) ── */
        var ecTitle = sectionTitle(L('ecMode') || 'Error correction', L('ecHelp'));
        formCol.appendChild(ecTitle);

        var ecPicker = togglePicker(null, 'ecMode', [
            ['auto', L('ecLevelAuto')   || 'Auto'],
            ['L',    L('ecLevelMin')    || 'Min'],
            ['M',    L('ecLevelLow')    || 'Low'],
            ['Q',    L('ecLevelMedium') || 'Medium'],
            ['H',    L('ecLevelHigh')   || 'High']
        ], 'auto');
        formCol.appendChild(ecPicker.field);

        /* ── Logo section ── */
        var logoTitle = sectionTitle(L('logo') || 'Logo', L('logoSectionHelp'));
        formCol.appendChild(logoTitle);

        var logoField = field(L('logo') || 'Logo');
        logoField.removeChild(logoField.firstChild);
        var logoControls = document.createElement('div');
        logoControls.className = 'lrob-qrm-maker-logo-controls';
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png,image/jpeg,image/webp';
        logoControls.appendChild(fileInput);
        var removeLogoBtn = document.createElement('button');
        removeLogoBtn.type = 'button';
        removeLogoBtn.className = 'lrob-qrm-maker-button lrob-qrm-maker-logo-remove';
        removeLogoBtn.textContent = L('removeLogo') || 'Remove logo';
        removeLogoBtn.hidden = true;
        logoControls.appendChild(removeLogoBtn);
        logoField.appendChild(logoControls);
        var logoHelp = document.createElement('small');
        logoHelp.textContent = L('logoHelp') || 'PNG, JPEG, or WebP. Stays in your browser, never uploaded.';
        logoField.appendChild(logoHelp);
        formCol.appendChild(logoField);

        // Settings that only make sense once a logo is picked.
        var logoSettings = document.createElement('div');
        logoSettings.className = 'lrob-qrm-maker-logo-settings';
        logoSettings.hidden = true;
        formCol.appendChild(logoSettings);

        var logoBgField = inlineCheckbox(L('logoBackground') || 'Clear QR modules behind logo', L('logoBackgroundHelp'));
        logoBgField.input.checked = true;
        logoSettings.appendChild(logoBgField.field);

        var logoSizePicker = togglePicker(L('logoSize') || 'Logo size', 'logoSize', [
            ['safe',   L('logoSizeSafe')   || 'Safe'],
            ['medium', L('logoSizeMedium') || 'Medium'],
            ['max',    L('logoSizeMax')    || 'Max']
        ], 'max', L('logoSizeHelp'));
        logoSettings.appendChild(logoSizePicker.field);

        function bind(state, onChange, onChangeSoon) {
            // onChangeSoon = debounced (typing, colour-picker drag).
            // onChange    = immediate (clicks, single-action commits).
            var deferred = onChangeSoon || onChange;
            onChangeBound = deferred;   // content-type text fields → debounced
            fgField.input.addEventListener('input', function () { state.fgColor = fgField.input.value; deferred(); });
            bgField.input.addEventListener('input', function () { state.bgColor = bgField.input.value; deferred(); });
            eyeField.input.addEventListener('input', function () { state.eyeColor = eyeField.input.value; deferred(); });
            transparentField.input.addEventListener('change', function () { state.bgTransparent = transparentField.input.checked; onChange(); });
            dotPicker.bind(function (v) { state.dotShape = v; onChange(); });
            eyePicker.bind(function (v) { state.eyeShape = v; onChange(); });
            fileInput.addEventListener('change', function () {
                var f = fileInput.files && fileInput.files[0];
                // Cancelling the picker (or change fired with no file) must NOT
                // wipe a previously-loaded logo. Use the explicit Remove button.
                if (!f) return;
                state.logoFile = f;
                state.logoAspect = 1;
                state.logoNaturalW = 0;
                state.logoNaturalH = 0;
                state.logoSize = 'max';
                logoSizePicker.set('max');
                var reader = new FileReader();
                reader.onload = function () {
                    state.logoDataUrl = reader.result;
                    var img = new Image();
                    img.onload = function () {
                        if (img.naturalWidth > 0) {
                            state.logoNaturalW = img.naturalWidth;
                            state.logoNaturalH = img.naturalHeight;
                            state.logoAspect = img.naturalHeight / img.naturalWidth;
                        }
                        removeLogoBtn.hidden = false;
                        onChange();
                    };
                    img.onerror = function () { removeLogoBtn.hidden = false; onChange(); };
                    img.src = reader.result;
                };
                reader.readAsDataURL(f);
            });
            removeLogoBtn.addEventListener('click', function () {
                fileInput.value = '';
                state.logoFile = null;
                state.logoDataUrl = null;
                state.logoAspect = 1;
                state.logoNaturalW = 0;
                state.logoNaturalH = 0;
                removeLogoBtn.hidden = true;
                onChange();
            });
            logoBgField.input.addEventListener('change', function () {
                state.logoBackground = logoBgField.input.checked; onChange();
            });
            logoSizePicker.bind(function (v) { state.logoSize = v; onChange(); });
            ecPicker.bind(function (v) { state.ecMode = v; onChange(); });
        }

        return {
            shell: shell,
            previewBox: previewBox,
            status: status,
            stats: stats,
            statsNotice: statsNotice,
            logoSettings: logoSettings,
            removeLogoBtn: removeLogoBtn,
            exportBtn: exportBtn,
            bind: bind,
            getContentValues: function () { return contentRenderer ? contentRenderer.read() : {}; }
        };
    }

    function renderStats(ui, data, params, i18n) {
        var r = window.lrobQrmEngine.computeStatsText(data, params, i18n);
        if (ui.stats) ui.stats.textContent = r.line;
        if (ui.statsNotice) {
            ui.statsNotice.textContent = r.notice;
            ui.statsNotice.hidden = !r.notice;
        }
    }

    function syncLogoSettingsVisibility(ui, state) {
        if (!ui.logoSettings) return;
        ui.logoSettings.hidden = !state.logoDataUrl;
    }

    /* ─── UI helpers ──────────────────────────────────────────────────── */

    function field(labelText, helpText) {
        var wrap = document.createElement('label');
        wrap.className = 'lrob-qrm-maker-field';
        var span = document.createElement('span');
        span.textContent = labelText;
        if (helpText) span.appendChild(infoBadge(helpText));
        wrap.appendChild(span);
        return wrap;
    }

    function colorField(labelText, def, helpText) {
        var f = field(labelText, helpText);
        var input = document.createElement('input');
        input.type = 'color';
        input.value = def;
        f.appendChild(input);
        return { field: f, input: input };
    }

    function inlineCheckbox(labelText, helpText) {
        var wrap = document.createElement('label');
        wrap.className = 'lrob-qrm-maker-checkbox';
        var input = document.createElement('input');
        input.type = 'checkbox';
        var span = document.createElement('span');
        span.textContent = labelText;
        if (helpText) span.appendChild(infoBadge(helpText));
        wrap.appendChild(input);
        wrap.appendChild(span);
        return { field: wrap, input: input };
    }

    function sectionTitle(text, helpText) {
        var h = document.createElement('h4');
        h.className = 'lrob-qrm-maker-section-title';
        h.textContent = text;
        if (helpText) h.appendChild(infoBadge(helpText));
        return h;
    }

    function infoBadge(helpText) {
        var b = document.createElement('span');
        b.className = 'lrob-qrm-maker-info';
        b.textContent = '(?)';
        b.setAttribute('title', helpText);
        b.setAttribute('tabindex', '0');
        return b;
    }

    /* Toggle pill group — text-labelled radio buttons rendered as a horizontal
     * row of pills. legendText null → no caption (the section h3 already names it).
     * helpText (optional) adds a (?) badge with a native tooltip in the legend. */
    function togglePicker(legendText, name, options, defaultValue, helpText) {
        var fs = document.createElement('fieldset');
        fs.className = 'lrob-qrm-maker-toggle-picker';
        if (legendText) {
            var legend = document.createElement('legend');
            legend.textContent = legendText;
            if (helpText) legend.appendChild(infoBadge(helpText));
            fs.appendChild(legend);
        }
        var inputs = [];
        options.forEach(function (opt) {
            var value = opt[0], label = opt[1];
            var tile = document.createElement('label');
            tile.className = 'lrob-qrm-maker-toggle-tile';
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = name;
            radio.value = value;
            if (value === defaultValue) radio.checked = true;
            tile.appendChild(radio);
            var span = document.createElement('span');
            span.textContent = label;
            tile.appendChild(span);
            fs.appendChild(tile);
            inputs.push(radio);
        });
        return {
            field: fs,
            bind: function (onChange) {
                inputs.forEach(function (i) {
                    i.addEventListener('change', function () { if (i.checked) onChange(i.value); });
                });
            },
            set: function (value) {
                inputs.forEach(function (i) { i.checked = (i.value === value); });
            }
        };
    }

    /* Shape radio tile group — same UX as the admin library editor. */
    function shapePicker(legendText, name, options, variant, defaultValue, L, helpText) {
        var fs = document.createElement('fieldset');
        fs.className = 'lrob-qrm-maker-shape-picker';
        var legend = document.createElement('legend');
        legend.textContent = legendText;
        if (helpText) legend.appendChild(infoBadge(helpText));
        fs.appendChild(legend);

        var inputs = [];
        options.forEach(function (opt) {
            var value = opt[0], label = L(opt[1]) || opt[1];
            var tile = document.createElement('label');
            tile.className = 'lrob-qrm-maker-shape-tile';
            // Shape name on hover/focus rather than under the icon — keeps
            // the picker compact (6 tiles wide).
            tile.setAttribute('title', label);
            tile.setAttribute('aria-label', label);

            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = name;
            radio.value = value;
            if (value === defaultValue) radio.checked = true;
            tile.appendChild(radio);
            inputs.push(radio);

            var icon = document.createElement('span');
            icon.className = 'lrob-qrm-maker-shape-icon lrob-qrm-maker-shape-icon-' + value
                + ' lrob-qrm-maker-shape-icon-' + variant;
            tile.appendChild(icon);

            fs.appendChild(tile);
        });

        return {
            field: fs,
            bind: function (onChange) {
                inputs.forEach(function (i) {
                    i.addEventListener('change', function () { if (i.checked) onChange(i.value); });
                });
            }
        };
    }

    /* ─── Export modal ────────────────────────────────────────────────── */

    function openExportModal(ui, state, L) {
        var modal = document.createElement('div');
        modal.className = 'lrob-qrm-maker-modal';
        modal.innerHTML =
            '<div class="lrob-qrm-maker-modal-backdrop"></div>'
            + '<div class="lrob-qrm-maker-modal-panel" role="dialog" aria-modal="true">'
            +   '<header class="lrob-qrm-maker-modal-header">'
            +     '<h3>' + escapeHtml(L('exportTitle') || 'Generate image') + '</h3>'
            +     '<button type="button" class="lrob-qrm-maker-modal-close" aria-label="' + escapeHtml(L('close') || 'Close') + '">&times;</button>'
            +   '</header>'
            +   '<div class="lrob-qrm-maker-modal-body"></div>'
            + '</div>';

        var body = modal.querySelector('.lrob-qrm-maker-modal-body');

        // Size select
        var sizeF = field(L('size') || 'Size');
        var sizeSel = document.createElement('select');
        [['256', '256 × 256'], ['512', '512 × 512'], ['1024', '1024 × 1024'],
         ['2048', '2048 × 2048'], ['4096', '4096 × 4096'],
         ['custom', L('custom') || 'Custom…']
        ].forEach(function (p) {
            var o = document.createElement('option');
            o.value = p[0]; o.textContent = p[1];
            if (p[0] === '1024') o.selected = true;
            sizeSel.appendChild(o);
        });
        sizeF.appendChild(sizeSel);
        body.appendChild(sizeF);

        var customF = field(L('customSize') || 'Custom size (px)');
        customF.hidden = true;
        var customIn = document.createElement('input');
        customIn.type = 'number';
        customIn.min = '64'; customIn.max = '8192'; customIn.step = '1'; customIn.value = '1024';
        customF.appendChild(customIn);
        body.appendChild(customF);

        sizeSel.addEventListener('change', function () {
            customF.hidden = sizeSel.value !== 'custom';
        });

        // Format select
        var fmtF = field(L('format') || 'Format');
        var fmtSel = document.createElement('select');
        ['webp', 'png', 'jpeg'].forEach(function (f) {
            var o = document.createElement('option');
            o.value = f; o.textContent = f.toUpperCase();
            if (f === 'webp') o.selected = true;
            fmtSel.appendChild(o);
        });
        fmtF.appendChild(fmtSel);
        body.appendChild(fmtF);

        // Scan-test reminder — printed in large quantities = expensive mistake
        // if the QR happens not to scan reliably on some phones.
        var warning = document.createElement('p');
        warning.className = 'lrob-qrm-maker-export-warning';
        warning.textContent = L('exportWarning')
            || 'Always scan-test the QR with a real phone before printing at scale — colours, logo overlap and print quality can affect readability.';
        body.appendChild(warning);

        // Actions
        var actions = document.createElement('footer');
        actions.className = 'lrob-qrm-maker-modal-actions';
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'lrob-qrm-maker-button';
        cancelBtn.textContent = L('cancel') || 'Cancel';
        actions.appendChild(cancelBtn);
        var confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'lrob-qrm-maker-button lrob-qrm-maker-button-primary';
        confirmBtn.textContent = L('download') || 'Generate image';
        actions.appendChild(confirmBtn);
        body.appendChild(actions);

        // Append to maker root so theme + custom CSS variables apply.
        ui.shell.parentNode.appendChild(modal);

        function close() {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            document.removeEventListener('keydown', onKey);
        }
        function onKey(e) { if (e.key === 'Escape') close(); }
        document.addEventListener('keydown', onKey);

        cancelBtn.addEventListener('click', close);
        modal.querySelector('.lrob-qrm-maker-modal-close').addEventListener('click', close);
        modal.querySelector('.lrob-qrm-maker-modal-backdrop').addEventListener('click', close);

        confirmBtn.addEventListener('click', function () {
            var size;
            if (sizeSel.value === 'custom') {
                size = parseInt(customIn.value, 10) || 1024;
            } else {
                size = parseInt(sizeSel.value, 10);
            }
            if (!size || size < 64) size = 1024;
            if (size > 8192) size = 8192;
            state.size = size;
            state.format = fmtSel.value;
            close();
            doDownload(state, ui, L);
        });
    }

    /* ─── Download (client-side via qr-code-styling) ──────────────────── */

    function doDownload(state, ui, L) {
        if (!state.data || !state.data.trim()) {
            ui.status.textContent = L('data') || 'Enter a URL or content first.';
            return;
        }
        if (!window.QRCodeStyling) {
            ui.status.textContent = L('errorGeneric') || 'Sorry, something went wrong.';
            return;
        }
        ui.exportBtn.disabled = true;
        ui.status.textContent = L('downloading') || 'Generating…';

        var exportParams = resolveQrParams(state.data, state.logoSize, state.logoAspect, state.ecMode, !!state.logoDataUrl);
        var exporter = new window.QRCodeStyling(buildQrConfig({
            type: 'canvas',
            width: state.size,
            data: state.data, ec: exportParams.ec,
            margin: Math.max(0, state.margin) * Math.max(2, Math.floor(state.size / 50)),
            fgColor: state.fgColor, bgColor: state.bgColor, eyeColor: state.eyeColor,
            bgTransparent: state.bgTransparent,
            dotShape: state.dotShape, eyeShape: state.eyeShape,
            logoUrl: state.logoDataUrl, logoBackground: state.logoBackground,
            imageSize: exportParams.imageSize
        }));

        var filename = 'qrcode-' + Date.now();
        var ready = exporter.download({
            name: filename,
            extension: state.format === 'jpeg' ? 'jpeg' : state.format
        });

        Promise.resolve(ready).then(function () {
            ui.status.textContent = '';
        }).catch(function (e) {
            ui.status.textContent = (e && e.message) ? e.message : (L('errorGeneric') || 'Error');
        }).finally(function () {
            ui.exportBtn.disabled = false;
        });
    }

    /* ─── Boot ────────────────────────────────────────────────────────── */

    function boot() {
        var nodes = document.querySelectorAll('.lrob-qrm-maker');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('data-hydrated') === '1') continue;
            nodes[i].setAttribute('data-hydrated', '1');
            try { hydrate(nodes[i]); }
            catch (e) { if (window.console) window.console.error('[lrob-qrm-maker]', e); }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
