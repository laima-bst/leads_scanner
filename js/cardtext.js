// Business card text (copied with the phone's own Live Text / Google Lens and
// pasted into one box) -> lead fields. Emails, phones, websites and postcodes are
// found reliably; which line is the company, the person and the position is a
// best guess that the user checks in the form. A name is always one whole line,
// exactly as printed: never split or reordered.

import { guessEmailType, COUNTRIES } from './leads.js';

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const TLDS = 'com|net|org|info|biz|eu|de|at|ch|fr|be|nl|lu|it|es|pt|co\\.uk|uk|ie|dk|se|no|fi|is|pl|cz|sk|hu|lt|lv|ee|ro|bg|hr|si|rs|ba|me|mk|al|gr|cy|mt|tr|ua|by|md|ru|kz|us|ca|au|nz|br|ar|cl|mx|za|in|cn|jp|kr|farm|agri|example';
const URL_RE = new RegExp(`(?:https?:\\/\\/)?(?:www\\d?\\.)?[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})(?:\\/[^\\s,;]*)?(?![a-z0-9.])`, 'gi');
const PHONE_RE = /(?:\+|00)?\(?\d[\d\s().\/-]{5,}\d/g;
const PHONE_LABEL = /(?:^|\s)(tel(?:efon|ephone|\.?\s*kom)?|phone|ph|mob(?:il|ile)?|cell|handy|gsm|fax|telefax|t|m|f|p|tél|mobiel|cellulare|móvil|komórka|puh|fon)\.?\s*[:.]?\s*$/i;
const MOBILE_LABEL = /^(mob(il|ile)?|cell|handy|gsm|m|tel\.?\s*kom|mobiel|cellulare|móvil|komórka)$/i;
const CONTACT_LABELS = /(?:^|\s)(?:tel(?:efon|ephone)?|phone|ph|mob(?:il|ile)?|cell|handy|gsm|fax|telefax|tél|e-?mail|mail|web|website|internet|[tmfpew])\.?\s*[:.]\s*/gi;
const LABEL_ONLY = /^(?:e-?mail|mail|e|web|website|internet|www|w|tel(?:efon|ephone)?|phone|ph|mob(?:il|ile)?|cell|fax|t|m|f|p)\.?\s*[:.]?$/i;

// Legal forms that mark a company line.
const LEGAL_FORM = new RegExp(
  '(?:^|[\\s,(„"«»\'])(?:' + [
    'GmbH', 'mbH', 'AG', 'KG', 'OHG', 'GbR', 'e\\.\\s?K\\.', 'eG', 'UG', 'Ltd\\.?', 'Limited', 'LLC', 'LLP', 'Inc\\.?', 'Corp\\.?', 'PLC',
    'S\\.A\\.S?\\.?', 'SAS', 'SA', 'SARL', 'S\\.à\\s?r\\.l\\.', 'S\\.r\\.l\\.?', 'Srl', 'S\\.p\\.A\\.?', 'SpA', 'S\\.L\\.U?\\.?', 'SL',
    'B\\.V\\.?', 'BV', 'N\\.V\\.?', 'NV', 'VOF', 'ApS', 'A\\/S', 'AB', 'HB', 'Oy', 'Oyj', 'AS', 'ASA', 'Sp\\.\\s?z\\s?o\\.\\s?o\\.?',
    's\\.r\\.o\\.?', 'a\\.s\\.', 'spol\\.', 'Kft\\.?', 'Zrt\\.?', 'Nyrt\\.?', 'Bt\\.?', 'UAB', 'ŽŪB', 'OÜ', 'SIA',
    'Lda\\.?', 'd\\.o\\.o\\.?', 'd\\.d\\.', 'ООО', 'ОАО', 'АО', 'ТОВ', 'ПАТ', 'ПрАТ', 'ФГ', 'A\\.Ş\\.?', 'Şti\\.?',
    'Α\\.Ε\\.?', 'Ε\\.Π\\.Ε\\.?', 'Ο\\.Ε\\.?', '&\\s?Co\\.?', 'Co\\.', 'Coop\\.?', 'Genossenschaft', 'Coopérative', 'Cooperativa',
    'Spółdzielnia', 'Družstvo', 'družstvo', 'Mleczarnia', 'Molkerei', 'Caseificio', 'Lacticínios', 'Lácteos', 'Laiterie',
  ].join('|') + ')(?=$|[\\s,.)„"«»\'])', 'u');

const POSITION_WORDS = [
  'ceo', 'cfo', 'cto', 'coo', 'owner', 'founder', 'director', 'manager', 'head of', 'sales', 'export', 'engineer',
  'consultant', 'specialist', 'representative', 'advisor', 'adviser', 'technician', 'veterinar', 'president',
  'managing partner', 'chef', 'salg', 'sjef',
  'officer', 'coordinator', 'account', 'purchas', 'buyer', 'marketing', 'assistant', 'agronom',
  'geschäftsführ', 'leiter', 'leitung', 'inhaber', 'vertrieb', 'verkauf', 'berater', 'prokurist', 'vorstand', 'techniker',
  'außendienst', 'einkauf', 'meister', 'directeur', 'directrice', 'responsable', 'gérant', 'commercial', 'ingénieur',
  'direttore', 'direttrice', 'responsabile', 'titolare', 'amministratore', 'gerente', 'jefe', 'jefa', 'técnico', 'técnica',
  'directora', 'kierownik', 'dyrektor', 'prezes', 'właściciel', 'specjalista', 'przedstawiciel', 'handlowiec',
  'vadov', 'direktor', 'vadybinink', 'savinink', 'eigenaar', 'bedrijfsleider', 'adviseur', 'verkoop', 'ředitel', 'jednatel',
  'vedoucí', 'předseda', 'obchodní', 'driftsleder', 'direktør', 'ejer', 'sælger', 'ägare', 'försäljning', 'säljare',
  'toimitusjohtaja', 'myynti', 'johtaja', 'ügyvezető', 'igazgató', 'vezető', 'értékesítés', 'менеджер', 'директор',
  'керівник', 'начальник', 'διευθυντής', 'διευθύντρια', 'υπεύθυν', 'müdür', 'satış', 'gestor', 'diretor', 'proprietário',
];
const NAME_PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'di', 'da', 'del', 'della', 'dos', 'das', 'du', 'la', 'le', 'ten', 'ter', 'zu', 'y', 'af', 'al']);
const TITLES = /^(dr|prof|ing|mag|dipl|mgr|ir|mr|mrs|ms|mme|sig|sr|sra|pan|pani|dott|dr\.-ing)\.?$/i;

// Local and English country names -> the English name the CRM uses.
const COUNTRY_ALIASES = {
  deutschland: 'Germany', österreich: 'Austria', schweiz: 'Switzerland', suisse: 'Switzerland', svizzera: 'Switzerland',
  belgique: 'Belgium', belgië: 'Belgium', nederland: 'Netherlands', holland: 'Netherlands', 'the netherlands': 'Netherlands',
  italia: 'Italy', españa: 'Spain', polska: 'Poland', česko: 'Czech Republic', 'česká republika': 'Czech Republic',
  czechia: 'Czech Republic', slovensko: 'Slovakia', magyarország: 'Hungary', lietuva: 'Lithuania', latvija: 'Latvia',
  eesti: 'Estonia', suomi: 'Finland', sverige: 'Sweden', norge: 'Norway', danmark: 'Denmark', éire: 'Ireland',
  uk: 'United Kingdom', 'great britain': 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom',
  wales: 'United Kingdom', ελλάδα: 'Greece', hellas: 'Greece', україна: 'Ukraine', türkiye: 'Turkey', românia: 'Romania',
  българия: 'Bulgaria', hrvatska: 'Croatia', slovenija: 'Slovenia', srbija: 'Serbia', usa: 'United States',
  'u.s.a.': 'United States', 'united states of america': 'United States',
};
for (const c of COUNTRIES) COUNTRY_ALIASES[c.toLowerCase()] = c;

const ZIP_CITY = /(?:^|[\s,])((?:[A-Z]{1,2}-)?(?:\d{5}|\d{4}(?:\s?[A-Z]{2}(?=\s))?|\d{2}-\d{3}|\d{3}\s\d{2}|\d{4}-\d{3}))\s+(\p{Lu}[\p{L}.'’\- ]*[\p{L}.])/u;
// UK postcodes and Irish Eircodes.
const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[AC-FHKNPRTV-Y]\d{2}\s?[AC-FHKNPRTV-Y0-9]{4})\b/;
const STREET_WORD = /(straße|strasse|str\.|weg\b|gasse|platz|allee|ring\b|damm\b|chaussee|rue\b|avenue|av\.|boulevard|chemin|route\b|via\b|viale|piazza|corso|calle|avda|carrer|rua\b|ul\.|ulica|aleja|straat|laan\b|plein|vej\b|gade\b|gatan|vägen|gata\b|katu\b|tie\b|utca|út\b|ulice|gatvė|g\.\s|pr\.|prospekt|iela|tänav|street|road|rd\.|lane|drive|вул\.|вулиця|ул\.|οδός|cad\.|caddesi|sok\.|sokak|postfach|p\.o\. box)/i;

const normalize = (s) => s.toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/đ/g, 'd');
const loose = (s) => normalize(s).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u').replace(/[^a-z0-9]/g, '');

const hasLetters = (s) => (s.match(/\p{L}/gu) || []).length >= 2;
const digitCount = (s) => (s.match(/\d/g) || []).length;
const tidy = (s) => s.replace(/^[\s|,;:·•\-–—/]+|[\s|,;:·•\-–—/]+$/g, '').replace(/\s{2,}/g, ' ');
const countryOf = (seg) => COUNTRY_ALIASES[tidy(seg).toLowerCase().replace(/\.$/, '')] || '';

// "Almweg 12, 83022 Rosenheim, Germany" -> { street, zip, city, country }
export function parseAddress(text) {
  const out = { street: '', zip: '', city: '', country: '' };
  const streetParts = [];
  for (const seg of text.split(/\s*[,|·•]\s*|\s{3,}/).map(tidy).filter(Boolean)) {
    const country = countryOf(seg);
    if (country) { out.country = out.country || country; continue; }
    const zc = !out.zip && seg.match(ZIP_CITY);
    if (zc) {
      const before = tidy(seg.slice(0, zc.index + (zc[0].length - zc[0].trimStart().length)));
      if (before) streetParts.push(before);
      out.zip = zc[1];
      let city = zc[2].trim();
      // A country written after the city: "83022 Rosenheim Germany"
      for (const [alias, name] of Object.entries(COUNTRY_ALIASES)) {
        if (city.toLowerCase().endsWith(' ' + alias)) {
          out.country = out.country || name;
          city = city.slice(0, -alias.length - 1).trim();
          break;
        }
      }
      out.city = city;
      continue;
    }
    const uk = !out.zip && seg.match(UK_POSTCODE);
    if (uk) {
      out.zip = uk[1];
      const rest = tidy(seg.replace(uk[1], ''));
      if (rest) out.city = out.city || rest;
      continue;
    }
    streetParts.push(seg);
  }
  // No postcode: a last part without digits is probably the town ("..., Rosenheim").
  const last = streetParts[streetParts.length - 1];
  if (!out.zip && !out.city && streetParts.length > 1 && !/\d/.test(last) && !STREET_WORD.test(last)) {
    out.city = streetParts.pop();
  }
  out.street = streetParts.join(', ');
  return out;
}

function looksLikeAddress(text) {
  return !!countryOf(text) || ZIP_CITY.test(text) || UK_POSTCODE.test(text)
    || (/\d/.test(text) && STREET_WORD.test(text))
    || /^\p{Lu}[\p{L}.'’\- ]+\s\d{1,4}[a-z]?(?:[/-]\d+)?(?:,|$)/u.test(text)         // "Almweg 12"
    || (/^\d{1,4}[a-z]?,?\s+\p{L}/u.test(text) && digitCount(text) <= 5);           // "7 rue des Pommiers"
}

const looksLikePosition = (text) => POSITION_WORDS.some((w) => text.toLowerCase().includes(w));

function looksLikeName(text) {
  if (/\d|@|&/.test(text) || text.length > 45) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((w) => NAME_PARTICLES.has(w.toLowerCase()) || TITLES.test(w) || /^\p{Lu}[\p{L}'’.-]*$/u.test(w));
}

// The line that contains a word from a personal email address ("k.schoenberger@").
function matchesEmailName(text, emails) {
  if (/\d/.test(text) || LEGAL_FORM.test(text)) return false;
  const n = loose(text);
  return emails.some((e) => e.split('@')[0].toLowerCase().split(/[._-]+/)
    .filter((t) => t.length >= 3 && !['info', 'office', 'sales', 'kontakt', 'contact', 'mail', 'service'].includes(t))
    .some((t) => n.includes(loose(t))));
}

// International dialling codes -> country, for cards that don't print the country.
const DIAL_CODES = {
  49: 'Germany', 43: 'Austria', 41: 'Switzerland', 33: 'France', 32: 'Belgium', 31: 'Netherlands', 352: 'Luxembourg',
  39: 'Italy', 34: 'Spain', 351: 'Portugal', 44: 'United Kingdom', 353: 'Ireland', 45: 'Denmark', 46: 'Sweden',
  47: 'Norway', 358: 'Finland', 354: 'Iceland', 48: 'Poland', 420: 'Czech Republic', 421: 'Slovakia', 36: 'Hungary',
  370: 'Lithuania', 371: 'Latvia', 372: 'Estonia', 40: 'Romania', 359: 'Bulgaria', 385: 'Croatia', 386: 'Slovenia',
  381: 'Serbia', 30: 'Greece', 357: 'Cyprus', 356: 'Malta', 90: 'Turkey', 380: 'Ukraine', 375: 'Belarus', 373: 'Moldova',
};

function countryFromPhones(phones) {
  for (const p of phones) {
    const digits = p.replace(/^00/, '+').match(/^\+\s*(\d[\d\s]{0,4})/);
    if (!digits) continue;
    const d = digits[1].replace(/\s/g, '');
    for (const len of [3, 2]) if (DIAL_CODES[d.slice(0, len)]) return DIAL_CODES[d.slice(0, len)];
  }
  return '';
}

// Returns { fields, hints }. `fields` has only what was found.
export function parseCardText(text) {
  const emails = [];
  const phones = [];   // { number, mobile, fax }
  let website = '';
  const lines = [];    // { value, role }

  for (const raw of (text || '').split(/\r?\n/)) {
    const original = raw.trim();
    if (!original) continue;
    let rest = original.replace(EMAIL_RE, (m) => {
      if (!emails.some((e) => e.toLowerCase() === m.toLowerCase())) emails.push(m);
      return ' ';
    });
    rest = rest.replace(URL_RE, (m) => {
      if (!website) website = m.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      return ' ';
    });
    rest = rest.replace(PHONE_RE, (m, offset, whole) => {
      if (digitCount(m) < 7) return m;
      // "83022 Rosenheim" or "Almweg 12 83022" is an address, not a phone number.
      if (!/^(\+|00|\()/.test(m) && digitCount(m) < 9 && /^\s*\p{L}/u.test(whole.slice(offset + m.length))) return m;
      const label = ((whole.slice(0, offset).match(PHONE_LABEL) || [])[1] || '').trim();
      const number = m.trim();
      if (!phones.some((p) => p.number === number)) {
        phones.push({ number, mobile: MOBILE_LABEL.test(label), fax: /^(fax|telefax|f)$/i.test(label) });
      }
      return ' ';
    });
    rest = tidy(rest.replace(CONTACT_LABELS, ' ').replace(/(?:^|\s)(?:tel|fax|mob|mobile|phone|e-?mail|web)\.?\s*$/i, ' '));
    if (hasLetters(rest) && !LABEL_ONLY.test(rest)) lines.push({ value: rest, role: null });
  }

  // 1. Clear signals: postcode/country, legal form, address, job title.
  for (const l of lines) {
    if (ZIP_CITY.test(l.value) || UK_POSTCODE.test(l.value) || countryOf(l.value)) l.role = 'address';
    else if (LEGAL_FORM.test(l.value)) l.role = 'company';
    else if (looksLikeAddress(l.value)) l.role = 'address';
    else if (looksLikePosition(l.value) && !matchesEmailName(l.value, emails)) l.role = 'position';
  }
  const open = () => lines.filter((l) => !l.role);

  // 2. The person: matches the email address, else a name-shaped line next to the title.
  let nameLine = open().find((l) => matchesEmailName(l.value, emails));
  if (!nameLine) {
    const posIdx = lines.findIndex((l) => l.role === 'position');
    const candidates = open().filter((l) => looksLikeName(l.value));
    nameLine = candidates.find((l) => posIdx >= 0 && Math.abs(lines.indexOf(l) - posIdx) === 1) || candidates[0];
  }
  if (nameLine) nameLine.role = 'full_name';

  // 3. The company: matches the web/email domain, else the first line left over.
  let companyGuessed = false;
  if (!lines.some((l) => l.role === 'company')) {
    const cores = [website, ...emails.map((e) => e.split('@')[1])].filter(Boolean)
      .flatMap((d) => d.toLowerCase().replace(/^www\d?\./, '').split('/')[0].split('.').slice(0, -1).join('.').split(/[.-]/))
      .filter((c) => c.length >= 4);
    const line = open().find((l) => cores.some((c) => loose(l.value).includes(loose(c)))) || open()[0];
    if (line) { line.role = 'company'; companyGuessed = true; }
  }

  // Several job-title candidates: keep the ones next to the name, the rest go to notes.
  const positions = lines.filter((l) => l.role === 'position');
  const nearName = (l) => nameLine && Math.abs(lines.indexOf(l) - lines.indexOf(nameLine)) === 1;
  if (positions.length > 1 && positions.some(nearName)) {
    for (const l of positions) if (!nearName(l)) l.role = null;
  }

  // 4. No job title found by keyword: take the line right after the name.
  if (nameLine && !lines.some((l) => l.role === 'position')) {
    const next = lines[lines.indexOf(nameLine) + 1];
    if (next && !next.role && next.value.length <= 60) next.role = 'position';
  }

  const pick = (role) => lines.filter((l) => l.role === role).map((l) => l.value);
  const fields = {
    company: pick('company').join(' '),
    full_name: pick('full_name').join(' '),
    position: pick('position').join(' '),
    website,
    emails: emails.map((address) => ({ address, type: guessEmailType(address) })),
    // Mobile first: the CRM gives the first number to the named person. Fax is kept in notes.
    phones: [...phones.filter((p) => p.mobile), ...phones.filter((p) => !p.mobile && !p.fax)].map((p) => p.number),
  };
  Object.assign(fields, parseAddress(pick('address').join(', ')));

  let countryGuessed = false;
  if (!fields.country) {
    fields.country = countryFromPhones(fields.phones);
    countryGuessed = !!fields.country;
  }

  const leftover = open().map((l) => l.value);
  const faxes = phones.filter((p) => p.fax).map((p) => p.number);
  fields.notes = [...leftover, ...(faxes.length ? [`Fax: ${faxes.join(', ')}`] : [])].join('\n');

  const hints = ['Read from the card text. Check especially the company, name and position.'];
  if (!fields.full_name) hints.push('No name was recognised. Type it exactly as printed on the card.');
  if (companyGuessed) hints.push(`The company was guessed ("${fields.company}"). Correct it if it's wrong.`);
  if (countryGuessed) hints.push(`The country (${fields.country}) was guessed from the phone number.`);
  if (leftover.length) hints.push('Text that did not fit a field was put in Notes.');

  const out = {};
  for (const [k, v] of Object.entries(fields)) if (Array.isArray(v) ? v.length : v) out[k] = v;
  return { fields: out, hints };
}
