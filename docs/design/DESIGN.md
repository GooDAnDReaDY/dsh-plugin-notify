# DESIGN.md — dsh-plugin-notify

## Product / Purpose
- Purpose: push turn-completion, error, and approval-waiting notifications to IM webhooks, with an optional local macOS notification.
- Audience: DeepSeek Harness operators who want remote IM alerts without storing webhook URLs in plugin settings.
- Status: private package `@goodandready-private/dsh-plugin-notify` 0.2.4, GitHub Packages.

## User Surfaces
- Web/UI: none beyond DSH settings.
- DSH UI / settings / slots: Settings → Plugins → Notify card (`settings.plugin.item`, namespace = package name). Fallback: `settings.section` when the plugin-item slot is missing.
- API: none. Outbound webhook POSTs only.
- CLI: none.
- Documentation: `README.md`, `README.zh.md`, `README.ru.md`. Internal Gitea-only: `AGENTS.md`, `index.md`, `docs/design/DESIGN.md`, `docs/testing/`, `docs/deployment/`.

## Visual Direction
- Atmosphere: native DSH settings card, not a separate app.
- Approved references: core DSH cards (Console, Agent loop).
- Do not copy: third-party messenger branding, hardcoded dark-theme colors.

## Foundations
- Colors: DSH theme variables only (`--dsw-alias-*`).
- Typography: card title 15px/600, subtitle 13px, fields 13px.
- Layout: 12px radius, header padding 14x16, collapsed by default.
- Accessibility: header is a button with `aria-expanded`; fields have labels; errors are text, not color-only.

## Components And States
- Card states: loading / unavailable / ready; save success / per-field errors.
- Channels empty = disabled.
- Dynamic `<style>` must set `data-dsh-plugin="dsh-plugin-notify"` before insert.
- Classes use the `pn-` prefix.

## User Flows
- First run: card collapsed; user stores webhook URLs in Credentials, then types only credential names in the card.
- Save writes every field and reports named failures instead of stopping at the first error.
- Session events `turn/end` and `approval/asked` dispatch notifications unless DND or an excluded session prefix matches.

## Do / Don't
- Do: keep webhook URLs in Credentials; settings hold names only.
- Do: register `en` and `zh` only; Russian UI comes from `dsh-russian-lang`.
- Don't: paste webhook URLs into settings or README examples.
- Don't: add a top-level settings section unless the owner asks.

## Locked Design Decisions
- 2026-09-05 — Private package scope `@goodandready-private`; reason: existing published identity; revisit only with an explicit package-identity migration.
- 2026-09-05 — Credential refs for webhook URLs; reason: secrets must not live in settings.
- 2026-09-05 — Settings card uses `settings.plugin.item`.
- 2026-09-16 — Runtime sources live in `lib/`, not `dist/`; there is no TypeScript build. Revisit only if a real compile step is introduced.
- 2026-09-16 — `AGENTS.md` and `index.md` stay tracked in Gitea and are excluded from npm / GitHub publication artifacts. Revisit if a sanitized GitHub source tree is introduced.
- 2026-09-16 — Product README exists in English, Chinese, and Russian; Russian is documentation only, not plugin UI.
