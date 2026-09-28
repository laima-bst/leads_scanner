// CSV export. The "import" format is the contract with the CRM's Leads -> Import
// (backend/load_new_companies.py): case-insensitive columns, read as utf-8-sig.
// Never add a column named "address": in that importer it means the email.

import { domainFromWebsite, isFreemailDomain } from './leads.js';

// `type` and `notes` are ignored by the importer today but are exported so
// nothing is lost.
export const IMPORT_COLUMNS = [
  'company', 'type', 'full_name', 'position', 'emails', 'email_types', 'phones',
  'website', 'domain', 'country', 'street', 'zip', 'city', 'region', 'lead_source', 'notes',
];

export const FULL_COLUMNS = [
  ...IMPORT_COLUMNS,
  'event', 'captured_by', 'captured_at', 'capture_method', 'raw_qr',
  'exported_at', 'updated_at', 'id',
];

// A list item must not contain the ";" separator or line breaks.
const listItem = (s) => String(s || '').replace(/[;\r\n]+/g, ' ').trim();

function importRow(lead) {
  const emails = (lead.emails || []).filter((e) => (e.address || '').trim());
  const phones = (lead.phones || []).map(listItem).filter(Boolean);
  // Safety net: a free-mail domain in website/domain would merge unrelated companies.
  // Written like "www.example.de", the form the importer's docs use.
  const website = isFreemailDomain(domainFromWebsite(lead.website))
    ? ''
    : (lead.website || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const domain = isFreemailDomain(domainFromWebsite(lead.domain)) ? '' : domainFromWebsite(lead.domain);
  return {
    company: (lead.company || '').trim(),
    type: lead.type,
    full_name: (lead.full_name || '').trim(),
    position: (lead.position || '').trim(),
    emails: emails.map((e) => listItem(e.address).replace(/\s+/g, '')).join(';'),
    email_types: emails.map((e) => e.type).join(';'),
    phones: phones.join(';'),
    website,
    domain,
    country: (lead.country || '').trim(),
    street: (lead.street || '').trim(),
    zip: (lead.zip || '').trim(),
    city: (lead.city || '').trim(),
    region: (lead.region || '').trim(),
    lead_source: (lead.event || '').trim(),
    notes: lead.notes || '',
  };
}

function fullRow(lead) {
  return {
    ...importRow(lead),
    event: lead.event || '',
    captured_by: lead.captured_by || '',
    captured_at: lead.captured_at || '',
    capture_method: lead.capture_method || '',
    raw_qr: lead.raw_qr || '',
    exported_at: lead.exported_at || '',
    updated_at: lead.updated_at || '',
    id: lead.id,
  };
}

function cell(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(columns, rows) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  // BOM so Excel opens it as UTF-8; the importer reads utf-8-sig.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function leadsToCsv(leads, format) {
  const sorted = [...leads].sort((a, b) => (a.captured_at || '').localeCompare(b.captured_at || ''));
  return format === 'full'
    ? toCsv(FULL_COLUMNS, sorted.map(fullRow))
    : toCsv(IMPORT_COLUMNS, sorted.map(importRow));
}
