#!/usr/bin/env bash
set -euo pipefail

echo "== CSV Data Compare: Codex cleanup =="

cd "$(dirname "$0")/.."

codex_root="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"

find_git() {
  if command -v git >/dev/null 2>&1; then
    command -v git
    return 0
  fi

  local candidate
  for candidate in "$codex_root/native/git/cmd/git.exe" "$codex_root/native/git/bin/git.exe"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

GIT_BIN="$(find_git || true)"

echo "== Remove temporary files =="
rm -rf .vite
rm -rf .cache
rm -rf tmp
rm -rf temp
rm -rf coverage

find . -name "*.log" -type f -delete
find . -name ".DS_Store" -type f -delete
find . -name "Thumbs.db" -type f -delete

echo "== Keep important release artifacts =="
echo "Keeping:"
echo "- release/CSVDataCompare"
echo "- release/CSVDataCompare-portable.zip"

echo "== Check ignored local folders =="
if [ -d node_modules ]; then
  echo "node_modules exists locally. It should remain ignored by git."
fi

if [ -d dist ]; then
  echo "dist exists locally. It should remain ignored by git."
fi

echo "== Git status =="
if [ -n "$GIT_BIN" ]; then
  "$GIT_BIN" status --short
else
  echo "git was not found; skipping git status." >&2
fi

echo "== Cleanup complete =="
