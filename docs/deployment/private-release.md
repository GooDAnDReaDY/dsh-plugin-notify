# Private package release

The source of truth is the canonical Gitea repository. A release is created
from merged `main`, tagged with the current `package.json` version, published
to GitHub Packages, mirrored to the private GitHub repository when the owner
explicitly asks to publish, and then installed by exact version in the DSH
web profile.

Production must never refer to a DEV path, worktree, or local package artifact.

## What stays in Gitea

These files are required or useful for agents and must remain tracked:

- `AGENTS.md`
- `index.md`
- `deploy.sh`
- `docs/design/DESIGN.md`
- `docs/testing/`
- `docs/deployment/`

They are **not** npm package contents. `package.json` `files` is the allowlist.
`.gitattributes` marks the internal files `export-ignore` for `git archive`.

## What must not appear on GitHub/npm

`AGENTS.md` and `index.md` are forbidden in GitHub source publication and npm
tarballs. `docs/testing` and `docs/deployment` are internal runbooks, not
product README. `DESIGN.md` stays in Gitea and is not packed into npm.

If a future GitHub mirror would copy the full Gitea tree, use the sanitized
publication flow instead of untracking the files from Gitea.

## History scan (2026-09-16)

Tracked product files (`lib/`, README*, `cordis.patch.yml`, `package.json`)
use placeholder credential names and `example.test` hosts in tests. No
webhook URL, token, or lab IP is stored in runtime code.
