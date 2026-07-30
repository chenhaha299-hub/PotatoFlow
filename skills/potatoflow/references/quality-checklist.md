# PotatoFlow handoff quality checklist

Apply this checklist before returning an import payload or a plan-changing recommendation.

## Privacy

- Values come only from the current user or are explicitly labelled assumptions.
- No author examples, account names, paths, brands, customer details, secrets, or unrelated projects
  are present.
- The export scope requested was no broader than necessary.

## Project quality

- The objective describes an outcome, not a topic.
- Success criteria are observable.
- Constraints and assumptions are separated.
- Near-term work is detailed; distant work is not falsely precise.

## Task quality

- Every task has a concrete outcome and a reason.
- Every task's note need was confirmed; notes contain only user-provided reminders or context, and
  remain blank when no note is needed.
- Steps are executable by one person.
- Acceptance criteria verify the result rather than repeat the steps.
- Duration and daily workload are realistic.
- Dependencies reference valid task IDs.
- Priority uses 1 as highest and 5 as lowest.
- Category is one of `daily`, `work`, `fun`, or `other`.
- Source-file mode is explicitly confirmed when the user has documents or reference material.
- Every `source_file_refs` value points to a declared source-file requirement.
- File bytes, private absolute paths, and credentials are never placed in JSON.

## State integrity

- Existing project and task IDs are preserved during updates.
- The update includes the exported project ID and revision in `import_metadata`.
- Every deletion was explicitly approved and appears only in `deleted_task_ids`.
- Omitted tasks are described as retained, not deleted.
- Task IDs and titles are unique; step and criterion text has no duplicates inside one task.
- Unchanged completed steps and criteria keep exactly the same wording.
- Completion is not represented with `manual_status`.
- Pause is independent from completion.
- Existing execution reports and recurring occurrence results are not discarded.
- Ordinary reports are not converted into issues.

## Scheduling

- Dates use the user's timezone.
- Recurring work uses one rule, not copied tasks.
- A date range has an end date on or after the start date.
- Major rescheduling is previewed before output.

## JSON handoff

- The output is one UTF-8 JSON object without comments or trailing commas.
- It conforms to `data-contract.md`.
- `validate-plan` succeeds.
- The user is told the correct UI action: “新建项目” or “合并更新已有项目”.
- The user is told to click “检查变更” and inspect all five counts before importing.
- When source files are declared, the user is told to select the actual files in the import preview
  and verify whether they are shared or mapped per task.
- A stale revision, ambiguous match, or unknown deletion is resolved from a fresh export rather than bypassed.
- The user is not told that data changed until they actually import it.
