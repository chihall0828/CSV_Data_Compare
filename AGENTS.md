# AGENTS.md

## Project

This repository contains CSV Data Compare, a portable Windows-friendly React/Vite app for comparing CSV and Excel data.

## Setup

Run this command from the repository root:

bash scripts/setup-codex.sh

The setup script installs dependencies, builds the app, and runs validation scripts.

## Validation

Before committing changes, run:

npm run build
node scripts/validate-real-data.mjs

If available, also run:

node scripts/validate-excel-and-calculation.mjs

## Cleanup

Before reporting final results, run:

bash scripts/cleanup-codex.sh

## Release artifacts

The following release artifacts are intentionally tracked:

release/CSVDataCompare/
release/CSVDataCompare-portable.zip

Do not delete these unless regenerating them.

When regenerating release artifacts, confirm both the folder version and zip-extracted version work.

## Do not commit

Do not commit:

node_modules/
dist/
.vite/
.cache/
tmp/
temp/
coverage/
*.log
.env
.env.*

## Important rules

- Do not use raw eval for formula calculation.
- Do not modify or delete real sample data unless explicitly instructed.
- Do not hard-code personal absolute paths.
- Keep the app name as CSV Data Compare.
- Preserve existing CSV, Excel, graph style, group split, row filter, PNG export, and portable release functionality.
- If release files are regenerated, verify both release/CSVDataCompare and release/CSVDataCompare-portable.zip.
