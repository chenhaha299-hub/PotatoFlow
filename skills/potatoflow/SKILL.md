---
name: potatoflow
description: Turn conversations and project documents into structured projects, milestones, executable tasks, schedules, issue records, and reviews. Use when the user wants Codex to create or update a PotatoFlow project, convert a discussion or document into a project tree and calendar plan, inspect today's tasks, analyze a problem in task context, reschedule work, record progress, or produce an execution review.
---

# PotatoFlow

Operate a single-user execution system that connects project thinking with daily action.

## Core rules

1. Preserve the chain `objective -> milestone -> task -> execution record -> review`.
2. Separate facts supplied by the user from assumptions proposed by Codex.
3. Make tasks executable: include an outcome, steps, acceptance criteria, estimate, and schedule.
4. Show a preview before creating or materially rescheduling multiple tasks.
5. Never store secrets, customer-confidential material, or personal data in examples or source control.
6. Preserve history. Record changes and reasons instead of silently replacing completed work.
7. Use the user's timezone for dates. If it is unavailable, ask before scheduling.

## Choose a workflow

- **Create a project from discussion or a document**: read [workflows.md](references/workflows.md), then produce a plan matching [data-contract.md](references/data-contract.md). Validate and import it with `scripts/potatoflow.py`.
- **Show today's work**: run `today`, then explain the recommended order and minimum acceptable outcome.
- **Solve an execution problem**: run `context` for the task, analyze the issue using the full project context, record the response with `answer-issue`, and use `resolve-issue` only after the user verifies the result.
- **Update execution state**: use `set-status`, `reschedule`, or `record-issue`. State the reason when changing a date or marking a task blocked.
- **Review progress**: run `review`; distinguish completed outcomes, unresolved blockers, changed assumptions, and proposed next actions.

## CLI

Use Python's standard library only.

```powershell
python scripts/potatoflow.py init --data .potatoflow/data.json
python scripts/potatoflow.py validate-plan --input plan.json
python scripts/potatoflow.py import-plan --input plan.json --data .potatoflow/data.json
python scripts/potatoflow.py today --date 2026-07-27 --data .potatoflow/data.json
python scripts/potatoflow.py context --task-id task-id --data .potatoflow/data.json
```

Every command emits JSON. Treat a nonzero exit code as failure and report the error without claiming that data changed.

## Create-project procedure

1. Extract the project objective, observable success condition, background, constraints, and unresolved decisions.
2. Ask only for missing information that would materially change the plan. Otherwise label reasonable assumptions.
3. Build milestones around outcomes rather than broad topics.
4. Break only the near-term milestone into detailed scheduled tasks. Keep later work at a coarser level unless the user requests full detail.
5. Present the project tree and proposed dates.
6. After confirmation, write a JSON plan matching the contract, run `validate-plan`, then run `import-plan`.
7. Return created IDs and the next scheduled task.

## Execution-problem procedure

1. Record the raw problem with `record-issue` if it is not already stored.
2. Load `context` for the task.
3. Identify the blocker, evidence, attempts already made, and the smallest safe next test.
4. Give a concrete resolution path. Do not repeat steps already tried unless explaining why a controlled retry is useful.
5. Record the useful answer with `answer-issue`.
6. Mark the issue resolved only after user verification.
7. Update task status or schedule only when the conclusion justifies it.

## Safety and write policy

- Read operations may run immediately.
- Preview bulk imports and multi-task rescheduling before writing.
- Require explicit user confirmation before deleting data. The bundled CLI intentionally has no delete command.
- Do not commit `.potatoflow/`, `.env`, access tokens, or user exports.
- When an API adapter is added, keep credentials outside the skill and use per-installation configuration.
