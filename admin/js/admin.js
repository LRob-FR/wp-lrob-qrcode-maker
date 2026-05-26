/* LRob QR Code Maker — admin library page.
 *
 * Vanilla JS. The page server-renders the card grid + a hidden modal editor;
 * this script wires the actions and drives the qr-code-styling preview for
 * the editor + the small previews on each card.
 *
 * Rendering: the same qr-code-styling instance handles preview and export
 * (export instance is built fresh at the requested size). No server-side
 * rendering. Server only stores QR metadata + handles /qr/{slug} redirect.
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
    var logoPreviewW = 0;
    var logoPreviewH = 0;
    var mediaFrame = null;

    /* ─── Editor preview (qr-code-styling) ───────────────────────────── */
    /* Lazily-initialised single instance — .update() does in-place SVG mutation
     * so consecutive refreshes (including the post-save tracking-slug refresh)
     * don't tear the preview down and re-flash it. Editor preview canvas is
     * 240×240 to match the export modal (the 280px size triggered a corner-
     * pattern rendering bug in qr-code-styling for the classy-rounded eye). */

    function ensurePreview() {
        if (!window.QRCodeStyling) return null;
        if (qrPreview) return qrPreview;
        qrPreview = new window.QRCodeStyling(buildQrConfig({
            width: 240, ec: 'M',
            fgColor: '#000', bgColor: '#fff', eyeColor: '#000',
            dotShape: 'square', eyeShape: 'square'
        }));
        qrPreview.append(preview);
        return qrPreview;
    }

    function readSpec() {
        var fd = new FormData(form);
        // size + format live in the export modal now; the design form just
        // carries the design data. Default size/format come from settings.
        var defaults = (cfg && cfg.exportDefaults) || {};
        var spec = {
            data:            (fd.get('data') || '').toString(),
            size:            parseInt(defaults.size, 10) || 1024,
            ecLevel:         'L', // legacy; effective EC now computed by resolveQrParams
            ecMode:          normalizeEcMode(fd.get('ecMode')),
            fgColor:         (fd.get('fgColor') || '#000000').toString(),
            bgColor:         (fd.get('bgColor') || '#ffffff').toString(),
            eyeColor:        (fd.get('eyeColor') || '#000000').toString(),
            bgTransparent:   !!fd.get('bgTransparent'),
            dotShape:        (fd.get('dotShape') || 'square').toString(),
            eyeShape:        (fd.get('eyeShape') || 'square').toString(),
            format:          (defaults.format || 'webp').toString(),
            logoSize:        normalizeLogoSize(fd.get('logoSize')),
            logoBackground:  !!fd.get('logoBackground'),
            margin:          4
        };
        return {
            spec: spec,
            label: (fd.get('label') || '').toString(),
            tracking_enabled: !!fd.get('tracking_enabled'),
            logo_attachment_id: parseInt(fd.get('logo_attachment_id') || '0', 10)
        };
    }

    var lastSpecKey = '';
    function refreshPreview() {
        // Cancel any pending debounce — direct callers (loadIntoEditor, setLogo,
        // 'change' events) shouldn't be followed by a stray trailing-edge fire.
        if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
        lastRefreshAt = Date.now();
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
        var hasLogo = !!logoPreviewUrl;
        var params = resolveQrParams(encoded, d.spec.logoSize, logoPreviewAspect, d.spec.ecMode, hasLogo);
        var config = buildQrConfig({
            width: 240, data: encoded, ec: params.ec,
            fgColor: d.spec.fgColor, bgColor: d.spec.bgColor, eyeColor: d.spec.eyeColor,
            bgTransparent: d.spec.bgTransparent,
            dotShape: d.spec.dotShape, eyeShape: d.spec.eyeShape,
            logoUrl: logoPreviewUrl, logoBackground: d.spec.logoBackground,
            imageSize: params.imageSize
        });
        // Dedup: if the lib config didn't change, skip the qp.update() call —
        // qr-code-styling would otherwise re-render the same SVG (visible flash
        // when an <input> blur fires 'change' right after the 'input' debounce
        // already painted the same data).
        var key = JSON.stringify(config);
        if (key === lastSpecKey) return;
        lastSpecKey = key;
        qp.update(config);
        renderStats(encoded, params);
    }

    var statsEl       = editor ? editor.querySelector('[data-role="stats"]') : null;
    var statsNoticeEl = editor ? editor.querySelector('[data-role="stats-notice"]') : null;
    var statsI18n     = (cfg && cfg.i18n) || {};

    function renderStats(data, params) {
        var r = window.lrobQrmEngine.computeStatsText(data, params, statsI18n);
        if (statsEl) statsEl.textContent = r.line;
        if (statsNoticeEl) {
            statsNoticeEl.textContent = r.notice;
            statsNoticeEl.hidden = !r.notice;
        }
    }

    // Shape value normalisation: accepts both the new qr-code-styling values
    // ('extra-rounded', 'classy', 'classy-rounded', etc.) and the legacy ones
    // saved by earlier versions of this plugin ('rounded' / 'dots' for eyes).
    // qr-code-styling itself accepts: dotsOptions.type ∈ {square, dots, rounded,
    // extra-rounded, classy, classy-rounded}; cornersSquareOptions.type ∈
    // {square, dot, extra-rounded, classy, classy-rounded}.
    // Shape normalisation + qr-code-styling config builder live in qr-engine.js.
    var buildQrConfig = window.lrobQrmEngine.buildQrConfig;

    /* ─── Logo picker (WP Media Library) ─────────────────────────────── */

    var logoIdInput   = form.querySelector('input[name="logo_attachment_id"]');
    var logoThumb     = form.querySelector('[data-role="logo-thumb"]');
    var pickLogoBtn   = form.querySelector('[data-action="pick-logo"]');
    var removeLogoBtn = form.querySelector('[data-action="remove-logo"]');
    var logoSettings  = form.querySelector('[data-role="logo-settings"]');

    function setLogo(attachmentId, previewUrl, width, height) {
        if (logoIdInput) logoIdInput.value = String(attachmentId || 0);
        logoPreviewUrl = previewUrl || null;
        logoPreviewW = (typeof width === 'number' && width > 0) ? width : 0;
        logoPreviewH = (typeof height === 'number' && height > 0) ? height : 0;
        logoPreviewAspect = (logoPreviewW > 0 && logoPreviewH > 0)
            ? (logoPreviewH / logoPreviewW)
            : 1;
        if (previewUrl && (!logoPreviewW || !logoPreviewH)) {
            // Dimensions not supplied (e.g. loading an existing QR) → probe.
            var probe = new Image();
            probe.onload = function () {
                if (probe.naturalWidth > 0) {
                    logoPreviewW = probe.naturalWidth;
                    logoPreviewH = probe.naturalHeight;
                    logoPreviewAspect = probe.naturalHeight / probe.naturalWidth;
                    refreshPreview();
                }
            };
            probe.src = previewUrl;
        }
        if (logoThumb) {
            if (previewUrl) { logoThumb.src = previewUrl; logoThumb.hidden = false; }
            else            { logoThumb.removeAttribute('src'); logoThumb.hidden = true; }
        }
        if (removeLogoBtn) removeLogoBtn.hidden = !attachmentId;
        if (pickLogoBtn) {
            pickLogoBtn.textContent = attachmentId
                ? (cfg.i18n.changeLogo || 'Change logo')
                : (cfg.i18n.pickLogo || 'Pick logo from Media Library');
        }
        if (logoSettings) logoSettings.hidden = !attachmentId;
        // Reset logo-size preset to "max" only on a fresh user pick — not when
        // loadIntoEditor / form.reset reapplies a saved logo (suppressed).
        if (attachmentId && suppressAutoSave === 0) {
            var maxRadio = form.querySelector('input[name="logoSize"][value="max"]');
            if (maxRadio) maxRadio.checked = true;
        }
        refreshPreview();
        scheduleAutoSave();
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
                setLogo(att.id, thumbUrl, att.width || 0, att.height || 0);
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
        // wpColorPicker fires its `change` callback on every hex digit + on every
        // colour-slider drag step — debounce the QR refresh so dragging stays smooth.
        $form.find('.lrob-qrm-color-picker').wpColorPicker({
            change: function () { setTimeout(function () { refreshPreviewSoon(); scheduleAutoSave(); }, 0); },
            clear:  function () { setTimeout(function () { refreshPreview();     scheduleAutoSave(); }, 0); }
        });
    }

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
                // Setting dataEncodedInput.value above is programmatic so it
                // doesn't dispatch an input event the form-level listener
                // would catch — call refresh ourselves, debounced because
                // the upstream content-type fires this on every keystroke.
                refreshPreviewSoon();
            }
        );
    }

    var trackingCheckbox = form.querySelector('input[name="tracking_enabled"]');
    var trackingPreview = form.querySelector('[data-role="tracking-preview"]');
    var trackingUrlEl = form.querySelector('[data-role="tracking-url"]');
    var trackingIncompatNotice = form.querySelector('[data-role="tracking-incompatible"]');
    // Tracking encodes a /qr/{slug} URL and 302-redirects to the target on
    // scan. That only works for content the scanner treats as web content
    // (url/text/vcard via .vcf). For native-scheme content (WIFI:, mailto:,
    // sms:, tel:, geo:) the redirect drops the scheme — the scanner sees a
    // plain HTML landing page instead of acting on the original payload.
    var NON_TRACKABLE_TYPES = ['wifi', 'email', 'sms', 'tel', 'geo'];

    if (contentTypeSelect) {
        contentTypeSelect.addEventListener('change', function () {
            var newType = contentTypeSelect.value;
            // Switching to a non-trackable type force-unchecks tracking.
            // syncTrackingPreview then sets disabled = true so it can't be
            // re-enabled until the type changes back.
            if (NON_TRACKABLE_TYPES.indexOf(newType) !== -1
                && trackingCheckbox && trackingCheckbox.checked) {
                trackingCheckbox.checked = false;
            }
            renderContentType(newType, {});
        });
    }

    function syncTrackingPreview() {
        if (!trackingCheckbox || !trackingPreview || !trackingUrlEl) return;
        var typeKey = contentTypeSelect ? contentTypeSelect.value : 'url';
        var incompatible = NON_TRACKABLE_TYPES.indexOf(typeKey) !== -1;
        // Block enabling for incompatible types. If the box is currently
        // checked (legacy DB state pre-restriction), leave the box enabled
        // so the user can uncheck — but once unchecked, it locks.
        trackingCheckbox.disabled = incompatible && !trackingCheckbox.checked;
        if (trackingIncompatNotice) {
            trackingIncompatNotice.hidden = !incompatible;
        }
        if (trackingCheckbox.checked) {
            trackingPreview.hidden = false;
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
    if (contentTypeSelect) contentTypeSelect.addEventListener('change', syncTrackingPreview);

    /* ─── Form event wiring ──────────────────────────────────────────── */

    // The form now wraps the whole panel; Enter on the label input would
    // otherwise reload the page since no submit handler exists.
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    // Adaptive refresh: leading edge if we haven't rendered in the last 500 ms
    // (one-off edit feels instant), trailing edge while inside the window
    // (rapid typing batches into a single render after the user stops). The
    // 'change' event path goes through refreshPreview() directly so a blur
    // following a debounced input dedups via lastSpecKey instead of double-
    // rendering.
    var REFRESH_DEBOUNCE_MS = 500;
    var refreshTimer = null;
    var lastRefreshAt = 0;
    function refreshPreviewSoon() {
        var now = Date.now();
        if (now - lastRefreshAt >= REFRESH_DEBOUNCE_MS) {
            // Cold: render now (and update lastRefreshAt inside refreshPreview).
            refreshPreview();
        } else {
            // Hot: schedule trailing edge.
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(function () {
                refreshTimer = null;
                refreshPreview();
            }, REFRESH_DEBOUNCE_MS);
        }
    }
    form.addEventListener('input', function (e) {
        if (e.target && e.target.name === 'logo_attachment_id') return;
        refreshPreviewSoon();
    });
    form.addEventListener('change', function (e) {
        if (e.target && e.target.name === 'logo_attachment_id') return;
        // refreshPreview() now cancels any pending debounce internally.
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
        var savedId = currentId;
        currentId = 0;
        setLogo(0, null);
        if (trackingUrlEl) trackingUrlEl.removeAttribute('data-current-slug');
        // Reset cross-session state so the next open starts clean instead of
        // inheriting the previous QR's encoded payload or preview dedup key.
        if (dataEncodedInput) dataEncodedInput.value = '';
        lastSpecKey = '';
        var didSave = hasSavedThisSession;
        resetSaveState();
        if (didSave && savedId) refreshGridCard(savedId);
    }

    // Wrap close: flush pending save, prompt if last save errored.
    function requestCloseEditor() {
        flushSave().then(function () {
            if (saveState === 'error') {
                var msg = (cfg && cfg.i18n && cfg.i18n.saveErrorOnExit)
                    || 'The QR code could not be saved. Exit anyway?';
                if (!confirm(msg)) return;
            }
            closeEditor();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !editor.hidden) requestCloseEditor();
    });

    document.querySelectorAll('[data-action="new-qr"]').forEach(function (b) {
        b.addEventListener('click', function () {
            currentId = 0;
            suppressAutoSave++;
            form.reset();
            setLogo(0, null);
            if (contentTypeSelect) contentTypeSelect.value = 'url';
            renderContentType('url', {});
            syncBgTransparent();
            syncTrackingPreview();
            openEditor();
            refreshPreview();
            resetSaveState();
            // Release the suppression after the current event loop tick so any
            // async change events from wpColorPicker/etc. don't false-trigger.
            setTimeout(function () { suppressAutoSave--; }, 0);
        });
    });

    document.querySelectorAll('[data-action="cancel"]').forEach(function (b) {
        b.addEventListener('click', requestCloseEditor);
    });

    // Editor "Export QR Code" button (inside the modal, not a card).
    var editorExportBtn = editor.querySelector('[data-action="download"]');
    if (editorExportBtn) {
        editorExportBtn.addEventListener('click', function (e) {
            e.preventDefault();
            downloadFromForm();
        });
    }

    // Card actions (download / edit / delete) are delegated on the grid so
    // dynamically-added cards work without rebinding.
    if (grid) {
        grid.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var card = btn.closest('[data-id]');
            if (!card) return;
            var id = parseInt(card.getAttribute('data-id'), 10);
            var action = btn.getAttribute('data-action');
            if (action === 'download') {
                e.preventDefault();
                downloadById(id);
            } else if (action === 'edit') {
                loadIntoEditor(id);
            } else if (action === 'delete') {
                if (!confirm(cfg.i18n.confirmDelete || 'Delete?')) return;
                fetch(cfg.restLibrary + '/' + id, {
                    method: 'DELETE',
                    headers: { 'X-WP-Nonce': cfg.nonce },
                    credentials: 'same-origin'
                }).then(function (r) { if (r.ok) card.remove(); });
            }
        });
    }

    /* ─── Incremental grid refresh after save ──────────────────────────── */

    function escAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* Build a card DOM mirroring LibraryPage.php's PHP template — invoked
     * post-save to add the new card (or replace the edited one) without a
     * full page reload. Keep in sync with LibraryPage::render(). */
    function buildCardDom(row) {
        var i18n = (cfg && cfg.i18n) || {};
        var trackingUrl = (row.tracking_enabled && row.slug)
            ? ((cfg.trackingBase || '/') + row.slug) : null;
        var encoded = trackingUrl || row.target_url || '';
        var cardData = {
            target: row.target_url || '',
            design: row.design || {},
            logoUrl: row.logo_url || null,
            trackingUrl: trackingUrl,
            encoded: encoded
        };
        var label = row.label && row.label.length ? row.label : (row.target_url || '');
        var isUrl = /^https?:\/\//i.test(row.target_url || '');
        var targetHtml = isUrl
            ? '<a class="lrob-qrm-card-url" href="' + escAttr(row.target_url) + '" target="_blank" rel="noopener">' + escHtml(row.target_url) + '</a>'
            : '<code class="lrob-qrm-card-url">' + escHtml(row.target_url) + '</code>';

        var trackingBlock;
        if (trackingUrl) {
            var n = parseInt(row.scan_count, 10) || 0;
            var scanFmt = n === 1
                ? (i18n.cardScanSingular || '%d scan')
                : (i18n.cardScansPlural || '%d scans');
            trackingBlock =
                '<dt>' + escHtml(i18n.cardTrackingUrl || 'Tracking URL') + '</dt>'
              + '<dd><a class="lrob-qrm-card-url" href="' + escAttr(trackingUrl) + '" target="_blank" rel="noopener">' + escHtml(trackingUrl) + '</a></dd>'
              + '<dt>' + escHtml(i18n.cardScansLabel || 'Scans') + '</dt>'
              + '<dd>' + escHtml(scanFmt.replace('%d', n)) + '</dd>';
        } else {
            trackingBlock =
                '<dt>' + escHtml(i18n.cardTracking || 'Tracking') + '</dt>'
              + '<dd><span class="lrob-qrm-pill lrob-qrm-pill-muted">' + escHtml(i18n.cardOff || 'Off') + '</span></dd>';
        }

        var article = document.createElement('article');
        article.className = 'lrob-qrm-card';
        article.setAttribute('data-id', String(row.id));
        article.setAttribute('data-qr', JSON.stringify(cardData));
        article.innerHTML =
            '<div class="lrob-qrm-card-preview" data-role="card-preview"></div>'
          + '<div class="lrob-qrm-card-body">'
          +   '<h3 class="lrob-qrm-card-title">' + escHtml(label) + '</h3>'
          +   '<dl class="lrob-qrm-card-info">'
          +     '<dt>' + escHtml(i18n.cardTarget || 'Target') + '</dt>'
          +     '<dd>' + targetHtml + '</dd>'
          +     trackingBlock
          +   '</dl>'
          + '</div>'
          + '<footer class="lrob-qrm-card-actions">'
          +   '<button type="button" class="button button-primary lrob-qrm-card-export" data-action="download">'
          +     '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10 3a1 1 0 0 1 1 1v6.6l1.3-1.3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 10.6V4a1 1 0 0 1 1-1zM4 15a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H4z"/></svg>'
          +     escHtml(i18n.cardExport || 'Generate image')
          +   '</button>'
          +   '<button type="button" class="button" data-action="edit" title="' + escAttr(i18n.cardEdit || 'Edit') + '">'
          +     '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M14.7 3.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L7.4 15H4v-3.4l9.3-9.3.4-.3.6.3.4.3zM4 17h12v1H4v-1z"/></svg>'
          +     escHtml(i18n.cardEdit || 'Edit')
          +   '</button>'
          +   '<button type="button" class="button lrob-qrm-icon-button lrob-qrm-icon-button-delete" data-action="delete" aria-label="' + escAttr(i18n.cardDelete || 'Delete') + '" title="' + escAttr(i18n.cardDelete || 'Delete') + '">'
          +     '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7 3h6l1 2h3v1H3V5h3l1-2zm-2 4h10l-1 11H6L5 7zm3 2v7h1V9H8zm3 0v7h1V9h-1z"/></svg>'
          +   '</button>'
          + '</footer>';
        return article;
    }

    /* Fetch the saved row + reflect it in the grid (replace if existing, add
     * if new). No flicker — preview is rendered into the placeholder via
     * renderCardPreviews(). */
    function refreshGridCard(id) {
        if (!grid) return;
        fetch(cfg.restLibrary, { credentials: 'same-origin', headers: { 'X-WP-Nonce': cfg.nonce } })
            .then(function (r) { return r.json(); })
            .then(function (list) {
                var row = (list || []).find(function (x) { return x.id === id; });
                if (!row) return;
                var newCard = buildCardDom(row);
                var existing = grid.querySelector('.lrob-qrm-card[data-id="' + id + '"]');
                if (existing) {
                    existing.replaceWith(newCard);
                } else {
                    var emptyState = grid.querySelector('.lrob-qrm-empty');
                    if (emptyState) emptyState.remove();
                    grid.appendChild(newCard);
                }
                renderCardPreviews();
            });
    }

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
            var params = resolveQrParams(info.encoded, legacyLogoSizeFromDesign(d), info.logoAspect, d.ecMode, !!info.logoUrl);
            var qp = new window.QRCodeStyling(buildQrConfig({
                width: 240, data: info.encoded, ec: params.ec,
                fgColor: d.fgColor, bgColor: d.bgColor, eyeColor: d.eyeColor,
                bgTransparent: d.bgTransparent,
                dotShape: d.dotShape, eyeShape: d.eyeShape,
                logoUrl: info.logoUrl, logoBackground: d.logoBackground,
                imageSize: params.imageSize
            }));
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
        var params = resolveQrParams(exportSpec.data, legacyLogoSizeFromDesign(exportSpec), exportLogoAspect, exportSpec.ecMode, !!exportLogoUrl);
        exportPreviewQr = new window.QRCodeStyling(buildQrConfig({
            width: 240, data: exportSpec.data, ec: params.ec,
            fgColor: exportSpec.fgColor, bgColor: exportSpec.bgColor, eyeColor: exportSpec.eyeColor,
            bgTransparent: exportSpec.bgTransparent,
            dotShape: exportSpec.dotShape, eyeShape: exportSpec.eyeShape,
            logoUrl: exportLogoUrl, logoBackground: exportSpec.logoBackground,
            imageSize: params.imageSize
        }));
        exportPreviewQr.append(exportPreview);
    }

    /* EC + logo coverage pipeline lives in assets/js/qr-engine.js (shared with
     * the front block). These thin shims keep the existing call sites in this
     * file readable without leaking the engine's window namespace everywhere. */
    function resolveQrParams(data, logoSize, aspect, ecMode, hasLogo) {
        return window.lrobQrmEngine.resolveQrParams(data, logoSize, aspect, ecMode, hasLogo);
    }
    function normalizeEcMode(raw)     { return window.lrobQrmEngine.normalizeEcMode(raw); }
    function normalizeLogoSize(raw)   { return window.lrobQrmEngine.normalizeLogoSize(raw); }
    function legacyLogoSizeFromDesign(d) { return window.lrobQrmEngine.legacyLogoSize(d); }

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
        var params = resolveQrParams(spec.data.toString(), legacyLogoSizeFromDesign(spec), exportLogoAspect, spec.ecMode, !!logoUrl);

        var size = parseInt(spec.size, 10) || 1024;
        var marginModules = parseInt(spec.margin, 10);
        if (isNaN(marginModules)) marginModules = 4;

        var exporter = new window.QRCodeStyling(Object.assign(
            buildQrConfig({
                width: size, data: spec.data.toString(), ec: params.ec,
                fgColor: spec.fgColor, bgColor: spec.bgColor, eyeColor: spec.eyeColor,
                bgTransparent: spec.bgTransparent,
                dotShape: spec.dotShape, eyeShape: spec.eyeShape,
                logoUrl: logoUrl, logoBackground: spec.logoBackground,
                imageSize: params.imageSize,
                margin: Math.max(0, marginModules) * Math.max(2, Math.floor(size / 50))
            }),
            // Override: download path uses canvas (raster export).
            { type: 'canvas' }
        ));

        var format = (spec.format || 'webp').toString();
        if (format === 'svg') format = 'png'; // SVG not surfaced (script-admitting format).
        var baseName = (label && label.trim()) ? label.trim().replace(/[^a-z0-9-]+/gi, '-').toLowerCase() : 'qrcode';
        var filename = baseName + '-' + Date.now();

        Promise.resolve(exporter.download({
            name: filename,
            extension: format === 'jpeg' ? 'jpeg' : format
        })).catch(function (e) {
            alert((e && e.message) ? e.message : (cfg.i18n.error || 'Error'));
        });
    }

    /* ─── Auto-save state machine ─────────────────────────────────────── */

    var SAVE_DEBOUNCE_MS = 1000;
    var saveState        = 'idle';   // idle | dirty | saving | saved | error
    var saveTimer        = null;     // pending debounce
    var saveInFlight     = null;     // Promise for current fetch
    var dirtyDuringFlight = false;   // re-fire after current save resolves
    var lastSavedAt      = null;
    var lastSaveError    = null;
    var hasSavedThisSession = false; // controls the close-time reload
    // Suppresses scheduleAutoSave during programmatic form mutations (reset,
    // loadIntoEditor, setVal, wpColorPicker reinit) which fire change events.
    var suppressAutoSave = 0;

    var saveStatusEl = null;
    function getSaveStatusEl() {
        if (saveStatusEl === null) {
            saveStatusEl = document.querySelector('[data-role="save-status"]') || false;
        }
        return saveStatusEl || null;
    }

    function buildSaveBody() {
        var d = readSpec();
        var typeKey = contentTypeSelect ? contentTypeSelect.value : 'url';
        var ctValues = contentRenderer ? contentRenderer.read() : {};
        var design = Object.assign({}, d.spec, {
            contentType:   typeKey,
            contentValues: ctValues
        });
        return {
            label: d.label,
            target_url: d.spec.data,
            tracking_enabled: d.tracking_enabled,
            design: design,
            logo_attachment_id: d.logo_attachment_id || 0
        };
    }

    function canAutoSave() {
        // Defer creating a row until there's an encoded payload to save —
        // avoids spawning empty rows when the user opens "New" then closes.
        if (!dataEncodedInput) return false;
        return dataEncodedInput.value && dataEncodedInput.value.trim().length > 0;
    }

    function scheduleAutoSave() {
        if (suppressAutoSave > 0) return;
        if (editor && editor.hidden) return;
        if (!canAutoSave()) return;
        setSaveState('dirty');
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            saveTimer = null;
            performAutoSave();
        }, SAVE_DEBOUNCE_MS);
    }

    function performAutoSave() {
        if (saveInFlight) {
            dirtyDuringFlight = true;
            return saveInFlight;
        }
        if (!canAutoSave()) return Promise.resolve();
        setSaveState('saving');
        var body = buildSaveBody();
        var url = cfg.restLibrary + (currentId ? '/' + currentId : '');
        saveInFlight = fetch(url, {
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
        }).then(function (saved) {
            saveInFlight = null;
            hasSavedThisSession = true;
            lastSavedAt = Date.now();
            lastSaveError = null;
            if (saved && saved.id && !currentId) currentId = saved.id;
            if (saved && saved.slug && trackingUrlEl) {
                var prevSlug = trackingUrlEl.getAttribute('data-current-slug') || '';
                trackingUrlEl.setAttribute('data-current-slug', saved.slug);
                syncTrackingPreview();
                // Re-render so the preview encodes the real slug instead of
                // the /qr/preview placeholder. Scanning the placeholder hits
                // a 404 (looks like a redirect to an unrelated page), so the
                // brief logo flash from .update() is the lesser evil.
                if (prevSlug !== saved.slug) refreshPreview();
            }
            setSaveState('saved');
            if (dirtyDuringFlight) {
                dirtyDuringFlight = false;
                scheduleAutoSave();
            }
        }).catch(function (e) {
            saveInFlight = null;
            lastSaveError = (e && e.message) ? e.message : (cfg.i18n.error || 'Error');
            setSaveState('error');
        });
        return saveInFlight;
    }

    // Flush any pending debounce + return a promise resolving when no save is in flight.
    function flushSave() {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
            performAutoSave();
        }
        return saveInFlight || Promise.resolve();
    }

    function setSaveState(s) {
        saveState = s;
        renderSaveStatus();
    }

    function renderSaveStatus() {
        var el = getSaveStatusEl();
        if (!el) return;
        var t = (cfg && cfg.i18n) || {};
        var className = 'lrob-qrm-save-status';
        var text = '';
        switch (saveState) {
            case 'idle':
                break;
            case 'dirty':
                text = t.saveDirty || 'Unsaved changes';
                className += ' is-dirty';
                break;
            case 'saving':
                text = t.saveSaving || 'Saving…';
                className += ' is-saving';
                break;
            case 'saved':
                var seconds = lastSavedAt ? Math.round((Date.now() - lastSavedAt) / 1000) : 0;
                if (seconds < 2) {
                    text = t.saveSavedNow || 'Saved just now';
                } else {
                    text = (t.saveSaved || 'Saved %ds ago').replace('%d', seconds);
                }
                className += ' is-saved';
                break;
            case 'error':
                text = (t.saveError || 'Save failed') + (lastSaveError ? ' — ' + lastSaveError : '');
                className += ' is-error';
                break;
        }
        el.textContent = text;
        el.className = className;
    }

    // Tick the relative "Saved Xs ago" label every second while it's visible.
    setInterval(function () {
        if (saveState === 'saved') renderSaveStatus();
    }, 1000);

    function resetSaveState() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        saveState = 'idle';
        saveInFlight = null;
        dirtyDuringFlight = false;
        lastSavedAt = null;
        lastSaveError = null;
        hasSavedThisSession = false;
        renderSaveStatus();
    }

    // Any input or change inside the editor form triggers an auto-save debounce.
    if (form) {
        form.addEventListener('input', scheduleAutoSave);
        form.addEventListener('change', scheduleAutoSave);
    }

    function loadIntoEditor(id) {
        // Show the modal frame immediately so the open animation runs while
        // the fetch is in flight; populate the fields when the row arrives.
        currentId = id;
        suppressAutoSave++;
        form.reset();
        setLogo(0, null);
        openEditor();
        editor.classList.add('is-loading');
        fetch(cfg.restLibrary, { credentials: 'same-origin', headers: { 'X-WP-Nonce': cfg.nonce } })
            .then(function (r) { return r.json(); })
            .then(function (list) {
                var row = (list || []).find(function (x) { return x.id === id; });
                if (!row) { editor.classList.remove('is-loading'); return; }
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
                    // Migrate legacy fields into the new shape before applying.
                    row.design.logoSize = legacyLogoSizeFromDesign(row.design);
                    row.design.ecMode   = normalizeEcMode(row.design.ecMode);
                    Object.keys(row.design).forEach(function (k) {
                        if (k === 'size' || k === 'format' || k === 'customSize'
                            || k === 'contentType' || k === 'contentValues'
                            || k === 'logoSizeRatio' || k === 'ecLevel'
                            || k === 'logoCoveragePct') return;
                        var v = row.design[k];
                        if (typeof v === 'boolean') setCheck(k, v);
                        else setVal(k, v);
                    });
                }
                if (row.logo_attachment_id && row.logo_url) {
                    setLogo(row.logo_attachment_id, row.logo_url);
                }
                syncBgTransparent();
                syncTrackingPreview();
                refreshPreview();
                resetSaveState();
                editor.classList.remove('is-loading');
                setTimeout(function () { suppressAutoSave--; }, 0);
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
