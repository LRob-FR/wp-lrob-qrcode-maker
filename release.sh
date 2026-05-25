#!/bin/bash
# LRob - QR Code Maker - Release Builder
# Lints, optionally refreshes vendored libs, regenerates translations,
# scans for dead CSS, prints build stats, zips.

set -e

SCRIPT_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
PLUGIN_DIR_NAME="$(basename "$SCRIPT_DIR")"
PLUGIN_SLUG="lrob-qrcode-maker"
PLUGIN_NAME="LRob - QR Code Maker"
PLUGIN_FILE="${SCRIPT_DIR}/${PLUGIN_SLUG}.php"
LANGUAGES_DIR="${SCRIPT_DIR}/languages"
VENDOR_DIR="${SCRIPT_DIR}/vendor"
RELEASES_DIR="${PARENT_DIR}/releases"

# ── Pinned vendor versions ──────────────────────────────────────────────
# Bump these on a deliberate vendor update; `./release.sh --refresh-vendors`
# re-downloads and replaces the tree. Without that flag, vendor/ is left
# alone so day-to-day builds don't hit the network.
#
# Refresh logic: each lib's directory is wiped clean before re-download so
# stray files from a previous version (renamed README, removed LICENSE, etc.)
# don't linger.
VENDOR_QR_CODE_STYLING_VERSION="1.9.2"

REFRESH_VENDORS=0
for arg in "$@"; do
    case "$arg" in
        --refresh-vendors) REFRESH_VENDORS=1 ;;
        --no-vendor)       REFRESH_VENDORS=0 ;;
    esac
done

ok()    { echo "[OK] $1"; }
fail()  { echo "[FAIL] $1" >&2; }
warn()  { echo "[WARN] $1"; }
step()  { echo "> $1"; }

need() { command -v "$1" >/dev/null 2>&1 || { fail "missing: $1"; exit 1; }; }

check_deps() {
    step "deps"
    need php; need zip
    if ! command -v wp >/dev/null 2>&1; then
        warn "wp-cli not found — translation generation will be skipped"
    fi
    if ! command -v msgfmt >/dev/null 2>&1; then
        warn "msgfmt not found — .mo compilation will be skipped"
    fi
    ok "php $(php -r 'echo PHP_VERSION;')"
}

get_version() {
    [ -f "$PLUGIN_FILE" ] || { fail "plugin file not found"; exit 1; }
    grep -oP "Version:\s*\K[\d.]+" "$PLUGIN_FILE"
}

# Re-download vendored upstream libraries to the pinned tag.
# Skipped unless --refresh-vendors is passed.
#
# Each library's directory is fully cleared before re-extraction so that
# renamed / removed upstream files (old LICENSE name, dropped READMEs, etc.)
# don't linger across version bumps.
refresh_vendors() {
    [ "$REFRESH_VENDORS" -eq 1 ] || { step "vendor (skipped — pass --refresh-vendors to update)"; return 0; }
    step "vendor refresh"
    need curl; need tar
    local tmp; tmp=$(mktemp -d)
    trap "rm -rf '$tmp'" RETURN

    # qr-code-styling — Denys Kozak (kozakdenys), MIT
    # npm UMD bundle, browser-side rendering for both preview and export.
    local v="$VENDOR_QR_CODE_STYLING_VERSION"
    curl -sL -o "$tmp/qcs.tgz" "https://registry.npmjs.org/qr-code-styling/-/qr-code-styling-${v}.tgz" \
        || { fail "download qr-code-styling ${v}"; return 1; }
    tar xzf "$tmp/qcs.tgz" -C "$tmp"
    [ -f "$tmp/package/lib/qr-code-styling.js" ] || { fail "qr-code-styling: bundle missing"; return 1; }

    rm -rf "$VENDOR_DIR/qr-code-styling"
    mkdir -p "$VENDOR_DIR/qr-code-styling"
    cp "$tmp/package/lib/qr-code-styling.js" "$VENDOR_DIR/qr-code-styling/"
    [ -f "$tmp/package/LICENSE" ]   && cp "$tmp/package/LICENSE"   "$VENDOR_DIR/qr-code-styling/"
    [ -f "$tmp/package/README.md" ] && cp "$tmp/package/README.md" "$VENDOR_DIR/qr-code-styling/"
    # Strip the .map sourceMappingURL comment — the .map file isn't shipped
    # and the browser request would 404 cosmetically.
    sed -i 's|//# sourceMappingURL=qr-code-styling\.js\.map||' "$VENDOR_DIR/qr-code-styling/qr-code-styling.js"
    echo "qr-code-styling@${v} (MIT, © Denys Kozak / kozakdenys) - UMD bundle, sourcemap-stripped" > "$VENDOR_DIR/qr-code-styling/VERSION.txt"
    ok "qr-code-styling ${v}"
}

lint_php() {
    step "lint php"
    local errors=0
    while IFS= read -r -d '' f; do
        if ! php -l "$f" >/dev/null 2>&1; then
            fail "${f#$SCRIPT_DIR/}"
            php -l "$f" || true
            errors=$((errors + 1))
        fi
    done < <(find "$SCRIPT_DIR" -type f -name "*.php" \
        ! -path "*/node_modules/*" ! -path "*/.git/*" -print0)
    [ $errors -gt 0 ] && { fail "$errors file(s) failed lint"; exit 1; }
    ok "all clean"
}

lint_js() {
    step "lint js"
    if ! command -v node >/dev/null 2>&1; then
        warn "node not found — skipping JS syntax check"
        return 0
    fi
    local errors=0
    local checked=0
    while IFS= read -r -d '' f; do
        if ! node --check "$f" 2>/dev/null; then
            fail "${f#$SCRIPT_DIR/}"
            node --check "$f" || true
            errors=$((errors + 1))
        fi
        checked=$((checked + 1))
    done < <(find "$SCRIPT_DIR" -type f -name "*.js" \
        ! -path "*/node_modules/*" ! -path "*/vendor/*" ! -path "*/.git/*" ! -path "*/releases/*" -print0)
    [ $errors -gt 0 ] && { fail "$errors file(s) failed JS lint"; exit 1; }
    ok "$checked file(s) clean"
}

# Find .lrob-qrm-* CSS classes never referenced in PHP/JS. Same heuristic
# as the email-toolkit build: literal match first, then once-peeled prefix
# for dynamic-concat patterns. Result is a heads-up, not a hard failure.
scan_dead_css() {
    step "dead-css scan"
    shopt -s nullglob
    local css_files=( "$SCRIPT_DIR"/admin/css/*.css "$SCRIPT_DIR"/assets/css/*.css )
    shopt -u nullglob
    [ ${#css_files[@]} -eq 0 ] && { warn "no CSS files"; return 0; }

    local css_classes
    css_classes=$(grep -hoE '\.lrob-qrm-[a-zA-Z0-9_-]+' "${css_files[@]}" 2>/dev/null \
        | sed 's/^\.//' | sort -u)
    [ -z "$css_classes" ] && { warn "no CSS classes found"; return 0; }

    local search_paths=("$SCRIPT_DIR/src" "$SCRIPT_DIR/admin" "$SCRIPT_DIR/assets" "$SCRIPT_DIR/$PLUGIN_SLUG.php")
    local dead=()
    while IFS= read -r cls; do
        if grep -qrn --include="*.php" --include="*.js" --include="*.json" --include="*.html" \
            -- "$cls" "${search_paths[@]}" 2>/dev/null; then
            continue
        fi
        local prefix="${cls%-*}"
        local hyphens="${prefix//[^-]/}"
        if [ "$prefix" != "$cls" ] && [ "${#hyphens}" -ge 3 ] && \
           grep -qrn --include="*.php" --include="*.js" --include="*.json" --include="*.html" \
               -- "${prefix}-" "${search_paths[@]}" 2>/dev/null; then
            continue
        fi
        dead+=("$cls")
    done <<< "$css_classes"

    local total; total=$(wc -l <<< "$css_classes")
    if [ ${#dead[@]} -eq 0 ]; then
        ok "$total CSS classes, all referenced"
    else
        warn "$total CSS classes, ${#dead[@]} candidate(s) for review:"
        printf '       .%s\n' "${dead[@]}"
    fi
}

generate_pot() {
    if ! command -v wp >/dev/null 2>&1; then
        warn "wp-cli missing — skipping pot generation"
        return 0
    fi
    step "make-pot"
    mkdir -p "$LANGUAGES_DIR"
    wp i18n make-pot "$SCRIPT_DIR" "$LANGUAGES_DIR/${PLUGIN_SLUG}.pot" \
        --domain="$PLUGIN_SLUG" --package-name="$PLUGIN_NAME" --exclude=vendor >/dev/null \
        || { fail "make-pot"; exit 1; }
    ok "${PLUGIN_SLUG}.pot"
}

merge_translations() {
    if ! command -v msgmerge >/dev/null 2>&1; then return 0; fi
    step "msgmerge"
    shopt -s nullglob
    local po_files=("$LANGUAGES_DIR"/*.po)
    shopt -u nullglob
    [ ${#po_files[@]} -eq 0 ] && { warn "no .po files"; return 0; }
    for po in "${po_files[@]}"; do
        msgmerge --quiet --update --backup=none "$po" "$LANGUAGES_DIR/${PLUGIN_SLUG}.pot" 2>/dev/null
        local obsolete; obsolete=$(grep -c '^#~ msgid' "$po" || true)
        obsolete=${obsolete:-0}
        if [ "$obsolete" -gt 0 ]; then
            msgattrib --no-obsolete -o "$po" "$po"
            ok "$(basename "$po") (pruned $obsolete obsolete)"
        else
            ok "$(basename "$po")"
        fi
    done
}

compile_translations() {
    if ! command -v msgfmt >/dev/null 2>&1; then return 0; fi
    step "msgfmt"
    shopt -s nullglob
    local po_files=("$LANGUAGES_DIR"/*.po)
    shopt -u nullglob
    [ ${#po_files[@]} -eq 0 ] && return 0
    for po in "${po_files[@]}"; do
        if msgfmt -o "${po%.po}.mo" "$po" 2>/dev/null; then
            local stats; stats=$(msgfmt --statistics "$po" -o /dev/null 2>&1 | tr -d '\n')
            ok "$(basename "${po%.po}.mo") — $stats"
        else
            fail "$(basename "$po")"
        fi
    done
}

generate_json_translations() {
    if ! command -v wp >/dev/null 2>&1; then return 0; fi
    step "make-json"
    shopt -s nullglob
    local po_files=("$LANGUAGES_DIR"/*.po)
    shopt -u nullglob
    [ ${#po_files[@]} -eq 0 ] && return 0
    rm -f "$LANGUAGES_DIR"/*.json
    wp i18n make-json "$LANGUAGES_DIR" --no-purge --pretty-print >/dev/null 2>&1 || { fail "make-json"; return 1; }
    local n; n=$(find "$LANGUAGES_DIR" -maxdepth 1 -name "*.json" | wc -l)
    ok "$n json file(s)"
}

print_stats() {
    step "stats"
    local tmp; tmp=$(mktemp)
    find "$SCRIPT_DIR" -type f \
        ! -path "*/.git/*" ! -path "*/node_modules/*" ! -path "*/releases/*" \
        ! -path "*/vendor/*" ! -path "*/languages/*.mo" \
        -print0 > "$tmp"

    declare -A files_by_ext bytes_by_ext lines_by_ext
    while IFS= read -r -d '' f; do
        local ext="${f##*.}"
        case "$f" in *".${ext}") ;; *) ext="(none)" ;; esac
        local sz; sz=$(stat -c%s "$f" 2>/dev/null || echo 0)
        local ln; ln=$(wc -l <"$f" 2>/dev/null || echo 0)
        files_by_ext[$ext]=$(( ${files_by_ext[$ext]:-0} + 1 ))
        bytes_by_ext[$ext]=$(( ${bytes_by_ext[$ext]:-0} + sz ))
        lines_by_ext[$ext]=$(( ${lines_by_ext[$ext]:-0} + ln ))
    done < "$tmp"
    rm -f "$tmp"

    printf '  %-8s %6s %10s %10s\n' "ext" "files" "lines" "bytes"
    printf '  %-8s %6s %10s %10s\n' "---" "-----" "-----" "-----"
    for ext in $(printf '%s\n' "${!files_by_ext[@]}" | sort); do
        printf '  %-8s %6d %10d %10d\n' \
            ".$ext" "${files_by_ext[$ext]}" "${lines_by_ext[$ext]}" "${bytes_by_ext[$ext]}"
    done

    local php_files
    php_files=$(find "$SCRIPT_DIR" -type f -name "*.php" \
        ! -path "*/.git/*" ! -path "*/node_modules/*" ! -path "*/vendor/*")
    if [ -n "$php_files" ]; then
        local counts; counts=$(awk '
            /^[[:space:]]*$/        { blank++;   next }
            /^[[:space:]]*(\/\/|\/\*|\*|#[^!])/ { comment++; next }
                                    { code++ }
            END { print (code+0), (comment+0), (blank+0) }
        ' $php_files)
        read -r php_code php_comment php_blank <<< "$counts"
        local php_total=$((php_code + php_comment + php_blank))
        [ $php_total -gt 0 ] && printf '  php: %d lines = %d code / %d comments / %d blank (%.1f%% comments)\n' \
            "$php_total" "$php_code" "$php_comment" "$php_blank" \
            "$(awk "BEGIN { printf \"%.1f\", $php_comment * 100.0 / $php_total }")"
    fi
}

create_archive() {
    step "archive"
    local version=$1
    local archive_name="${PLUGIN_SLUG}-${version}.zip"
    local archive_path="${RELEASES_DIR}/${archive_name}"

    mkdir -p "$RELEASES_DIR"
    [ -f "$archive_path" ] && rm "$archive_path"

    local temp_list; temp_list=$(mktemp)
    (cd "$PARENT_DIR" && find "$PLUGIN_DIR_NAME" -type f \
        ! -path "*/.git/*" ! -path "*/.github/*" ! -path "*/.claude/*" \
        ! -path "*/node_modules/*" ! -path "*/releases/*" \
        ! -name "*.sh" ! -name "*.po" ! -name "*.pot" \
        ! -name ".gitignore" ! -name ".editorconfig" ! -name ".DS_Store" \
        ! -name "CLAUDE.md" ! -name "README.md" \
        ! -name "composer.json" ! -name "composer.lock" \
        ! -name "phpcs.xml" ! -name "phpcs.xml.dist" \
        ! -name "phpstan.neon" ! -name "phpstan.neon.dist" \
        > "$temp_list")
    (cd "$PARENT_DIR" && zip -q -r "$archive_path" -@ < "$temp_list")
    rm "$temp_list"

    local size; size=$(du -h "$archive_path" | cut -f1)
    ok "${archive_name} ($size)"
}

main() {
    check_deps
    VERSION=$(get_version)
    step "version $VERSION"
    refresh_vendors
    lint_php
    lint_js
    scan_dead_css
    generate_pot
    merge_translations
    compile_translations
    generate_json_translations
    print_stats
    create_archive "$VERSION"
    ok "release $VERSION done"
}

main "$@"
