# DESIGN.md — dsh-plugin-notify

## Product / Purpose
- Purpose: multi-layer notification system for DeepSeek Harness: Web Audio pentatonic chimes, cross-session in-app screen toasts, native OS/desktop push notifications (Windows, macOS, Linux, DSH Desktop), and remote IM webhooks (Feishu, WeCom, DingTalk, Slack, Discord, custom).
- Audience: DeepSeek Harness operators who work across multiple sessions, run background tasks, or want remote IM alerts without storing webhook secrets in plugin settings.
- Status: public package `@goodandready/dsh-plugin-notify` 0.3.5, npm & GitHub.

## User Surfaces
- Web/UI:
  - Settings card on `settings.plugin.item` (`@goodandready-private/dsh-plugin-notify`).
  - In-app floating toast banners overlaying active/background sessions with "Go to session" navigation button.
  - Native OS / Desktop push notifications via HTML5 `Notification API`.
- DSH UI / settings / slots: Settings → Plugins → Notify card (`settings.plugin.item`). Fallback `settings.section` is removed to prevent root settings card duplication.
- API: Real-time SSE event stream `GET /dsh-plugin-notify/events` registered on Cordis `webServer` service. Outbound webhook POSTs.
- CLI: none.
- Documentation: `README.md`, `README.zh.md`, `README.ru.md`, `CHANGELOG.md`. Internal Gitea-only: `AGENTS.md`, `index.md`, `docs/design/DESIGN.md`, `docs/testing/`, `docs/deployment/`.

## Visual Direction
- Atmosphere: native DSH settings card and unobtrusive floating notification overlays, not a separate app.
- Approved references: core DSH cards (Console, Agent loop), native DSH modal and toast styles.
- Do not copy: third-party messenger branding, hardcoded dark-theme colors, jarring alarm sounds.

## Foundations
- Colors: DSH theme variables only (`--dsw-alias-*`).
- Typography: card title 15px/600, subtitle 13px, fields 13px, toast title 13px/600, toast body 12px.
- Layout: 12px radius, header padding 14x16, collapsed by default. Toasts positioned at top-right with 12px margin and auto-dismiss after 7 seconds.
- Audio: gentle pentatonic double-chimes synthesized at runtime via Web Audio API (`AudioContext`) with sinusoidal oscillator and exponential gain ramp decay.
- Accessibility: header is a button with `aria-expanded`; fields have labels; errors are text, not color-only; toasts have accessible close and action buttons.

## Components And States
- Card states: loading / unavailable / ready; save success / per-field errors.
- Notification permission state indicator: `granted` (green), `denied` (red), `default` (clickable "Request permission" button).
- Interactive test triggers: "Test sound", "Test toast".
- Channels empty = disabled.
- Dynamic `<style>` must set `data-dsh-plugin="dsh-plugin-notify"` before insert.
- Classes use the `pn-` prefix.

## User Flows
- First run: card collapsed; user enables desired channels (Sound, Toasts, Desktop push, IM webhooks).
- Desktop notifications require one-click browser permission grant.
- Save writes every field and reports named failures instead of stopping at the first error.
- Event dispatch: when `turn/end` or `approval/asked` occurs, host broadcasts to SSE stream and fires configured IM webhooks.
- Connected client receives SSE payload and conditionally triggers chime, toast banner, and desktop notification based on `notifyBackgroundOnly` and active session filter.
- User clicks "Go to session" in toast or native notification to immediately navigate to the relevant session.

## Do / Don't
- Do: keep webhook URLs in Credentials; settings hold names only.
- Do: register `en` and `zh` only; Russian UI comes from `dsh-russian-lang`.
- Do: synthesize audio with Web Audio API; avoid external media assets.
- Don't: paste webhook URLs into settings or README examples.
- Don't: re-introduce `settings.section` slot registration.
- Don't: embed version release changelogs in READMEs; use `CHANGELOG.md`.

## Locked Design Decisions
- 2026-09-05 — Private package scope `@goodandready-private`; reason: existing published identity; revisit only with an explicit package-identity migration.
- 2026-09-05 — Credential refs for webhook URLs; reason: secrets must not live in settings.
- 2026-09-05 — Settings card uses `settings.plugin.item`.
- 2026-09-16 — Runtime sources live in `lib/`, not `dist/`; there is no TypeScript build. Revisit only if a real compile step is introduced.
- 2026-09-16 — `AGENTS.md` and `index.md` stay tracked in Gitea and are excluded from npm / GitHub publication artifacts. Revisit if a sanitized GitHub source tree is introduced.
- 2026-09-16 — Product README exists in English, Chinese, and Russian; Russian is documentation only, not plugin UI.
- 2026-09-16 — Release 0.2.5 is the private GitHub Packages successor to already-published 0.2.4; reason: hygiene block cannot reuse an immutable published version.
- 2026-09-18 — Settings card registers exclusively on `settings.plugin.item`; reason: `settings.section` fallback caused the card to be rendered twice in root Settings (Issue #16).
- 2026-09-18 — Audio chimes synthesized via browser Web Audio API (`AudioContext`); reason: zero external audio assets, instant playback, zero network overhead.
- 2026-09-18 — Cross-session toasts styled with DSH CSS variables (`--dsw-alias-*`) and interactive session switcher button (`navigateToSession`); reason: enables fast workflow resumption when working across multiple sessions without leaving the browser tab.
- 2026-09-18 — Native OS push notifications via HTML5 `Notification API`; reason: reaches operator when DSH is minimized or in background, with window focus on click.
- 2026-09-18 — Version history centralized into `CHANGELOG.md`; reason: keep READMEs concise and maintain a single standard source of truth for release notes (Issue #17).
- 2026-09-18 — Audio, toasts, and desktop push channels are opt-in (`default(false)`); reason: prevent unsolicited chimes or unexpected browser permission dialogs (Issue #20).
- 2026-09-18 — Fail-closed origin check on `GET /dsh-plugin-notify/events`; reason: adhere to family standard verifying `sec-fetch-site`, origin/host match, or loopback (Issue #21).
- 2026-09-18 — Server-side logging strictly through `ctx.logger`; reason: prevent stdout pollution and integrate with DSH diagnostic log collectors (Issue #22).
- 2026-09-18 — `@deepseek-ai/schemastery` declared in `peerDependencies`; reason: core DSH runtime provides schemastery and prevents version drift across plugins (Issue #23).

- 2026-09-24 — Client monolithic bundle exception (>600 lines): according to DSH core ModuleLoader architecture (`window.__ModuleLoader__.load`), the client UI of the plugin is delivered as a single self-contained browser JavaScript bundle without browser filesystem imports. This architecture decision is a conscious design exception from the 600-line limit (mirroring `dsh-messenger-gateway#73`).
