// Checks a branch against the latest main before it is pushed or merged. Run by the pre-push
// hook and by CI: `npm run guard`. It reads git only and changes nothing except fetching.
// Pass --no-fetch when the refs are already current (CI), and --base=<ref> to compare elsewhere.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const baseRef = args.find(a => a.startsWith('--base='))?.slice(7) ?? 'origin/main';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const lines = (text) => text.split('\n').filter(Boolean);

if (!args.includes('--no-fetch')) git('fetch', '--quiet', 'origin', 'main');

const branch = process.env.GITHUB_HEAD_REF || git('rev-parse', '--abbrev-ref', 'HEAD');
const problems = [];

console.log(`Latest main: ${git('log', '-1', '--format=%h %ad %s', '--date=short', baseRef)}`);
console.log(`This branch: ${branch} at ${git('log', '-1', '--format=%h %s')}`);

if (branch === 'main') problems.push('Do not push to main. Open a pull request.');

// Everything merges in one order: a branch must contain the latest main before it goes in.
const behind = Number(git('rev-list', '--count', `HEAD..${baseRef}`));
if (behind > 0) problems.push(`${behind} commit(s) behind main. Run: git fetch origin && git merge origin/main`);

// Vercel refuses to deploy commits from an address no GitHub account owns.
const authors = new Set(lines(git('log', '--format=%ae', `${baseRef}..HEAD`)));
for (const email of authors) {
  if (email.endsWith('.local')) problems.push(`Commit author ${email} isn't linked to GitHub. Fix: git config user.email <your GitHub email>`);
}

// Migrations are one ordered list. A shared version number means one of them is silently skipped.
const migrationDir = 'supabase/migrations';
const versionOf = (file) => file.split('/').pop().split('_')[0];
const onMain = lines(git('ls-tree', '-r', '--name-only', baseRef, `${migrationDir}/`));
const here = lines(git('ls-files', `${migrationDir}/`));
const seen = new Map();
for (const file of here) {
  const version = versionOf(file);
  if (seen.has(version)) problems.push(`Two migrations share version ${version}: ${seen.get(version)} and ${file}`);
  seen.set(version, file);
}

const newestOnMain = onMain.map(versionOf).sort().at(-1);
const added = here.filter(file => !onMain.includes(file));
for (const file of added) {
  if (versionOf(file) <= newestOnMain) problems.push(`${file} must be timestamped after ${newestOnMain}, the newest migration on main.`);
}

// Applied migrations are history. Changes go in a new file.
const changed = lines(git('diff', '--name-only', '--diff-filter=MDR', `${baseRef}...HEAD`, '--', `${migrationDir}/`));
for (const file of changed) problems.push(`${file} is already on main. Add a new migration instead of changing it.`);

if (problems.length) {
  console.error(`\nNot ready to merge:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(added.length ? `\nReady. New migrations, in order:\n${added.map(f => `  - ${f}`).join('\n')}` : '\nReady.');
