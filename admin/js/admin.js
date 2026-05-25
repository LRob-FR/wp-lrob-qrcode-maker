/* LRob QR Code Maker — admin library page.
 *
 * Vanilla JS. The page server-renders the card grid + a hidden modal editor;
 * this script wires the actions and drives the qr-code-styling preview for
 * the editor + the small previews on each card.
 *
 * Rendering: the same qr-code-styling instance handles preview and export
 * (export instance is built fresh at the requested size). No server-side
 * rendering. Server only stores QR metadata + handles /qr/{slug} redirect.
 *
 * AVIF support: detected once at boot via canvas.toBlob; the option is added
 * to the format select only on browsers that can actually encode it.
 */
(function () {
    'use strict';
    var cfg = window.lrobQrmAdmin || {};
    if (!cfg.restLibrary) return;

    var grid = document.querySelector('[data-role="grid"]');
    // The promo strip is shared by Library + Settings pages, but the rest of
    // this script only applies to Library (it owns the QR editor modal). Boot
    // the promo first so the Settings page still gets it before we early-out.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootLrobPromo);
    } else {
        bootLrobPromo();
    }

    var editor = document.querySelector('[data-role="editor"]');
    var preview = editor ? editor.querySelector('[data-role="preview"]') : null;
    var form = editor ? editor.querySelector('[data-role="form"]') : null;
    if (!editor || !form) return;

    var currentId = 0;
    var qrPreview = null;
    var logoPreviewUrl = null;
    var logoPreviewAspect = 1;
    var mediaFrame = null;

    /* ─── AVIF capability detection ──────────────────────────────────── */

    var avifEncodingPromise = (function () {
        return new Promise(function (resolve) {
            try {
                var c = document.createElement('canvas');
                c.width = c.height = 1;
                c.toBlob(function (b) { resolve(!!b); }, 'image/avif');
            } catch (e) { resolve(false); }
        });
    })();

    // (AVIF option added in openExportModal init below — the export controls
    // moved out of the main editor form into the dedicated export modal.)

    /* ─── Editor preview (qr-code-styling) ───────────────────────────── */

    function ensurePreview() {
        if (!window.QRCodeStyling) return null;
        if (qrPreview) return qrPreview;
        qrPreview = new window.QRCodeStyling({
            type: 'svg',
            width: 280, height: 280, data: ' ',
            margin: 8,
            qrOptions: { errorCorrectionLevel: 'M' },
            dotsOptions: { color: '#000', type: 'square', roundSize: false },
            backgroundOptions: { color: '#fff' },
            cornersSquareOptions: { color: '#000', type: 'square' },
            cornersDotOptions: { color: '#000', type: 'square' }
        });
        qrPreview.append(preview);
        return qrPreview;
    }

    function readSpec() {
        var fd = new FormData(form);
        // size + format live in the export modal now; the design form just
        // carries the design data. Default size/format come from settings.
        var defaults = (cfg && cfg.exportDefaults) || {};
        var spec = {
            data:           (fd.get('data') || '').toString(),
            size:           parseInt(defaults.size, 10) || 1024,
            ecLevel:        'L',
            fgColor:        (fd.get('fgColor') || '#000000').toString(),
            bgColor:        (fd.get('bgColor') || '#ffffff').toString(),
            eyeColor:       (fd.get('eyeColor') || '#000000').toString(),
            bgTransparent:  !!fd.get('bgTransparent'),
            dotShape:       (fd.get('dotShape') || 'square').toString(),
            eyeShape:       (fd.get('eyeShape') || 'square').toString(),
            format:         (defaults.format || 'webp').toString(),
            logoSizeRatio:  parseFloat(fd.get('logoSizeRatio') || '0.3'),
            logoBackground: !!fd.get('logoBackground'),
            margin:         4
        };
        return {
            spec: spec,
            label: (fd.get('label') || '').toString(),
            tracking_enabled: !!fd.get('tracking_enabled'),
            logo_attachment_id: parseInt(fd.get('logo_attachment_id') || '0', 10)
        };
    }

    function refreshPreview() {
        var qp = ensurePreview();
        if (!qp) return;
        var d = readSpec();
        // What the QR actually encodes: tracking URL when enabled (using the
        // existing slug if we're editing a saved QR, else a placeholder so the
        // user sees a faithful preview of the post-save behaviour), otherwise
        // the raw target.
        var encoded = d.spec.data || ' ';
        if (d.tracking_enabled) {
            var savedSlug = (trackingUrlEl && trackingUrlEl.getAttribute('data-current-slug')) || '';
            encoded = (cfg.trackingBase || '/') + (savedSlug || 'preview');
        }
        var ec = effectiveEc(d.spec.ecLevel, encoded, logoPreviewUrl, d.spec.logoSizeRatio, logoPreviewAspect);
        qp.update({
            data: encoded,
            qrOptions: { errorCorrectionLevel: ec, typeNumber: 0, mode: 'Byte' },
            dotsOptions: { color: d.spec.fgColor, type: normalizeDotShape(d.spec.dotShape), roundSize: false },
            backgroundOptions: { color: d.spec.bgTransparent ? 'rgba(0,0,0,0)' : d.spec.bgColor },
            cornersSquareOptions: { color: d.spec.eyeColor, type: normalizeEyeShape(d.spec.eyeShape) },
            cornersDotOptions: {
                color: d.spec.eyeColor,
                type: innerEyeFromOuter(d.spec.eyeShape)
            },
            image: logoPreviewUrl || undefined,
            imageOptions: {
                crossOrigin: 'anonymous',
                margin: 4,
                imageSize: d.spec.logoSizeRatio,
                hideBackgroundDots: !!d.spec.logoBackground
            }
        });
        renderStats(encoded, ec);
    }

    var statsEl = form ? form.parentNode.querySelector('[data-role="stats"]') : null;
    var statsNoticeEl = form ? form.parentNode.querySelector('[data-role="stats-notice"]') : null;
    var statsI18n = (cfg && cfg.i18n) || {};

    function renderStats(data, effEc) {
        if (!statsEl || !window.lrobQrmContent || !window.lrobQrmContent.qrStats) return;
        var s = window.lrobQrmContent.qrStats(data, effEc);
        var line = '', notice = '';
        if (s.overflow) {
            notice = statsI18n.statsOverflow || 'Content too large to encode as a QR.';
        } else if (s.version) {
            line = (statsI18n.statsTemplate || 'QR v%v · %m×%m modules · %b bytes · EC %e')
                .replace('%v', s.version).replace(/%m/g, s.modules)
                .replace('%b', s.bytes).replace('%e', s.ec);
            if (s.bytes > 200) {
                notice = statsI18n.statsLengthWarn || 'Past ~200 bytes, some smartphones may fail to scan the QR.';
                var isVcard = window.lrobQrmContent.guessType && window.lrobQrmContent.guessType(data) === 'vcard';
                if (isVcard) {
                    notice += ' ' + (statsI18n.statsLengthWarnVcardSuffix || 'For a contact card, hosting the .vcf file and encoding its URL keeps the QR much shorter.');
                }
            }
        }
        statsEl.textContent = line;
        if (statsNoticeEl) {
            statsNoticeEl.textContent = notice;
            statsNoticeEl.hidden = !notice;
        }
    }

    // Shape value normalisation: accepts both the new qr-code-styling values
    // ('extra-rounded', 'classy', 'classy-rounded', etc.) and the legacy ones
    // saved by earlier versions of this plugin ('rounded' / 'dots' for eyes).
    // qr-code-styling itself accepts: dotsOptions.type ∈ {square, dots, rounded,
    // extra-rounded, classy, classy-rounded}; cornersSquareOptions.type ∈
    // {square, dot, extra-rounded, classy, classy-rounded}.
    function normalizeDotShape(shape) {
        var s = String(shape || 'square');
        var allowed = ['square', 'rounded', 'extra-rounded', 'dots', 'classy', 'classy-rounded'];
        return allowed.indexOf(s) >= 0 ? s : 'square';
    }
    function normalizeEyeShape(shape) {
        var s = String(shape || 'square');
        // Legacy aliases from earlier plugin versions:
        if (s === 'dots')    return 'dot';            // we renamed Dot → Circle
        if (s === 'rounded') return 'extra-rounded';  // old "rounded" was the lib's extra-rounded
        var allowed = ['square', 'dot', 'extra-rounded', 'classy', 'classy-rounded'];
        return allowed.indexOf(s) >= 0 ? s : 'square';
    }
    // The inner eye dot follows the outer choice: a circle eye gets a circle
    // dot, a classy eye gets a classy dot. qr-code-styling cornersDotOptions
    // supports {square, dot, rounded, classy, classy-rounded, extra-rounded}.
    function innerEyeFromOuter(eye) {
        var s = normalizeEyeShape(eye);
        if (s === 'dot') return 'dot';
        if (s === 'extra-rounded') return 'rounded';
        if (s === 'classy') return 'classy';
        if (s === 'classy-rounded') return 'classy-rounded';
        return 'square';
    }

    /* ─── Logo picker (WP Media Library) ─────────────────────────────── */

    var logoIdInput = form.querySelector('input[name="logo_attachment_id"]');
    var logoThumb = form.querySelector('[data-role="logo-thumb"]');
    var pickLogoBtn = form.querySelector('[data-action="pick-logo"]');
    var removeLogoBtn = form.querySelector('[data-action="remove-logo"]');

    function setLogo(attachmentId, previewUrl, aspect) {
        if (logoIdInput) logoIdInput.value = String(attachmentId || 0);
        logoPreviewUrl = previewUrl || null;
        if (typeof aspect === 'number' && aspect > 0) {
            logoPreviewAspect = aspect;
        } else if (previewUrl) {
            logoPreviewAspect = 1;
            var probe = new Image();
            probe.onload = function () {
                if (probe.naturalWidth > 0) {
                    logoPreviewAspect = probe.naturalHeight / probe.naturalWidth;
                    refreshPreview();
                }
            };
            probe.src = previewUrl;
        } else {
            logoPreviewAspect = 1;
        }
        if (logoThumb) {
            if (previewUrl) {
                logoThumb.src = previewUrl;
                logoThumb.hidden = false;
            } else {
                logoThumb.removeAttribute('src');
                logoThumb.hidden = true;
            }
        }
        if (removeLogoBtn) removeLogoBtn.hidden = !attachmentId;
        if (pickLogoBtn) {
            pickLogoBtn.textContent = attachmentId
                ? (cfg.i18n.changeLogo || 'Change logo')
                : (cfg.i18n.pickLogo || 'Pick logo from Media Library');
        }
        refreshPreview();
    }

    function openMediaPicker() {
        if (!window.wp || !window.wp.media) {
            alert((cfg.i18n.error || 'Error') + ': wp.media not available');
            return;
        }
        if (!mediaFrame) {
            mediaFrame = window.wp.media({
                title: cfg.i18n.mediaTitle || 'Choose a logo image',
                button: { text: cfg.i18n.mediaButton || 'Use this logo' },
                multiple: false,
                library: { type: ['image/png', 'image/jpeg', 'image/webp'] }
            });
            mediaFrame.on('select', function () {
                var att = mediaFrame.state().get('selection').first().toJSON();
                if (!att || !att.id) return;
                var thumbUrl = att.url;
                if (att.sizes && att.sizes.medium && att.sizes.medium.url) {
                    thumbUrl = att.sizes.medium.url;
                } else if (att.sizes && att.sizes.thumbnail && att.sizes.thumbnail.url) {
                    thumbUrl = att.sizes.thumbnail.url;
                }
                var aspect = (att.width && att.height && att.width > 0)
                    ? (att.height / att.width) : 1;
                setLogo(att.id, thumbUrl, aspect);
            });
        }
        mediaFrame.open();
    }

    if (pickLogoBtn) pickLogoBtn.addEventListener('click', function (e) { e.preventDefault(); openMediaPicker(); });
    if (removeLogoBtn) removeLogoBtn.addEventListener('click', function (e) { e.preventDefault(); setLogo(0, null); });

    /* ─── Conditional UI (transparent bg, custom size, logo size %) ──── */

    var bgColorField = form.querySelector('[data-role="bgcolor-field"]');
    var bgColorInput = bgColorField ? bgColorField.querySelector('input[type="color"]') : null;
    var bgTransparentInput = form.querySelector('input[name="bgTransparent"]');
    function syncBgTransparent() {
        if (!bgColorField || !bgTransparentInput) return;
        var off = bgTransparentInput.checked;
        // Visually mark the background color as disabled rather than hide it —
        // the field stays in place so users see the relationship between the
        // transparency toggle and the color picker.
        bgColorField.classList.toggle('lrob-qrm-field-disabled', off);
        if (bgColorInput) bgColorInput.disabled = off;
    }
    if (bgTransparentInput) bgTransparentInput.addEventListener('change', syncBgTransparent);

    /* WordPress core's wpColorPicker — single widget exposing the swatch +
       a popover with hex / RGB inputs. The underlying text input keeps its
       `name` attribute, so FormData() picks the chosen value up unchanged.
       We wire `change` to refreshPreview because wpColorPicker doesn't fire
       native `input` events on the wrapped text field. */
    var $form = window.jQuery ? window.jQuery(form) : null;
    if ($form && $form.wpColorPicker) {
        $form.find('.lrob-qrm-color-picker').wpColorPicker({
            change: function () { setTimeout(refreshPreview, 0); },
            clear:  function () { setTimeout(refreshPreview, 0); }
        });
    }

    // Size/format moved out to the dedicated export modal (see below) —
    // keeping a no-op syncCustomSize stub so older callers in loadIntoEditor
    // continue to work without an undefined-function error.
    function syncCustomSize() { /* no-op since export controls are in the export modal */ }

    var logoSizeRange = form.querySelector('input[name="logoSizeRatio"]');
    var logoSizeValue = form.querySelector('[data-role="logo-size-value"]');
    function syncLogoSizeValue() {
        if (!logoSizeRange || !logoSizeValue) return;
        logoSizeValue.textContent = Math.round(parseFloat(logoSizeRange.value) * 100) + '%';
    }
    if (logoSizeRange) logoSizeRange.addEventListener('input', syncLogoSizeValue);

    /* ─── Content type renderer ──────────────────────────────────────── */

    var contentTypeSelect = form.querySelector('select[name="contentType"]');
    var contentFieldsContainer = form.querySelector('[data-role="content-fields"]');
    var dataEncodedInput = form.querySelector('input[name="data"][data-role="data-encoded"]');
    var contentRenderer = null;

    function renderContentType(typeKey, values) {
        if (!contentFieldsContainer || !window.lrobQrmContent) return;
        var defs = (cfg && cfg.contentTypes) || {};
        contentRenderer = window.lrobQrmContent.render(
            contentFieldsContainer,
            typeKey,
            defs,
            values || {},
            function (encoded /*, fieldVals */) {
                if (dataEncodedInput) dataEncodedInput.value = encoded;
                refreshPreview();
            }
        );
    }

    if (contentTypeSelect) {
        contentTypeSelect.addEventListener('change', function () {
            renderContentType(contentTypeSelect.value, {});
        });
    }

    var trackingCheckbox = form.querySelector('input[name="tracking_enabled"]');
    var trackingPreview = form.querySelector('[data-role="tracking-preview"]');
    var trackingUrlEl = form.querySelector('[data-role="tracking-url"]');
    function syncTrackingPreview() {
        if (!trackingCheckbox || !trackingPreview || !trackingUrlEl) return;
        if (trackingCheckbox.checked) {
            trackingPreview.hidden = false;
            // We don't know the slug until save; show a placeholder showing
            // the path shape so the user understands the URL structure.
            var existingSlug = trackingUrlEl.getAttribute('data-current-slug') || '';
            if (existingSlug) {
                trackingUrlEl.textContent = (cfg.trackingBase || '/') + existingSlug;
            } else {
                trackingUrlEl.textContent = (cfg.trackingBase || '/') + '…  (' + (cfg.i18n.trackingHint || 'slug on save') + ')';
            }
        } else {
            trackingPreview.hidden = true;
        }
    }
    if (trackingCheckbox) trackingCheckbox.addEventListener('change', syncTrackingPreview);

    /* ─── Form event wiring ──────────────────────────────────────────── */

    form.addEventListener('input', function (e) {
        if (e.target && e.target.name === 'logo_attachment_id') return;
        refreshPreview();
    });
    form.addEventListener('change', function (e) {
        if (e.target && e.target.name === 'logo_attachment_id') return;
        refreshPreview();
    });

    /* ─── Modal open / close ─────────────────────────────────────────── */

    function openEditor() {
        editor.hidden = false;
        document.body.classList.add('lrob-qrm-modal-open');
        // Focus the first input for keyboard users.
        setTimeout(function () {
            var first = form.querySelector('input[name="data"]');
            if (first) first.focus();
        }, 0);
    }
    function closeEditor() {
        editor.hidden = true;
        document.body.classList.remove('lrob-qrm-modal-open');
        currentId = 0;
        setLogo(0, null);
        if (trackingUrlEl) trackingUrlEl.removeAttribute('data-current-slug');
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !editor.hidden) closeEditor();
    });

    document.querySelectorAll('[data-action="new-qr"]').forEach(function (b) {
        b.addEventListener('click', function () {
            currentId = 0;
            form.reset();
            setLogo(0, null);
            if (contentTypeSelect) contentTypeSelect.value = 'url';
            renderContentType('url', {});
            syncCustomSize();
            syncBgTransparent();
            syncLogoSizeValue();
            syncTrackingPreview();
            openEditor();
            refreshPreview();
        });
    });

    document.querySelectorAll('[data-action="cancel"]').forEach(function (b) {
        b.addEventListener('click', closeEditor);
    });

    document.querySelectorAll('[data-action="download"]').forEach(function (b) {
        b.addEventListener('click', function (e) {
            e.preventDefault();
            var card = b.closest('[data-id]');
            if (card) {
                var id = parseInt(card.getAttribute('data-id'), 10);
                downloadById(id);
            } else {
                downloadFromForm();
            }
        });
    });

    document.querySelectorAll('[data-action="save"]').forEach(function (b) {
        b.addEventListener('click', function () { saveFromForm(); });
    });

    document.querySelectorAll('[data-action="edit"]').forEach(function (b) {
        b.addEventListener('click', function () {
            var card = b.closest('[data-id]');
            if (!card) return;
            loadIntoEditor(parseInt(card.getAttribute('data-id'), 10));
        });
    });

    document.querySelectorAll('[data-action="delete"]').forEach(function (b) {
        b.addEventListener('click', function () {
            if (!confirm(cfg.i18n.confirmDelete || 'Delete?')) return;
            var card = b.closest('[data-id]');
            if (!card) return;
            var id = parseInt(card.getAttribute('data-id'), 10);
            fetch(cfg.restLibrary + '/' + id, {
                method: 'DELETE',
                headers: { 'X-WP-Nonce': cfg.nonce },
                credentials: 'same-origin'
            }).then(function (r) {
                if (r.ok) card.remove();
            });
        });
    });

    /* ─── Card previews (qr-code-styling on each card) ───────────────── */

    function renderCardPreviews() {
        if (!window.QRCodeStyling || !grid) return;
        grid.querySelectorAll('.lrob-qrm-card').forEach(function (card) {
            if (card.getAttribute('data-preview-rendered') === '1') return;
            var holder = card.querySelector('[data-role="card-preview"]');
            if (!holder) return;
            var raw = card.getAttribute('data-qr');
            if (!raw) return;
            var info;
            try { info = JSON.parse(raw); } catch (e) { return; }
            var d = info.design || {};
            var ec = effectiveEc('L', info.encoded, info.logoUrl, d.logoSizeRatio, info.logoAspect);
            var qp = new window.QRCodeStyling({
                type: 'svg',
                width: 240, height: 240,
                data: (info.encoded || ' '),
                margin: 6,
                qrOptions: { errorCorrectionLevel: ec, typeNumber: 0, mode: 'Byte' },
                dotsOptions: { color: d.fgColor || '#000000', type: normalizeDotShape(d.dotShape), roundSize: false },
                backgroundOptions: { color: d.bgTransparent ? 'rgba(0,0,0,0)' : (d.bgColor || '#ffffff') },
                cornersSquareOptions: { color: d.eyeColor || d.fgColor || '#000000', type: normalizeEyeShape(d.eyeShape) },
                cornersDotOptions: {
                    color: d.eyeColor || d.fgColor || '#000000',
                    type: innerEyeFromOuter(d.eyeShape)
                },
                image: info.logoUrl || undefined,
                imageOptions: {
                    crossOrigin: 'anonymous',
                    margin: 2,
                    imageSize: parseFloat(d.logoSizeRatio) || 0.3,
                    hideBackgroundDots: !!d.logoBackground
                }
            });
            qp.append(holder);
            card.setAttribute('data-preview-rendered', '1');
        });
    }

    /* ─── Export modal (the actual download dialog) ───────────────────── */

    var exportModal = document.querySelector('[data-role="export-modal"]');
    var exportPreview = exportModal ? exportModal.querySelector('[data-role="export-preview"]') : null;
    var exportSizeSelect = exportModal ? exportModal.querySelector('[data-role="export-size-select"]') : null;
    var exportCustomSizeField = exportModal ? exportModal.querySelector('[data-role="export-custom-size-field"]') : null;
    var exportFormatSelect = exportModal ? exportModal.querySelector('[data-role="export-format-select"]') : null;
    var exportPreviewQr = null;
    var exportSpec = null;    // current spec being exported
    var exportLogoUrl = null; // logo URL bound to this export
    var exportLogoAspect = 1;
    var exportLabel = '';     // filename base

    if (exportSizeSelect) {
        exportSizeSelect.addEventListener('change', function () {
            if (exportCustomSizeField) exportCustomSizeField.hidden = exportSizeSelect.value !== 'custom';
        });
    }

    // AVIF option added dynamically when the browser actually supports it.
    avifEncodingPromise.then(function (supported) {
        if (!supported || !exportFormatSelect) return;
        if (exportFormatSelect.querySelector('option[value="avif"]')) return;
        var opt = document.createElement('option');
        opt.value = 'avif';
        opt.textContent = 'AVIF';
        exportFormatSelect.appendChild(opt);
    });

    function applyExportDefaults() {
        var defaults = (cfg && cfg.exportDefaults) || {};
        if (exportSizeSelect) {
            var size = String(defaults.size || 1024);
            if (exportSizeSelect.querySelector('option[value="' + size + '"]')) {
                exportSizeSelect.value = size;
            } else {
                exportSizeSelect.value = 'custom';
                var custom = exportCustomSizeField && exportCustomSizeField.querySelector('input');
                if (custom) custom.value = size;
            }
            if (exportCustomSizeField) exportCustomSizeField.hidden = exportSizeSelect.value !== 'custom';
        }
        if (exportFormatSelect) {
            var format = String(defaults.format || 'webp');
            if (exportFormatSelect.querySelector('option[value="' + format + '"]')) {
                exportFormatSelect.value = format;
            }
        }
    }

    function openExportModal(spec, logoUrl, label, logoAspect) {
        if (!exportModal) return;
        if (!spec || !spec.data || !spec.data.toString().trim()) {
            alert(cfg.i18n.error || 'Error');
            return;
        }
        exportSpec = spec;
        exportLogoUrl = logoUrl || null;
        exportLogoAspect = (typeof logoAspect === 'number' && logoAspect > 0) ? logoAspect : 1;
        exportLabel = label || '';
        applyExportDefaults();
        renderExportPreview();
        exportModal.hidden = false;
        document.body.classList.add('lrob-qrm-modal-open');
    }

    function closeExportModal() {
        if (!exportModal) return;
        exportModal.hidden = true;
        if (editor.hidden) document.body.classList.remove('lrob-qrm-modal-open');
        exportSpec = null;
        exportLogoUrl = null;
        exportLogoAspect = 1;
        exportLabel = '';
    }

    function renderExportPreview() {
        if (!exportPreview || !exportSpec || !window.QRCodeStyling) return;
        exportPreview.innerHTML = '';
        exportPreviewQr = new window.QRCodeStyling({
            type: 'svg',
            width: 240, height: 240,
            data: exportSpec.data,
            margin: 8,
            qrOptions: { errorCorrectionLevel: effectiveEc(exportSpec.ecLevel, exportSpec.data, exportLogoUrl, exportSpec.logoSizeRatio, exportLogoAspect), typeNumber: 0, mode: 'Byte' },
            dotsOptions: { color: exportSpec.fgColor || '#000000', type: normalizeDotShape(exportSpec.dotShape), roundSize: false },
            backgroundOptions: { color: exportSpec.bgTransparent ? 'rgba(0,0,0,0)' : (exportSpec.bgColor || '#ffffff') },
            cornersSquareOptions: { color: exportSpec.eyeColor || exportSpec.fgColor || '#000000', type: normalizeEyeShape(exportSpec.eyeShape) },
            cornersDotOptions: { color: exportSpec.eyeColor || exportSpec.fgColor || '#000000', type: innerEyeFromOuter(exportSpec.eyeShape) },
            image: exportLogoUrl || undefined,
            imageOptions: {
                crossOrigin: 'anonymous',
                margin: 4,
                imageSize: parseFloat(exportSpec.logoSizeRatio) || 0.3,
                hideBackgroundDots: !!exportSpec.logoBackground
            }
        });
        exportPreviewQr.append(exportPreview);
    }

    var EC_BYTE_CAP_V40 = { L: 2953, M: 2331, Q: 1663, H: 1273 };
    var EC_RECOVERY    = { L: 0.07, M: 0.15, Q: 0.25, H: 0.30 };
    var EC_RANK        = { L: 0, M: 1, Q: 2, H: 3 };

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

    function effectiveEc(ec, data, logoUrl, logoSizeRatio, logoAspect) {
        var preferred = ec || 'M';
        if (logoUrl) {
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

    function readExportSizeFormat() {
        var sizeVal = exportSizeSelect ? exportSizeSelect.value : '1024';
        var size;
        if (sizeVal === 'custom') {
            var customInput = exportCustomSizeField && exportCustomSizeField.querySelector('input');
            size = customInput ? parseInt(customInput.value, 10) : 1024;
        } else {
            size = parseInt(sizeVal, 10);
        }
        if (!size || size < 64) size = 1024;
        if (size > 8192) size = 8192;
        var format = exportFormatSelect ? exportFormatSelect.value : 'webp';
        return { size: size, format: format };
    }

    document.querySelectorAll('[data-action="export-cancel"]').forEach(function (b) {
        b.addEventListener('click', closeExportModal);
    });
    document.querySelectorAll('[data-action="export-confirm"]').forEach(function (b) {
        b.addEventListener('click', function () {
            if (!exportSpec) return;
            var so = readExportSizeFormat();
            var fullSpec = Object.assign({}, exportSpec, { size: so.size, format: so.format });
            performExport(fullSpec, exportLogoUrl, exportLabel);
            closeExportModal();
        });
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && exportModal && !exportModal.hidden) closeExportModal();
    });

    /* ─── Card / form export buttons → open the export modal ─────────── */

    function downloadFromForm() {
        var d = readSpec();
        openExportModal(d.spec, logoPreviewUrl, d.label, logoPreviewAspect);
    }

    function downloadById(id) {
        fetch(cfg.restLibrary, { credentials: 'same-origin', headers: { 'X-WP-Nonce': cfg.nonce } })
            .then(function (r) { return r.json(); })
            .then(function (list) {
                var row = (list || []).find(function (x) { return x.id === id; });
                if (!row) return;
                var spec = Object.assign({}, row.design || {}, { data: row.target_url });
                // If tracking is on, the QR encodes the tracking URL, not target.
                var card = document.querySelector('.lrob-qrm-card[data-id="' + id + '"]');
                if (card) {
                    try {
                        var info = JSON.parse(card.getAttribute('data-qr') || '{}');
                        if (info.encoded) spec.data = info.encoded;
                    } catch (e) {}
                }
                openExportModal(spec, row.logo_url || null, row.label || '', 1);
            })
            .catch(function (e) { alert((e && e.message) ? e.message : (cfg.i18n.error || 'Error')); });
    }

    function performExport(spec, logoUrl, label) {
        if (!spec || !spec.data || !spec.data.toString().trim()) {
            alert(cfg.i18n.error || 'Error');
            return;
        }
        if (!window.QRCodeStyling) {
            alert(cfg.i18n.error || 'Error');
            return;
        }
        var ec = effectiveEc(spec.ecLevel, spec.data.toString(), logoUrl, spec.logoSizeRatio, spec.logoAspect);

        var size = parseInt(spec.size, 10) || 1024;
        var marginModules = parseInt(spec.margin, 10);
        if (isNaN(marginModules)) marginModules = 4;

        var exporter = new window.QRCodeStyling({
            width: size,
            height: size,
            data: spec.data.toString(),
            margin: Math.max(0, marginModules) * Math.max(2, Math.floor(size / 50)),
            qrOptions: { errorCorrectionLevel: ec, typeNumber: 0, mode: 'Byte' },
            dotsOptions: { color: spec.fgColor || '#000000', type: normalizeDotShape(spec.dotShape), roundSize: false },
            backgroundOptions: { color: spec.bgTransparent ? 'rgba(0,0,0,0)' : (spec.bgColor || '#ffffff') },
            cornersSquareOptions: { color: spec.eyeColor || spec.fgColor || '#000000', type: normalizeEyeShape(spec.eyeShape) },
            cornersDotOptions: {
                color: spec.eyeColor || spec.fgColor || '#000000',
                type: innerEyeFromOuter(spec.eyeShape)
            },
            image: logoUrl || undefined,
            imageOptions: {
                crossOrigin: 'anonymous',
                margin: 4,
                imageSize: parseFloat(spec.logoSizeRatio) || 0.3,
                hideBackgroundDots: !!spec.logoBackground
            }
        });

        var format = (spec.format || 'webp').toString();
        if (format === 'svg') format = 'png'; // SVG not surfaced (script-admitting format).
        var baseName = (label && label.trim()) ? label.trim().replace(/[^a-z0-9-]+/gi, '-').toLowerCase() : 'qrcode';
        var filename = baseName + '-' + Date.now();

        if (format === 'avif') {
            exportAsAvif(exporter, filename).catch(function (e) {
                alert((e && e.message) ? e.message : (cfg.i18n.error || 'Error'));
            });
        } else {
            Promise.resolve(exporter.download({
                name: filename,
                extension: format === 'jpeg' ? 'jpeg' : format
            })).catch(function (e) {
                alert((e && e.message) ? e.message : (cfg.i18n.error || 'Error'));
            });
        }
    }

    // AVIF path: qr-code-styling doesn't support 'avif' natively. We get a
    // PNG blob from the library, decode it to a canvas, then re-encode with
    // canvas.toBlob('image/avif'). Slower (one round-trip) but only on click.
    function exportAsAvif(exporter, filename) {
        return exporter.getRawData('png').then(function (pngBlob) {
            return new Promise(function (resolve, reject) {
                var url = URL.createObjectURL(pngBlob);
                var img = new Image();
                img.onload = function () {
                    var c = document.createElement('canvas');
                    c.width = img.width;
                    c.height = img.height;
                    c.getContext('2d').drawImage(img, 0, 0);
                    c.toBlob(function (avifBlob) {
                        URL.revokeObjectURL(url);
                        if (!avifBlob) {
                            reject(new Error('AVIF encoding failed'));
                            return;
                        }
                        triggerBlobDownload(avifBlob, filename + '.avif');
                        resolve();
                    }, 'image/avif', 0.92);
                };
                img.onerror = function () {
                    URL.revokeObjectURL(url);
                    reject(new Error('Could not decode intermediate PNG'));
                };
                img.src = url;
            });
        });
    }

    function triggerBlobDownload(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }

    function saveFromForm() {
        var d = readSpec();
        var typeKey = contentTypeSelect ? contentTypeSelect.value : 'url';
        var ctValues = contentRenderer ? contentRenderer.read() : {};
        // The composed encoded payload IS the target_url. The raw field values
        // + the chosen type are persisted in design so editing later restores
        // the original input shape.
        var design = Object.assign({}, d.spec, {
            contentType:   typeKey,
            contentValues: ctValues
        });
        var body = {
            label: d.label,
            target_url: d.spec.data,
            tracking_enabled: d.tracking_enabled,
            design: design,
            logo_attachment_id: d.logo_attachment_id || 0
        };
        var url = cfg.restLibrary + (currentId ? '/' + currentId : '');
        fetch(url, {
            method: currentId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
            body: JSON.stringify(body),
            credentials: 'same-origin'
        }).then(function (r) {
            if (!r.ok) {
                return r.json().then(function (j) {
                    throw new Error((j && j.message) || r.statusText);
                });
            }
            return r.json();
        }).then(function () {
            window.location.reload();
        }).catch(function (e) {
            alert((e && e.message) ? e.message : (cfg.i18n.error || 'Error'));
        });
    }

    function loadIntoEditor(id) {
        fetch(cfg.restLibrary, { credentials: 'same-origin', headers: { 'X-WP-Nonce': cfg.nonce } })
            .then(function (r) { return r.json(); })
            .then(function (list) {
                var row = (list || []).find(function (x) { return x.id === id; });
                if (!row) return;
                currentId = id;
                form.reset();
                setLogo(0, null);
                setVal('label', row.label);
                if (dataEncodedInput) dataEncodedInput.value = row.target_url || '';
                setCheck('tracking_enabled', row.tracking_enabled);
                if (row.slug && trackingUrlEl) {
                    trackingUrlEl.setAttribute('data-current-slug', row.slug);
                }
                // Determine content type — explicit when saved, guessed for
                // pre-content-type rows.
                var typeKey = (row.design && row.design.contentType)
                    || (window.lrobQrmContent && window.lrobQrmContent.guessType(row.target_url))
                    || 'url';
                var ctValues = (row.design && row.design.contentValues) || {};
                // Legacy: pre-content-type QRs had no ct values, just a raw URL.
                if (!ctValues || !Object.keys(ctValues).length) {
                    if (typeKey === 'url')  ctValues = { url:  row.target_url || '' };
                    if (typeKey === 'text') ctValues = { text: row.target_url || '' };
                }
                if (contentTypeSelect) contentTypeSelect.value = typeKey;
                renderContentType(typeKey, ctValues);

                if (row.design) {
                    Object.keys(row.design).forEach(function (k) {
                        // size / format are export-time (in the export modal), and
                        // contentType / contentValues are handled above.
                        if (k === 'size' || k === 'format' || k === 'customSize'
                            || k === 'contentType' || k === 'contentValues') return;
                        var v = row.design[k];
                        if (typeof v === 'boolean') setCheck(k, v);
                        else setVal(k, v);
                    });
                }
                if (row.logo_attachment_id && row.logo_url) {
                    setLogo(row.logo_attachment_id, row.logo_url);
                }
                syncCustomSize();
                syncBgTransparent();
                syncLogoSizeValue();
                syncTrackingPreview();
                openEditor();
                refreshPreview();
            });
    }

    function setVal(name, value) {
        if (value === undefined || value === null) return;
        var nodes = form.querySelectorAll('[name="' + name + '"]');
        if (nodes.length === 0) return;
        if (nodes.length > 1 && nodes[0].type === 'radio') {
            // Radio group: check the one matching the saved value (with legacy
            // aliasing for eyeShape — dots → dot, rounded → extra-rounded).
            var target = String(value);
            if (name === 'eyeShape') {
                if (target === 'dots') target = 'dot';
                else if (target === 'rounded') target = 'extra-rounded';
            }
            nodes.forEach(function (n) { n.checked = (n.value === target); });
            return;
        }
        nodes[0].value = String(value);
        // If this is a wpColorPicker-wrapped input, push the value through
        // its API so the swatch + popover both reflect the change.
        if (nodes[0].classList.contains('lrob-qrm-color-picker')
            && window.jQuery && window.jQuery.fn.wpColorPicker) {
            window.jQuery(nodes[0]).wpColorPicker('color', String(value));
        }
    }
    function setCheck(name, value) {
        var el = form.querySelector('[name="' + name + '"]');
        if (el) el.checked = !!value;
    }

    /* ─── LRob promo strip — random start, auto-rotate, pause on hover ─── */

    function bootLrobPromo() {
        var hosts = document.querySelectorAll('[data-role="lrob-promo"]');
        if (!hosts.length) return;
        var pool = (cfg && cfg.lrobPromos) || [];
        if (!pool.length) return;

        hosts.forEach(function (host) {
            // Build the static icon + body markup once.
            host.innerHTML = '<span class="lrob-qrm-promo-icon"></span><span class="lrob-qrm-promo-body"></span>';
            var iconEl = host.querySelector('.lrob-qrm-promo-icon');
            var bodyEl = host.querySelector('.lrob-qrm-promo-body');

            // Random starting index — different visitors / page loads see
            // different angles first.
            var i = Math.floor(Math.random() * pool.length);
            paint(i);

            var paused = false;
            host.addEventListener('mouseenter', function () { paused = true; });
            host.addEventListener('mouseleave', function () { paused = false; });

            // Auto-rotate every ~9s with a short fade. Skip when the user is
            // hovering so they have time to read / click the link.
            setInterval(function () {
                if (paused) return;
                bodyEl.classList.add('is-fading');
                setTimeout(function () {
                    i = (i + 1) % pool.length;
                    paint(i);
                    bodyEl.classList.remove('is-fading');
                }, 350);
            }, 9000);

            function paint(idx) {
                var p = pool[idx];
                iconEl.textContent = p.icon || '✨';
                bodyEl.innerHTML = escapePromoHtml(p.text) + ' '
                    + '<a href="https://www.lrob.fr" target="_blank" rel="noopener nofollow">'
                    + escapePromoHtml(p.link) + '</a>';
            }
        });
    }

    function escapePromoHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Initial render of card previews (promo is booted at the top of the IIFE
    // so it runs on both Library and Settings pages).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderCardPreviews);
    } else {
        renderCardPreviews();
    }
})();
