# dsh-plugin-notify

DSH notifications for completed, failed, and approval-waiting sessions. The
package is private and published as `@goodandready-private/dsh-plugin-notify`.

- DEV: `/mnt/external/Project/DEV/dhsplugins/dsh-plugin-notify`
- OPT: not applicable; production installs the immutable GitHub Packages version in the DSH web profile.
- Entry point: `dist/index.js`; bundle patch: `cordis.patch.yml`.
- Tests: `npm install --no-package-lock --ignore-scripts`, then `npm test`.
- Deployment: publish the tagged package and install the exact version in the profile; see `docs/deployment/private-release.md`.
- Testing details: `docs/testing/notification.md`.

Last verified: 27.08.2026 on MiniAI and isolated MiniPC DSH test profile.
