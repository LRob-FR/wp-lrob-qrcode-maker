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
 *
 * AVIF: detected at boot via canvas.toBlob; the format option appears only
 * on browsers that can actually encode AVIF. Slow path: PNG → canvas → AVIF.
 */
(function () {
    'use strict';

    var i18n = (window.wp && window.wp.i18n && window.wp.i18n.__) ? window.wp.i18n.__ : function (s) { return s; };

    // Probe once at boot — every hydrated maker reuses the same Promise.
    var avifEncodingPromise = new Promise(function (resolve) {
        try {
            var c = document.createElement('canvas');
            c.width = c.height = 1;
            c.toBlob(function (b) { resolve(!!b); }, 'image/avif');
        } catch (e) { resolve(false); }
    });

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
            logoSizeRatio: 0.3,
            bgTransparent: false,
            ecLevel: 'L',
            logoAspect: 1,
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

        var initialData = encodedData(state);
        var initialEc = effectiveEc(state.ecLevel, initialData, !!state.logoDataUrl, state.logoSizeRatio, state.logoAspect);
        // SVG + roundSize:false → crisp edges, fills the canvas at any QR version.
        var preview = new window.QRCodeStyling({
            type: 'svg',
            width: 360, height: 360,
            data: initialData,
            margin: 8,
            qrOptions: { errorCorrectionLevel: initialEc, typeNumber: 0, mode: 'Byte' },
            dotsOptions: { color: state.fgColor, type: state.dotShape, roundSize: false },
            backgroundOptions: { color: state.bgColor },
            cornersSquareOptions: { color: state.eyeColor, type: state.eyeShape },
            cornersDotOptions: { color: state.eyeColor, type: innerEyeFromOuter(state.eyeShape) }
        });
        preview.append(ui.previewBox);
        renderStats(ui, initialData, initialEc, L);

        function refreshPreview() {
            var data = encodedData(state);
            var ec = effectiveEc(state.ecLevel, data, !!state.logoDataUrl, state.logoSizeRatio, state.logoAspect);
            preview.update({
                data: data,
                qrOptions: { errorCorrectionLevel: ec, typeNumber: 0, mode: 'Byte' },
                dotsOptions: { color: state.fgColor, type: state.dotShape, roundSize: false },
                backgroundOptions: { color: state.bgTransparent ? 'rgba(0,0,0,0)' : state.bgColor },
                cornersSquareOptions: { color: state.eyeColor, type: state.eyeShape },
                cornersDotOptions: { color: state.eyeColor, type: innerEyeFromOuter(state.eyeShape) },
                image: state.logoDataUrl || undefined,
                imageOptions: {
                    crossOrigin: 'anonymous',
                    margin: 4,
                    imageSize: state.logoSizeRatio,
                    hideBackgroundDots: !!state.logoBackground
                }
            });
            renderStats(ui, data, ec, L);
        }

        ui.bind(state, refreshPreview);

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

    function innerEyeFromOuter(eye) {
        if (eye === 'dot')            return 'dot';
        if (eye === 'extra-rounded')  return 'rounded';
        if (eye === 'classy')         return 'classy';
        if (eye === 'classy-rounded') return 'classy-rounded';
        return 'square';
    }

    /* The composed encoded payload comes from the content-type renderer.
     * Empty payload falls back to lrob.fr so the preview shows something
     * instead of a blank QR. */
    function encodedData(state) {
        var d = state.data ? state.data.trim() : '';
        return d || 'https://www.lrob.fr';
    }

    // Auto-EC pipeline — see README "Error correction (fully automatic)".
    var EC_BYTE_CAP_V40 = { L: 2953, M: 2331, Q: 1663, H: 1273 };
    var EC_RECOVERY = { L: 0.07, M: 0.15, Q: 0.25, H: 0.30 };
    var EC_RANK = { L: 0, M: 1, Q: 2, H: 3 };

    function ecForLogo(logoSizeRatio, aspectRatio) {
        var ratio = parseFloat(logoSizeRatio) || 0;
        if (ratio <= 0) return 'L';
        var k = parseFloat(aspectRatio);
        if (!k || k <= 0) k = 1;
        var thickness = Math.max(k, 1 / k);
        var needed = (0.81 * ratio) / thickness;
        if (needed <= EC_RECOVERY.L) return 'L';
        if (needed <= EC_RECOVERY.M) return 'M';
        if (needed <= EC_RECOVERY.Q) return 'Q';
        return 'H';
    }

    function effectiveEc(ec, data, hasLogo, logoSizeRatio, logoAspect) {
        var preferred = ec || 'M';
        if (hasLogo) {
            var minForLogo = ecForLogo(logoSizeRatio, logoAspect);
            if ((EC_RANK[minForLogo] || 0) > (EC_RANK[preferred] || 0)) {
                preferred = minForLogo;
            }
        }
        var bytes = (typeof TextEncoder !== 'undefined')
            ? new TextEncoder().encode(data || '').length
            : (data ? data.length : 0);
        var order = ['H', 'Q', 'M', 'L'];
        var idx = order.indexOf(preferred);
        if (idx < 0) idx = 2;
        while (idx < order.length && bytes > EC_BYTE_CAP_V40[order[idx]]) idx++;
        return order[Math.min(idx, order.length - 1)];
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
        exportBtn.textContent = L('download') || 'Export QR Code';
        previewWrap.appendChild(exportBtn);

        var stats = document.createElement('p');
        stats.className = 'lrob-qrm-maker-stats';
        stats.setAttribute('aria-live', 'polite');
        previewWrap.appendChild(stats);

        // Contextual notice — only shown when EC was auto-downgraded, payload
        // overflowed, or the QR is dense enough that lowering EC would help.
        var statsNotice = document.createElement('p');
        statsNotice.className = 'lrob-qrm-maker-stats-notice';
        statsNotice.hidden = true;
        previewWrap.appendChild(statsNotice);

        previewCol.appendChild(previewWrap);

        /* ── Content type select + dynamic fields ── */
        var typeField = field(L('contentType') || 'Content type');
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

        var fgField = colorField(L('foreground'), defaults.fgColor);
        colorsRow.appendChild(fgField.field);
        var bgField = colorField(L('background'), defaults.bgColor);
        colorsRow.appendChild(bgField.field);
        var eyeField = colorField(L('eyeColor'), defaults.eyeColor);
        colorsRow.appendChild(eyeField.field);

        var transparentField = inlineCheckbox(L('transparent'));
        formCol.appendChild(transparentField.field);

        // Grey out (rather than hide) the bg color picker when transparent is on.
        transparentField.input.addEventListener('change', function () {
            bgField.field.classList.toggle('lrob-qrm-maker-field-disabled', transparentField.input.checked);
            bgField.input.disabled = transparentField.input.checked;
        });

        var dotPicker = shapePicker(L('dotShape'), 'dotShape', DOT_SHAPES, 'filled', defaults.dotShape, L);
        formCol.appendChild(dotPicker.field);

        var eyePicker = shapePicker(L('eyeShape'), 'eyeShape', EYE_SHAPES, 'outline', defaults.eyeShape, L);
        formCol.appendChild(eyePicker.field);

        /* ── Logo section ── */
        var logoTitle = sectionTitle(L('logo') || 'Logo');
        formCol.appendChild(logoTitle);

        var logoField = field(L('logo') || 'Logo');
        // Remove the duplicated label — we already have a section title.
        logoField.removeChild(logoField.firstChild);
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png,image/jpeg,image/webp';
        logoField.appendChild(fileInput);
        var logoHelp = document.createElement('small');
        logoHelp.textContent = L('logoHelp') || 'PNG, JPEG, or WebP. Stays in your browser, never uploaded.';
        logoField.appendChild(logoHelp);
        formCol.appendChild(logoField);

        var logoBgField = inlineCheckbox(L('logoBackground') || 'Clear QR modules behind logo');
        logoBgField.input.checked = true;
        formCol.appendChild(logoBgField.field);

        var logoSizeField = field(L('logoSize') || 'Logo size');
        var logoSizeValueLabel = document.createElement('span');
        logoSizeValueLabel.className = 'lrob-qrm-maker-range-value';
        logoSizeValueLabel.textContent = '30%';
        logoSizeField.querySelector('span').appendChild(logoSizeValueLabel);
        var logoRange = document.createElement('input');
        logoRange.type = 'range';
        logoRange.min = '0.1'; logoRange.max = '0.3'; logoRange.step = '0.01'; logoRange.value = '0.3';
        logoRange.addEventListener('input', function () {
            logoSizeValueLabel.textContent = Math.round(parseFloat(logoRange.value) * 100) + '%';
        });
        logoSizeField.appendChild(logoRange);
        formCol.appendChild(logoSizeField);

        function bind(state, onChange) {
            onChangeBound = onChange;
            fgField.input.addEventListener('input', function () { state.fgColor = fgField.input.value; onChange(); });
            bgField.input.addEventListener('input', function () { state.bgColor = bgField.input.value; onChange(); });
            eyeField.input.addEventListener('input', function () { state.eyeColor = eyeField.input.value; onChange(); });
            transparentField.input.addEventListener('change', function () { state.bgTransparent = transparentField.input.checked; onChange(); });
            dotPicker.bind(function (v) { state.dotShape = v; onChange(); });
            eyePicker.bind(function (v) { state.eyeShape = v; onChange(); });
            fileInput.addEventListener('change', function () {
                var f = fileInput.files && fileInput.files[0];
                state.logoFile = f || null;
                state.logoAspect = 1;
                if (!f) { state.logoDataUrl = null; onChange(); return; }
                var reader = new FileReader();
                reader.onload = function () {
                    state.logoDataUrl = reader.result;
                    var img = new Image();
                    img.onload = function () {
                        state.logoAspect = (img.naturalWidth > 0)
                            ? (img.naturalHeight / img.naturalWidth)
                            : 1;
                        onChange();
                    };
                    img.onerror = function () { onChange(); };
                    img.src = reader.result;
                };
                reader.readAsDataURL(f);
            });
            logoBgField.input.addEventListener('change', function () {
                state.logoBackground = logoBgField.input.checked; onChange();
            });
            logoRange.addEventListener('input', function () {
                state.logoSizeRatio = parseFloat(logoRange.value); onChange();
            });
        }

        return {
            shell: shell,
            previewBox: previewBox,
            status: status,
            stats: stats,
            statsNotice: statsNotice,
            exportBtn: exportBtn,
            bind: bind,
            getContentValues: function () { return contentRenderer ? contentRenderer.read() : {}; }
        };
    }

    function computeStats(data, effectiveEc, L) {
        var line = '', notice = '';
        if (!window.lrobQrmContent || !window.lrobQrmContent.qrStats) return { line: line, notice: notice };
        var s = window.lrobQrmContent.qrStats(data, effectiveEc);
        if (s.overflow) {
            notice = L('statsOverflow') || 'Content too large to encode as a QR (max 2953 bytes at EC L). Shorten the content.';
            return { line: line, notice: notice };
        }
        if (!s.version) return { line: line, notice: notice };
        line = (L('statsTemplate') || 'QR v%v · %m×%m modules · %b bytes · EC %e')
            .replace('%v', s.version)
            .replace(/%m/g, s.modules)
            .replace('%b', s.bytes)
            .replace('%e', s.ec);
        if (s.bytes > 200) {
            notice = L('statsLengthWarn') || 'Past ~200 bytes, some smartphones may fail to scan the QR. Shorten the content for maximum compatibility.';
            var isVcard = window.lrobQrmContent.guessType && window.lrobQrmContent.guessType(data) === 'vcard';
            if (isVcard) {
                notice += ' ' + (L('statsLengthWarnVcardSuffix') || 'For a contact card, hosting the .vcf file and encoding its URL keeps the QR much shorter.');
            }
        }
        return { line: line, notice: notice };
    }

    function renderStats(ui, data, effectiveEc, L) {
        if (!ui.stats) return;
        var r = computeStats(data, effectiveEc, L);
        ui.stats.textContent = r.line;
        if (ui.statsNotice) {
            ui.statsNotice.textContent = r.notice;
            ui.statsNotice.hidden = !r.notice;
        }
    }

    /* ─── UI helpers ──────────────────────────────────────────────────── */

    function field(labelText) {
        var wrap = document.createElement('label');
        wrap.className = 'lrob-qrm-maker-field';
        var span = document.createElement('span');
        span.textContent = labelText;
        wrap.appendChild(span);
        return wrap;
    }

    function colorField(labelText, def) {
        var f = field(labelText);
        var input = document.createElement('input');
        input.type = 'color';
        input.value = def;
        f.appendChild(input);
        return { field: f, input: input };
    }

    function inlineCheckbox(labelText) {
        var wrap = document.createElement('label');
        wrap.className = 'lrob-qrm-maker-checkbox';
        var input = document.createElement('input');
        input.type = 'checkbox';
        var span = document.createElement('span');
        span.textContent = labelText;
        wrap.appendChild(input);
        wrap.appendChild(span);
        return { field: wrap, input: input };
    }

    function sectionTitle(text) {
        var h = document.createElement('h4');
        h.className = 'lrob-qrm-maker-section-title';
        h.textContent = text;
        return h;
    }

    /* Shape radio tile group — same UX as the admin library editor. */
    function shapePicker(legendText, name, options, variant, defaultValue, L) {
        var fs = document.createElement('fieldset');
        fs.className = 'lrob-qrm-maker-shape-picker';
        var legend = document.createElement('legend');
        legend.textContent = legendText;
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
            +     '<h3>' + escapeHtml(L('exportTitle') || 'Export QR Code') + '</h3>'
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

        avifEncodingPromise.then(function (supported) {
            if (!supported) return;
            if (fmtSel.querySelector('option[value="avif"]')) return;
            var o = document.createElement('option');
            o.value = 'avif'; o.textContent = 'AVIF';
            fmtSel.appendChild(o);
        });

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
        confirmBtn.textContent = L('download') || 'Export QR Code';
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

        var ec = effectiveEc(state.ecLevel, state.data, !!state.logoDataUrl, state.logoSizeRatio, state.logoAspect);
        var exporter = new window.QRCodeStyling({
            width: state.size,
            height: state.size,
            data: state.data,
            margin: Math.max(0, state.margin) * Math.max(2, Math.floor(state.size / 50)),
            qrOptions: { errorCorrectionLevel: ec, typeNumber: 0, mode: 'Byte' },
            dotsOptions: { color: state.fgColor, type: state.dotShape, roundSize: false },
            backgroundOptions: { color: state.bgTransparent ? 'rgba(0,0,0,0)' : state.bgColor },
            cornersSquareOptions: { color: state.eyeColor, type: state.eyeShape },
            cornersDotOptions: { color: state.eyeColor, type: innerEyeFromOuter(state.eyeShape) },
            image: state.logoDataUrl || undefined,
            imageOptions: {
                crossOrigin: 'anonymous',
                margin: 4,
                imageSize: state.logoSizeRatio,
                hideBackgroundDots: !!state.logoBackground
            }
        });

        var filename = 'qrcode-' + Date.now();
        var ready;
        if (state.format === 'avif') {
            ready = exporter.getRawData('png').then(function (pngBlob) {
                return new Promise(function (resolve, reject) {
                    var url = URL.createObjectURL(pngBlob);
                    var img = new Image();
                    img.onload = function () {
                        var c = document.createElement('canvas');
                        c.width = img.width; c.height = img.height;
                        c.getContext('2d').drawImage(img, 0, 0);
                        c.toBlob(function (avifBlob) {
                            URL.revokeObjectURL(url);
                            if (!avifBlob) { reject(new Error('AVIF encoding failed')); return; }
                            triggerDownload(avifBlob, filename + '.avif');
                            resolve();
                        }, 'image/avif', 0.92);
                    };
                    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('PNG decode failed')); };
                    img.src = url;
                });
            });
        } else {
            ready = exporter.download({
                name: filename,
                extension: state.format === 'jpeg' ? 'jpeg' : state.format
            });
        }

        Promise.resolve(ready).then(function () {
            ui.status.textContent = '';
        }).catch(function (e) {
            ui.status.textContent = (e && e.message) ? e.message : (L('errorGeneric') || 'Error');
        }).finally(function () {
            ui.exportBtn.disabled = false;
        });
    }

    function triggerDownload(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }

    /* ─── Boot ────────────────────────────────────────────────────────── */

    function boot() {
        var nodes = document.querySelectorAll('.lrob-qrm-maker');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('data-hydrated') === '1') continue;
            nodes[i].setAttribute('data-hydrated', '1');
            try { hydrate(nodes[i]); } catch (e) { /* per-instance failures */ }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
