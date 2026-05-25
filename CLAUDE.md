# CLAUDE.md

Guidance for Claude Code sessions working in this repository.

## Project

WordPress plugin **LRob - QR Code Maker** (slug `lrob-qrcode-maker`). Customizable QR code generator with a public Gutenberg block (visitors design and download their own) and an admin library with optional per-QR scan tracking. Requires PHP 8.4+ and WordPress 7.0+.

**Rendering architecture: fully client-side.** Both the preview and the downloaded file are produced by the vendored `qr-code-styling` JS library (Denys Kozak / kozakdenys, MIT, `vendor/qr-code-styling/`). The PHP side stores QR metadata + handles the `/qr/{slug}` tracking redirect — it does not render images. There is no `RenderController`, no `QRRenderer`, no GD pipeline, no PHP QR library. Previous server-side rendering was ripped out in favour of "preview == export" via the same JS engine. **Credit qr-code-styling whenever the rendering pipeline is discussed publicly.**

## Build / lint / release

`./release.sh` is the single build entry point. **Run it yourself whenever needed.** Output is captured in one go — `./release.sh 2>&1 | tail -40` shows everything that matters. Steps:

- Lints every PHP file (`php -l`) and every JS file (`node --check`, skipped if no node).
- Scans CSS for unreferenced `.lrob-qrm-*` selectors (peel-once + 3-hyphen-min heuristic).
- Regenerates `languages/lrob-qrcode-maker.pot` via `wp i18n make-pot` (when wp-cli present).
- `msgmerge`s POT into every `.po`, `msgattrib --no-obsolete` strips orphans.
- Compiles `.po` → `.mo` + `.json`; `msgfmt --statistics` per language.
- Prints file-type + LoC stats.
- Zips into `../releases/lrob-qrcode-maker-<version>.zip`.

**Vendor refresh:** `./release.sh --refresh-vendors` re-downloads the pinned version of `qr-code-styling` (version pin at the top of `release.sh`). The lib's vendor directory is wiped clean before extraction so renamed/dropped upstream files don't linger. Skipped by default so day-to-day builds don't hit the network. Bump the version constant in `release.sh`, run with the flag, commit the diff.

## Versioning

Two cadences:
- **+0.0.1 (patch)** — small adjustments. Multiple iterations stack at the same version while testing; bump only on the user's explicit ship cue. **Ask the user for the version number — don't decide it yourself.** Do NOT bump during iterative debug — the user has been explicit about this (see memory `feedback-no-version-bumps-while-unstable`).
- **+0.1.0 (minor)** — a feature shipped.

Single source of truth: `lrob-qrcode-maker.php` has both the `Version:` header and `LROB_QRM_VERSION` constant — bump them together.

## Naming convention — **MANDATORY**

Prefixes must be plugin-specific. Several LRob plugins coexist; "lrob_" alone collides. This plugin uses `qrm` (= "qr maker") everywhere a runtime identifier appears.

| Layer | Prefix | Examples |
|---|---|---|
| PHP namespace | `LRob\QRCodeMaker\` | `LRob\QRCodeMaker\Support\QRRenderer` |
| Hooks (actions/filters) | `lrob_qrm_` | `lrob_qrm_rendered_bytes` |
| Constants | `LROB_QRM_` | `LROB_QRM_VERSION`, `LROB_QRM_PATH` |
| DB tables | `{wpdb->prefix}lrob_qrm_` | `wp_lrob_qrm_codes`, `wp_lrob_qrm_scans` |
| Options | `lrob_qrm_` | `lrob_qrm_settings`, `lrob_qrm_db_version` |
| REST namespace | `lrob-qrm/v1` | `/wp-json/lrob-qrm/v1/render` |
| Capability | `manage_lrob_qrm` | granted to `administrator` on activate |
| Text domain | `lrob-qrcode-maker` | unchanged (human-readable slug) |
| CSS classes / JS globals | `lrob-qrm-` / `lrobQrm` | `lrob-qrm-maker`, `window.lrobQrmAdmin` |
| Block name | `lrob-qrm/maker` | the only block today |

Anything Claude adds — new option, table, hook, CSS class — **must** follow these prefixes.

## Architecture

**Entry point** (`lrob-qrcode-maker.php`): defines constants, registers a hand-rolled PSR-4 autoloader for plugin code (`LRob\QRCodeMaker\Foo\Bar` → `src/Foo/Bar.php`). Boots `Plugin::instance()->boot()` on `plugins_loaded`. **No Composer at runtime, no PHP vendor dependencies** — the only vendored lib is the JS bundle `vendor/qr-code-styling/qr-code-styling.js`, enqueued by the block + admin pages.

**Lifecycle**: `Activator::activate()` grants `manage_lrob_qrm` to administrator, seeds settings + uninstall-mode options, runs `Schema::install()` (dbDelta idempotent) for `wp_lrob_qrm_codes` + `wp_lrob_qrm_scans`, flushes rewrite rules so `/qr/{slug}` resolves on the next request. `Deactivator::deactivate()` clears any `lrob_qrm_*` cron events and flushes rewrites. `uninstall.php` honours `lrob_qrm_uninstall_mode` (keep / archive / wipe) — `keep` is default so a misclick doesn't lose data.

**Container** (`src/Container.php`): tiny `set()`/`get()`/`has()` service locator. Not actively used — most subsystems are instantiated directly in `Plugin::boot()`. Kept for future cross-subsystem service registration.

**Subsystems** (all wired in `Plugin::boot()`):
- `Block\Maker` — registers the `lrob-qrm/maker` Gutenberg block, server-renders the shell, enqueues `assets/js/maker.js` only on pages containing the block (block-scoped registration).
- `REST\LibraryController` — `GET/POST/PUT/DELETE /lrob-qrm/v1/library`. Admin-only (`manage_lrob_qrm` + `X-WP-Nonce`). The only REST surface this plugin exposes.
- `Tracking\Router` — `init` rewrite rule + `template_redirect` lookup → log scan + 302 to target.
- `AutoUpdate\Updater` — runs in every context (front + admin), filters `pre_set_site_transient_update_plugins` and `plugins_api`.
- `Admin\Menu` (admin only) — top-level "QR Codes" with submenus Library / Settings.

**Trust boundary**: admin writes pass `LibraryController::sanitize_payload()` (target_url length cap, design JSON flattened to scalars, logo_attachment_id verified against the attachment + MIME). Tracking redirects clamp the slug to `[a-z0-9]{1,32}` via the rewrite regex. No QR-rendering payload validation needed — there is no PHP renderer.

## Conventions to follow

- **Strict types**: every PHP file in `src/` starts with `declare(strict_types=1);`.
- **Final classes** unless explicitly meant for subclassing.
- **Constructor property promotion** + readonly + `match` + named args freely — PHP 8.4+ minimum.
- **No mock/stub/fallback code paths for things that can't happen.** Internal code trusts callers; validate only at WP REST / admin / form boundaries.
- **One-line doc comments only where the WHY is non-obvious.** Don't narrate WHAT — names already do that.
- **No backwards-compat shims** while version < 1.0.0. Schema can change freely between minor versions.
- **Don't pre-bump versions or auto-commit small changes.** Both wait for the user's cue.

## Don't run the plugin locally

The user tests on his server, not on this machine. **Do not** run `php -r` smoke tests, do not spin up a wp-cli stub, do not try to install a missing PHP extension. Linters (`php -l`, `node --check`) are fine — they don't execute anything.

QR rendering is fully client-side (qr-code-styling), so the runtime surface is tiny: PHP version + WP version + pretty permalinks for the `/qr/{slug}` redirect. No GD / Imagick / fileinfo dependencies. If something genuinely needs server-side verification later, surface it inline on the Library page rather than re-introducing a dedicated diagnostics page.

## Deployment workflow — read before claiming a fix is live

The user runs the plugin from the release zip, not the working tree. **Every PHP change must be followed by `./release.sh`**. Treat "edit done" as "not deployed" until rebuild has run. CSS/JS pick up a `filemtime`-based cache-bust query when `WP_DEBUG` is on; in production they use plugin version, so a CSS-only fix in a release still needs a version bump or a hard refresh.

## Render architecture (client-side only)

Both preview and download go through the same `qr-code-styling` instance. Preview is a small (≈280×280) instance attached to a DOM node; download builds a fresh instance at the user's chosen pixel size and calls its `.download({ name, extension })` method. There is no PHP rendering. Preview == export, guaranteed.

**Auto-bump for logos.** When a logo is attached AND the user picked EC level L or M, the export instance is rebuilt with EC H. Logos can cover up to ~9% of the data area and would push past L's 7% budget. Explicit Q/H choices are honoured. This logic lives in `assets/js/maker.js::doDownload()` and `admin/js/admin.js::exportQr()`.

**Logo source.**
- Public block: `FileReader` → dataURL → passed as `image:` to qr-code-styling. The bytes never leave the browser.
- Admin library: WP Media Library attachment URL → fetched by qr-code-styling cross-origin (same site → no CORS issue). The attachment ID + URL come back from `LibraryController::list` via `Repository::inflate()`.

## Adding a new shape / format

- **Dot or eye shape:** add the option in `maker.js` and `admin.js` UI (label + value), map the value in their `shapeToDotType()` / `shapeToEyeType()` helpers (or `jsType()` / `jsEyeType()` in admin.js), and add a Gutenberg `SelectControl` entry in `block-editor.js` for the per-block defaults. qr-code-styling supports `square`, `rounded`, `dots`, `classy`, `classy-rounded`, `extra-rounded` for dots, plus matching corner types.
- **Output format:** add to the `<select name="format">` options in `LibraryPage.php` and to the `selectField` in `maker.js`. qr-code-styling's `extension` accepts `png` / `jpeg` / `webp` (we deliberately don't expose `svg`).

## Where things live

```
lrob-qrcode-maker.php        Entry, constants, plugin autoloader, lifecycle hooks
uninstall.php                 keep/archive/wipe gated by lrob_qrm_uninstall_mode
src/
  Activator.php               Capability + options + schema seed
  Deactivator.php             Clear cron + flush rewrites
  Plugin.php                  Boot order
  Container.php               Tiny service locator (unused in current build)
  REST/
    LibraryController.php     Admin CRUD (sole REST surface)
  Library/
    Schema.php                dbDelta for codes + scans tables
    Repository.php            wpdb wrapper, scan logging, slug allocator
  Tracking/
    Router.php                /qr/{slug} rewrite + redirect + scan log
  Block/
    Maker.php                 Gutenberg block registration + render callback
  Admin/
    Menu.php                  Top-level menu + asset enqueue (incl. wp.media)
    LibraryPage.php           Card grid + editor panel
    SettingsPage.php          Tracking path + uninstall mode
  AutoUpdate/
    Updater.php               GitHub-release self-updater
assets/                       Frontend assets (block-scoped enqueue)
  js/block-editor.js          Gutenberg editor: InspectorControls + preview
  js/maker.js                 Frontend: hydrate, live preview, download (qr-code-styling)
  css/block-editor.css
  css/maker.css
admin/                        Admin assets
  js/admin.js                 Editor preview + download (qr-code-styling), wp.media picker
  css/admin.css
vendor/
  qr-code-styling/            The only vendored upstream — Denys Kozak, MIT
languages/                    .pot + .po (gitignored: .mo, .json)
release.sh                    Lints + vendor refresh + translations + zip
```
