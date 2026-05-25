# 📱 LRob — QR Code Maker

### Self-hosted, privacy-first QR code generator for WordPress.

> Drop a Gutenberg block on any page so your visitors design and download their own QR codes — or keep a personal library of trackable QRs in the admin. **Every pixel is rendered in the browser**; the server only stores metadata and handles the optional tracking redirect.

[![License: GPL v2+](https://img.shields.io/badge/License-GPL%20v2%2B-blue.svg)](LICENSE)
![PHP: 8.4+](https://img.shields.io/badge/PHP-8.4%2B-777BB4)
![WordPress: 7.0+](https://img.shields.io/badge/WordPress-7.0%2B-21759B)
[![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-success)](https://github.com/LRob-FR/wp-lrob-qrcode-maker/releases)
![No SaaS](https://img.shields.io/badge/No%20SaaS-✓-success)
![No tracking calls](https://img.shields.io/badge/No%20third--party%20calls-✓-success)
![GDPR-friendly](https://img.shields.io/badge/GDPR--friendly-✓-success)

---

## 💡 Skip the QR SaaS. Own your QR codes.

Every other QR generator out there asks you to ship visitor traffic and scan analytics through *their* domain, *their* dashboard, *their* monthly bill. When they raise prices, sell to a private-equity firm, or shut down — your printed QR codes die with them.

**This plugin does the opposite.** Trackable URLs live on `your-site.com/qr/abc`. Scan logs land in your WordPress database. There is no API key, no monthly tier, no per-scan fee, no third-party processor in the contract. Install once, own it forever.

---

## 🎯 Who is this for?

<table>
<tr>
<td width="33%" valign="top">

### 🏢 Web agencies & freelancers

**Centralise QR codes for every client site you run.**

- Provide your clients a **branded, self-hosted QR studio** sitting inside their WordPress admin — no SaaS subscription to recommend, no third-party data processor to add to their GDPR register.
- Build tracked campaigns for them and **own the data**: scan counts, time-series, anonymised geo — all in their database.
- White-label-ready: the discreet LRob credit is opt-out per block (one click in the Inspector).

</td>
<td width="33%" valign="top">

### 🍽️ Hospitality & retail

**Menu codes, Wi-Fi codes, table-side ordering — done.**

- One block on a page = visitors generate **their own QR** for your menu / event / booking link, branded with your colours and logo.
- **Wi-Fi QR** content type: SSID + password + WPA → guests scan and connect, zero typing.
- Print runs with **tracked redirects**: change the menu URL after printing 500 flyers without reprinting a single one.

</td>
<td width="33%" valign="top">

### 📊 Marketing & growth teams

**Campaign tracking that respects your visitors.**

- Each QR has an **opt-in tracking toggle**. IPs are truncated to /24 (v4) or /48 (v6) **before** they hit the database — GDPR-friendly by construction.
- See scan counts directly on the QR card. No external dashboard, no consent banner needed for "QR analytics".
- **Eight content types**: URLs, vCards, Wi-Fi, email, SMS, phone, geolocation, plain text — cover the whole campaign toolkit.

</td>
</tr>
<tr>
<td valign="top">

### 🏠 Real estate, events, conferences

**Connect physical to digital, on your terms.**

- Property flyer QR → virtual tour, with scan counts showing **which listings get attention**.
- Conference badge vCard QR → attendees scan to save speaker contacts. Single-block, no third-party scanner integration.
- Event ticket QR + landing page tracking, all from the same WordPress admin.

</td>
<td valign="top">

### 🔐 Privacy-sensitive organisations

**Public sector, healthcare, education, EU SMEs.**

- **Zero outbound calls** other than a daily GitHub release check for updates.
- No third-party processor to declare. No cookies set by the plugin. No fingerprinting.
- Visitor logos for the public block are processed **in their own browser** — your server never sees the file.

</td>
<td valign="top">

### 🛠️ WordPress developers

**Plug it in, hook it, move on.**

- PHP 8.4+, WordPress 7.0+. No Composer at runtime, no JS build pipeline.
- One vendored library ([qr-code-styling](https://github.com/kozakdenys/qr-code-styling), MIT). ~92 KB zip.
- All admin actions go through a single REST namespace (`lrob-qrm/v1/library`). Schema is small (`wp_lrob_qrm_codes` + `wp_lrob_qrm_scans`), `dbDelta`-migrated.
- Self-hosted auto-update from GitHub releases — no wordpress.org dependency.

</td>
</tr>
</table>

---

## 🚀 What you can build in 5 minutes

> **Restaurant** — a public page where customers grab a QR linking to your seasonal menu, in your brand colours, with your logo. Print it once, update the menu URL without reprinting.

> **B2B agency** — a private admin library of every client's marketing QR codes. One scan log per campaign. Bill clients on real numbers, not on a SaaS subscription.

> **Conference** — speaker vCards as QRs on each badge. Attendees scan, the contact lands in their phone book. No mailing list signup friction.

> **SaaS landing page** — a "Get the mobile app" QR with your iOS/Android store link, tracked so you see how many visitors actually scan vs click.

> **Coworking space** — a Wi-Fi QR at reception. Hidden network, WPA2 password. Members scan and connect — guests don't get the password verbally.

> **Real estate listings** — every property page has a QR to the virtual tour. The agent sees in WP which properties got scanned most that week.

---

## ✨ What's inside

| | |
|---|---|
| 🧠 **All rendering client-side** | Powered by [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) — no PHP imaging library, no GD pipeline, no REST render endpoint. Preview and export come from the **same** code path, so what you see is what you get. |
| 🔒 **Privacy-first by design** | Visitors' logos never leave their browser. Tracking stores anonymised IPs (/24 for v4, /48 for v6). No SaaS, no third-party scripts, no callbacks home. |
| 🎨 **Genuinely customisable** | 6 dot shapes, 5 eye shapes, free colours per element, optional logo with **fully automatic error correction** (aspect-aware), 5 themes (incl. FSE inheritance + fully custom), 3 layouts. |
| 📇 **Eight content types** | URL · Plain text · vCard · Wi-Fi · Email · SMS · Phone · Geolocation. Compose the payload from typed fields — the encoded `BEGIN:VCARD` / `WIFI:` / `mailto:` string is built client-side. |
| 📤 **Modern export formats** | WebP (default), PNG, JPEG, **AVIF** (auto-detected on browsers that can encode it). Sizes 256 → 8192 px, plus custom for print. |
| 📈 **Tracked redirects, anonymised** | Optional per QR. `https://yoursite.com/qr/<slug>` → 302 to target + scan log. Default URL prefix configurable. |
| 🪶 **Lightweight** | ~92 KB zip, no Composer at runtime, no JS build pipeline. One vendored library (~50 KB). |
| 🔄 **Self-hosted auto-update** | Plugin updates pulled directly from GitHub releases. No wordpress.org dependency. |
| 🌍 **Localised** | English source, 🇫🇷 French at 100%. Drop a `.po` next to it for any locale you need. |

---

## 🆚 vs. the QR SaaS landscape

|  | This plugin | Typical QR SaaS |
|---|---|---|
| **Cost** | One-time install, free forever (GPL) | $5–$50 / month, scaling with scans |
| **Tracking URL** | `yoursite.com/qr/...` | `their-domain.com/yourcode` |
| **What happens if they shut down** | Nothing | Your printed QRs become 404s |
| **Where the data lives** | Your WordPress database | Their cloud, often outside the EU |
| **GDPR compliance** | No third-party processor | You add them to your DPA |
| **Custom branding** | Full control, white-labelable | Often "Pro" tier only |
| **Logo upload privacy** | File never leaves visitor's browser | Uploaded to their servers |
| **Auto-update** | From GitHub, on your timeline | Forced on theirs |

---

## 🚀 Quick start

### 1. Install

**From a release** *(recommended)*

1. Download `lrob-qrcode-maker-<version>.zip` from the [Releases](https://github.com/LRob-FR/wp-lrob-qrcode-maker/releases) page.
2. WordPress admin → **Plugins → Add New → Upload Plugin** → pick the zip → **Activate**.

**From source**

```bash
git clone https://github.com/LRob-FR/wp-lrob-qrcode-maker.git
cd wp-lrob-qrcode-maker
./release.sh                                     # produces ../releases/lrob-qrcode-maker-<version>.zip
```

### 2. Add the public block

In the block editor, insert **QR Code Maker** (category *Widgets*). Visitors land on a live maker with preview, design controls, and an *Export QR Code* action. Configure defaults (colours, theme, layout, content type) from the Inspector sidebar.

### 3. Build a tracked QR in the admin

Go to **QR Codes → Library → Create new QR code**, fill it in, tick **Tracking**, save. The QR encodes `https://yoursite/qr/<slug>` instead of the raw URL. Each scan logs an anonymised row and bumps the counter shown on the card.

That's it. No external account. No configuration step.

---

## 📦 Feature deep-dive

### Public Gutenberg block — `lrob-qrm/maker`

A drop-in maker UI visitors interact with directly.

- **Live preview** that doubles as the export source (preview = export, guaranteed).
- **Pre-seeded design** — block authors set the default colours, shapes, content type and theme in the Inspector sidebar. Each block instance can be configured independently.
- **No data leaves the browser.** Logo files are read via `FileReader` and passed in-memory to the renderer.
- **Mobile-first** responsive layout; collapses to a single column under 720 px.

### Admin library

A card grid of reusable QR codes with a modal editor.

- Card thumbnails are rendered live in the grid (qr-code-styling at 240×240).
- One-click **Edit / Export / Delete** per card.
- Stored QRs preserve their **content type + raw input values** in the design JSON, so editing later re-opens the original form (vCard fields, Wi-Fi creds, etc.) rather than the composed payload.

### Per-QR scan tracking

Opt-in per QR. When enabled:

- The QR encodes `https://yoursite/<tracking_path>/<slug>` (default `tracking_path = qr`, configurable in Settings).
- Hitting that URL: anonymises the IP, logs the scan, **302s to the real target**, increments the counter on the card.
- Non-URL targets (vCard / Wi-Fi / etc.) with tracking on display the raw payload rather than redirect — safe by construction.

### Export modal

Opened by every *Export QR Code* button (cards + designer). Holds:

- **Size** select with preset standards (256 / 512 / 1024 / 2048 / 4096 — powers of 2) + **Custom** up to 8192 px.
- **Format** select. WebP default; AVIF appears only when `canvas.toBlob('image/avif')` actually works on the visitor's browser (slow path: PNG → canvas → re-encode AVIF).
- Live preview at modal size so big-resolution exports still feel responsive.

### Content types

| Type | What it encodes |
|---|---|
| **URL** | A web URL (`https://…`) |
| **Plain text** | Free-form text |
| **Contact (vCard)** | Name, organisation, title, email, phone, website, address → `BEGIN:VCARD` v3.0 |
| **Wi-Fi network** | SSID, password, WPA/WEP/none, hidden flag → `WIFI:T:WPA;S:...;P:...;;` |
| **Email** | Recipient, subject, body → `mailto:to?subject=&body=` |
| **SMS** | Phone, message → `sms:+...?body=...` |
| **Phone call** | Phone → `tel:+...` |
| **Geolocation** | Latitude + longitude → `geo:lat,lng` |

Adding a new type is a single-class change — see `src/Support/ContentTypes.php` + the matching JS composer in `assets/js/content-types.js`.

### Themes (5)

- **Auto** *(default)* — follows the visitor's `prefers-color-scheme` (light or dark, automatic).
- **Light** — white shell, dark text, blue accent.
- **Dark** — anthracite shell, light text, same accent.
- **Inherit from site theme (FSE)** — maps the maker colours to the site's WordPress block theme palette via `--wp--preset--color--background / --foreground / --primary / --secondary`. Falls back to defaults on classic themes.
- **Custom** — six colour pickers in the Inspector: surface, soft surface (cards), input background, text, muted text, accent. Injected as inline CSS variables on the shell.

### Layouts (3)

- **Preview right** *(default)* — form left, QR + Export button right.
- **Preview left** — QR + Export button left, form right.
- **Stacked** — preview on top, form below (one column, mobile-friendly).

### Shapes

| Element | Options |
|---|---|
| **Dot shape** | Square · Rounded · Extra rounded · Dots · Classy · Classy rounded |
| **Eye shape** | Square · Extra rounded · Circle · Classy · Classy rounded |
| **Eye inner dot** | Auto-derived from the outer eye choice |

### Logo handling

- **Public block**: file picker. Image stays in the browser (FileReader → dataURL → qr-code-styling).
- **Admin library**: WordPress Media Library picker. The logo persists on the QR row (attachment ID).

### Error correction (fully automatic)

There's no EC knob in the UI — fiddling with it confuses end users and the optimal value is computable. The plugin picks the **minimum EC** that satisfies these constraints, in order:

1. **No logo** → EC `L`. Lowest overhead, biggest modules, most data capacity.
2. **Logo present** → EC bumped to whatever's needed for the logo to render at its intended size. `qr-code-styling` renders the logo at `coverage = imageSize × ecPercent` of the QR area, so a higher EC is needed for the logo to reach its intended dimension. **The logo's aspect ratio is taken into account** — non-square logos spread their coverage along one axis, so they need less EC than square ones at the same `imageSize`.
3. **Payload overflows v40** at the chosen EC → walks down `H → Q → M → L` until it fits. The Reed-Solomon margin shrinks, but the data fits.

Mapping for the default `logoSizeRatio = 0.3`:

| Logo aspect | Min EC |
|---|---|
| Square (1:1) | Q |
| Wide 2:1 | M |
| Wide / tall 4:1 | L |

The effective EC is surfaced in the stats footer under the preview (e.g. *QR v15 · 77×77 modules · 280 bytes · EC L*), along with a one-line scanner-compat notice if the payload exceeds ~200 bytes (the empirical limit for some native phone QR scanners regardless of EC/version).

### Export formats

| Format | Notes |
|---|---|
| **WebP** *(default)* | Best size/quality trade-off. |
| **PNG** | Lossless, supports transparency. |
| **JPEG** | Smallest for opaque codes, no alpha. |
| **AVIF** | Only offered when the browser can encode it. PNG → canvas → AVIF re-encode pass (slow but transparent). |

> SVG is intentionally **not** offered. SVG can carry scripts; allowing visitors to host an SVG produced by your site would expand the attack surface for no real benefit.

---

## ⚙️ Settings

**QR Codes → Settings**:

| Setting | Default | Effect |
|---|---|---|
| Tracking URL prefix | `qr` | First path segment of tracked URLs (e.g. `/qr/abc123`). Change to `/go/`, `/r/`, etc. |
| Default export size | `1024` | Pre-fills the Export modal. |
| Default export format | `webp` | Pre-fills the Export modal. |
| Uninstall behaviour | `keep` | What happens when the plugin is deleted from WP admin (see below). |

### Uninstall modes

| Mode | What it drops |
|---|---|
| **keep** *(default, safest)* | Nothing. Reinstalling picks up where you left off. |
| **archive** | Plugin options + capability + cron. Keeps QR codes + scan history. |
| **wipe** | Everything (tables, options, capability, cron). |

The `keep` default means a misclick on WP's *Delete* button cannot lose data.

---

## 🔐 Privacy & security

- **No third-party callouts.** Everything runs on your server (or your visitor's browser). The plugin makes one outbound request: a daily GitHub release check for self-update — that's it.
- **No upload pipeline for visitor logos.** The public block reads the file via `FileReader` and composites it client-side via canvas. The file never reaches your server.
- **Admin logos** are regular WP Media Library attachments, governed by your existing permissions. The render endpoint that reads them is **cap-checked** (`manage_lrob_qrm`) and **MIME-restricted** to `image/png | image/jpeg | image/webp`.
- **Tracking minimisation**:
  - IPs are truncated **before** writing (v4 → /24, v6 → /48).
  - User-agent shortened to 120 chars.
  - Referer reduced to the host (no full URL).
  - No cookies, no fingerprinting, no third-party analytics.
- **Opaque tracking URLs.** Slugs are 8-char base36 (~2.8 × 10¹² combinations), uniqueness-checked at allocation. There's nothing sensitive in the URL — just an opaque key the server resolves.
- **Permission gate**: every admin endpoint is gated by `manage_lrob_qrm` (granted to `administrator` on activation) plus `X-WP-Nonce`.

---

## 🏗️ Architecture (in 30 seconds)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (you)                            │
│   qr-code-styling — preview + export, all shapes, logos, gradients
│                                  ▲                               │
│                                  │ Same engine for preview + export
└──────────────────────────────────┼───────────────────────────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │                           │                           │
       ▼                           ▼                           ▼
  Gutenberg block          REST /lrob-qrm/v1/library      Tracking redirect
  (server-rendered          (admin CRUD only —             /qr/{slug}
   shell + JSON              no render endpoint            (rewrite rule +
   config)                   exists by design)             302 + scan log)
       │                           │                           │
       └───────────────────────────┴───────────────────────────┘
                                   │
                                   ▼
                          PHP 8.4+ on WP 7.0+
                  (no PHP image library, no Composer)
```

- **Entry point** (`lrob-qrcode-maker.php`): defines constants, registers a hand-rolled PSR-4 autoloader for plugin code, boots `Plugin::instance()->boot()` on `plugins_loaded`.
- **Subsystems** (all wired in `Plugin::boot()`):
  - `Block\Maker` — registers the `lrob-qrm/maker` Gutenberg block.
  - `REST\LibraryController` — admin-only CRUD over saved QRs (the only REST surface).
  - `Tracking\Router` — `/qr/{slug}` rewrite + redirect + scan log.
  - `AutoUpdate\Updater` — surfaces GitHub releases as WordPress plugin updates.
  - `Admin\Menu` — top-level **QR Codes** menu with **Library** + **Settings** submenus.
- **Trust boundary**: admin writes pass `LibraryController::sanitize_payload()` (URL length cap, design JSON flattened to scalars + 1-level `contentValues` map, logo_attachment_id verified against the attachment + MIME). Tracking redirects clamp the slug to `[a-z0-9]{1,32}` via the rewrite regex.

Full deep-dive: see [`CLAUDE.md`](./CLAUDE.md).

---

## 🛠️ Requirements

- PHP **8.4+**
- WordPress **7.0+**
- Modern browser with JavaScript enabled (for the maker UI)
- Pretty permalinks (Settings → Permalinks) if you want the `/qr/{slug}` tracking endpoint

AVIF export requires a browser that can encode AVIF on a canvas (Chrome 85+, Safari 16+, Firefox 110+).

---

## 🌍 Languages

| Locale | Coverage |
|---|---|
| 🇬🇧 English (source) | 100 % |
| 🇫🇷 French (`fr_FR`) | 100 % |

Adding a locale: drop `lrob-qrcode-maker-<locale>.po` into `languages/` and run `./release.sh`. The .pot is regenerated and your .po merged automatically.

---

## 🧑‍💻 Developer notes

### Build

```bash
./release.sh                       # lints, regenerates translations, zips the release
./release.sh --refresh-vendors     # also re-downloads the pinned qr-code-styling version
```

### Tests / linting

```bash
./release.sh                       # runs php -l on every PHP, node --check on every JS,
                                   # plus a dead-CSS scan with peel-once heuristic
```

No PHPUnit yet — feature-tested manually via the WordPress admin. Linting is enforced by the release script (it refuses to package on syntax errors).

### Extending content types

1. Add a key to `ContentTypes::definitions()` (`src/Support/ContentTypes.php`) — label + fields list.
2. Add a `case` to the `compose()` switch in `assets/js/content-types.js` — produce the encoded string.
3. Done — both admin + frontend pick the new type up via localised config.

### Extending shapes

`qr-code-styling`'s `dotsOptions.type` and `cornersSquareOptions.type` define the wire values; the lists at the top of `assets/js/maker.js` (and the `DOT_SHAPES` / `EYE_SHAPES` consts in `src/Admin/LibraryPage.php`) drive the UI. Adding a shape = one entry in each + a CSS icon class.

---

## 💬 Feedback & contributions

Bug reports, feature ideas and pull requests welcome on the [GitHub issue tracker](https://github.com/LRob-FR/wp-lrob-qrcode-maker/issues).

---

## 📜 License & credits

Plugin code: **GPL-2.0-or-later**. See [`LICENSE`](./LICENSE).

### Vendored libraries

| Library | Author | License | Role |
|---|---|---|---|
| [**qr-code-styling**](https://github.com/kozakdenys/qr-code-styling) | Denys Kozak (@kozakdenys) | MIT | Browser-side QR rendering — preview AND export. This plugin would not exist in its current form without it. |

Upstream notices are preserved verbatim in `vendor/qr-code-styling/LICENSE`.

### Built by

**[LRob](https://www.lrob.fr)** — WordPress web hosting specialist based in Orléans, France.

- 📦 Plugin home: <https://www.lrob.fr/wordpress/plugins/lrob-qrcode-maker/>
- 🐛 Issues: <https://github.com/LRob-FR/wp-lrob-qrcode-maker/issues>
- 💼 Hosting service: <https://www.lrob.fr>

---

> *Powered by visitors' browsers. Hosted on your terms. No SaaS.*
