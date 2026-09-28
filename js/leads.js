// Lead model helpers: company types, email typing, free-mail detection, domains.

export const COMPANY_TYPES = ['Distributor', 'Farm', 'OEM'];
export const DEFAULT_TYPE = 'Distributor';
export const EMAIL_TYPES = ['personal', 'role', 'company'];
export const CAPTURE_METHODS = { manual: 'Manual', qr: 'QR code', card: 'Business card' };

// Free-mail and ISP domains. Never put these in website/domain: the CRM matches
// companies by domain, so they would merge unrelated companies.
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'mail.com', 'email.com', 'protonmail.com', 'proton.me', 'pm.me', 'zoho.com',
  'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'gmx.com', 'web.de', 't-online.de',
  'freenet.de', 'arcor.de', 'online.de', 'posteo.de', 'mailbox.org', 'vodafone.de',
  'wanadoo.fr', 'orange.fr', 'free.fr', 'laposte.net', 'sfr.fr', 'neuf.fr', 'club-internet.fr',
  'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it', 'tin.it', 'fastwebnet.it',
  'telefonica.net', 'terra.es', 'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net',
  'ntlworld.com', 'blueyonder.co.uk', 'eircom.net', 'bluewin.ch', 'hispeed.ch',
  'telenet.be', 'skynet.be', 'ziggo.nl', 'kpnmail.nl', 'home.nl', 'planet.nl', 'hetnet.nl',
  'xs4all.nl', 'chello.nl', 'upcmail.nl', 'a1.net', 'aon.at', 'chello.at', 'telia.com',
  'online.no', 'start.no', 'jubii.dk', 'mail.dk', 'suomi24.fi', 'kolumbus.fi',
  'wp.pl', 'o2.pl', 'onet.pl', 'op.pl', 'interia.pl', 'poczta.fm', 'seznam.cz', 'centrum.cz',
  'atlas.cz', 'azet.sk', 'zoznam.sk', 'freemail.hu', 'citromail.hu', 'abv.bg',
  'inbox.lt', 'one.lt', 'takas.lt', 'mail.ee', 'inbox.lv', 'mail.ru', 'bk.ru', 'list.ru',
  'inbox.ru', 'yandex.ru', 'yandex.com', 'ukr.net', 'i.ua',
  'qq.com', '163.com', '126.com', 'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
  'bigpond.com', 'optusnet.com.au', 'xtra.co.nz', 'rediffmail.com',
]);
// Country variants such as yahoo.de, hotmail.co.uk, outlook.fr, live.nl.
const FREEMAIL_FAMILY = /^(yahoo|hotmail|outlook|live|windowslive|gmx|aol|msn)\.[a-z.]{2,6}$/;

export function isFreemailDomain(domain) {
  const d = (domain || '').toLowerCase().trim();
  return !!d && (FREEMAIL.has(d) || FREEMAIL_FAMILY.test(d));
}

// "https://www.Example.de/contact" -> "example.de"
export function domainFromWebsite(website) {
  let s = (website || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\d*\./, '');
  return s.split(/[/?#:]/)[0];
}

export function domainFromEmail(address) {
  const at = (address || '').lastIndexOf('@');
  return at < 0 ? '' : address.slice(at + 1).trim().toLowerCase();
}

export function isValidEmail(address) {
  return /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test((address || '').trim());
}

// General mailboxes (-> "company") and function mailboxes (-> "role").
const COMPANY_BOXES = [
  'info', 'office', 'contact', 'kontakt', 'contacto', 'contatto', 'mail', 'email', 'hello',
  'hallo', 'hi', 'post', 'postmaster', 'general', 'enquiries', 'enquiry', 'inquiries',
  'inquiry', 'reception', 'welcome', 'bureau', 'buero', 'buro', 'admin', 'team', 'hq',
  'central', 'zentrale', 'biuro', 'birou', 'kancelaria', 'firma', 'company',
];
const ROLE_BOXES = [
  'sales', 'sale', 'verkauf', 'vertrieb', 'ventes', 'vente', 'vendite', 'ventas', 'export',
  'import', 'service', 'services', 'support', 'parts', 'spareparts', 'ersatzteile', 'technik',
  'tech', 'technical', 'orders', 'order', 'bestellung', 'bestellungen', 'purchasing',
  'purchase', 'einkauf', 'procurement', 'marketing', 'accounts', 'accounting', 'billing',
  'invoice', 'invoices', 'rechnung', 'finance', 'buchhaltung', 'hr', 'jobs', 'careers',
  'press', 'presse', 'media', 'logistics', 'logistik', 'shipping', 'dispatch', 'versand',
  'customerservice', 'kundendienst', 'kundenservice', 'werkstatt', 'shop', 'webshop',
  'store', 'noreply', 'no-reply',
];

export function guessEmailType(address) {
  const local = (address || '').split('@')[0].toLowerCase().trim();
  if (!local) return 'personal';
  // Treat "sales.de", "info-fr", "service2" like the plain mailbox.
  const base = local.split(/[._\-+]|\d/)[0];
  if (COMPANY_BOXES.includes(local) || COMPANY_BOXES.includes(base)) return 'company';
  if (ROLE_BOXES.includes(local) || ROLE_BOXES.includes(base)) return 'role';
  return 'personal';
}

export function newLeadId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'l-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function blankLead() {
  return {
    id: newLeadId(),
    company: '',
    type: DEFAULT_TYPE,
    full_name: '',
    position: '',
    emails: [],           // [{ address, type }]
    phones: [],           // [string]
    website: '',
    domain: '',
    country: '',
    street: '',
    zip: '',
    city: '',
    region: '',
    notes: '',
    captured_by: '',
    captured_at: new Date().toISOString(),
    event_id: '',
    event: '',            // event name at capture time, exported as lead_source
    capture_method: 'manual',
    raw_qr: '',
    card_text: '',        // text copied from a business card
    exported_at: null,
    updated_at: null,
  };
}

export const COUNTRIES = [
  'Albania', 'Andorra', 'Armenia', 'Austria', 'Azerbaijan', 'Belarus', 'Belgium',
  'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark',
  'Estonia', 'Finland', 'France', 'Georgia', 'Germany', 'Greece', 'Hungary', 'Iceland',
  'Ireland', 'Italy', 'Kazakhstan', 'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania',
  'Luxembourg', 'Malta', 'Moldova', 'Monaco', 'Montenegro', 'Netherlands', 'North Macedonia',
  'Norway', 'Poland', 'Portugal', 'Romania', 'Russia', 'San Marino', 'Serbia', 'Slovakia',
  'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Turkey', 'Ukraine', 'United Kingdom',
  'Algeria', 'Argentina', 'Australia', 'Brazil', 'Canada', 'Chile', 'China', 'Colombia',
  'Egypt', 'India', 'Indonesia', 'Iran', 'Israel', 'Japan', 'Kenya', 'Mexico', 'Morocco',
  'New Zealand', 'Nigeria', 'Pakistan', 'Saudi Arabia', 'South Africa', 'South Korea',
  'Thailand', 'Tunisia', 'United Arab Emirates', 'United States', 'Uruguay', 'Uzbekistan',
  'Vietnam',
];
