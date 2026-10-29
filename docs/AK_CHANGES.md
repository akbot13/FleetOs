# Ak's changes

Every change made on the `Ak-changes` branch: what was wrong, what changed, and how it was checked. Newest first.

- **Branch:** `Ak-changes` on the fork [akbot13/FleetOs](https://github.com/akbot13/FleetOs/tree/Ak-changes), made from `main` at `a522d2b` (27 Oct 2026).
- **Live site:** https://fleetoss.vercel.app deploys only from `shivamjindal076-lab/FleetOs` `main`. Nothing here reaches it until a pull request is merged.

## Needs Shivam (things the code can't do)

| What | Why | Where |
| --- | --- | --- |
| Add `https://fleetoss.vercel.app` and `http://localhost:8080` to the Ola Maps key's allowed domains | Address search on the live site fails with "Domain is not allowed" (403) | Ola Maps dashboard |
| Check or renew the Mappls access token | Mappls answers 503 / is blocked | Mappls console, then Vercel env |
| Review, then apply `supabase/migrations/20261030000000_rate_cards.sql` (a test project first is best), then `npm run db:check` | Turns on saving in the new Rate card screen (#6, #7). Fares don't change until a rate card is saved | Supabase |
| Check the live `set_driver_pin()` uses `public.driver_pins`; optionally apply `20261030010000_fix_set_driver_pin_schema.sql` | The original migration had a typo (#14); the new migration fixes it for fresh databases | Supabase |
| Don't run the Playwright tests against the live database | `tests/global-setup.ts` deletes and inserts bookings and resets drivers | `.env` |

| # | Date | Area | Change | Commit |
| --- | --- | --- | --- | --- |
| 1 | 2026-10-28 | Maps / address search | Look up addresses after typing pauses; say which map search failed | `2959a5e` |
| 2 | 2026-10-30 | Driver app | Trip actions wait for the database before moving the screen on | `ab82773` |
| 3 | 2026-10-30 | Admin / drivers | Remove-driver button reports when removal fails | `3e15c02` |
| 4 | 2026-10-30 | Tests | Cash tests run without database settings | `87e13d2` |
| 5 | 2026-10-30 | Performance | Staff screens download only when opened | `f46bc0f` |
| 6 | 2026-10-30 | Pricing | Rate cards: any pricing model per trip type (migration not applied) | `7ffe6dd` |
| 7 | 2026-10-30 | Pricing / admin | Rate card editor on the Pricing screen (preview until migration) | `ac6268c` |
| 8 | 2026-10-30 | Admin / messaging (addition) | One-tap WhatsApp messages for bookings; Call button dials | `9f63801` |
| 9 | 2026-10-30 | Admin / reports (addition) | Download bookings for Excel | `312728b` |
| 10 | 2026-10-30 | Customer (addition) | Share my ride with family | `69853c5` |
| 11 | 2026-10-30 | Admin / receipts (addition) | Printable trip receipt | `69dfd8e` |
| 12 | 2026-10-30 | Code quality | All 57 lint errors cleared; driver last-updated and handover-save bugs fixed | `8334485` |
| 13 | 2026-10-30 | CI | Lint, types, tests, SQL tests and build on every push | `808e4dc` |
| 14 | 2026-10-30 | Database / drivers | Driver PIN typo fixed for new databases (migration not applied) | `3c8768e` |

---

## 14. Driver PIN typo fixed for new databases

**Date:** 2026-10-30 · **Commit:** `3c8768e` · **Status:** pushed to the fork. Migration **not applied** (the live database doesn't need it).

### The issue

`set_driver_pin()` in `20261025010000_driver_pin_sign_in.sql` saves the PIN into `sdpublic.driver_pins`, a schema that doesn't exist (the code review's problem #1). Postgres only checks table names when the function runs, so the migration applied without error, but on any database built from these migrations, **every attempt to set a PIN fails and no driver can ever sign in**. The live database must have been fixed by hand, since PIN sign-in works there. A second fleet set up from the repo would have been broken.

### What changed

- A new migration, `20261030010000_fix_set_driver_pin_schema.sql`, replaces the function with `public.driver_pins`. It differs from the original in that one word only.
- The original migration file is left untouched, so the migration history stays the same.
- On the live database, applying it is harmless: it re-creates the same function the live one presumably already is.

### Checks

- `npm run test:sql` now also loads both versions into the in-memory Postgres: the original fails to save a PIN, and the fixed one saves it and signs the driver out. PGlite has no pgcrypto, so the hashing is a stand-in: this checks where the PIN goes, not bcrypt.

## 13. CI: every push is checked on GitHub

**Date:** 2026-10-30 · **Commit:** `808e4dc` · **Status:** pushed; **first run passed** ([run 40956049942](https://github.com/akbot13/FleetOs/actions/runs/40956049942))

### The issue

Nothing checked the code automatically (FO-08 in the team's review). Lint errors had piled up to 57, and a broken change could reach `main` and the live site unnoticed.

### What changed

`.github/workflows/ci.yml` runs on every push and pull request:

1. `npm ci` (a clean install from the lockfile)
2. Lint (now 0 errors, so any new error fails the run)
3. Type check (app and config)
4. Unit tests (no `.env` needed since change #4)
5. Rate-card SQL tests in an in-memory Postgres (`npm run test:sql`)
6. Production build

It needs **no secrets** and **never connects to a database**. Once merged into Shivam's repo, it runs there too, and shows a ✓ or ✗ on every pull request.

### Checks

- The first run on the fork passed every step.
- The Playwright end-to-end tests aren't in CI: they're out of date (old OTP sign-in) and write to the live database (see #12).

## 12. All 57 lint errors cleared; two bugs fixed on the way

**Date:** 2026-10-30 · **Commit:** `8334485` · **Status:** pushed to the fork

### The issue

`npm run lint` reported 57 errors and 12 warnings (the team's review lists this as FO-17), so a new real problem would disappear among the old ones. 53 of the errors were the loose `any` type, which turns off type checking for that value. Typing them properly surfaced two real bugs:

1. **Driver "last updated" always said "Unknown".** The admin's driver list read `driver.updated_at`, a column the drivers table doesn't have. The location time is in `location_updated_at`.
2. **Handover Approve and Flag ignored failed saves.** They removed the handover from the list even when the database refused the change, so the admin thought it was approved when it wasn't.

### What changed

- **Real types instead of `any`:**
  - the slice of Leaflet the app uses (it's loaded from a CDN, so its own types weren't available);
  - the replies from Ola, Mappls, OpenStreetMap and OSRM;
  - cash handovers, collection rows, the driver sign-in row, and error handling.
- `getLastUpdated` now reads `location_updated_at`, so the admin sees "3 min ago" instead of "Unknown".
- Approve and Flag on cash handovers now check the save, show an error, and keep the handover on screen if it failed.
- `tailwind.config.ts` uses an `import` instead of `require()`, a test avoids a constant expression, and `OLA maps/` is left out of lint: it holds earlier copies of the map components that nothing imports.

| | Before | After |
| --- | --- | --- |
| Lint errors | 57 | **0** |
| Lint warnings | 12 | 12 (React hook dependency and hot-reload hints, left for case-by-case review) |

### Checks

- Lint 0 errors; type check (app and config) passes; all 61 unit tests and `npm run test:sql` pass; build passes.
- Locally: the tracking map still draws its markers, route and tiles after the map typing changes.
- The two bug fixes weren't clicked through, since they need an admin login.

### Note for Shivam

`tests/global-setup.ts` (Playwright) **writes to whatever database the .env points at**: it deletes and inserts bookings and resets every driver to "free". With today's `.env`, that's the live Anil Cabs database. Don't run the Playwright tests until they point at a test database.

## 11. Printable trip receipt (addition)

**Date:** 2026-10-30 · **Commit:** `69dfd8e` · **Status:** pushed to the fork; receipt tested locally with a sample booking. *A new feature, easy to remove.*

### The issue

Customers, especially corporate and outstation ones, ask for a bill. FleetOs had no receipt, so the fleet had to write one by hand or send a screenshot.

### What changed

- A **Receipt** button in the admin's booking panel (`ReceiptButton.tsx`), shown when the booking has a fare.
- It opens a clean, phone-friendly receipt in a new tab (`src/lib/receipt.ts`):
  - fleet name, receipt number and date issued;
  - customer, trip type, car size, pickup, drop and trip date;
  - fare, amount paid and how (cash / UPI) and when, then either "Paid in full" or the **balance due** in red with the fleet's **UPI ID** to pay it.
- A **Print or save as PDF** button uses the browser's print dialog, so it works on phones and computers with no PDF library. The button hides itself on the printout.
- Customer-typed text (names, addresses) is escaped, so it can't inject anything into the page.
- If the browser blocks the new tab, the admin is told to allow pop-ups.

GST lines aren't on the receipt yet: they need the fleet's GSTIN and the rate card's tax setting (change #6) applied first.

### Checks

- 3 new unit tests: content, balance due with UPI, and escaping. All tests pass; type check passes; no new lint problems.
- Locally, on a temporary preview page with a sample booking: the receipt renders correctly at phone width. Screenshot: `resources/screenshots/2026-10-30-trip-receipt.jpg`.
- The button inside the real admin panel wasn't clicked, since that needs an admin login.

## 10. "Share my ride" for customers (addition)

**Date:** 2026-10-30 · **Commit:** `69853c5` · **Status:** pushed to the fork; tested locally with a sample booking. *A new feature, easy to remove.*

### The issue

A customer riding alone, often at night or out of town, had no easy way to let family follow the trip. The tracking page only had "Copy tracking link", which then has to be pasted into a message with no context. Sharing ride details is a standard safety feature in Indian cab apps.

### What changed

- A green **Share my ride** button on the customer's tracking page, above "Copy tracking link", shown while the trip is open.
- On most phones it opens the phone's own **share sheet** (WhatsApp, SMS, Telegram, anything). Where there's no share sheet, as on most computers, it opens **WhatsApp** to pick a contact.
- The message: *"I'm taking a cab from Jaipur Junction to Hawa Mahal. Driver: Dinesh Meena (Maruti Swift, RJ14 AB 1234). Follow my ride live: <link>"*. The driver line is left out until a driver is assigned.

### Checks

- 2 new unit tests for the message. All tests pass; type check and lint pass.
- Locally, on a temporary preview page answering the booking lookup with a sample booking (no real booking or database read): the button shows at phone width, and with no share sheet it opened WhatsApp with the message above. Screenshot: `resources/screenshots/2026-10-30-share-my-ride.jpg`.
- The phone share sheet itself wasn't tried; it needs a real phone.

## 9. Download bookings for Excel (addition)

**Date:** 2026-10-30 · **Commit:** `312728b` · **Status:** pushed to the fork; spreadsheet contents unit-tested; button not clicked in a browser. *A new feature, easy to remove.*

### The issue

The Collections screen showed a day, week or month of bookings and payments, but there was no way to get them out. A fleet owner doing accounts, GST or driver settlements had to copy numbers by hand.

### What changed

- A **Download for Excel** button on the Collections screen saves the period on screen as a `.csv` file (e.g. `bookings-2026-10-01-to-2026-10-31.csv`), which opens in Excel or Google Sheets.
- Columns: booking ID, date and time (India time), customer, pickup, drop, trip status, driver name, fare, collected, paid by, payment status (paid / partial / unpaid), paid at.
- **Safe to open:** customer names and addresses are typed by the public, and a cell starting with `=`, `+`, `-` or `@` could run as a formula in Excel. Such text gets a leading apostrophe; real numbers are untouched. The file also carries a marker so Excel shows ₹ and Hindi text correctly.
- `src/lib/csv.ts` is a small reusable helper for any future export.

### Checks

- 3 new unit tests: quoting, empty cells, and formula neutralising. All tests pass; type check passes; no new lint problems (6 existing in the file).
- Not clicked in a browser: the Collections screen needs an admin login, and a test download would save a file to your Downloads folder.

## 8. One-tap WhatsApp messages for bookings (addition)

**Date:** 2026-10-30 · **Commit:** `9f63801` · **Status:** pushed to the fork; buttons tested locally with sample data. *A new feature, easy to remove if you don't want it.*

### The issue

- **Customers never got their driver's details.** The tracking page told customers "Driver and trip details will be shared with you on SMS and WhatsApp" and "have been queued for SMS and WhatsApp delivery", but no SMS or WhatsApp provider is connected (and Indian SMS needs DLT registration first). Nothing was ever sent.
- **Admins had to type trip details to drivers by hand** in WhatsApp.
- **The Call button on each booking card did nothing**: its click only stopped the card from opening.

### What changed

- **WhatsApp buttons in the admin's booking panel** (`BookingWhatsApp.tsx`, messages in `src/lib/whatsappMessages.ts`). Each one opens WhatsApp with the message already typed; the admin checks it and presses send. No provider, cost or approval needed.
  - No driver yet: **Send booking confirmation to customer**, with pickup, drop, time, fare and the customer's tracking link.
  - Driver assigned: **Send driver details to customer**, with driver, car, plate, phone and the live tracking link; and **Send trip to driver**, with the customer, phone, pickup, drop, time, fare, note and a Google Maps link to the pickup.
  - Times are in India time. A button is hidden if the phone number isn't a valid Indian mobile.
- **Call** on booking cards now dials the customer, and is hidden when there's no phone number.
- **Tracking page wording** now says what really happens: driver details appear on the page once assigned.

### Checks

- 5 new unit tests (phone formats, message content, missing parts left out). All 53 tests pass; type check passes; no new lint problems.
- Locally, on a temporary preview page with sample data (no real booking): buttons render at phone width, and the links contain the right numbers and messages, using the fleet name "Anil Cabs" read from the database. Screenshot: `resources/screenshots/2026-10-30-whatsapp-buttons.jpg`.
- Not seen inside the real admin booking panel, which needs an admin login.

## 7. Rate card editor on the Pricing screen

**Date:** 2026-10-30 · **Commit:** `ac6268c` · **Status:** pushed to the fork; tested locally (preview mode)

### The issue

The Pricing screen had eight number boxes: one base fare per trip type, night %, and two car-size multipliers. There was no way to choose a different pricing model, add peak or festival surcharges, set GST or waiting charges, or see what a change would do to real trips before saving.

### What changed

The Pricing page has two tabs. **Basic rates** is the old screen, unchanged. **Rate card** is new (`src/components/admin/RateCardEditor.tsx`):

- **Per trip type**, a dropdown picks the model (flat, by distance, meter, hourly, rental packages, per day, outstation per km). The fields change to match, with a one-line explanation, and rental packages can be added and removed.
- **Car size, returns and stays:** multipliers and the driver's night halt.
- **Surcharges:** time windows with weekday chips (e.g. "Evening peak 20%, 5–9 PM, Mon–Fri"), plus festival dates. The screen explains that only the biggest one applies.
- **Waiting, tax and rounding.**
- **Problems are listed in plain words** (e.g. "Tax must be between 0 and 50%"), and Save stays off until they're fixed.
- **Fare calculator:** any trip type, car size, distance, minutes, hours, days, pickup hour, waiting, return and stay, with the full breakdown.
- **"Now vs this card" table** on five typical trips, so the admin sees the effect before saving: dearer in amber, cheaper in green.
- **Undo changes** returns to the saved card.

**Preview only until the migration is applied.** The tab checks whether the database has the `rate_card` column. If not, which is the live database today, it shows a "Preview only" notice and Save stays off. It never writes to the old pricing columns.

### Checks

- Locally in Chrome against the live database (read-only): "Preview only" shows; city switched to "By distance" gives ₹226 for 12 km (₹100 + 9 km × ₹14); typical trips update (5 km ₹180 → ₹150, 15 km ₹180 → ₹268); a 6 hr / 60 km sightseeing trip falls in the 8 hr / 80 km package (₹2,200).
- At phone width (375 px): no sideways scrolling. The date-surcharge row was cramped and was fixed to wrap onto two lines.
- Type check, all 48 unit tests, and lint on the new files pass.
- Screenshots: `resources/screenshots/2026-10-30-rate-card-editor-phone.jpg`, `2026-10-30-rate-card-packages.jpg`.
- Saving wasn't tested: it needs the migration on a database.

## 6. Rate cards: any pricing model per trip type

**Date:** 2026-10-30 · **Commit:** `7ffe6dd` · **Status:** pushed to the fork. ⚠️ Includes a database migration that is **not applied** to the live database.

### The issue

Pricing could only be one fixed number per trip type: a city ride was a flat ₹180 whether it was 2 km or 30 km, outstation was per day with no distance, and sightseeing was per hour. Fleets price in many other ways (by km, meter-style, rental packages like 4 hr / 40 km, outstation per km with a daily minimum), and none of them could be set up. There were also no peak-hour or festival surcharges, waiting charges, GST or rounding.

### What changed

A fleet now has a **rate card**. Each trip type picks one of seven models:

| Model | Charges | Example |
| --- | --- | --- |
| Flat | One price | Airport ₹450 |
| By distance | Base fare covering the first few km, then ₹/km, with a minimum | ₹100 for 3 km, then ₹14/km, minimum ₹150 |
| Meter | Base + ₹/km + ₹/minute, with a minimum | ₹60 + ₹12/km + ₹1.5/min |
| By the hour | ₹/hour with minimum hours | ₹550/hr, minimum 2 hr |
| Rental packages | Cheapest package that covers the trip; longer trips pay the largest plus extra hours and km | 4 hr/40 km ₹1,200, 8 hr/80 km ₹2,200 |
| Per day | ₹/day | ₹3,200/day |
| Outstation per km | ₹/km, at least the daily minimum km, plus a driver allowance per day | ₹12/km, 250 km/day, ₹400/day |

On top of the model:
- **Car-size multipliers**, as before.
- **Return-trip multiplier** for city and airport (×2, as before).
- **Driver night halt** per night (outstation).
- **Time surcharges** (night, peak hours, chosen weekdays) and **date surcharges** (festivals). Only the biggest one applies, so night and Diwali don't stack.
- **Waiting charges** after some free minutes, **tax/GST %**, and **rounding** to ₹1, ₹5 or ₹10.

Every fare comes with a line-by-line breakdown.

| File | What it is |
| --- | --- |
| `src/lib/pricing.ts` | The calculator and rate-card types. Used by the Pricing screen to preview unsaved rates. |
| `supabase/migrations/20261030000000_rate_cards.sql` | **Not applied.** Adds `org_pricing.rate_card` and the same calculator in the database (`quote_fare_from_card`). `quote_fare()` keeps its name and inputs, so the apps keep working. |
| `src/lib/pricingCases.json` | 18 hand-checked fare cases both calculators must agree on. |
| `scripts/check-rate-cards-sql.mjs` | Runs the migration in an in-memory Postgres (PGlite), with no connection to any real database. `npm run test:sql`. |

**Nothing changes for a fleet until its admin saves a rate card.** A fleet without one is priced from its old settings through a rate card built to charge exactly the old fares.

**Customers can't set their own distance.** A distance sent with a customer booking is ignored for now, because the customer app doesn't yet send coordinates the database can check. Distance-based plans charge their minimum for customer bookings until that's added; admin quotes can include a distance. See "Next steps".

### Checks

- 23 calculator tests, including 576 combinations matching the old `quote_fare()` formula exactly.
- `npm run test:sql`: the migration loads in real Postgres (PGlite); all 18 shared cases match; the new `quote_fare()` gives the same fare as the previous one on all **1,152** combinations tested; a customer's distance is ignored.
- All 48 unit tests pass; type check passes; no lint problems in the new files.

### Next steps

1. **Shivam reviews and applies the migration**, ideally on a test Supabase project first. After applying, run `npm run db:check`.
2. Customer app sends pickup/drop coordinates, and the database measures the distance itself, so distance and meter plans work for customer bookings.
3. Final fare from the odometer at trip end (the trip already records start and end readings).

## 5. Staff screens download only when opened

**Date:** 2026-10-30 · **Commit:** `f46bc0f` · **Status:** pushed to the fork; tested locally

### The issue

Most visitors are customers booking a ride, but `src/pages/Index.tsx` loaded the admin dashboard, driver app, pricing screen and both sign-in screens at startup. Every customer downloaded all of it: an 803 KB main file (229 KB compressed), slow to open on a phone on mobile data. The team's own review lists this as FO-18.

### What changed

The admin dashboard, admin shell, driver app, driver sign-in, admin sign-in and pricing screen now load the first time someone opens them, with a spinner while they load. The customer screen still loads straight away.

| | Before | After |
| --- | --- | --- |
| Main file | 803 KB (229 KB gzipped) | 598 KB (178 KB gzipped) |
| Admin dashboard | in main file | separate, 63 KB |
| Driver app | in main file | separate, 66 KB |
| New booking sheet | in main file | separate, 40 KB |

The main file is still above Vite's 500 KB warning: most of what's left is React, the Supabase library and the UI kit, which every screen needs.

### Checks

- Type check and build pass; 25 of 25 tests pass.
- Locally in Chrome: the customer screen, admin sign-in and driver sign-in all open, with no console errors. The admin dashboard and driver app themselves weren't opened, since that needs a real sign-in.

## 4. Cash tests run without database settings

**Date:** 2026-10-30 · **Commit:** `87e13d2` · **Status:** pushed to the fork

### The issue

`src/lib/cash.test.ts` checks the driver's cash maths (cash to hand over, expenses, net earnings). It imported three small helpers from `useDriverCash.ts`, which also opens the Supabase connection, and that connection throws when there's no `.env`. So the whole test file failed to load: the 6 cash tests never ran on a machine without keys, and they would fail on any CI server.

### What changed

- The three helpers (`toBookingId`, `rowToExpense`, `rowToCollection`) moved unchanged into a new file, `src/components/driver/cashRows.ts`, which has no database import.
- `useDriverCash.ts` and the test now import them from there.

### Checks

- With `.env` moved aside: 5 of 5 test files, 25 of 25 tests pass. Before: 4 of 5 files, and the cash tests never ran.
- Type check passes; no lint problems in the changed files.

## 3. Remove-driver button reports when removal fails

**Date:** 2026-10-30 · **Commit:** `3e15c02` · **Status:** pushed to the fork; type check passes; not clicked in a browser (it deletes a real driver)

### The issue

On the admin Drivers list, the **Remove** button for temporary drivers (`AdminDashboard.tsx`) deleted the driver without checking the reply, then always said "<name> removed". A driver who has done any trip or cash handover can't be deleted (the database protects their history), so the delete failed silently and the admin believed the driver was gone.

The **Reject** button for new applicants did check, but showed the raw database error.

### What changed

- Remove now uses the same handler as Reject: it shows a loading state, refreshes the list only on success, and reports failures.
- A driver with history gets a plain message: *"<name> has trips or cash records, so they can't be removed. Their history has to stay."* Other failures show *"Couldn't remove <name>: <reason>"*.

A proper way to retire a driver (deactivate instead of delete) needs a database change; it's on the list as a database item for Shivam.

### Checks

- Type check passes; lint unchanged in the file (7 before, 7 after, all existing).

## 2. Driver trip actions wait for the database before moving on

**Date:** 2026-10-30 · **Status:** pushed to the fork; type check passes; not clicked through in a browser (that needs a real driver sign-in, which writes to the live database)

### The issue

In the driver app (`src/components/driver/DriverApp.tsx`), Confirm, Start Trip, End Trip, Log payment and the odometer photo uploads sent their change to the database and then carried on without checking the reply. On a weak network, or if a database rule refused the change, the driver saw "Trip started" or "Trip completed" and the payment form closed, while the database still had the old state. The office then saw a trip that never started, or a payment that was never recorded, and the driver had no idea anything went wrong.

### What changed

| Action | Before | Now |
| --- | --- | --- |
| Confirm trip | Marked confirmed on screen whatever happened | On failure, goes back to "needs confirming" and shows an error |
| Start Trip | Screen moved to "started" before saving | Saves first; screen moves only once the database has it. The button shows "Starting…" and can't be tapped twice. |
| End Trip | Screen moved to "completed" and the trip vanished from the list before saving | Saves first; on failure the trip stays active with an error. Shows "Ending…". |
| Log payment | Form closed and the collection was added to the driver's cash whatever happened | On failure the form stays open with the amount typed, and nothing is added to the cash total. A blank or negative amount is refused. |
| Odometer photos | "Saved ✓" only on success, silent on failure | A failed upload or save shows an error. Both buttons now share one function instead of two copies. |

Errors read like: *"Couldn't end the trip. <reason>. Check your connection and try again."*

### Checks

- Type check passes; no lint problems in the file.
- Not tested in a browser: the driver app needs a PIN sign-in, which links the browser to a real driver on the live database.

## 1. Look up addresses after typing pauses; say which map search failed

**Date:** 2026-10-28 · **Commit:** `2959a5e` · **Status:** pushed to the fork, tested locally on 2026-10-30

### The issue

On the live site, typing a pickup or drop address showed *"Primary location search is being rejected. FleetOs is trying the backup providers."* and no suggestions appeared.

Reproduced on fleetoss.vercel.app on 28 Oct by typing "Jaipur Railway Station" in New Booking. All three search providers failed:

| Provider | Result | Cause |
| --- | --- | --- |
| Ola Maps (main) | 403 | Ola's reply: "Domain https://fleetoss.vercel.app is not allowed." The API key's allowed-domains list doesn't include the live site. |
| Mappls (backup) | 503 | Not confirmed. Mappls access tokens are often short-lived, so the one in Vercel may have expired. |
| OpenStreetMap (last resort) | 503 | Free public server; it limits heavy use and its policy forbids apps relying on it. |

The code made this worse in two ways:

1. **One lookup per keystroke.** The trip preview map (`TripPreviewMap.tsx`) geocoded the address every time it changed, with no delay and no memory of earlier lookups. Each lookup can try all three providers, so typing one address sent dozens of requests, and editing the drop looked the pickup up again. That's the kind of traffic that gets an app blocked by OpenStreetMap.
2. **Misleading message.** The message only appears after every provider has already failed, but it said FleetOs "is trying the backup providers". It also only reported Ola's error and hid the others.

### What changed

| File | Change |
| --- | --- |
| `src/components/maps/TripPreviewMap.tsx` | Waits until typing pauses for 800 ms before looking addresses up. |
| `src/lib/olaMaps.ts` | `olaGeocode()` remembers addresses it found this session (up to 200), so an address is looked up once. Failed lookups aren't remembered, so a provider that comes back is tried again. Addresses under 3 characters are skipped. Address suggestions now collect every provider's failure into a `LocationSearchError`, and `describeSearchFailures()` turns that into one sentence. |
| `src/components/customer/LocationInput.tsx` | Shows that sentence, e.g. *"Address search is unavailable: Ola Maps refused this site (403), Mappls could not be reached, OpenStreetMap could not be reached. You can still type the full address."* |
| `src/lib/olaMaps.test.ts` (new) | 5 tests: the message wording, an address is looked up once, a failed lookup is retried, short input is skipped. |

### Checks

- Unit tests: 19 of 19 pass. `cash.test.ts` still fails to load without a `.env`; that problem predates this change.
- **Correction (2026-10-30):** the new `olaGeocode` tests assumed no map keys were set. Once a `.env` with Ola and Mappls keys existed, each lookup made three requests and 2 tests failed. Fixed in a follow-up commit: the tests now clear the map keys themselves and pass with or without a `.env`.
- Type check and production build pass.
- Lint: no new problems in the changed files (20 before, 20 after; all existed already).
- **Browser test, 2026-10-30,** running locally (`npm run dev`, http://localhost:8080) against the live database, read-only (nothing saved):
  - Typed "Jaipur Railway Station" into the customer pickup box in three bursts. The map preview sent **one** address lookup, for the finished address. Before the change it sent one per keystroke.
  - From this computer, OpenStreetMap answered (200) and suggestions appeared. Ola still answered 403 and Mappls 503, even on `localhost`.
  - With OpenStreetMap blocked in that tab only (a test override, removed afterwards), the box showed: *"Address search is unavailable: Ola Maps refused this site (403), Mappls could not be reached, OpenStreetMap could not be reached. You can still type the full address."*

### Still needed outside the code

- **Ola Maps dashboard:** add `https://fleetoss.vercel.app` (and any preview domains) to the API key's allowed domains. This is what actually brings search back on the live site. The key also refuses `localhost`, so add `http://localhost:8080` for local testing.
- **Mappls:** check whether the access token in Vercel has expired.
