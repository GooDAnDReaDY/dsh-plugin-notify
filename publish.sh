#!/usr/bin/env bash
# publish.sh — publication layer for GitHub
# Sanitized public tree assembled from verified main without internal documents
# (AGENTS.md, index.md, docs/, .gitea, deploy.sh, publish.sh).

set -euo pipefail

MODE="${1:-}"
REF="${2:-origin/main}"
VERSION="${3:-}"

GITHUB_URL="https://github.com/GooDAnDReaDY/dsh-plugin-notify.git"
GITHUB_BRANCH="main"

EXCLUDED_PATHS=(
  "AGENTS.md"
  "index.md"
  "deploy.sh"
  "publish.sh"
  "docs"
  ".gitea"
  ".planning"
  ".worktrees"
)

REQUIRED_PATHS=(
  "package.json"
  "lib/index.js"
  "lib/client.js"
  "cordis.patch.yml"
  "README.md"
  "README.zh.md"
  "README.ru.md"
  "CHANGELOG.md"
  "LICENSE"
  "test/notify.test.mjs"
)

fail() { echo "ERROR: $*" >&2; exit 1; }

build_public_tree() {
  local ref="$1"
  local temp_dir index_file tree git_dir
  git_dir="$(git rev-parse --git-dir)"
  temp_dir="$(mktemp -d)"
  index_file="$(mktemp)"
  rm -f "$index_file"

  # Export strictly via git archive honoring .gitattributes export-ignore
  git archive "$ref" | tar -x -C "$temp_dir" || fail "git archive failed for $ref"

  # Double guard: explicitly ensure excluded paths are purged if any slipped through
  for path in "${EXCLUDED_PATHS[@]}"; do
    rm -rf "$temp_dir/$path"
  done

  # Build temporary index and write tree
  export GIT_INDEX_FILE="$index_file"
  export GIT_WORK_TREE="$temp_dir"
  git --work-tree="$temp_dir" --git-dir="$git_dir" add -A || fail "cannot index exported tree"
  tree="$(git --work-tree="$temp_dir" --git-dir="$git_dir" write-tree)" || fail "cannot write the public tree"

  unset GIT_INDEX_FILE
  unset GIT_WORK_TREE
  rm -rf "$temp_dir" "$index_file"
  printf "%s" "$tree"
}

verify_tree() {
  local tree="$1"
  local list
  list="$(git ls-tree -r --name-only "$tree")"

  local path
  for path in "${EXCLUDED_PATHS[@]}"; do
    if printf "%s\n" "$list" | grep -qx "$path" || printf "%s\n" "$list" | grep -q "^$path/"; then
      fail "excluded path is present in the public tree: $path"
    fi
  done
  for path in "${REQUIRED_PATHS[@]}"; do
    printf "%s\n" "$list" | grep -qx "$path" || fail "required file is missing from the public tree: $path"
  done

  printf "%s\n" "$list" | sort
}

case "$MODE" in
  plan)
    tree="$(build_public_tree "$REF")"
    echo "public tree for $REF (object $tree):"
    verify_tree "$tree" >/dev/null
    git ls-tree -r --name-only "$tree" | sort
    echo "plan: OK — no service files, all required product files present"
    ;;

  publish)
    [ "${DSH_NOTIFY_PUBLISH:-}" = "yes" ] || fail "publication requires explicit owner approval: run with DSH_NOTIFY_PUBLISH=yes"
    [ -n "$VERSION" ] || fail "usage: DSH_NOTIFY_PUBLISH=yes bash publish.sh publish <ref> <version>"
    command -v gh >/dev/null 2>&1 || fail "gh CLI not found in PATH"

    tree="$(build_public_tree "$REF")"
    echo "public tree for $REF (object $tree):"
    verify_tree "$tree" >/dev/null
    git ls-tree -r --name-only "$tree" | sort
    echo "verification: no service files, all required product files present"

    public_main=""
    if git -c credential.helper="!gh auth git-credential" fetch "$GITHUB_URL" "$GITHUB_BRANCH" >/dev/null 2>&1; then
      public_main="$(git rev-parse FETCH_HEAD 2>/dev/null || true)"
    fi

    if [ -n "$public_main" ]; then
      echo "public $GITHUB_BRANCH is $public_main"
      commit="$(git commit-tree "$tree" -p "$public_main" -m "release: publish v$VERSION

Public tree for v$VERSION: product files from verified main without
internal documents (AGENTS.md, index.md, docs, .gitea).")"
    else
      echo "initializing public $GITHUB_BRANCH"
      commit="$(git commit-tree "$tree" -m "release: publish v$VERSION

Public tree for v$VERSION: product files from verified main without
internal documents (AGENTS.md, index.md, docs, .gitea).")"
    fi
    echo "publication commit $commit"

    git -c credential.helper="!gh auth git-credential" push "$GITHUB_URL" "$commit:refs/heads/$GITHUB_BRANCH" \
      || fail "push of the publication commit failed"
    git tag -f -a "v$VERSION" "$commit" -m "v$VERSION — public release tree"
    git -c credential.helper="!gh auth git-credential" push "$GITHUB_URL" "refs/tags/v$VERSION" \
      || fail "push of the release tag failed"
    echo "published: $GITHUB_URL branch $GITHUB_BRANCH and tag v$VERSION -> $commit"
    ;;

  *)
    fail "usage: bash publish.sh plan [ref] | DSH_NOTIFY_PUBLISH=yes bash publish.sh publish <ref> <version>"
    ;;
esac
