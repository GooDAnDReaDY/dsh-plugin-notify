#!/usr/bin/env bash
# Private DSH plugin: there is no OPT git checkout.
# After an explicit owner OK, install the exact GitHub Packages version
# into the target DSH profile. This script only prints the verified
# contract; it does not mutate production by itself.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
NAME="$(node -p "require('$ROOT/package.json').name")"
VERSION="$(node -p "require('$ROOT/package.json').version")"

cat <<EOF
Target: DSH web profile package install (not an OPT git pull)
Package: ${NAME}@${VERSION}
Registry: GitHub Packages (see package.json publishConfig)
Pre-checks:
  - npm test
  - npm pack --dry-run --json (no AGENTS.md / index.md / docs)
  - isolated MiniPC test-server cycle
Production action (only after explicit owner OK):
  dsh plugin --profile web add ${NAME}@${VERSION}
Post-checks:
  - installed version equals ${VERSION}
  - settings card loads
  - dsh-lanmode remains installed
EOF
