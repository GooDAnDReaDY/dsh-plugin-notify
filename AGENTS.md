# dsh-plugin-notify

Private DSH plugin. Package identity `@goodandready-private/dsh-plugin-notify`
must match in `package.json`, `cordis.patch.yml` → `name:`, `lib/index.js`
`export const name`, and `lib/client.js` loader `id`.

## Constraints (MUST NOT)

- Do not put infra paths, IPs, hostnames, webhook URLs, or secrets in the tree or README.
- Do not register a `ru` locale dictionary in this plugin; Russian UI comes from `dsh-russian-lang`.
- Do not use `--force` install modes.
- Do not untrack `AGENTS.md` or `index.md` from Gitea. They are internal files and must not enter npm or a public GitHub tree.
- Do not treat `dist/` as a build output: runtime code is authored in `lib/`.

## Conventions

- Develop only in a Git worktree of Gitea `goodandready/dsh-plugin-notify`.
- Git identity: the assigned `git-<agent>` wrapper. Bare `git` is not used for project commits.
- Settings card: `settings.plugin.item`, namespace = package name.
- Dynamic styles must set `data-dsh-plugin="dsh-plugin-notify"`.
- Source language is English. User-facing strings go through `en` + `zh` locale maps.

## Test matrix

- `npm install --no-audit --no-fund --no-package-lock`
- `npm test` — `pretest` syntax-checks `lib/*.js`, then `node --test test/*.test.mjs`
- `npm pack --dry-run --json` — npm allowlist and 256 KiB file-size gate
- Isolated DSH test profile on MiniPC before any production candidate

## Layout

- `lib/index.js` — host apply, Config, webhook dispatch
- `lib/client.js` — settings card
- `docs/design/DESIGN.md` — UX contract
- `docs/testing/notification.md` — test notes
- `docs/deployment/private-release.md` — private publication notes
