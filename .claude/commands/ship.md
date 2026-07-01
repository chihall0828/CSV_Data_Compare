---
description: Implement a scoped task, validate it, commit it, push a new feature branch, and open a PR
allowed-tools: Read, Bash, Grep, Glob, Edit, MultiEdit, Write
---

You are shipping a scoped change for this repository.

## Core rules

1. Read `AGENTS.md` first.
2. Confirm the current branch and `git status --short`.
3. Run the baseline check before editing:
   - `bash scripts/setup-codex.sh`
4. Implement only the task explicitly described by the user.
5. Do not implement adjacent improvements unless they are required to complete the specified task.
6. Do not modify release artifacts unless the user explicitly asks.
7. Do not modify GitHub Pages workflow unless the user explicitly asks.
8. Do not modify public sample data unless the user explicitly asks.
9. Do not commit `node_modules/`, `dist/`, `.env`, cache files, or logs.
10. Do not force push.
11. Do not push directly to `origin/main`.

## Branch policy

After implementation and validation:

1. If currently on `main`, create a new feature branch from current HEAD.
2. Use a branch name like:
   - `claude/<short-task-name>`
3. Push the new feature branch to origin.
4. Open a Pull Request into `main`.

If already on a feature branch, push that branch only if it is not stale or previously merged.  
If the feature branch is stale or already merged, create a new feature branch instead.

## Required validation

After implementation, run:

```bash
bash scripts/setup-codex.sh
npm run build:web
npm run build:portable
bash scripts/cleanup-codex.sh
git status --short
```

If the task adds a new validation script, run it explicitly too.

## Commit policy

If all validation passes, commit with the user-provided commit message.
If no commit message is provided, create a concise message using this style:

```text
Add <feature name>
Fix <bug name>
Improve <area name>
```

## PR policy

Open a PR into `main`.
The PR description must include:

* Summary
* Validation results
* Files changed
* What was intentionally not changed
* Remaining limitations

## Stop conditions

Stop and report without committing if:

* baseline checks fail before editing
* validation fails after implementation and cannot be fixed safely
* the requested task is ambiguous enough that multiple incompatible implementations are possible
* the change requires destructive git operations
* the change requires secrets, credentials, or browser-only GitHub settings

## Final report format

```text
Ship report

1. Task
- ...

2. Branch
- ...

3. Implementation summary
- ...

4. Files changed
- ...

5. Validation
- setup-codex:
- build:web:
- build:portable:
- additional validation:
- cleanup:

6. Commit
- hash:
- message:

7. Push
- branch:
- remote:

8. Pull Request
- number:
- URL:

9. Not changed
- ...

10. Remaining limitations
- ...
```
