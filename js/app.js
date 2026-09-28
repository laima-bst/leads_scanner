import * as db from './db.js';
import { leadsToCsv } from './csv.js';
import {
  COMPANY_TYPES, CAPTURE_METHODS, COUNTRIES, blankLead, guessEmailType,
  isFreemailDomain, isValidEmail, domainFromWebsite, domainFromEmail,
} from './leads.js';
import { parseQr, startScanner, decodeImageFile } from './qr.js';
import {
  loadSettings, saveSettings, newEventId, loadDraft, saveDraft, clearDraft,
} from './settings.js';

const APP_VERSION = '0.2.0';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let settings = loadSettings();
let leads = [];
let editing = null;      // lead being edited in the form (a copy)
let isNewLead = false;
let formDirty = false;
let formHints = [];      // notes from the QR parser, shown above the form
let prefill = null;      // { lead, hints } from a scan, consumed by the next #new
let stopScan = null;
let listEventId = settings.activeEventId;  // '' = all events

// ---------- events ----------

const eventById = (id) => settings.events.find((e) => e.id === id);
const activeEvent = () => eventById(settings.activeEventId);
const eventName = (lead) => (eventById(lead.event_id) || {}).name || lead.event || '';
const leadsOf = (eventId) => (eventId ? leads.filter((l) => l.event_id === eventId) : leads);

function eventLabel(ev) {
  return ev.date ? `${ev.name} (${formatDate(ev.date)})` : ev.name;
}

function fillEventSelect(select, value, { allOption = false } = {}) {
  const opts = settings.events.map((e) => `<option value="${esc(e.id)}">${esc(eventLabel(e))}</option>`);
  if (allOption) opts.push('<option value="">All events</option>');
  if (!settings.events.length && !allOption) opts.push('<option value="">(no event yet)</option>');
  select.innerHTML = opts.join('');
  select.value = value || '';
  if (select.selectedIndex < 0) select.selectedIndex = 0;
}

// ---------- boot ----------

async function boot() {
  $('#app-version').textContent = `Lead Scanner ${APP_VERSION}`;
  $('#country-list').innerHTML = COUNTRIES.map((c) => `<option value="${esc(c)}">`).join('');
  $('#type-options').innerHTML = COMPANY_TYPES.map((t) =>
    `<label><input type="radio" name="type" value="${t}"><span>${t}</span></label>`).join('');

  bindList();
  bindScan();
  bindForm();
  bindExport();
  bindSettings();
  bindNav();
  bindOnline();

  await reloadLeads();
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

async function reloadLeads() {
  leads = await db.allLeads();
  // Leads saved before events existed carry only the event name.
  for (const l of leads) {
    if (!l.event_id && l.event) {
      const ev = settings.events.find((e) => e.name === l.event);
      if (ev) l.event_id = ev.id;
    }
  }
  leads.sort((a, b) => (b.captured_at || '').localeCompare(a.captured_at || ''));
  renderCounts();
}

// ---------- routing ----------

const TITLES = {
  leads: 'Leads', scan: 'Scan QR', new: 'New lead', edit: 'Edit lead', export: 'Export', settings: 'Settings',
};

function route() {
  const [name, id] = location.hash.replace(/^#/, '').split('/');
  const view = TITLES[name] ? name : 'leads';

  if (view !== 'scan' && stopScan) { stopScan(); stopScan = null; }

  if (view === 'new') openForm(null);
  else if (view === 'edit') {
    const lead = leads.find((l) => l.id === decodeURIComponent(id || ''));
    if (!lead) return go('leads');
    openForm(lead);
  } else formDirty = false;

  if (view === 'scan' && !openScanner()) return;
  if (view === 'leads') renderList();
  if (view === 'export') renderExport();
  if (view === 'settings') renderSettings();

  const section = view === 'new' || view === 'edit' ? 'form' : view;
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${section}`; });
  $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === (section === 'form' ? 'leads' : view)));
  $('#view-title').textContent = TITLES[view];
  renderEventLabel();
  window.scrollTo(0, 0);
}

function go(name) {
  if (location.hash === `#${name}`) route();
  else location.hash = name;
}

function renderEventLabel() {
  const ev = activeEvent();
  $('#event-label').textContent = ev ? ev.name : 'No event';
}

function bindNav() {
  window.addEventListener('hashchange', route);
  // Leaving the form with unsaved changes asks first.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || !formDirty || $('#view-form').hidden) return;
    if (!confirm('Discard the unsaved changes to this lead?')) e.preventDefault();
    else discardForm();
  });
}

function bindOnline() {
  const update = () => { $('#offline-badge').hidden = navigator.onLine; };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

// ---------- list ----------

function renderCounts() {
  const n = leads.filter((l) => !l.exported_at).length;
  $('#unexported-count').textContent = n;
  $('#unexported-word').textContent = n === 1 ? 'lead' : 'leads';
  $('#export-banner').classList.toggle('ok', n === 0);
  const badge = $('#tab-badge');
  badge.hidden = n === 0;
  badge.textContent = n;
}

function renderList() {
  $('#setup-banner').hidden = !!activeEvent();
  const draft = loadDraft();
  $('#draft-banner').hidden = !(draft && draft.isNew);

  if (listEventId && !eventById(listEventId)) listEventId = settings.activeEventId;
  fillEventSelect($('#list-event'), listEventId, { allOption: true });
  $('#list-event').hidden = settings.events.length < 2 && !leads.some((l) => l.event_id !== settings.activeEventId);

  const q = $('#search').value.trim().toLowerCase();
  const shown = leadsOf(listEventId).filter((l) => !q ||
    [l.company, l.full_name, l.position, l.city, l.country, l.notes, l.captured_by,
      ...(l.emails || []).map((e) => e.address)]
      .some((v) => (v || '').toLowerCase().includes(q)));

  $('#empty-list').hidden = shown.length > 0;
  $('#empty-list').textContent = leads.length ? 'No matching leads.' : 'No leads yet.';
  $('#lead-list').innerHTML = shown.map((l) => `
    <li>
      <a href="#edit/${encodeURIComponent(l.id)}" class="lead-item">
        <div class="lead-main">
          <strong>${esc(l.company || '(no company)')}</strong>
          <span class="type-tag">${esc(l.type)}</span>
        </div>
        <div class="lead-sub">${esc([l.full_name, l.position].filter(Boolean).join(' · ') || ' ')}</div>
        <div class="lead-foot">
          <span>${esc([formatTime(l.captured_at), l.captured_by, CAPTURE_METHODS[l.capture_method],
            listEventId ? '' : eventName(l)].filter(Boolean).join(' · '))}</span>
          ${l.exported_at ? '<span class="exported">exported</span>' : '<span class="not-exported">not exported</span>'}
        </div>
      </a>
    </li>`).join('');
}

function bindList() {
  $('#search').addEventListener('input', renderList);
  $('#list-event').addEventListener('change', (e) => { listEventId = e.target.value; renderList(); });
}

// ---------- QR scanning ----------

// Returns false when the scan view should not open.
function openScanner() {
  if (!activeEvent()) {
    alert('Create an event in Settings first. Every lead is attributed to it.');
    go('settings');
    return false;
  }
  const draft = loadDraft();
  if (draft && draft.isNew) {
    if (!confirm('You have an unsaved lead. Discard it and scan a new one?')) {
      go('new');
      return false;
    }
    clearDraft();
  }
  const status = $('#scan-status');
  status.textContent = 'Starting the camera…';
  status.classList.remove('error');
  startScanner($('#scan-video'), onQrText)
    .then((stop) => {
      if (location.hash !== '#scan') { stop(); return; }
      stopScan = stop;
      status.textContent = 'Point the camera at the QR code.';
    })
    .catch((err) => {
      status.classList.add('error');
      status.textContent = err && err.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow the camera for this site in the browser settings, or take a photo of the QR code instead.'
        : `The camera could not start (${err.message || err}). You can take a photo of the QR code instead.`;
    });
  return true;
}

function onQrText(text) {
  const { fields, hints } = parseQr(text);
  const lead = { ...newLeadForEvent(), ...fields, capture_method: 'qr', raw_qr: text };
  prefill = { lead, hints };
  go('new');
}

function bindScan() {
  $('#scan-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = $('#scan-status');
    status.classList.remove('error');
    status.textContent = 'Reading the photo…';
    try {
      const text = await decodeImageFile(file);
      if (text) onQrText(text);
      else {
        status.classList.add('error');
        status.textContent = 'No QR code found in the photo. Try again closer, with the code flat and sharp.';
      }
    } catch (err) {
      status.classList.add('error');
      status.textContent = err.message || String(err);
    }
  });
}

// ---------- form ----------

function newLeadForEvent() {
  const lead = blankLead();
  lead.captured_by = settings.capturedBy;
  lead.event_id = settings.activeEventId;
  return lead;
}

function openForm(lead) {
  const draft = loadDraft();
  isNewLead = !lead;
  let notice = '';
  formHints = [];

  if (lead) {
    editing = structuredClone(lead);
    if (draft && !draft.isNew && draft.data.id === lead.id) {
      editing = draft.data;
      notice = 'Restored your unsaved changes.';
    }
  } else if (prefill) {
    editing = prefill.lead;
    formHints = prefill.hints;
    prefill = null;
    notice = 'QR code read. Check the fields, correct them if needed, then save.';
  } else if (draft && draft.isNew) {
    editing = draft.data;
    formHints = draft.hints || [];
    notice = 'Restored the lead you had not saved yet.';
  } else {
    editing = newLeadForEvent();
  }

  fillForm(editing);
  // A scanned or restored lead is unsaved work from the start.
  formDirty = !!notice;
  if (formDirty) saveDraft({ isNew: isNewLead, data: readForm(), hints: formHints });

  $('#form-notice').hidden = !notice;
  $('#form-notice').textContent = notice;
  $('#form-hints').innerHTML = formHints.map((h) => `<li>${esc(h)}</li>`).join('');
  $('#form-delete').hidden = isNewLead;
  $('#raw-qr-box').hidden = !editing.raw_qr;
  $('#raw-qr').textContent = editing.raw_qr || '';

  const meta = [];
  if (!isNewLead) {
    meta.push(`Captured ${formatTime(editing.captured_at)} · ${CAPTURE_METHODS[editing.capture_method] || ''}`);
    if (editing.exported_at) meta.push(`Exported ${formatTime(editing.exported_at)}. Edits reach the CRM only if you export this lead again.`);
  }
  $('#form-meta').textContent = meta.join(' — ');
  updateWarnings();
}

const TEXT_FIELDS = ['company', 'full_name', 'position', 'website', 'country', 'city', 'street', 'zip', 'region', 'domain', 'notes'];

function fillForm(lead) {
  const f = $('#lead-form');
  for (const k of TEXT_FIELDS) f.elements[k].value = lead[k] || '';
  $$('input[name="type"]', f).forEach((r) => { r.checked = r.value === lead.type; });

  fillEventSelect($('#form-event'), lead.event_id || settings.activeEventId);
  fillPeopleSelect($('#captured-by'), lead.captured_by);

  $('#email-rows').innerHTML = '';
  (lead.emails.length ? lead.emails : [{ address: '', type: 'personal' }]).forEach(addEmailRow);
  $('#phone-rows').innerHTML = '';
  (lead.phones.length ? lead.phones : ['']).forEach(addPhoneRow);
}

function addEmailRow(email) {
  const row = $('#email-row').content.firstElementChild.cloneNode(true);
  const input = $('[data-k="address"]', row);
  const select = $('[data-k="type"]', row);
  input.value = email.address || '';
  select.value = email.type || guessEmailType(email.address);
  // Suggest the type from the address until the user picks one themselves.
  select.dataset.auto = email.address ? 'no' : 'yes';
  input.addEventListener('input', () => {
    if (select.dataset.auto === 'yes') select.value = guessEmailType(input.value);
  });
  select.addEventListener('change', () => { select.dataset.auto = 'no'; });
  $('#email-rows').append(row);
  return input;
}

function addPhoneRow(phone) {
  const row = $('#phone-row').content.firstElementChild.cloneNode(true);
  $('input', row).value = phone || '';
  $('#phone-rows').append(row);
  return $('input', row);
}

function readForm() {
  const f = $('#lead-form');
  const lead = { ...editing };
  for (const k of TEXT_FIELDS) lead[k] = f.elements[k].value.trim();
  lead.type = ($('input[name="type"]:checked', f) || {}).value || editing.type;
  lead.event_id = f.elements.event_id.value;
  lead.captured_by = f.elements.captured_by.value;
  lead.emails = $$('#email-rows .row').map((row) => ({
    address: $('[data-k="address"]', row).value.trim(),
    type: $('[data-k="type"]', row).value,
  })).filter((e) => e.address);
  lead.phones = $$('#phone-rows input').map((i) => i.value.trim()).filter(Boolean);
  return lead;
}

function warningsFor(lead) {
  const w = [];
  if (!lead.company) w.push({ block: true, text: 'Company is required: the CRM import skips rows without it.' });
  if (!eventById(lead.event_id)) w.push({ block: true, text: 'Choose an event (create one in Settings). Every lead is attributed to an event.' });
  for (const e of lead.emails) {
    if (!isValidEmail(e.address)) w.push({ text: `"${e.address}" does not look like an email address.` });
  }
  for (const [field, value] of [['Website', lead.website], ['Domain', lead.domain]]) {
    const d = domainFromWebsite(value);
    if (isFreemailDomain(d)) {
      w.push({ block: true, text: `${field} "${d}" is a free-mail/ISP domain. Leave it empty: the CRM matches companies by domain. Keep the address in Emails only.` });
    }
  }
  if (!lead.website && !lead.domain) {
    const d = lead.emails.map((e) => domainFromEmail(e.address)).find((x) => x && !isFreemailDomain(x));
    if (d) w.push({ text: `No website. The company's email domain is ${d}; add www.${d} if that is their site, so the CRM can match the company.` });
  }
  return w;
}

function updateWarnings() {
  const w = warningsFor(readForm());
  $('#form-warnings').innerHTML = w.map((x) => `<li class="${x.block ? 'block' : ''}">${esc(x.text)}</li>`).join('');
  return w;
}

function discardForm() {
  formDirty = false;
  clearDraft();
}

function bindForm() {
  const f = $('#lead-form');

  f.addEventListener('input', () => {
    formDirty = true;
    saveDraft({ isNew: isNewLead, data: readForm(), hints: formHints });
    updateWarnings();
  });
  f.addEventListener('change', () => updateWarnings());

  f.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (!rm) return;
    const rows = rm.closest('.rows');
    rm.closest('.row').remove();
    if (!rows.children.length) (rows.id === 'email-rows' ? addEmailRow({}) : addPhoneRow(''));
    f.dispatchEvent(new Event('input'));
  });
  $('#add-email').addEventListener('click', () => addEmailRow({}).focus());
  $('#add-phone').addEventListener('click', () => addPhoneRow('').focus());

  $('#form-cancel').addEventListener('click', () => {
    if (formDirty && !confirm('Discard the unsaved changes to this lead?')) return;
    discardForm();
    go('leads');
  });

  $('#form-delete').addEventListener('click', async () => {
    if (!confirm(`Delete the lead for ${editing.company || 'this company'}? This cannot be undone.`)) return;
    await db.deleteLeads([editing.id]);
    discardForm();
    await reloadLeads();
    go('leads');
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const lead = readForm();
    const blocking = updateWarnings().filter((x) => x.block);
    if (blocking.length) {
      $('#form-warnings').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    lead.event = eventById(lead.event_id).name;
    if (!isNewLead) lead.updated_at = new Date().toISOString();
    try {
      await db.putLead(lead);
    } catch (err) {
      alert(`Could not save the lead on this phone: ${err.message || err}`);
      return;
    }
    discardForm();
    db.requestPersistence();
    await reloadLeads();
    go('leads');
  });
}

// ---------- export ----------

function exportSelection() {
  const eventId = $('#export-event').value;
  const scope = $('input[name="scope"]:checked').value;
  const format = $('input[name="format"]:checked').value;
  const pool = leadsOf(eventId);
  const chosen = scope === 'all' ? pool : pool.filter((l) => !l.exported_at);
  return { eventId, format, chosen };
}

function renderExportCounts() {
  const pool = leadsOf($('#export-event').value);
  $('#count-new').textContent = pool.filter((l) => !l.exported_at).length;
  $('#count-all').textContent = pool.length;
}

function renderExport() {
  fillEventSelect($('#export-event'), settings.activeEventId, { allOption: true });
  renderExportCounts();
  $('#export-result').hidden = true;
  $('#btn-share').hidden = !canShareFiles();
}

function canShareFiles() {
  try {
    const probe = new File(['x'], 'x.csv', { type: 'text/csv' });
    return !!(navigator.canShare && navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
}

function exportFile() {
  const { eventId, format, chosen } = exportSelection();
  if (!chosen.length) {
    showExportResult('There are no leads to export with this choice.');
    return null;
  }
  const csv = leadsToCsv(chosen, format);
  const base = eventId ? eventById(eventId).name : 'all-events';
  const slug = base.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'leads';
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const name = `${slug}_${format === 'full' ? 'full' : 'crm-import'}_${stamp}.csv`;
  return { file: new File([csv], name, { type: 'text/csv;charset=utf-8' }), chosen };
}

async function markExported(chosen) {
  if (!$('#mark-exported').checked) return;
  const now = new Date().toISOString();
  await db.putLeads(chosen.map((l) => ({ ...l, exported_at: now })));
  await reloadLeads();
  renderExportCounts();
}

function showExportResult(text) {
  const p = $('#export-result');
  p.textContent = text;
  p.hidden = false;
}

function bindExport() {
  $('#btn-download').addEventListener('click', async () => {
    const out = exportFile();
    if (!out) return;
    const url = URL.createObjectURL(out.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = out.file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    await markExported(out.chosen);
    showExportResult(`Downloaded ${out.file.name} (${plural(out.chosen.length, 'lead')}).`);
  });

  $('#btn-share').addEventListener('click', async () => {
    const out = exportFile();
    if (!out) return;
    try {
      await navigator.share({ files: [out.file], title: out.file.name });
    } catch (err) {
      if (err.name !== 'AbortError') showExportResult(`Sharing failed: ${err.message}`);
      return; // cancelled or failed: don't mark as exported
    }
    await markExported(out.chosen);
    showExportResult(`Shared ${out.file.name} (${plural(out.chosen.length, 'lead')}).`);
  });

  $('#export-event').addEventListener('change', () => { renderExportCounts(); $('#export-result').hidden = true; });
  $$('#view-export input[type="radio"]').forEach((r) =>
    r.addEventListener('change', () => { $('#export-result').hidden = true; }));
}

// ---------- settings ----------

function fillPeopleSelect(select, value, people = settings.people) {
  const list = [...people];
  if (value && !list.includes(value)) list.push(value);
  select.innerHTML = ['<option value="">(not set)</option>',
    ...list.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`)].join('');
  select.value = value || '';
}

function persistSettings() {
  if (!saveSettings(settings)) alert('Could not save settings in this browser.');
  renderEventLabel();
}

function renderEvents() {
  $('#event-list').innerHTML = settings.events.map((ev) => {
    const n = leadsOf(ev.id).length;
    const active = ev.id === settings.activeEventId;
    return `
      <li class="event-item${active ? ' active' : ''}" data-id="${esc(ev.id)}">
        <div>
          <strong>${esc(ev.name)}</strong>
          <div class="muted small">${esc([ev.date && formatDate(ev.date), plural(n, 'lead')].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="event-actions">
          ${active ? '<span class="active-tag">Active</span>' : '<button type="button" class="btn small" data-act="activate">Make active</button>'}
          <button type="button" class="btn small ghost" data-act="rename">Rename</button>
          ${n ? '' : '<button type="button" class="btn small ghost danger" data-act="delete">Delete</button>'}
        </div>
      </li>`;
  }).join('') || '<li class="muted">No events yet. Create the first one below.</li>';
}

async function renderSettings() {
  renderEvents();
  $('#event-error').hidden = true;
  const f = $('#settings-form');
  f.elements.people.value = settings.people.join('\n');
  fillPeopleSelect($('#settings-captured-by'), settings.capturedBy);
  $('#settings-saved').hidden = true;

  const exported = leads.filter((l) => l.exported_at).length;
  const persisted = await db.isPersisted();
  $('#storage-info').textContent =
    `${plural(leads.length, 'lead')} on this phone (${exported} exported, ${leads.length - exported} not exported). ` +
    (persisted ? 'Storage is marked persistent.' : 'Storage is not marked persistent; the browser may clear it if the phone runs low on space.');
}

function nameTaken(name, exceptId) {
  const n = name.toLowerCase();
  return settings.events.some((e) => e.id !== exceptId && e.name.toLowerCase() === n);
}

function bindSettings() {
  $('#event-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.elements.name.value.trim();
    const err = $('#event-error');
    err.hidden = true;
    if (!name) { err.textContent = 'Give the event a name.'; err.hidden = false; return; }
    if (nameTaken(name)) { err.textContent = `There is already an event called "${name}".`; err.hidden = false; return; }
    const ev = { id: newEventId(), name, date: f.elements.date.value };
    settings.events.push(ev);
    settings.activeEventId = ev.id;
    listEventId = ev.id;
    persistSettings();
    f.reset();
    renderEvents();
  });

  $('#event-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const ev = eventById(btn.closest('[data-id]').dataset.id);
    if (!ev) return;

    if (btn.dataset.act === 'activate') {
      settings.activeEventId = ev.id;
      listEventId = ev.id;
      persistSettings();
    } else if (btn.dataset.act === 'rename') {
      const name = (prompt('New name for this event (it is the lead source in the CRM):', ev.name) || '').trim();
      if (!name || name === ev.name) return;
      if (nameTaken(name, ev.id)) return alert(`There is already an event called "${name}".`);
      ev.name = name;
      persistSettings();
      const affected = leadsOf(ev.id).map((l) => ({ ...l, event: name }));
      if (affected.length) await db.putLeads(affected);
      await reloadLeads();
    } else if (btn.dataset.act === 'delete') {
      if (leadsOf(ev.id).length) return;
      if (!confirm(`Delete the event "${ev.name}"?`)) return;
      settings.events = settings.events.filter((x) => x.id !== ev.id);
      if (settings.activeEventId === ev.id) settings.activeEventId = (settings.events[settings.events.length - 1] || {}).id || '';
      persistSettings();
    }
    renderEvents();
  });

  const f = $('#settings-form');
  // Keep the "used by" list in step with the people typed above it.
  f.elements.people.addEventListener('input', () => {
    const current = $('#settings-captured-by').value;
    const people = parsePeople(f.elements.people.value);
    fillPeopleSelect($('#settings-captured-by'), people.includes(current) ? current : '', people);
  });

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    settings.people = parsePeople(f.elements.people.value);
    settings.capturedBy = f.elements.capturedBy.value;
    const ok = saveSettings(settings);
    $('#settings-saved').textContent = ok ? 'Saved.' : 'Could not save settings in this browser.';
    $('#settings-saved').hidden = false;
  });

  $('#btn-delete-exported').addEventListener('click', async () => {
    const ids = leads.filter((l) => l.exported_at).map((l) => l.id);
    if (!ids.length) return alert('There are no exported leads to delete.');
    if (!confirm(`Delete ${plural(ids.length, 'exported lead')} from this phone? Make sure the export file is safe first.`)) return;
    await db.deleteLeads(ids);
    await reloadLeads();
    renderSettings();
  });

  $('#btn-delete-all').addEventListener('click', async () => {
    if (!leads.length) return alert('There are no leads to delete.');
    const unexported = leads.filter((l) => !l.exported_at).length;
    const msg = unexported
      ? `Delete ALL ${leads.length} leads? ${unexported} have NOT been exported and will be lost.`
      : `Delete all ${leads.length} leads from this phone?`;
    if (!confirm(msg)) return;
    if (unexported && prompt('Type DELETE to confirm.') !== 'DELETE') return;
    await db.deleteLeads(leads.map((l) => l.id));
    await reloadLeads();
    renderSettings();
  });
}

function parsePeople(text) {
  return [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}

// ---------- helpers ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin',
    `<div class="banner warn">The app could not start: ${esc(err.message || err)}</div>`);
});
