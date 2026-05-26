/* LRob QR Code Maker — EC + logo coverage pipeline.
 *
 * Shared between admin/js/admin.js and assets/js/maker.js. Computes the
 * effective error-correction level + logo coverage for a given payload and
 * user-picked logoSize preset, AND mirrors qr-code-styling's internal logo
 * quantization so we can report the actually-rendered coverage (not the
 * theoretical target which the library rounds to odd module counts).
 *
 * Exposes window.lrobQrmEngine. Depends on window.lrobQrmContent.qrStats.
 *
 * Model (no sigmoid scanner-reliability — empirically saturates near 1.0 for
 * any QR rendered above ~3px/module, which is every realistic preview/export):
 *
 *   versionFactor = min(1, 0.5 + version/12)          // small-QR codeword safety
 *   dimCap        = 0.55² × sqrt(ecPct / 0.30) / max(aspect, 1/aspect)
 *                                                      // EC-aware longest-dim cap
 *   safeArea      = min(ecPct × 0.67 × versionFactor, dimCap)
 *                                                      // theoretical safe area %
 *   coverage      = LOGO_SIZE_MULT[preset] × safeArea  // pre-quantization target
 *   {w, h, actual} = actualLogoLayout(coverage, modules, aspect)
 *                                                      // what the lib will render
 */
(function () {
    'use strict';

    var EC_BYTE_CAP_V40 = { L: 2953, M: 2331, Q: 1663, H: 1273 };
    var EC_RECOVERY     = { L: 0.07, M: 0.15, Q: 0.25, H: 0.30 };
    // Anchor: at EC H + square logo, the longest-dim cap is 0.55 (= sqrt(0.3025))
    // of the QR side. Lower ECs scale down via sqrt(ecPct/EC_H_REF) so the cap
    // shrinks ~with the RS burst-error budget rather than being flat across ECs.
    var EC_DIM_CAP_BASE = 0.3025;
    var EC_H_REF        = 0.30;
    var EC_BUDGET_FRAC  = 0.67;
    var LOGO_SIZE_MULT  = { safe: 0.5, medium: 0.8, max: 1.0 };

    function utf8Bytes(s) {
        return (typeof TextEncoder !== 'undefined')
            ? new TextEncoder().encode(s || '').length
            : (s ? s.length : 0);
    }

    function normalizeEcMode(raw) {
        var v = String(raw || 'auto');
        // Legacy from the pre-refactor 3-mode select.
        if (v === 'reliability') return 'H';
        if (v === 'readable')    return 'auto';
        if (v === 'auto' || v === 'L' || v === 'M' || v === 'Q' || v === 'H') return v;
        return 'auto';
    }

    function normalizeLogoSize(raw) {
        var v = String(raw || 'max');
        if (v === 'safe' || v === 'medium' || v === 'max') return v;
        // Legacy numeric logoCoveragePct from the slider era.
        var n = parseFloat(v);
        if (!isNaN(n)) {
            if (n <= 10) return 'safe';
            if (n <= 18) return 'medium';
            return 'max';
        }
        return 'max';
    }

    function legacyLogoSize(design) {
        if (!design) return 'max';
        if (design.logoSize != null)        return normalizeLogoSize(design.logoSize);
        if (design.logoCoveragePct != null) return normalizeLogoSize(design.logoCoveragePct);
        return 'max';
    }

    // Forced EC: keep the requested level; if data overflows v40 at it, step
    // DOWN to a lower EC (more capacity) until it fits.
    function pickForcedEc(requested, bytes) {
        var order = ['L', 'M', 'Q', 'H'];
        var i = order.indexOf(requested);
        if (i < 0) i = 0;
        for (var j = i; j >= 0; j--) {
            if (bytes <= EC_BYTE_CAP_V40[order[j]]) return order[j];
        }
        return 'L';
    }

    function safeAreaFor(version, ec, aspect) {
        var ecPct = EC_RECOVERY[ec] || 0.15;
        var versionFactor = Math.min(1, 0.5 + version / 12);
        var raw = ecPct * EC_BUDGET_FRAC * versionFactor;
        var k = parseFloat(aspect) || 1;
        var thickness = Math.max(k, 1 / k);
        var dimCap = Math.sqrt(ecPct / EC_H_REF) * EC_DIM_CAP_BASE / thickness;
        return Math.min(raw, dimCap);
    }

    function ecCandidate(data, ec, aspect) {
        if (!window.lrobQrmContent || !window.lrobQrmContent.qrStats) return null;
        var s = window.lrobQrmContent.qrStats(data, ec);
        if (!s || !s.version) return null;
        return {
            ec: ec, version: s.version, modules: s.modules,
            safeArea: safeAreaFor(s.version, ec, aspect)
        };
    }

    function bestCandidate(data, aspect) {
        var cands = ['L', 'M', 'Q', 'H']
            .map(function (e) { return ecCandidate(data, e, aspect); })
            .filter(Boolean);
        if (cands.length === 0) return null;
        return cands.reduce(function (a, b) { return a.safeArea > b.safeArea ? a : b; });
    }

    /* Without a logo, "auto" picks the highest EC that doesn't bloat the QR
     * past what the lowest EC (L) needs — same module count as L, but more
     * recovery. For very large data, this collapses to L (no EC headroom
     * without growing the matrix). */
    function autoEcNoLogo(data, aspect) {
        if (!window.lrobQrmContent || !window.lrobQrmContent.qrStats) return null;
        var lStats = window.lrobQrmContent.qrStats(data, 'L');
        if (!lStats || !lStats.version) return null;
        var target = lStats.version;
        var order = ['H', 'Q', 'M', 'L'];
        for (var i = 0; i < order.length; i++) {
            var s = window.lrobQrmContent.qrStats(data, order[i]);
            if (s && s.version === target) {
                return {
                    ec: order[i], version: s.version, modules: s.modules,
                    safeArea: safeAreaFor(s.version, order[i], aspect)
                };
            }
        }
        return null;
    }

    /* Replicates qr-code-styling's logo-quantization (vendor/qr-code-styling/
     * qr-code-styling.js — the `({originalHeight, originalWidth, maxHiddenDots,
     * maxHiddenAxisDots, dotSize})` block). Returns the actual logo size in
     * modules + the resulting coverage fraction, so the UI can display values
     * that match what the user actually sees rather than the theoretical target. */
    function actualLogoLayout(targetCoverage, modules, aspect) {
        if (targetCoverage <= 0 || modules <= 0) return { w: 0, h: 0, coverage: 0 };
        var a = Math.floor(targetCoverage * modules * modules);
        if (a <= 0) return { w: 0, h: 0, coverage: 0 };
        var k = parseFloat(aspect) || 1; // h/w
        var maxAxis = modules - 14;
        var ox = Math.floor(Math.sqrt(a / k));
        if (ox <= 0) ox = 1;
        if (maxAxis > 0 && maxAxis < ox) ox = maxAxis;
        if (ox % 2 === 0) ox--;
        if (ox <= 0) ox = 1;
        var oy = 1 + 2 * Math.ceil((ox * k - 1) / 2);
        if (oy * ox > a || (maxAxis > 0 && maxAxis < oy)) {
            if (maxAxis > 0 && maxAxis < oy) {
                oy = maxAxis;
                if (oy % 2 === 0) oy--;
            } else {
                oy -= 2;
            }
            if (oy <= 0) oy = 1;
            ox = 1 + 2 * Math.ceil((oy / k - 1) / 2);
            if (maxAxis > 0 && maxAxis < ox) ox = maxAxis;
        }
        return { w: ox, h: oy, coverage: (ox * oy) / (modules * modules) };
    }

    /* Main entry point. Returns the resolved EC + computed coverage targets +
     * actual rendered logo dimensions, all in a single pass. */
    function resolveQrParams(data, logoSize, aspect, ecMode, hasLogo) {
        var bytes = utf8Bytes(data);
        var k = parseFloat(aspect) || 1;
        var mode = normalizeEcMode(ecMode);

        var ec, version, modules, safeArea;
        if (mode === 'auto') {
            // With a logo: maximise its renderable area (highest safeArea).
            // Without a logo: highest EC at the smallest viable QR version —
            // bumping EC without growing modules is a free reliability win;
            // growing modules just to bump EC is wasted space.
            var picked = hasLogo ? bestCandidate(data, k) : autoEcNoLogo(data, k);
            if (picked) {
                ec = picked.ec; version = picked.version; modules = picked.modules;
                safeArea = picked.safeArea;
            } else {
                ec = 'L'; version = 1; modules = 21; safeArea = 0;
            }
        } else {
            ec = pickForcedEc(mode, bytes);
            var cand = ecCandidate(data, ec, k);
            if (cand) {
                version = cand.version; modules = cand.modules; safeArea = cand.safeArea;
            } else {
                version = 1; modules = 21; safeArea = 0;
            }
        }

        if (!hasLogo) {
            return {
                ec: ec, version: version, modules: modules,
                coverage: 0, imageSize: 0, safeArea: safeArea,
                logoW: 0, logoH: 0
            };
        }

        var mult = LOGO_SIZE_MULT[normalizeLogoSize(logoSize)] || 1.0;
        var targetCoverage = Math.max(0, Math.min(safeArea * mult, 1));
        var ecPct = EC_RECOVERY[ec] || 0.15;
        var imageSize = ecPct > 0 ? Math.min(1, targetCoverage / ecPct) : 0;
        var actual = actualLogoLayout(targetCoverage, modules, k);
        return {
            ec: ec, version: version, modules: modules,
            coverage: actual.coverage, // ← actual rendered fraction, not target
            imageSize: imageSize,
            safeArea: safeArea,
            logoW: actual.w, logoH: actual.h
        };
    }

    /* ─── Shape normalisation + qr-code-styling config builder ─────────── */
    // Accepts the new qr-code-styling values + legacy aliases saved by earlier
    // versions of this plugin. Lib types:
    //   dotsOptions.type ∈ {square, dots, rounded, extra-rounded, classy, classy-rounded}
    //   cornersSquareOptions.type ∈ {square, dot, extra-rounded, classy, classy-rounded}
    //   cornersDotOptions.type ∈ {square, dot, rounded, extra-rounded, classy, classy-rounded}

    function normalizeDotShape(shape) {
        var s = String(shape || 'square');
        var allowed = ['square', 'rounded', 'extra-rounded', 'dots', 'classy', 'classy-rounded'];
        return allowed.indexOf(s) >= 0 ? s : 'square';
    }

    function normalizeEyeShape(shape) {
        var s = String(shape || 'square');
        if (s === 'dots')    return 'dot';            // legacy "dots" eye → lib "dot"
        if (s === 'rounded') return 'extra-rounded';  // legacy "rounded" eye → lib "extra-rounded"
        var allowed = ['square', 'dot', 'extra-rounded', 'classy', 'classy-rounded'];
        return allowed.indexOf(s) >= 0 ? s : 'square';
    }

    function innerEyeFromOuter(eyeShape) {
        var s = normalizeEyeShape(eyeShape);
        if (s === 'dot') return 'dot';
        if (s === 'extra-rounded') return 'rounded';
        if (s === 'classy') return 'classy';
        if (s === 'classy-rounded') return 'classy-rounded';
        return 'square';
    }

    // qr-code-styling 1.9.2 SVG bug workaround: cornersSquare.type ∉
    // {dot, square, extra-rounded} routes through the dots-drawer class,
    // whose drawClassyRounded has asymmetric corner logic and drops part
    // of the bottom-left finder pattern's outline at EC H. Substitute
    // for the OUTER frame only; cornersDot keeps the original type and
    // renders fine through the `l` class.
    function safeEyeOuter(eyeShape) {
        var s = normalizeEyeShape(eyeShape);
        if (s === 'classy' || s === 'classy-rounded') return 'extra-rounded';
        return s;
    }

    /* Single source of truth for qr-code-styling config — used by every
     * call site (editor preview, card grid, export preview, downloads,
     * front block). Callers pass a flat spec with shape/color/data and
     * the engine assembles the lib's nested options object. */
    function buildQrConfig(o) {
        return {
            type: o.type || 'svg',
            width: o.width || 240,
            height: o.width || 240,
            data: o.data || ' ',
            margin: o.margin || 0,
            qrOptions: { errorCorrectionLevel: o.ec, typeNumber: 0, mode: 'Byte' },
            dotsOptions: { color: o.fgColor || '#000000', type: normalizeDotShape(o.dotShape), roundSize: false },
            backgroundOptions: { color: o.bgTransparent ? 'rgba(0,0,0,0)' : (o.bgColor || '#ffffff') },
            cornersSquareOptions: { color: o.eyeColor || o.fgColor || '#000000', type: safeEyeOuter(o.eyeShape) },
            cornersDotOptions:    { color: o.eyeColor || o.fgColor || '#000000', type: innerEyeFromOuter(o.eyeShape) },
            image: o.logoUrl || undefined,
            imageOptions: {
                crossOrigin: 'anonymous',
                margin: 0,
                imageSize: o.imageSize,
                hideBackgroundDots: !!o.logoBackground
            }
        };
    }

    /* Stats line + scanner-compat notice text — same logic in admin + front.
     * Returns {line, notice}. Caller is responsible for painting them into
     * the right DOM elements (different markup per consumer).
     *
     *   i18n keys consumed (all optional, English fallbacks bundled):
     *     statsTemplate, statsLogoSuffix, statsOverflow,
     *     statsDensityWarn, statsLengthWarn, statsLengthWarnVcardSuffix */
    function computeStatsText(data, params, i18n) {
        i18n = i18n || {};
        var out = { line: '', notice: '' };
        if (!window.lrobQrmContent || !window.lrobQrmContent.qrStats) return out;
        var s = window.lrobQrmContent.qrStats(data, params.ec);
        if (s.overflow) {
            out.notice = i18n.statsOverflow || 'Content too large to encode as a QR (max 2953 bytes at EC L). Shorten the content.';
            return out;
        }
        if (!s.version) return out;
        out.line = (i18n.statsTemplate || '{m}×{m} modules · {b} bytes · EC {e}')
            .replace(/\{m\}/g, s.modules).replace('{b}', s.bytes).replace('{e}', s.ec);
        if (params.coverage > 0 && params.logoW && params.logoH) {
            out.line += (i18n.statsLogoSuffix || ' · Logo {lw}×{lh} ({lp}%)')
                .replace('{lw}', params.logoW)
                .replace('{lh}', params.logoH)
                .replace('{lp}', Math.round(params.coverage * 100));
        }
        if (s.bytes > 1024) {
            out.notice = i18n.statsLengthWarn || 'Past ~1024 bytes the QR may be unscannable on many phones — shorten the content for reliable scans.';
        } else if (s.bytes > 512) {
            out.notice = i18n.statsDensityWarn || 'Past ~512 bytes the QR gets dense — print it large (≥ 4 cm) for reliable scans, especially at high error correction.';
        }
        if (out.notice) {
            var isVcard = window.lrobQrmContent.guessType && window.lrobQrmContent.guessType(data) === 'vcard';
            if (isVcard) {
                out.notice += ' ' + (i18n.statsLengthWarnVcardSuffix || 'For a contact card, hosting the .vcf file and encoding its URL keeps the QR much shorter.');
            }
        }
        return out;
    }

    window.lrobQrmEngine = {
        EC_RECOVERY:        EC_RECOVERY,
        EC_BYTE_CAP_V40:    EC_BYTE_CAP_V40,
        normalizeEcMode:    normalizeEcMode,
        normalizeLogoSize:  normalizeLogoSize,
        legacyLogoSize:     legacyLogoSize,
        normalizeDotShape:  normalizeDotShape,
        normalizeEyeShape:  normalizeEyeShape,
        innerEyeFromOuter:  innerEyeFromOuter,
        safeEyeOuter:       safeEyeOuter,
        buildQrConfig:      buildQrConfig,
        resolveQrParams:    resolveQrParams,
        actualLogoLayout:   actualLogoLayout,
        computeStatsText:   computeStatsText
    };
})();
