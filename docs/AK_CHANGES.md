# Ak's changes

Every change made on the `Ak-changes` branch: what was wrong, what changed, and how it was checked. Newest first.

- **Branch:** `Ak-changes` on the fork [akbot13/FleetOs](https://github.com/akbot13/FleetOs/tree/Ak-changes), made from `main` at `a522d2b` (27 Oct 2026).
- **Live site:** https://fleetoss.vercel.app deploys only from `shivamjindal076-lab/FleetOs` `main`. Nothing here reaches it until a pull request is merged.

| # | Date | Area | Change | Commit |
| --- | --- | --- | --- | --- |
| 1 | 2026-10-28 | Maps / address search | Look up addresses after typing pauses; say which map search failed | `2959a5e` |
| 2 | 2026-10-30 | Driver app | Trip actions wait for the database before moving the screen on | `ab82773` |
| 3 | 2026-10-30 | Admin / drivers | Remove-driver button reports when removal fails | `3e15c02` |
| 4 | 2026-10-30 | Tests | Cash tests run without database settings | `87e13d2` |
| 5 | 2026-10-30 | Performance | Staff screens download only when opened | `f46bc0f` |

---

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
- Type check and production build pass.
- Lint: no new problems in the changed files (20 before, 20 after; all existed already).
- **Browser test, 2026-10-30,** running locally (`npm run dev`, http://localhost:8080) against the live database, read-only (nothing saved):
  - Typed "Jaipur Railway Station" into the customer pickup box in three bursts. The map preview sent **one** address lookup, for the finished address. Before the change it sent one per keystroke.
  - From this computer, OpenStreetMap answered (200) and suggestions appeared. Ola still answered 403 and Mappls 503, even on `localhost`.
  - With OpenStreetMap blocked in that tab only (a test override, removed afterwards), the box showed: *"Address search is unavailable: Ola Maps refused this site (403), Mappls could not be reached, OpenStreetMap could not be reached. You can still type the full address."*

### Still needed outside the code

- **Ola Maps dashboard:** add `https://fleetoss.vercel.app` (and any preview domains) to the API key's allowed domains. This is what actually brings search back on the live site. The key also refuses `localhost`, so add `http://localhost:8080` for local testing.
- **Mappls:** check whether the access token in Vercel has expired.
