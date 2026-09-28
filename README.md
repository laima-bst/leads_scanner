# Lead Scanner

A phone-first web page for capturing trade-show leads and exporting them as a CSV
file for the Brolis HerdLine CRM's **Leads → Import**. Static files only: no server,
no build step. It is hosted on GitHub Pages.

Leads are stored **only on the phone** (IndexedDB) and the page works offline.
Export often, because clearing browser data or losing the phone loses any leads
that haven't been exported.

## Using it

1. Open the Pages URL on the phone. On iPhone, add it to the Home Screen
   (Share → Add to Home Screen) and open it from there.
2. **Settings:** create the event and make it active (its name becomes the CRM
   `lead_source`). Then enter the people at the stand and who uses this phone.
3. **Scan QR** (vCard/MeCard contact codes) or **Type in**. Check the form, correct
   it if needed, and save. Every lead is attributed to the active event.
4. **Export:** download or share the CSV.
   - *CRM import* is the file for Leads → Import.
   - *Full* holds everything captured, for reference.

## CSV import format

The columns are `company, type, full_name, position, emails, email_types, phones,
website, domain, country, street, zip, city, region, lead_source, notes`. The file
is UTF-8 with a BOM and comma-separated. List fields use `;`. The importer currently
ignores `type` and `notes`, so set Farm/OEM by hand in the CRM. See `CLAUDE.md` for
the full contract.

## Development

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123. The camera (QR/card modes) needs HTTPS, so test
those on real phones through the GitHub Pages URL.

`vendor/jsQR.js` is jsQR 1.4.0 (Apache-2.0, see `vendor/jsQR.LICENSE`). It's
bundled so scanning works offline.

When you change a cached file, bump `VERSION` in `sw.js` so phones pick up the new
version.
