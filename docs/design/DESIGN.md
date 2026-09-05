# DESIGN — dsh-plugin-notify

## Purpose
Push turn-completion / error / approval notifications to IM webhooks and optional local macOS notifications.

## Package identity
- npm / cordis / client loader id: `@goodandready-private/dsh-plugin-notify`
- cordis short id in patch: `plugin-notify`
- Host `export const name` must equal the package name (private scope).

## User Surfaces
- Settings → Plugins → **Notify** card (`settings.plugin.item`, namespace = package name).
- Fallback: `settings.section` when the plugin-item slot is missing.

## Configuration
Non-secret fields live in plugin settings (events, DND, local, timeouts, exclude prefixes).
Webhook **URLs** are secrets: store under Credentials; settings hold only credential **names** under `webhooks.*`.

Legacy: a raw `http(s)://…` value in `webhooks.*` still works with a deprecation warning.

## Components And States
Card states: loading / unavailable / ready; save success / per-field errors.
Channels empty = disabled.

## Locked Design Decisions
- Private package scope `@goodandready-private` (confirmed).
- Credential refs for webhook URLs (2026-09-05).
- Settings card uses `settings.plugin.item` (2026-09-05).
