#!/usr/bin/env bash
set -euo pipefail

echo "== CSV Data Compare: Codex setup =="

# Move to repository root
cd "$(dirname "$0")/.."

codex_root="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"

find_tool() {
  local name="$1"
  shift
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi

  local candidate
  for candidate in "$@"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

NODE_BIN="$(find_tool node "$codex_root/node/bin/node.exe" "$codex_root/node/bin/node" || true)"
NPM_BIN="$(find_tool npm "$codex_root/node/bin/npm.cmd" "$codex_root/node/bin/npm" || true)"
PNPM_BIN="$(find_tool pnpm "$codex_root/bin/pnpm.cmd" "$codex_root/bin/pnpm" || true)"
GIT_BIN="$(find_tool git "$codex_root/native/git/cmd/git.exe" "$codex_root/native/git/bin/git.exe" || true)"

run_node() {
  if [ -z "$NODE_BIN" ]; then
    echo "Node.js was not found. Install Node.js or run in a Codex environment with bundled Node." >&2
    return 1
  fi
  "$NODE_BIN" "$@"
}

run_build() {
  if [ -n "$NPM_BIN" ]; then
    "$NPM_BIN" run build
  elif [ -f node_modules/vite/bin/vite.js ]; then
    run_node node_modules/vite/bin/vite.js build
  elif [ -n "$PNPM_BIN" ]; then
    "$PNPM_BIN" run build
  else
    echo "No npm/pnpm or local Vite CLI was found for build." >&2
    return 1
  fi
}

echo "== Environment =="
if [ -n "$NODE_BIN" ]; then "$NODE_BIN" --version; else echo "node: not found"; fi
if [ -n "$NPM_BIN" ]; then "$NPM_BIN" --version; else echo "npm: not found"; fi
if [ -n "$PNPM_BIN" ]; then "$PNPM_BIN" --version; else echo "pnpm: not found"; fi
if [ -n "$GIT_BIN" ]; then "$GIT_BIN" --version; else echo "git: not found"; fi

echo "== Install dependencies =="
if [ -n "$NPM_BIN" ] && [ -f package-lock.json ]; then
  "$NPM_BIN" ci
elif [ -n "$NPM_BIN" ]; then
  "$NPM_BIN" install
elif [ -d node_modules ]; then
  echo "npm is unavailable; using existing node_modules."
elif [ -n "$PNPM_BIN" ]; then
  "$PNPM_BIN" install --no-frozen-lockfile
else
  echo "No package manager is available and node_modules is missing." >&2
  exit 1
fi

echo "== Validate source tree =="
test -f package.json
test -f index.html
test -d src
test -d scripts

echo "== Build =="
run_build

echo "== Run validation =="
if [ -f scripts/validate-real-data.mjs ]; then
  run_node scripts/validate-real-data.mjs
fi

if [ -f scripts/validate-excel-and-calculation.mjs ]; then
  run_node scripts/validate-excel-and-calculation.mjs
fi

if [ -f scripts/validate-statistics.mjs ]; then
  run_node scripts/validate-statistics.mjs
fi

echo "== Setup complete =="
