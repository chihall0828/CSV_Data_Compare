#!/usr/bin/env bash
set -euo pipefail

echo "== CSV Data Compare: Codex cleanup =="

cd "$(dirname "$0")/.."

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
git status --short

echo "== Cleanup complete =="
