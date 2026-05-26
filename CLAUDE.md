# CLAUDE.md

Guidance for Claude Code sessions working in this repository. End-user-facing docs live in `README.md` — keep this file for operational + code-level notes that don't belong there.

## Project

WordPress plugin **LRob - QR Code Maker** (slug `lrob-qrcode-maker`). Public Gutenberg block + admin library with optional per-QR scan tracking. Requires PHP 8.3+ and WordPress 6.0+.

**Rendering is fully client-side** via the vendored `qr-code-styling` JS lib (Denys Kozak, MIT, `vendor/qr-code-styling/`). The PHP side stores QR metadata + handles `/qr/{slug}` redirects — it does **not** render images. No GD, no Imagick, no PHP QR lib. **Credit qr-code-styling whenever the rendering pipeline is discussed publicly.**

## Build / lint / release

`./release.sh` is the single build entry point. **Run it yourself whenever needed.** Output is captured in one go — `./release.sh 2>&1 | tail -40` shows everything that matters.

Steps: lint every PHP (`php -l`) + every JS (`node --check`) → dead-CSS scan → regen `.pot` → `msgmerge` POs → compile `.mo` + `.json` → stats → zip into `../releases/lrob-qrcode-maker-<version>.zip`.

Every build pings the npm registry for the latest qr-code-styling tag and WARNs if it's newer than the pinned `VENDOR_QR_CODE_STYLING_VERSION` constant (network-best-effort, silent if offline).

`./release.sh --refresh-vendors` re-downloads the pinned version. Skipped by default so day-to-day builds don't hit the network for the actual download. **Before bumping the version constant**: read the upstream changelog at <https://github.com/kozakdenys/qr-code-styling/releases>. The 1.9.2 we pin has a known SVG bug on classy/classy-rounded eyes — `qr-engine.js`'s `safeEyeOuter()` works around it. Verify the bump fixes that bug before dropping the workaround.

Note: `node --check` validates syntax only, not `ReferenceError`. After moving shared helpers between files, manually grep for orphan callers.

## Versioning

Two cadences:
- **+0.0.1 (patch)** — small adjustments. Multiple iterations stack at the same version while testing; bump only on the user's explicit ship cue. **Ask the user for the version number — don't decide it yourself.** Do NOT bump during iterative debug (see memory `feedback-no-version-bumps-while-unstable`).
- **+0.1.0 (minor)** — a feature shipped.

Single source of truth: `lrob-qrcode-maker.php` has both the `Version:` header and `LROB_QRM_VERSION` constant — bump them together.

## Naming convention — **MANDATORY**

Prefixes must be plugin-specific. Several LRob plugins coexist; `lrob_` alone collides. This plugin uses `qrm` (= "qr maker") everywhere a runtime identifier appears.

| Layer | Prefix | Examples |
|---|---|---|
| PHP namespace | `LRob\QRCodeMaker\` | `LRob\QRCodeMaker\Library\Repository` |
| Hooks (actions/filters) | `lrob_qrm_` | `lrob_qrm_rendered_bytes` |
| Constants | `LROB_QRM_` | `LROB_QRM_VERSION`, `LROB_QRM_PATH` |
| DB tables | `{wpdb->prefix}lrob_qrm_` | `wp_lrob_qrm_codes`, `wp_lrob_qrm_scans` |
| Options | `lrob_qrm_` | `lrob_qrm_settings`, `lrob_qrm_db_version` |
| REST namespace | `lrob-qrm/v1` | `/wp-json/lrob-qrm/v1/library` |
| Capability | `manage_lrob_qrm` | granted to `administrator` on activate |
| Text domain | `lrob-qrcode-maker` | unchanged (human-readable slug) |
| CSS / JS globals | `lrob-qrm-` / `lrobQrm` | `lrob-qrm-maker`, `window.lrobQrmAdmin` |
| Block name | `lrob-qrm/maker` | the only block today |

Anything new — option, table, hook, CSS class — **must** follow these prefixes.

## Conventions

- **Strict types**: every PHP file in `src/` starts with `declare(strict_types=1);`.
- **Final classes** unless explicitly meant for subclassing.
- **Constructor property promotion + readonly + `match` + named args + typed class constants** — PHP 8.3+. No 8.4-only features (no property hooks, no asymmetric visibility).
- **No mock/stub/fallback code paths for things that can't happen.** Internal code trusts callers; validate only at WP REST / admin / form boundaries.
- **One-line doc comments only where the WHY is non-obvious.** Don't narrate WHAT — names already do that.
- **No backwards-compat shims** while version < 1.0.0. Schema can change freely between minor versions.
- **Don't pre-bump versions or auto-commit small changes.** Both wait for the user's cue.

## Don't run the plugin locally

The user tests on his server, not on this machine. **Do not** run `php -r` smoke tests, do not spin up a wp-cli stub, do not install missing PHP extensions. Linters are fine — they don't execute.

If something genuinely needs server-side verification later, surface it inline on the Library page rather than re-introducing a dedicated diagnostics page.

## Deployment workflow — read before claiming a fix is live

The user runs the plugin from the release zip, not the working tree. **Every PHP change must be followed by `./release.sh`**. Treat "edit done" as "not deployed" until rebuild has run. CSS/JS pick up a `filemtime`-based cache-bust query when `WP_DEBUG` is on; in production they use plugin version, so a CSS-only fix in a release still needs a version bump or a hard refresh.

## Architecture

**Entry point** (`lrob-qrcode-maker.php`): defines constants, registers a hand-rolled PSR-4 autoloader (`LRob\QRCodeMaker\Foo\Bar` → `src/Foo/Bar.php`). Boots `Plugin::instance()->boot()` on `plugins_loaded`. **No Composer at runtime.** The only vendored lib is `vendor/qr-code-styling/qr-code-styling.js`.

**Lifecycle**: `Activator::activate()` grants `manage_lrob_qrm`, seeds settings + uninstall-mode, runs `Schema::install()` (dbDelta), flushes rewrite rules. `Deactivator::deactivate()` clears `lrob_qrm_*` cron + flushes rewrites. `uninstall.php` honours `lrob_qrm_uninstall_mode` (keep / archive / wipe) — `keep` default.

**Subsystems** (wired in `Plugin::boot()`):
- `Block\Maker` — registers `lrob-qrm/maker`, server-renders the shell, enqueues `assets/js/maker.js` only on pages containing the block.
- `REST\LibraryController` — `GET/POST/PUT/DELETE /lrob-qrm/v1/library`. Admin-only (`manage_lrob_qrm` + `X-WP-Nonce`). Sole REST surface.
- `Tracking\Router` — `init` rewrite + `template_redirect` lookup → log scan + 302 to target. Special-cases vCard payloads → serves `text/vcard` attachment.
- `AutoUpdate\Updater` — filters `pre_set_site_transient_update_plugins` + `plugins_api` to surface GitHub releases as WP updates.
- `Admin\Menu` — top-level "QR Codes" with Library + Settings submenus.

**Trust boundary**: admin writes pass `LibraryController::sanitize_payload()` (URL length cap, design JSON flattened to scalars, `logo_attachment_id` verified against attachment + MIME). Tracking redirects clamp the slug to `[a-z0-9]{1,32}` via the rewrite regex. No QR-rendering validation needed — no PHP renderer exists.

## Admin editor modal

The `<form data-role="form">` wraps the **entire** `lrob-qrm-modal-panel` (header + body), so the `<input name="label">` in the header bar is picked up by `FormData(form)` along with the body fields. Body is a 2-col grid: `lrob-qrm-editor-fields` LEFT, `lrob-qrm-editor-preview-wrap` RIGHT (sticky preview + Generate-image button + stats + notice).

- **Form submit listener** does `preventDefault()` so Enter in the label input doesn't reload the page.
- **Mobile (≤800px)**: modal goes full-bleed (border-radius 0, padding 0 on backdrop); preview wrap floats above the fields via `order: -1`.
- **Open animation**: pure CSS — `@keyframes lrob-qrm-fade-in` on the backdrop + `lrob-qrm-pop-in` on the panel, fired by toggling the `[hidden]` attribute. Close is instant (no CSS-only way to delay `display: none`).
- **Edit flow**: modal opens FIRST (synchronous `openEditor()`), THEN `loadIntoEditor()` fetches `/library` in the background. `.is-loading` class dims `.lrob-qrm-editor-grid` until the row is applied — feels responsive even on slow connections.
- **Post-save grid refresh**: when the editor closes after a successful save, `refreshGridCard(id)` re-fetches `/library`, finds the saved row, and replaces the matching `[data-id]` card with a freshly-built one (`buildCardDom`) or appends it if it's the first save. Empty-state placeholder removed automatically. **No full page reload.** `buildCardDom` mirrors the PHP template in `LibraryPage::render()` — keep them in sync.
- **Card actions** (download / edit / delete) are delegated on the grid via a single click listener, so dynamically-added cards work without re-binding.

## Autosave

The editor autosaves on every form input with a **1s debounce**. No "Save to library" button. Closing the modal flushes any pending save.

- **State machine** (`saveState`): `idle | dirty | saving | saved | error`. Sticky indicator in the modal header.
- **Race conditions**: only one save in flight; `dirtyDuringFlight` re-fires the next save after the current resolves. `suppressAutoSave` counter blocks autosave during programmatic form mutations (`form.reset()`, `loadIntoEditor`, `wpColorPicker` reinit, `setLogo` from existing-QR load).
- **Slug arrival**: when a fresh save returns a NEW slug (first save with tracking on), we update `data-current-slug`, `syncTrackingPreview()`, AND call `refreshPreview()` so the QR encodes the real slug. Skipping refresh to avoid the logo-reload flash was tried but rejected: the preview kept encoding `/qr/preview` (placeholder) until next user input, and scanning that placeholder hits a Router 404 which WP serves as an unrelated page. The flash is the lesser evil. Gated on `prevSlug !== saved.slug` so subsequent saves don't re-flash.
- **Close flow**: Cancel/backdrop/X/Escape → `requestCloseEditor()` → `flushSave()` → if `saveState === 'error'`, `confirm()` before closing.

## EC + logo coverage pipeline (qr-engine.js)

`assets/js/qr-engine.js` is the single source of truth for the EC + logo pipeline (`window.lrobQrmEngine`). Both `admin/js/admin.js` and `assets/js/maker.js` delegate to `resolveQrParams(data, logoSize, aspect, ecMode, hasLogo)` and `computeStatsText(data, params, i18n)` (returns `{line, notice}` to paint into each consumer's DOM). Depends on `window.lrobQrmContent.qrStats` (in `content-types.js`).

**UI controls** (both as `.lrob-qrm-toggle-picker` radio-pill groups):
- `Error correction`: Auto | Min | Low | Medium | High → `auto | L | M | Q | H`.
  - `auto` no-logo: highest EC at L's QR version (no module bloat).
  - `auto` with logo: EC with largest `safeArea` for the chosen `logoSize`.
  - Forced levels step DOWN if data overflows v40 at the chosen EC.
- `Logo size`: Safe | Medium | Max → multipliers `{0.5, 0.8, 1.0}` on `safeArea`.

**Formula** — proper Reed-Solomon math via the QR code's block structure:
```
totalEC    = ECC_PER_BLOCK[ec][version] × BLOCKS[ec][version]
rsBudget   = (totalEC × 8 × RS_SAFETY) / (totalModules × √blocks)
dimCap     = 0.55² / max(aspect, 1/aspect)
safeArea   = min(rsBudget, dimCap)
coverage   = LOGO_SIZE_MULT[preset] × safeArea
{w, h, actual} = actualLogoLayout(coverage, modules, aspect)
imageSize  = coverage / ecPct               // qr-code-styling's "imageSize" is a budget
```

Key design choices:
- **`ECC_PER_BLOCK` + `BLOCKS` tables** from ISO/IEC 18004:2015 Annex D Table 9 (40 versions × 4 EC levels). These give the exact Reed-Solomon structure per (version, EC). Hardcoded in `qr-engine.js`.
- **`totalEC × 4` (= ×8/2) modules** is the theoretical error-mode RS recovery budget (half the EC codewords as max errors, ×8 modules per codeword). We assume **error mode**, not erasure — scanners don't reliably treat hidden-background logo modules as erasures.
- **`÷ √blocks`** accounts for damage concentration: a centred logo's modules don't distribute evenly across RS blocks. The √ scaling fits both empirical calibration points (v3 H 16% scans / v13 H 9% scans, 15% fails) within ~1pp.
- **`RS_SAFETY = 0.54`** is the single empirical knob, calibrated against the two observed boundaries above.
- **`dimCap` = 0.55² / thickness** is a separate cap on the logo's longest dimension (≤55% of the QR side). Scanner heuristics struggle to skip a logo region larger than that, no matter the RS budget. Kicks in for wide/tall logos.
- **`coverage` returned by `resolveQrParams`** is the **actual rendered fraction** post qr-code-styling's odd-module quantization, not the theoretical target. Stats line shows `Logo {w}×{h} ({lp}%)` so the displayed % matches what the user actually sees.
- No scanner-reliability sigmoid, no `versionFactor`, no `EC_H_REF`/`EC_BUDGET_FRAC` — the proper RS math handles per-version scaling correctly via the EC tables.

**Constants** (all in `qr-engine.js`):
- `EC_RECOVERY = { L: 0.07, M: 0.15, Q: 0.25, H: 0.30 }` — only used for the `imageSize = coverage / ecPct` mapping to qr-code-styling.
- `EC_BYTE_CAP_V40 = { L: 2953, M: 2331, Q: 1663, H: 1273 }`
- `EC_DIM_CAP_BASE = 0.3025` (= 0.55², scanner-heuristic linear cap on the logo's longest side)
- `RS_SAFETY = 0.54` (empirical scanner safety margin on top of theoretical RS budget)
- `LOGO_SIZE_MULT = { safe: 0.5, medium: 0.8, max: 1.0 }`
- `ECC_PER_BLOCK[ec][i]` + `BLOCKS[ec][i]` — QR spec tables, 40 entries each, indexed by version-1.

**Legacy migration** (in `normalizeEcMode` / `normalizeLogoSize` / `legacyLogoSize`):
- `ecMode === 'reliability'` → `'H'`; `'readable'` → `'auto'`.
- Numeric `logoCoveragePct` → preset by threshold: `≤10 → safe`, `≤18 → medium`, else `max`.
- Old `logoSizeRatio` + `ecLevel` fields are dropped from the form-apply skip list.

**Stats line** (`data-role="stats"`): `{m}×{m} modules · {b} bytes · EC {e}` + when a logo is present, ` · Logo {lw}×{lh} ({lp}%)`.

**Notice** (`data-role="stats-notice"`):
- `> 1024 bytes` — "may be unscannable on many phones, shorten the content".
- `> 512 bytes` — "QR is getting dense, print large (≥ 4 cm) for reliable scans".
- vCard payloads at either threshold → suffix suggesting Tracking + .vcf endpoint.
- `> 2953 bytes` (overflow at L) — "content too large to encode".

## qr-code-styling quirks

The lib is vendored at `vendor/qr-code-styling/qr-code-styling.js` (minified, v1.9.2). Key behaviours that bite:

- **`dotsOptions.roundSize: false`** is required on previews. Otherwise canvas rounds module size to integer pixels, leaving empty margin around the QR matrix as version increases.
- **All preview render paths share `buildQrConfig({...})`** (in `qr-engine.js`) — same width (240), same margin (0), same options. Editor preview reuses one instance via `.update()`; card grid + export modal each create a fresh instance. The download path uses `{type: 'canvas'}` override.
- **classy / classy-rounded eye + bottom-left finder at EC H** is a SVG-renderer bug. `cornersSquare.type ∉ {dot, square, extra-rounded}` falls back to the dots-drawer class whose `_drawClassyRounded` has asymmetric corner-neighbor logic, dropping part of the bottom-left frame outline. Canvas renders fine (download unaffected). **Workaround**: `safeEyeOuter()` substitutes classy/classy-rounded → extra-rounded for `cornersSquareOptions.type` only; the inner `cornersDotOptions` keeps the original (renders fine through the `l` class). Long-term: bump qr-code-styling and remove `safeEyeOuter`.
- **`imageOptions.imageSize` is a COVERAGE BUDGET, not the logo width.** Rendered coverage = `imageSize × ecPercent` of QR area, aspect-preserved. Our formula handles this — we pass `imageSize = coverage / ecPercent` directly.
- **`imageOptions.margin = 0`** everywhere. The lib's margin is px padding around the logo box where modules get cleared with `hideBackgroundDots`; `margin > 0` produces inconsistent rendering across canvas sizes.

## Content type composer (content-types.js)

`assets/js/content-types.js` exposes `window.lrobQrmContent` with:
- `render(container, typeKey, defs, values, onChange, opts)` — build the content-type's form fields, wire `onChange` on every input.
- `compose(typeKey, values)` — produce the encoded payload (URL, `BEGIN:VCARD` vCard 3.0, `WIFI:`, `mailto:`, etc.).
- `guessType(raw)` — best-effort detection from an encoded string. Used when loading legacy QRs.
- `qrStats(data, ec)` → `{bytes, version, modules, ec, overflow}`. Backed by the `QR_BYTE_CAP` table (byte capacity per EC × version). Used by `qr-engine.js`.
- `qrByteLen(data)` — UTF-8 byte length via `TextEncoder`.

Format choices baked in:
- **vCard 3.0** (not MECARD). MECARD's ORG/TITLE aren't reliably supported on iOS Camera. `;CHARSET=UTF-8` parameter doesn't help strict Android scanners — the reliable workaround for accented vCards is Tracking + .vcf endpoint.
- **Wi-Fi** `WIFI:T:WPA;S:<ssid>;P:<pwd>;;`. Pure-hex passwords (e.g. "1234abcd") get wrapped in quotes per ZXing spec — without quotes, scanners decode them as raw hex bytes and auth fails.

## Where things live

```
lrob-qrcode-maker.php         Entry, constants, autoloader, lifecycle hooks
uninstall.php                 keep/archive/wipe gated by lrob_qrm_uninstall_mode
src/
  Activator.php               Capability + options + schema seed
  Deactivator.php             Clear cron + flush rewrites
  Plugin.php                  Boot order
  REST/LibraryController.php  Admin CRUD (sole REST surface)
  Library/Schema.php          dbDelta for codes + scans tables
  Library/Repository.php      wpdb wrapper, scan logging, slug allocator
  Tracking/Router.php         /qr/{slug} rewrite + redirect (+ vCard .vcf serve)
  Block/Maker.php             Gutenberg block registration + render callback
  Admin/Menu.php              Top-level menu + asset enqueue (incl. wp.media)
  Admin/LibraryPage.php       Card grid + editor modal + autosave UI
  Admin/SettingsPage.php      Tracking path + uninstall mode
  AutoUpdate/Updater.php      GitHub-release self-updater
assets/                       Front block + shared assets (block-scoped enqueue)
  js/block-editor.js          Gutenberg editor: InspectorControls + preview
  js/maker.js                 Front block runtime: hydrate, live preview, download
  js/content-types.js         Shared: render + compose + qrStats + guessType
  js/qr-engine.js             Shared EC + logo coverage pipeline + buildQrConfig
  css/block-editor.css
  css/maker.css
admin/                        Admin-only assets
  js/admin.js                 Editor modal + autosave + card grid + export modal
  css/admin.css
vendor/qr-code-styling/       The only vendored upstream — Denys Kozak, MIT
languages/                    .pot + .po (gitignored: .mo, .json)
release.sh                    Lints + vendor refresh + translations + zip
```
