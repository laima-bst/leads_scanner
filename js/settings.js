// Per-phone settings in localStorage: events, people, who uses this phone.

const KEY = 'leadscanner.settings';
const DEFAULTS = {
  events: [],         // [{ id, name, date }]; the name becomes the CRM lead_source
  activeEventId: '',  // new leads are attributed to this event
  people: [],         // who can capture leads
  capturedBy: '',     // default person on this phone
};

export function loadSettings() {
  let s;
  try {
    s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    s = { ...DEFAULTS };
  }
  // Settings from 0.1 had a single event name.
  if (s.event && !s.events.length) {
    const id = newEventId();
    s.events = [{ id, name: s.event, date: '' }];
    s.activeEventId = id;
  }
  delete s.event;
  delete s.apiKey;
  return s;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function newEventId() {
  return 'e-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// Unsaved form content, so a lead survives the browser killing the tab.
const DRAFT_KEY = 'leadscanner.draft';

export function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
}

export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
