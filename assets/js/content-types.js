/* LRob QR Code Maker — content-type renderer + composers.
 *
 * Exposes a single global `window.lrobQrmContent` with:
 *   - render(container, typeKey, defs, values, onChange)
 *       Renders the input fields for the given type into `container`, wires
 *       change events to call `onChange(composedString, currentValues)`,
 *       returns an object with `read()` to read current values.
 *   - compose(typeKey, values)
 *       Returns the encoded QR payload string (URL, MECARD, WIFI:, mailto:,
 *       sms:, tel:, geo:) for the given type + field values.
 *
 * Used by both admin (admin/js/admin.js) and frontend (assets/js/maker.js).
 */
(function () {
    'use strict';

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'class') node.className = attrs[k];
            else if (k === 'text') node.textContent = attrs[k];
            else node.setAttribute(k, attrs[k]);
        });
        if (children) children.forEach(function (c) { if (c) node.appendChild(c); });
        return node;
    }

    function buildField(field, opts) {
        var fname = 'ct__' + field.name;
        var type = field.type || 'text';
        var fieldClass = opts.fieldClass;
        var inlineFieldClass = opts.inlineFieldClass;
        var label = el('label', { class: fieldClass });
        var span = el('span', { text: field.label });
        label.appendChild(span);

        var input;
        if (type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
        } else if (type === 'select') {
            input = document.createElement('select');
            (field.options || []).forEach(function (opt) {
                var o = document.createElement('option');
                o.value = opt[0];
                o.textContent = opt[1];
                input.appendChild(o);
            });
        } else if (type === 'checkbox') {
            // Inline checkbox layout — flip the label structure.
            label.className = inlineFieldClass;
            label.innerHTML = '';
            input = document.createElement('input');
            input.type = 'checkbox';
            input.value = '1';
            label.appendChild(input);
            var lbl = el('span', { text: field.label });
            label.appendChild(lbl);
        } else {
            input = document.createElement('input');
            input.type = type;
            if (field.placeholder) input.placeholder = field.placeholder;
        }
        input.name = fname;
        if (type !== 'checkbox') label.appendChild(input);
        return { label: label, input: input, name: field.name, type: type };
    }

    function render(container, typeKey, defs, values, onChange, opts) {
        // Class-prefix options let the caller scope the generated DOM to its
        // own CSS namespace. Defaults to the admin class names; the frontend
        // block passes `lrob-qrm-maker-field` variants.
        opts = opts || {};
        opts.fieldClass = opts.fieldClass || 'lrob-qrm-field';
        opts.inlineFieldClass = opts.inlineFieldClass || 'lrob-qrm-field lrob-qrm-field-inline';

        container.innerHTML = '';
        var def = defs && defs[typeKey];
        if (!def) return { read: function () { return {}; } };

        var built = (def.fields || []).map(function (f) { return buildField(f, opts); });
        built.forEach(function (b) {
            var v = values && values[b.name];
            if (v !== undefined && v !== null) {
                if (b.type === 'checkbox') b.input.checked = !!v;
                else b.input.value = String(v);
            }
            container.appendChild(b.label);
            var evt = (b.input.tagName === 'TEXTAREA' || b.type === 'text' || b.type === 'email' || b.type === 'tel') ? 'input' : 'change';
            b.input.addEventListener(evt, fire);
            if (b.input.tagName === 'TEXTAREA') b.input.addEventListener('change', fire);
        });

        function read() {
            var out = {};
            built.forEach(function (b) {
                out[b.name] = (b.type === 'checkbox') ? b.input.checked : b.input.value;
            });
            return out;
        }
        function fire() {
            var vals = read();
            var encoded = compose(typeKey, vals);
            onChange(encoded, vals);
        }

        // Initial fire so the parent picks up composed defaults / loaded values.
        var initial = read();
        onChange(compose(typeKey, initial), initial);

        return { read: read };
    }

    function escapeVcard(s) {
        return String(s || '').replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');
    }
    function escapeWifi(s) {
        // WIFI: format reserves \;,":
        return String(s || '').replace(/([\\;,":])/g, '\\$1');
    }
    function clean(s) { return String(s || '').trim(); }

    function compose(type, v) {
        v = v || {};
        switch (type) {
            case 'url':
                return clean(v.url);
            case 'text':
                return v.text || '';
            case 'vcard':
                var lines = ['BEGIN:VCARD', 'VERSION:3.0'];
                var fn = (clean(v.firstName) + ' ' + clean(v.lastName)).trim();
                if (fn) lines.push('FN:' + escapeVcard(fn));
                if (v.lastName || v.firstName) {
                    lines.push('N:' + escapeVcard(v.lastName || '') + ';' + escapeVcard(v.firstName || '') + ';;;');
                }
                if (v.org)     lines.push('ORG:' + escapeVcard(v.org));
                if (v.title)   lines.push('TITLE:' + escapeVcard(v.title));
                if (v.email)   lines.push('EMAIL:' + escapeVcard(v.email));
                if (v.phone)   lines.push('TEL:' + escapeVcard(v.phone));
                if (v.url)     lines.push('URL:' + escapeVcard(v.url));
                if (v.address) lines.push('ADR:;;' + escapeVcard(v.address) + ';;;;');
                lines.push('END:VCARD');
                return lines.join('\n');
            case 'wifi':
                var enc = v.encryption || 'WPA';
                var parts = ['WIFI:T:' + enc, 'S:' + escapeWifi(v.ssid)];
                if (enc !== 'nopass') parts.push('P:' + escapeWifi(v.password));
                if (v.hidden) parts.push('H:true');
                return parts.join(';') + ';;';
            case 'email':
                var to = clean(v.to);
                if (!to) return '';
                var url = 'mailto:' + to;
                var q = [];
                if (v.subject) q.push('subject=' + encodeURIComponent(v.subject));
                if (v.body)    q.push('body=' + encodeURIComponent(v.body));
                if (q.length) url += '?' + q.join('&');
                return url;
            case 'sms':
                var sphone = clean(v.phone).replace(/[^+0-9]/g, '');
                if (!sphone) return '';
                return 'sms:' + sphone + (v.message ? '?body=' + encodeURIComponent(v.message) : '');
            case 'tel':
                var tphone = clean(v.phone).replace(/[^+0-9]/g, '');
                return tphone ? 'tel:' + tphone : '';
            case 'geo':
                var lat = clean(v.lat), lng = clean(v.lng);
                return (lat && lng) ? 'geo:' + lat + ',' + lng : '';
            default:
                return '';
        }
    }

    /** Best-effort guess at the content type from a raw encoded string —
     *  used when migrating QRs created before the content-type field existed
     *  (every legacy QR's target_url goes through this on edit). */
    function guessType(raw) {
        if (!raw) return 'url';
        var s = String(raw);
        if (/^BEGIN:VCARD/i.test(s))   return 'vcard';
        if (/^WIFI:/i.test(s))          return 'wifi';
        if (/^mailto:/i.test(s))        return 'email';
        if (/^sms(to)?:/i.test(s))      return 'sms';
        if (/^tel:/i.test(s))           return 'tel';
        if (/^geo:/i.test(s))           return 'geo';
        if (/^https?:\/\//i.test(s) || /^[a-z][a-z0-9+.-]*:/i.test(s)) return 'url';
        return 'url';
    }

    window.lrobQrmContent = {
        render: render,
        compose: compose,
        guessType: guessType
    };
})();
