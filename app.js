'use strict';

// Keep in step with CACHE in sw.js: the app checks that cache exists.
const APP_VERSION = '1.1.0';
const CACHE_NAME = 'cards-v' + APP_VERSION;
const STORE_KEY = 'cards.v1';

// bwip-js symbology id -> label, plus the ZXing format name that maps to it.
const FORMATS = [
  { id: 'code128', label: 'Code 128', zxing: 'CODE_128' },
  { id: 'ean13', label: 'EAN-13', zxing: 'EAN_13' },
  { id: 'ean8', label: 'EAN-8', zxing: 'EAN_8' },
  { id: 'upca', label: 'UPC-A', zxing: 'UPC_A' },
  { id: 'code39', label: 'Code 39', zxing: 'CODE_39' },
  { id: 'interleaved2of5', label: 'ITF (Interleaved 2 of 5)', zxing: 'ITF' },
  { id: 'rationalizedCodabar', label: 'Codabar', zxing: 'CODABAR' },
  { id: 'qrcode', label: 'QR code', zxing: 'QR_CODE', square: true },
  { id: 'pdf417', label: 'PDF417', zxing: 'PDF_417' },
  { id: 'datamatrix', label: 'Data Matrix', zxing: 'DATA_MATRIX', square: true },
  { id: 'azteccode', label: 'Aztec', zxing: 'AZTEC', square: true },
];

const $ = (sel) => document.querySelector(sel);

// If stored data can't be read, keep a copy and block saving so a later
// write never overwrites cards that might still be recoverable.
let storageBroken = false;
let cards = load();
let editingId = null;
let wakeLock = null;

// ---------- Storage ----------

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) throw new Error('not a list');
    return parsed.filter(isValidCard);
  } catch {
    storageBroken = true;
    try { if (raw) localStorage.setItem(STORE_KEY + '.unreadable.' + Date.now(), raw); } catch { /* best effort */ }
    return [];
  }
}

// Saves `next` and only then makes it the live list. Returns false on failure.
function commit(next) {
  if (storageBroken) {
    alert('Saved cards could not be read, so saving is switched off to protect them. Import a backup to recover.');
    return false;
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    alert('Could not save. Storage may be full or blocked. Nothing was changed.');
    return false;
  }
  cards = next;
  renderGrid();
  return true;
}

function isValidCard(c) {
  return c && typeof c.id === 'string' && typeof c.name === 'string' &&
    typeof c.number === 'string' && FORMATS.some((f) => f.id === c.format);
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Barcode rendering ----------

function renderSvg(format, number) {
  const f = FORMATS.find((x) => x.id === format);
  const opts = { bcid: format, text: number, scale: 3, paddingwidth: 8, paddingheight: 8 };
  if (!f.square && format !== 'pdf417') opts.height = 22;
  return bwipjs.toSVG(opts);
}

function contrastText(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#000000' : '#ffffff';
}

// ---------- Grid ----------

function renderGrid() {
  const grid = $('#grid');
  grid.replaceChildren();
  $('#empty').hidden = cards.length > 0;
  for (const card of cards) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'tile';
    btn.style.background = card.colour || '#0f766e';
    btn.style.color = contrastText(card.colour || '#0f766e');
    btn.textContent = card.name;
    if (card.note) {
      const small = document.createElement('small');
      small.textContent = card.note;
      btn.append(small);
    }
    btn.addEventListener('click', () => showCard(card.id));
    li.append(btn);
    grid.append(li);
  }
}

// ---------- Show card ----------

async function showCard(id) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  $('#show-name').textContent = card.name;
  $('#show-number').textContent = card.number;
  $('#show-note').textContent = card.note || '';
  const box = $('#show-code');
  box.classList.toggle('square', !!FORMATS.find((f) => f.id === card.format).square);
  try {
    box.innerHTML = renderSvg(card.format, card.number);
  } catch (e) {
    box.textContent = 'Could not draw this barcode: ' + cleanError(e);
  }
  $('#show-edit').onclick = () => { closeDialog('#show'); openEdit(card.id); };
  $('#show').showModal();
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* not critical */ }
}

$('#show').addEventListener('close', () => {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
});

// ---------- Add / edit ----------

function fillFormatSelect() {
  const sel = $('#f-format');
  for (const f of FORMATS) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.label;
    sel.append(opt);
  }
}

function openEdit(id) {
  editingId = id || null;
  const card = cards.find((c) => c.id === id);
  $('#edit-title').textContent = card ? 'Edit card' : 'Add card';
  $('#f-name').value = card ? card.name : '';
  $('#f-number').value = card ? card.number : '';
  $('#f-format').value = card ? card.format : 'code128';
  $('#f-colour').value = card ? card.colour : '#0f766e';
  $('#f-note').value = card ? card.note || '' : '';
  $('#edit-extra').hidden = !card;
  $('#scan-msg').textContent = '';
  updatePreview();
  $('#edit').showModal();
}

function updatePreview() {
  const number = $('#f-number').value.trim();
  const format = $('#f-format').value;
  const preview = $('#preview');
  const msg = $('#preview-msg');
  msg.textContent = '';
  if (!number) { preview.replaceChildren(); return true; }
  try {
    preview.innerHTML = renderSvg(format, number);
    return true;
  } catch (e) {
    preview.replaceChildren();
    msg.textContent = 'This number does not fit that barcode type: ' + cleanError(e);
    return false;
  }
}

function cleanError(e) {
  return String(e && e.message || e).replace(/^bwipp\.\w+#\d+:\s*/, '');
}

$('#f-number').addEventListener('input', updatePreview);
$('#f-format').addEventListener('change', updatePreview);

$('#edit-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!updatePreview()) return;
  const data = {
    name: $('#f-name').value.trim(),
    number: $('#f-number').value.trim(),
    format: $('#f-format').value,
    colour: $('#f-colour').value,
    note: $('#f-note').value.trim(),
  };
  if (!data.name || !data.number) return;
  const next = editingId
    ? cards.map((c) => (c.id === editingId ? { ...c, ...data } : c))
    : [...cards, { id: newId(), ...data }];
  if (commit(next)) closeDialog('#edit');
});

function move(delta) {
  const i = cards.findIndex((c) => c.id === editingId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= cards.length) return;
  const next = [...cards];
  [next[i], next[j]] = [next[j], next[i]];
  commit(next);
}

$('#move-up').addEventListener('click', () => move(-1));
$('#move-down').addEventListener('click', () => move(1));

$('#delete-btn').addEventListener('click', () => {
  const card = cards.find((c) => c.id === editingId);
  if (!card || !confirm(`Delete ${card.name}? This cannot be undone unless you have a backup.`)) return;
  if (commit(cards.filter((c) => c.id !== editingId))) closeDialog('#edit');
});

// ---------- Scanning ----------

function makeReader() {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,
    FORMATS.map((f) => ZXing.BarcodeFormat[f.zxing]));
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  return new ZXing.BrowserMultiFormatReader(hints);
}

function applyScan(result) {
  const name = ZXing.BarcodeFormat[result.getBarcodeFormat()];
  const f = FORMATS.find((x) => x.zxing === name);
  $('#f-number').value = result.getText();
  if (f) $('#f-format').value = f.id;
  $('#scan-msg').textContent = `Found ${f ? f.label : name}. Check the number matches the card.`;
  updatePreview();
}

// One scan session at a time. We own the camera stream rather than leaving
// it to ZXing, so Cancel always turns the camera off, even if it is pressed
// while the permission prompt is still open.
let scan = null;

function stopScan() {
  if (!scan) return;
  scan.reader.reset();
  if (scan.stream) scan.stream.getTracks().forEach((t) => t.stop());
  scan = null;
}

$('#scan-camera').addEventListener('click', async () => {
  stopScan();
  $('#scan-msg').textContent = '';
  const session = { reader: makeReader(), stream: null };
  scan = session;
  $('#scanner').showModal();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    if (scan !== session) { stream.getTracks().forEach((t) => t.stop()); return; }
    session.stream = stream;
    await session.reader.decodeFromStream(stream, $('#video'), (result) => {
      if (!result || scan !== session) return;
      applyScan(result);
      closeDialog('#scanner');
    });
    if (scan !== session) stream.getTracks().forEach((t) => t.stop());
  } catch {
    if (scan !== session) return;
    closeDialog('#scanner');
    $('#scan-msg').textContent = 'Camera not available. Allow camera access, or scan a photo instead.';
  }
});

$('#scanner').addEventListener('close', stopScan);

$('#scan-photo').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  $('#scan-msg').textContent = 'Reading photo…';
  const url = URL.createObjectURL(file);
  try {
    applyScan(await makeReader().decodeFromImageUrl(url));
  } catch {
    $('#scan-msg').textContent = 'No barcode found. Try a sharper, closer photo, or type the number.';
  } finally {
    URL.revokeObjectURL(url);
  }
});

// ---------- Backup ----------

const LAST_EXPORT_KEY = 'cards.lastExport';
const health = { offline: 'Checking…', storage: 'Checking…' };

function lastExport() {
  try { return localStorage.getItem(LAST_EXPORT_KEY); } catch { return null; }
}

function renderHealth() {
  const last = lastExport();
  $('#health').replaceChildren(...[
    ['Offline', health.offline],
    ['Storage', health.storage],
    ['Last backup', last ? new Date(last).toLocaleDateString('en-NZ') : 'Never'],
  ].map(([k, v]) => {
    const li = document.createElement('li');
    const b = document.createElement('strong');
    b.textContent = k + ': ';
    li.append(b, v);
    return li;
  }));
}

$('#menu-btn').addEventListener('click', () => {
  $('#menu-msg').textContent = '';
  renderHealth();
  $('#menu').showModal();
});

$('#export-btn').addEventListener('click', async () => {
  const json = JSON.stringify({ app: 'cards', version: 1, exported: new Date().toISOString(), cards }, null, 2);
  const name = `cards-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Cards backup' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    try { localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); } catch { /* not critical */ }
    renderHealth();
    $('#menu-msg').textContent = `Exported ${cards.length} card(s).`;
  } catch (e) {
    if (e.name !== 'AbortError') $('#menu-msg').textContent = 'Export failed.';
  }
});

$('#import-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = (Array.isArray(parsed) ? parsed : parsed.cards || []).filter(isValidCard);
    if (!incoming.length) throw new Error('none');
    // Merge: cards with the same id are replaced, new ones are added.
    const next = [...cards];
    for (const card of incoming) {
      const i = next.findIndex((c) => c.id === card.id);
      if (i >= 0) next[i] = card; else next.push(card);
    }
    // Importing a backup is the recovery path, so it re-enables saving.
    storageBroken = false;
    $('#menu-msg').textContent = commit(next)
      ? `Imported ${incoming.length} card(s).`
      : 'Import failed: could not save. Nothing was changed.';
  } catch {
    $('#menu-msg').textContent = 'That file is not a valid Cards backup.';
  }
});

// ---------- Dialog plumbing ----------

function closeDialog(sel) {
  const d = $(sel);
  if (d.open) d.close();
}

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('dialog').close());
});

// ---------- Start ----------

fillFormatSelect();
renderGrid();
$('#add-btn').addEventListener('click', () => openEdit(null));
$('#version').textContent = `Version ${APP_VERSION}`;

if (storageBroken) {
  alert('Your saved cards could not be read. Saving is switched off to protect them. Open ⋯ and import a backup.');
}

(async () => {
  try {
    const granted = navigator.storage && navigator.storage.persist && await navigator.storage.persist();
    health.storage = granted
      ? 'Kept permanently'
      : 'Best effort: iOS may clear it if space runs low. Keep a backup.';
  } catch {
    health.storage = 'Unknown. Keep a backup.';
  }
})();

if (!('serviceWorker' in navigator) || location.protocol !== 'https:') {
  health.offline = 'Not available here (needs the installed app over HTTPS).';
} else {
  // A new version took over: reload once so page and cache match.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => caches.has(CACHE_NAME))
    .then((ok) => { health.offline = ok ? `Ready (version ${APP_VERSION})` : 'Not ready: files not cached yet. Open once with signal.'; })
    .catch(() => { health.offline = 'Not ready: offline setup failed. Open once with signal.'; });
}
