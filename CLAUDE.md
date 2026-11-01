# Working on FleetOs

## Before any push
1. Run `git fetch origin`, then say which commit is the latest on `main`.
2. Run `npm run guard`. If it fails, fix the cause. Never bypass it with `--no-verify`.
3. Check open pull requests for overlapping files and migrations.

## Merging
- All work reaches `main` through a pull request, one at a time, oldest ready PR first.
- After each merge, every other open branch merges the new `main` and re-runs its checks.
- Never force-push a shared branch or rewrite commits others may be using.

## Migrations
- Never edit a migration that is already on `main`. Add a new file.
- Each new version must be later than the newest on `main`, and no two files may share a version.
- Apply migrations before deploying code that needs them.

## Writing PRs
Use `.github/pull_request_template.md`. `docs/PR_PREPARATION_PROMPT.md` has the rules for keeping upstream behaviour.
