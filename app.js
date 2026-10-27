'use strict';

const APP_VERSION = '1.0.0';
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

let cards = load();
let editingId = null;
let wakeLock = null;

// ---------- Storage ----------

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isValidCard) : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cards));
    return true;
  } catch {
    alert('Could not save. Storage may be full or blocked.');
    return false;
  }
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
  if (editingId) {
    Object.assign(cards.find((c) => c.id === editingId), data);
  } else {
    cards.push({ id: newId(), ...data });
  }
  if (save()) {
    renderGrid();
    closeDialog('#edit');
  }
});

function move(delta) {
  const i = cards.findIndex((c) => c.id === editingId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= cards.length) return;
  [cards[i], cards[j]] = [cards[j], cards[i]];
  save();
  renderGrid();
}

$('#move-up').addEventListener('click', () => move(-1));
$('#move-down').addEventListener('click', () => move(1));

$('#delete-btn').addEventListener('click', () => {
  const card = cards.find((c) => c.id === editingId);
  if (!card || !confirm(`Delete ${card.name}? This cannot be undone unless you have a backup.`)) return;
  cards = cards.filter((c) => c.id !== editingId);
  save();
  renderGrid();
  closeDialog('#edit');
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

let scanReader = null;

$('#scan-camera').addEventListener('click', async () => {
  $('#scan-msg').textContent = '';
  scanReader = makeReader();
  $('#scanner').showModal();
  try {
    await scanReader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      $('#video'),
      (result) => {
        if (!result) return;
        applyScan(result);
        closeDialog('#scanner');
      });
  } catch (e) {
    closeDialog('#scanner');
    $('#scan-msg').textContent = 'Camera not available. Allow camera access, or scan a photo instead.';
  }
});

$('#scanner').addEventListener('close', () => {
  if (scanReader) { scanReader.reset(); scanReader = null; }
});

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

$('#menu-btn').addEventListener('click', () => {
  $('#menu-msg').textContent = '';
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
    for (const card of incoming) {
      const i = cards.findIndex((c) => c.id === card.id);
      if (i >= 0) cards[i] = card; else cards.push(card);
    }
    save();
    renderGrid();
    $('#menu-msg').textContent = `Imported ${incoming.length} card(s).`;
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

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
