---
name: potatoflow
description: Operate the privacy-first PotatoFlow personal execution system. Convert the current user's conversations, documents, goals, constraints, exports, and execution reports into validated project JSON, safe merge updates, realistic schedules, recurring-task rules, issue analyses, reviews, and recovery guidance. Use when the user wants to create, revise, import, schedule, review, troubleshoot, back up, restore, or deeply use a PotatoFlow project.
---

# PotatoFlow

Create and update plans for the single-user PotatoFlow execution system.

## Non-negotiable rules

1. Start from the current user's information. Never reuse another person's project, brand, inventory, task, date, path, account name, or example as user data.
2. Treat every bundled example as fictional structure only. Replace all example values before producing an import payload.
3. Keep unknown information blank or label it as an assumption. Do not invent personal facts.
4. Exclude secrets, customer-confidential material, credentials, private contacts, and unrelated projects.
5. Preserve `objective -> milestone -> task -> execution record -> review`.
6. Derive completion from checked execution steps and acceptance criteria. Do not create a manual completed/incomplete/pending field.
7. Treat pause as independent from completion. Use `paused` only when the user explicitly pauses a task.
8. Preview bulk creation, destructive replacement, or major rescheduling before asking the user to import it.
9. Use the user's timezone and stated availability. Ask only when missing information would materially change the schedule.
10. Treat IDs and revision numbers as data-integrity controls. Never regenerate existing IDs or guess
    around a revision conflict.
11. Omission is not deletion. Remove an existing task only through `deleted_task_ids` after the user
    explicitly confirms the named tasks.

## First-use onboarding

For a new user or a blank installation, read [onboarding.md](references/onboarding.md). Guide the
user through short interview rounds, generate a plain-language project brief for confirmation,
then create the import JSON. Do not ask the user to understand the schema or preload any tasks.

## Choose one operation

Read [operations.md](references/operations.md) and choose the smallest operation that satisfies the request:

- create a new project;
- merge-update an existing project;
- add or reschedule tasks;
- analyze a task problem;
- run a daily or weekly review;
- explain export, backup, restore, or migration.

For planning logic read [workflows.md](references/workflows.md). For every import payload read
[data-contract.md](references/data-contract.md). Before handing off JSON, apply
[quality-checklist.md](references/quality-checklist.md).

## Web-app exchange procedure

1. Ask the user to export only the necessary scope: current task, current project, or full backup.
2. Read only that scope and identify facts, constraints, open issues, and existing IDs.
3. Show a concise preview when multiple tasks or dates will change.
4. Output one valid UTF-8 JSON object with no Markdown comments.
5. Tell the user whether to choose “新建项目” or “合并更新已有项目”.
6. Tell the user to click “检查变更” and review additions, edits, retained tasks, deletions, and
   conflicts before confirming.
7. Never claim the browser data changed merely because JSON was generated.
8. A full backup is a different envelope from a project import. Never tell the user to paste a
   full backup into the project-import tab.

## Project creation procedure

1. Extract objective, observable success criteria, background, constraints, assumptions, and execution guidance.
2. Ask whether source files are needed during execution. If yes, confirm whether all tasks share
   the same files or each task uses different files; encode roles and relationships without file
   bytes or private local paths.
3. Build outcome-based milestones.
4. Detail near-term tasks; keep later work coarse unless the user requests full scheduling.
5. Give every task an outcome, reason, steps, acceptance criteria, estimate, priority, category, and date or recurrence. Ask whether that task needs a note; include only user-provided reminders or context.
6. Keep the daily workload realistic and dependencies explicit.
7. Validate with:

```powershell
python scripts/potatoflow.py validate-plan --input plan.json
```

8. Return the validated payload, source-file mode, and recommended import mode. Explain that the
   actual files are chosen locally in the web app after the change preview.

## Update procedure

1. Require the current-project export unless the complete current state is already in context.
2. Preserve the project ID, project `revision`, and matching task IDs.
3. Preserve execution results, reports, issues, and recurring occurrence history unless the user
   explicitly replaces them.
4. Return `import_metadata.base_project_id` and `base_project_revision` from the export used as the
   source of truth.
5. Include changed and newly created tasks. It is acceptable to omit untouched tasks because the
   app retains them.
6. Put explicitly approved removals in `deleted_task_ids`. Never imply deletion by leaving a task
   out of `tasks`.
7. Keep unchanged step and acceptance-criterion wording exactly the same when its completion
   evidence should remain attached. Rewording creates a new unchecked item while the prior task
   definition is retained in revision history.
8. Summarize additions, edits, reschedules, pauses, explicit deletions, and untouched items before
   emitting JSON.
9. Use “合并更新已有项目”; never silently create a duplicate project.
10. If the export changed after analysis, stop and regenerate from the latest export instead of
    bypassing a stale-revision warning.

## Issue procedure

1. Use the original task context and attempts already made.
2. Do not create an issue for “没有问题” or an ordinary completion report.
3. Return likely cause, uncertainty, smallest next test, exact steps, and success/failure signals.
4. Mark an issue answered after recording analysis; mark it resolved only after user verification.

## Review procedure

1. Use checked steps, acceptance criteria, reports, and unresolved issues as evidence.
2. Separate outcomes, effort, blockers, changed assumptions, and next decisions.
3. Do not punish incomplete work by automatically moving every task.
4. Show schedule changes requiring confirmation, then produce an update payload only if requested.

## Backup and restore

- “当前任务” and “当前项目” exports are context packages for collaboration with Codex.
- “全量备份” is the browser recovery package and replaces all browser data when restored.
- Require the user to type “恢复” in the web app before destructive restore.
- Explain that uploaded Word/PDF file binaries live in IndexedDB and are not embedded in the JSON
  backup; after restore they must be added again.
- Never merge two full backups by guessing. Convert and preview at project scope instead.

## Offline CLI

The bundled standard-library CLI is optional and stores no user data until the user supplies a data path.

```powershell
python scripts/potatoflow.py init --data .potatoflow/data.json
python scripts/potatoflow.py validate-plan --input plan.json
python scripts/potatoflow.py import-plan --input plan.json --data .potatoflow/data.json
python scripts/potatoflow.py today --date 2026-01-15 --data .potatoflow/data.json
python scripts/potatoflow.py context --task-id task-id --data .potatoflow/data.json
python scripts/potatoflow.py review --data .potatoflow/data.json
```

Every command emits JSON. Treat a nonzero exit code as failure.

## Safety

- Require explicit confirmation before deletion or replacing an entire project.
- Prefer merge updates that retain unmatched existing tasks.
- Never ask the user to bypass a conflict merely to finish an import.
- Treat a no-change import as success without writing another copy.
- Do not put execution reports into the issue list unless they contain a real question.
- Keep recurring tasks as one rule with per-date results; never expand months into copied tasks.
- Do not commit `.potatoflow/`, exports, source documents, `.env`, tokens, or user-specific generated plans.
- Package only the skill files; exclude caches and local execution data.
