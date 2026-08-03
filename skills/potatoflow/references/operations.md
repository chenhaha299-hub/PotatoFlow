# PotatoFlow operation router

Choose one primary operation before asking questions or generating JSON.

## 1. Create a new project

Use when no existing project state must be preserved.

Required input:

- intended outcome;
- observable success criteria;
- important resources and constraints;
- whether source files exist and, if so, whether they are shared or mapped per task;
- timezone and usable time when scheduling matters.

Follow `onboarding.md`. Return a project brief first and JSON only after confirmation. Recommend
“新建项目”.

## 2. Merge-update an existing project

Use when the user wants to add, edit, remove, pause, reschedule, or restructure existing work.

Required input:

- current-project export from PotatoFlow;
- requested change;
- any new evidence or constraints.

Preserve project and task IDs and copy the export's project revision into
`import_metadata.base_project_revision`. State what remains unchanged. Return a project payload and
recommend “合并更新已有项目”. Omitted tasks remain unchanged. Put a task ID in
`deleted_task_ids` only after explicit confirmation. Deletion or broad replacement requires
explicit confirmation.

Before returning the payload, classify every existing task as one of:

- update: same stable ID, changed definition or schedule;
- retain: omitted or included without changes;
- delete: explicitly confirmed and listed in `deleted_task_ids`;
- conflict: ID/title/revision cannot be resolved safely.

If the same export has already been updated during the conversation, request a fresh export before
producing another update.

## 3. Add or reschedule tasks

Use the same merge-update path. For each proposed task specify its result, reason, steps,
acceptance criteria, estimate, priority, category, dependencies, and date or recurrence.

For recurrence:

- `daily`: every calendar day;
- `weekdays`: Monday through Friday;
- `weekends`: Saturday and Sunday;
- a date range uses `scheduled_date` and `end_date`;
- a one-time task uses no recurrence.

Do not copy recurring tasks by date. Keep one stable task ID.

For every added or rescheduled task, ask whether the user wants an optional task note. Preserve an
existing note when it is omitted from an update; clear it only when the user explicitly requests
that change.

## 4. Analyze an execution problem

Request a current-task export, not a full backup. Distinguish:

- result report: evidence of work, saved once at task level;
- question: uncertainty needing analysis, saved as an issue;
- blocker: a question that currently prevents progress.

Return:

1. likely cause;
2. evidence and uncertainty;
3. smallest next test;
4. exact next actions;
5. success and failure signals;
6. impact on the remaining plan.

Do not mark the issue resolved until the user verifies the result.

## 5. Daily or weekly review

Use a project export when multiple tasks matter.

Daily review:

- outcomes completed;
- remaining task with the highest leverage;
- blockers worth recording;
- one adjustment for the next work session.

Weekly review:

- outcomes versus success criteria;
- invalidated assumptions;
- recurring friction;
- schedule changes that need confirmation;
- reusable assets or knowledge produced.

Do not create a new project merely for a review.

## 6. Backup, restore, and migration

Use “全量备份” for recovery or moving browser data. It replaces the destination browser store.
Use project exports for collaboration, editing, or selective migration.

Never say uploaded file binaries are included in a JSON backup. The user must add those files again
after restore.

Use the app's automatic import-before snapshots for short-term rollback, but still recommend a full
backup before a large restructure. Snapshots are browser-local and limited; they are not a
cross-device backup.

## Ambiguity rule

If the request could be either a new project or an update, ask whether existing progress must be
preserved. When existing IDs or execution history appear in the input, default to merge-update.
