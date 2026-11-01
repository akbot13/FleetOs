# Preparing a pull request with Claude

Paste everything below the line into Claude from your FleetOs checkout. Replace `<your-branch>` first. It gets your branch in step with `main`, then writes the pull request description.

---

You are preparing the `<your-branch>` branch for a pull request into shivamjindal076-lab/FleetOs, branch main. Avoid merge conflicts and don't undo work already on main.

Before changing anything:
1. Fetch the upstream repo. Compare `<your-branch>` with upstream main, and with any open pull request branches that touch the same files.
2. If upstream has new work, merge it into `<your-branch>`. Don't force-push, and don't rewrite commits others may be using.
3. List every overlapping file and conflict, and how you plan to resolve each one. Wait for my approval before resolving them.

Keep these upstream behaviours when resolving conflicts:
- Fares: quote_fare() runs on the server, ignores any fare sent by the browser, and must keep the 4_seater/6_seater vehicle_class multipliers. Rate cards must build on this. With no rate card saved, fares must stay exactly the same.
- Security: keep the triggers limit_driver_row_update and limit_driver_trip_update. Every driver save must write only columns they allow. Keep tenant isolation, and don't widen public access to organizations, bookings or drivers.
- Driver-only content stays in org_driver_info, never in public organizations columns.
- Branding: use org fields (brand_name, logo, colours, phones, UPI, payment_methods, messages) from useOrg(). Don't hardcode a fleet's name, phone or price. If a field is blank, show nothing. Don't use fake ratings or sample rides.
- Screens: keep the customer footer sign-in links, driver "From <brand>" note and Call office button, live tracking, Add driver sheet, and the theme tokens in src/index.css. No emoji in the UI; use lucide-react icons.
- Spreadsheet exports must stop cells starting with =, +, - or @ from running as formulas.

Database rules:
- Never edit a migration that has already been applied. Add a new one, timestamped after the newest file in upstream supabase/migrations.
- Don't apply migrations to the live database. Only write them and list them in the PR.

Pull request rules:
- Keep lint fixes and formatting in a separate commit from behaviour changes. Avoid reformatting files you aren't otherwise changing.
- If this is too large to review, split it into smaller PRs in this order: tests and CI, bug fixes, additions, rate cards.
- Make sure commits use an email linked to a GitHub account, or Vercel may block the deploy.
- Before opening the PR, run `npm run guard`, the type check, unit tests, lint, and build, and report the real results.

Then fill in `.github/pull_request_template.md` for the PR description:
- What changed and why.
- The files most likely to conflict.
- Migrations included, their required order, and whether they've been applied.
- What was tested in a browser and what wasn't.
- Anything that needs the owner's decision.

Don't merge the PR yourself.
