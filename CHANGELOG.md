# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-09-18

### Added
- **Web Audio Chimes (`enableSound`)**:
  - Synthesized dual-tone pentatonic chimes using Web Audio API (`AudioContext`) without external audio files or network requests (`lib/client.js`).
  - Distinct pleasant sound signatures for `task_done`, `error`, and `approval_requested`.
  - Added "Test sound" action button in the plugin settings card.
- **Cross-Session In-App Screen Toasts (`enableToasts`)**:
  - Light-weight native toast banner overlay styled with DSH design variables (`--dsw-alias-*`, `data-dsh-plugin="dsh-plugin-notify"`).
  - Shows event title, session ID, and summary across active and background sessions.
  - Interactive "Go to session" navigation button to instantly switch to the target session.
  - Auto-dismisses after 7 seconds or manual close.
  - Added "Test toast" action button in settings.
- **Native OS / Desktop Notifications (`enableDesktopNotifications`)**:
  - Integrates with HTML5 `Notification API` for system tray / desktop push notifications (Windows, macOS, Linux, and DSH Desktop app).
  - Includes permission request button in the settings card with live state indicators (`granted`, `denied`, `default`).
  - Clicking on the native notification focuses the DSH window and switches to the affected session.
- **Server-Sent Events (SSE) Event Stream (`GET /dsh-plugin-notify/events`)**:
  - Live broadcast endpoint mounted on Cordis `webServer` service (`lib/index.js`).
  - Real-time client listener in `lib/client.js` with exponential backoff auto-reconnect.
  - Configurable `notifyBackgroundOnly` filter to suppress notifications if the event occurred in the currently active session.

### Fixed
- **Settings Card Duplication (#16)**:
  - Removed fallback registration to `settings.section` slot in `lib/client.js`, retaining only `settings.plugin.item`.
  - Prevents the notify settings card from rendering twice (in root Settings and inside Plugins).

### Changed
- **Documentation Hygiene (#17)**:
  - Removed `Changed in vX.Y.Z` sections from `README.md`, `README.ru.md`, and `README.zh.md`, centralizing all version release history into `CHANGELOG.md`.
  - Registered `CHANGELOG.md` in `package.json` distribution files list.

## [0.2.5] - 2026-09-16

### Changed
- Runtime sources live in `lib/` instead of a misleading `dist/` tree; removed unnecessary TypeScript build config.
- The settings card stylesheet is tagged `data-dsh-plugin="dsh-plugin-notify"` so HMR and neighbor-plugin cleanup preserve card styles.
- Product README provided in English, Chinese, and Russian; internal files (`AGENTS.md`, `index.md`) stay in Gitea and are excluded from npm packaging.

### Added
- Automated unit test suite (`test/notify.test.mjs`) covering IM channel payloads, missing credentials, recipient failures, AbortSignal timeout, and locale reload without `ru` dictionary.

## [0.2.4] - 2026-09-08

### Fixed
- Avoid duplicate Russian locale registration to cleanly coexist with the `dsh-russian-lang` language pack.

### Changed
- Pointed repository and issue tracker URLs to `goodandready-private` organization.

## [0.2.3] - 2026-09-06

### Added
- Native DSH settings card registered on `settings.plugin.item`.
- Credential references for webhook URLs: secrets stored in DSH Credentials service, settings card stores only credential names.

### Changed
- Standardized MIT license with GooDAnDReaDY copyright.
- Migrated to private package route `@goodandready-private/dsh-plugin-notify`.

## [0.2.2] - 2026-09-05

### Added
- Initial private package routing and credentials-based webhook dispatch for Feishu, WeCom, DingTalk, Slack, Discord, and generic custom webhooks.
