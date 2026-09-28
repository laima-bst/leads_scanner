# HerdLine Lead Scanner — orientation for an AI agent

Written 28 September 2026, from the planning discussion held in the CRM repo.
The owner is Laima Andrejevaite (Brolis Sensor). Where this file says "decided",
she decided it.

## What this is

A small, standalone, phone-first web page for capturing leads at trade shows.
It exists because an upcoming small dairy show will most likely have **no lead
scanning system**. (EuroTier, Hanover, 10–13 Nov 2026, has its own Scan2Lead,
and that export can be imported into the CRM separately.)

**Deadline: about two weeks** from 28 Sep 2026. Build it so a usable version
exists early (manual entry + CSV export), with the other input modes added on top.

## Decisions (do not re-open without asking)

- **Separate repo, hosted on GitHub Pages.** Static files only, with no server and
  no build step required.
- **The CRM must not change for this project.** People already use the CRM
  (Brolis HerdLine CRM, `sales.brolisherdline.com`, a separate Azure DevOps repo).
  The scanner does **not** talk to the CRM's API. Its only link to the CRM is a
  **CSV file** that Laima imports by hand.
- **Three ways to add a lead:**
  1. **Manual entry** (a form).
  2. **QR scan** with the phone camera. Parse **vCard** (`BEGIN:VCARD`) and
     **MeCard** (`MECARD:`) into fields. A plain URL QR fills in website/domain
     only. Show-badge QR codes are usually proprietary or encrypted, so don't
     promise to decode them; just show the raw text.
  3. **Business card photo → AI extraction** with Claude vision (see below).
- **Review before saving, always.** Every mode fills the same form, and the user
  confirms or corrects it. Nothing is saved automatically.
- **Company type:** each lead is `Distributor`, `Farm` or `OEM` (those exact
  strings, which are the CRM's values). The default is `Distributor`.
- **Storage is on the phone:** IndexedDB (or localStorage). The page must work
  **offline** for manual entry and QR scanning, because show-hall Wi-Fi is
  unreliable.
- **CSV export** of saved leads, with a clearly visible "Export" button. Losing
  the phone or clearing browser data loses any unexported leads, so make export
  easy and show how many leads haven't been exported yet.

## AI card reading — decided approach (option A)

- The page has a **settings screen where an Anthropic API key is pasted once
  per phone** and stored only in that browser's storage. **The key never goes into
  the repo.** The repo and site are public (free GitHub Pages can't be private).
- The browser calls the Anthropic Messages API directly, with the header
  `anthropic-dangerous-direct-browser-access: true`. Send the photo as a base64
  image and ask for structured JSON (company, full name, position, email(s),
  phone(s), website, country, city, address). Default model: the latest
  Claude model. Check the current model ids and API shape against the docs before
  writing the call; don't rely on memory.
- Mitigations Laima will do outside the code: a key used only for the scanner, a
  monthly spend cap in the Anthropic Console, and revoking it after the show.
- **Offline:** if there's no connection, store the photo with the lead as
  "pending AI read" and let the user run the read later.
- Resize or compress the photo before sending (card photos from phones are large).
- **Later / optional (option B):** a Cloudflare Worker proxy that holds the key.
  Brolis already uses Cloudflare for `brolisherdline.com`. Build it only if asked.
- On-device OCR (Tesseract.js) is at most an offline fallback. Low priority.

## The CSV the CRM import expects — the most important contract

Laima imports through the CRM's **Leads → Import** button (admin only). That runs
the CRM's `backend/load_new_companies.py`. Column names are
**case-insensitive**, and the file is read as `utf-8-sig`, so writing a UTF-8
BOM is fine and recommended for Excel. Columns it understands:

| Column | Meaning |
|---|---|
| `company` | **required**; rows without it are skipped |
| `country` | full country name, e.g. `Germany` |
| `website` | e.g. `www.example.de`; domain is derived from it |
| `domain` | optional explicit domain (overrides the one derived from `website`) |
| `street`, `zip`, `city`, `region` | physical address parts |
| `full_name` | the person, **as printed on the card, never split or reordered** |
| `position` | the person's job title |
| `emails` | `;`-separated addresses |
| `email_types` | `;`-separated, parallel to `emails`: `personal` / `role` / `company` |
| `phones` | `;`-separated; the first goes to the named person |
| `lead_source` | tag shown as the lead source in the CRM. **Use the event name**, e.g. `Dairy Show 2026` |

Rules and consequences:

- **Do not use a column named `address`.** In this importer, `address` means
  the *email* (a quirk left over from the sequencer export). Use `street`/`city`/`zip`.
- **Email type:** `personal` = a named person's own mailbox (`j.dupont@`);
  `role` = a function mailbox (`sales@`, `service@`); `company` = the general one
  (`info@`, `office@`). The first email in `emails` is attached to the named person.
- **Matching:** the CRM matches an existing company by **domain** (else by
  normalised name), so a card from a dealer already in the CRM adds the person to
  that company instead of creating a duplicate. **Never put a free-mail or ISP
  domain** (gmail.com, outlook.com, t-online.de, wanadoo.fr…) in `domain`/`website`;
  it would merge unrelated companies. Keep such an address in `emails` only.
- ⚠️ **The importer currently ignores `type` and any notes column.** Every new
  company is created as `Distributor`, and an existing company's type is never
  changed. Still **export `type` and `notes` columns** (the importer ignores unknown
  columns) so nothing is lost; Laima sets Farm/OEM by hand in the CRM for now.
  Changing the importer is a CRM change and **out of scope** here.
- Also offer a **"full" export** holding everything captured (type, notes, the
  person who took the lead, timestamp, interest level, raw QR text), for
  reference and for the EuroTier follow-up.

## Fields to capture per lead

Company, company type (Distributor/Farm/OEM), full name, position, email(s) with
type, phone(s), website, country, city/street/zip, notes, **captured by**
(who met them; pick from a short list stored in settings), **captured at**
(timestamp), event name (set once in settings, used as `lead_source`), and how the
lead was captured (manual / QR / card).

## Data and privacy rules (carried over from the CRM)

- These are named individuals at EU companies (GDPR). Record **source (event)
  and date** on every lead so a deletion request can be met.
- Card photos are sent to Anthropic. **Laima is checking whether Brolis
  allows this.** Until that's confirmed, keep AI reading behind the settings key,
  so without a key the feature is simply off.
- Don't keep card photos longer than needed. Offer to delete them once the lead is
  read and exported.
- Never invent a person from a mailbox. Never guess a split of first and last name.

## Testing

- The camera needs HTTPS. GitHub Pages provides it, so **test on real phones via
  the Pages URL**. `localhost` works on the laptop only; a phone reaching the laptop
  over Wi-Fi is not treated as secure and the camera is blocked.
- Before the show, rehearse the import into a **local copy of the CRM** (Laima
  runs it on her Mac with a local `crm.db`) before importing into the live CRM.
- Check on the actual phones that will go to the show. That's still to be
  confirmed: iPhone, Android or both. iOS Safari has no native `BarcodeDetector`,
  so use a JS QR library (e.g. `jsQR` / `zxing`, loaded from a CDN or bundled).

## Open questions — ask, do not guess

1. The date of the small dairy show, and its name (to use as `lead_source`).
2. Which phones: iPhone, Android or both?
3. Is sending card photos to Anthropic OK under Brolis policy / GDPR?
4. Is a GitHub account/organisation OK for Brolis to host this?
5. Any extra fields beyond the list above (interest level, product interest,
   follow-up action)?

## Decisions since (28 Sep 2026)

- **Events are created in the app** (Settings → Events), and one is active at a time.
  Every lead stores `event_id` plus the event name, which is exported as
  `lead_source`. Renaming an event updates its leads. An event with leads can't be
  deleted. The list and the export can be filtered by event.
- **Phones: both iPhone and Android.** QR scanning uses the bundled
  `vendor/jsQR.js` (jsQR 1.4.0, Apache-2.0), so it works offline and doesn't
  depend on `BarcodeDetector`. There's a photo fallback if live scanning fails.
- **Step 4 (AI card reading) is postponed.** There's no API-key setting in the UI
  for now.
- **Hosting on Laima's GitHub account is OK.**
- **Extra fields** (interest level, product interest, follow-up) will be reviewed
  by Laima in the next step.

- **Business cards without AI (option C):** the phone's own text recognition copies
  the card's text: Live Text "Scan Text" on iPhone, Google Lens on Android. The user
  pastes it into one box, and `js/cardtext.js` sorts it into fields; the review form
  is where corrections happen. No photo is stored. Leads captured this way have
  `capture_method: card` and keep the pasted text in `card_text` (full export only).

## Suggested order of work

1. Repo + Pages skeleton, a phone-first layout, settings (event, people, API key).
2. Manual form → saved on the phone → list of saved leads → CSV export (import format +
   full). **This is already usable at a show.**
3. QR scanning with vCard/MeCard parsing into the form.
4. Card photo → Claude → form, with an offline "pending" queue.
5. Test on real phones, and rehearse the import into the local CRM.
