// QR codes: camera scanning (jsQR, loaded from vendor/jsQR.js) and parsing of
// vCard / MeCard / URL payloads into lead fields.
// Names are never split or reordered: only a display name (vCard FN, or a
// single-part N) fills full_name.

import { guessEmailType } from './leads.js';

// ---------- parsing ----------

// Returns { kind, fields, hints }. `fields` holds only what the QR contained.
export function parseQr(text) {
  const raw = (text || '').trim();
  if (/^BEGIN:VCARD/i.test(raw)) return parseVCard(raw);
  if (/^MECARD:/i.test(raw)) return parseMeCard(raw);
  if (/^(https?:\/\/|www\.)\S+$/i.test(raw)) {
    return { kind: 'url', fields: { website: raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '') }, hints: [] };
  }
  return {
    kind: 'text',
    fields: {},
    hints: ['This QR code is not a contact card (show badges are often encrypted). Its content is kept with the lead; please fill in the fields.'],
  };
}

function parseVCard(raw) {
  // Unfold continuation lines; vCard 2.1 quoted-printable uses a trailing "=".
  const lines = raw
    .replace(/=\r?\n/g, '=SOFTBREAK')
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/=SOFTBREAK/g, '=\n'));

  const fields = { emails: [], phones: [] };
  const hints = [];
  let nParts = null;

  for (const line of lines) {
    const colon = findUnquoted(line, ':');
    if (colon < 0) continue;
    const head = line.slice(0, colon).split(';');
    const name = head[0].replace(/^item\d+\./i, '').toUpperCase();
    const params = head.slice(1).join(';').toUpperCase();
    let value = line.slice(colon + 1);
    if (/QUOTED-PRINTABLE/.test(params)) value = decodeQuotedPrintable(value.replace(/=\n/g, ''));

    switch (name) {
      case 'FN': fields.full_name = unescapeV(value); break;
      case 'N': nParts = splitV(value, ';'); break;
      case 'ORG': fields.company = splitV(value, ';').filter(Boolean)[0] || ''; break;
      case 'TITLE': fields.position = unescapeV(value); break;
      case 'ROLE': if (!fields.position) fields.position = unescapeV(value); break;
      case 'EMAIL': addEmail(fields, unescapeV(value)); break;
      case 'TEL': addPhone(fields, unescapeV(value).replace(/^tel:/i, '')); break;
      case 'URL': if (!fields.website) fields.website = unescapeV(value).replace(/^https?:\/\//i, '').replace(/\/+$/, ''); break;
      case 'ADR': {
        // PO box; extended; street; locality; region; postal code; country
        const [, ext, street, city, region, zip, country] = splitV(value, ';');
        if (!fields.street) {
          Object.assign(fields, {
            street: [street, ext].filter(Boolean).join(', '),
            city: city || '', region: region || '', zip: zip || '', country: country || '',
          });
        }
        break;
      }
      case 'NOTE': fields.notes = unescapeV(value); break;
      default: break;
    }
  }

  if (!fields.full_name && nParts) nameFromParts(fields, hints, nParts);
  return { kind: 'vcard', fields: clean(fields), hints };
}

function parseMeCard(raw) {
  const body = raw.replace(/^MECARD:/i, '').replace(/;;\s*$/, '');
  const fields = { emails: [], phones: [] };
  const hints = [];
  for (const part of splitV(body, ';', false)) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const key = part.slice(0, colon).toUpperCase();
    const value = unescapeM(part.slice(colon + 1));
    switch (key) {
      case 'N': nameFromParts(fields, hints, splitV(part.slice(colon + 1), ',', false).map(unescapeM)); break;
      case 'ORG': fields.company = value; break;
      case 'TITLE': fields.position = value; break;
      case 'EMAIL': addEmail(fields, value); break;
      case 'TEL': addPhone(fields, value); break;
      case 'URL': fields.website = value.replace(/^https?:\/\//i, '').replace(/\/+$/, ''); break;
      case 'ADR': fields.street = value; hints.push('The address came as one line; split it into street, ZIP and city if needed.'); break;
      case 'NOTE': fields.notes = value; break;
      default: break;
    }
  }
  return { kind: 'mecard', fields: clean(fields), hints };
}

// Only a single-part name is used as-is; anything else would mean guessing the order.
function nameFromParts(fields, hints, parts) {
  const filled = parts.map((p) => (p || '').trim()).filter(Boolean);
  if (filled.length === 1) fields.full_name = filled[0];
  else if (filled.length > 1) {
    hints.push(`The QR code gives the name only in parts (${filled.join(' | ')}). Type the full name exactly as printed on the badge or card.`);
  }
}

function addEmail(fields, address) {
  const a = address.replace(/^mailto:/i, '').trim();
  if (a && !fields.emails.some((e) => e.address.toLowerCase() === a.toLowerCase())) {
    fields.emails.push({ address: a, type: guessEmailType(a) });
  }
}

function addPhone(fields, phone) {
  const p = phone.trim();
  if (p && !fields.phones.includes(p)) fields.phones.push(p);
}

function clean(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v) ? v.length : (v || '').trim()) out[k] = Array.isArray(v) ? v : v.trim();
  }
  return out;
}

function findUnquoted(s, ch) {
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted;
    else if (s[i] === ch && !quoted) return i;
  }
  return -1;
}

// Splits on `sep` unless escaped with a backslash; unescapes vCard values by default.
function splitV(s, sep, unescape = true) {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; }
    else if (s[i] === sep) { out.push(cur); cur = ''; }
    else cur += s[i];
  }
  out.push(cur);
  return unescape ? out.map(unescapeV) : out;
}

function unescapeV(s) {
  return s.replace(/\\([nN])/g, '\n').replace(/\\([,;:\\])/g, '$1').trim();
}

function unescapeM(s) {
  return s.replace(/\\([,;:\\])/g, '$1').trim();
}

function decodeQuotedPrintable(s) {
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(s.charCodeAt(i) & 0xff);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder('windows-1252').decode(new Uint8Array(bytes));
  }
}

// ---------- scanning ----------

function decode(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const code = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
  return code && code.data ? code.data : null;
}

// Starts the rear camera in `video` and calls onResult(text) once a QR code is read.
// Returns a stop() function.
export async function startScanner(video, onResult) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('This browser cannot use the camera here. The camera needs HTTPS (the GitHub Pages address).');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let last = 0;

  const stop = () => {
    stopped = true;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  const tick = (t) => {
    if (stopped) return;
    if (t - last > 120 && video.readyState >= 2 && video.videoWidth) {
      last = t;
      // Decode a downscaled frame: fast enough on older phones, sharp enough for QR.
      const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const text = decode(ctx, canvas.width, canvas.height);
      if (text) {
        stop();
        if (navigator.vibrate) navigator.vibrate(80);
        onResult(text);
        return;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return stop;
}

// Reads a QR code from a photo (fallback when live scanning is not possible).
export async function decodeImageFile(file) {
  const bitmap = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (const max of [1200, 800, 1800]) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const text = decode(ctx, canvas.width, canvas.height);
    if (text) return text;
  }
  return null;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open the photo.')); };
    img.src = url;
  });
}
