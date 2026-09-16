# Notification plugin testing

Host tests import `lib/index.js` directly. They cover:

- private package identity across `package.json`, patch, host export, and client loader
- `data-dsh-plugin` on the settings-card stylesheet
- English/Chinese locale registration, coexistence with `dsh-russian-lang`, and reload after effect dispose
- legacy raw webhook URL compatibility
- credential-ref resolution and env fallback
- missing credential (no POST)
- Feishu / WeCom / DingTalk / Slack / Discord / custom body shapes
- recipient failure does not throw in the session loop
- `AbortSignal` is attached to webhook POST
- `excludeSessionPrefixes` suppression

Run:

```sh
npm install --no-audit --no-fund --no-package-lock
npm test
```

Expected: `pretest` syntax-checks `lib/index.js` and `lib/client.js`, then `node --test` reports all tests passing.

Real external IM delivery requires a user-owned webhook and is not part of the
automated suite; the request contract is tested against a stub `fetch` or a
local HTTP receiver.
