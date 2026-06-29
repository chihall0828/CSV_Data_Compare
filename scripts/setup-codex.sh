#!/usr/bin/env bash
set -euo pipefail

echo "== CSV Data Compare: Codex setup =="

# Move to repository root
cd "$(dirname "$0")/.."

echo "== Environment =="
node --version || true
npm --version || true
git --version || true

echo "== Install dependencies =="
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "== Validate source tree =="
test -f package.json
test -f index.html
test -d src
test -d scripts

echo "== Build =="
npm run build

echo "== Run validation =="
if [ -f scripts/validate-real-data.mjs ]; then
  node scripts/validate-real-data.mjs
fi

if [ -f scripts/validate-excel-and-calculation.mjs ]; then
  node scripts/validate-excel-and-calculation.mjs
fi

echo "== Setup complete =="
