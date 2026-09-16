# dsh-plugin-notify

DSH notifications for completed, failed, and approval-waiting sessions. The
package is private and published as `@goodandready-private/dsh-plugin-notify`.

- DEV: `/mnt/external/Project/DEV/dhsplugins/dsh-plugin-notify`
- OPT: not applicable; production installs the immutable GitHub Packages version in the DSH web profile.
- Entry point: `lib/index.js`; client: `lib/client.js`; bundle patch: `cordis.patch.yml`.
- Tests: `npm install --no-audit --no-fund --no-package-lock`, then `npm test`.
- Documentation: `README.md` (en), `README.zh.md`, `README.ru.md`.
- Deployment: publish the tagged package to GitHub Packages and install the exact version in the profile; see `docs/deployment/private-release.md` and `deploy.sh`.
- Testing details: `docs/testing/notification.md`.

Last verified: 16.09.2026 on MiniAI worktree `chore/dsh-plugin-notify-audit-hygiene` by `npm test`.
