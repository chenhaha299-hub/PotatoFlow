# PotatoFlow architecture

PotatoFlow is a single-user, self-hosted execution system.

## Components

- `skills/potatoflow`: Codex workflow and deterministic client scripts.
- `apps/web`: responsive local-first PWA for projects, calendar, tasks, and issue capture.
- `workers/api`: future Cloudflare Worker API.
- `database`: future Cloudflare D1 migrations.

The Skill CLI uses a local JSON store. The first web implementation uses an empty browser-local store. Both follow the same project, task, and issue shapes so a later HTTP adapter can preserve the data contract.

Task execution uses three levels: projects contain milestone groups, milestone groups contain
checkable tasks, and tasks contain read-only steps and acceptance criteria. Only the task-level
checkbox changes completion. A single `result_report` stores the task outcome; legacy
`step_results` and `step_reports` store step progress and optional notes. `criterion_results`
remains only for backward-compatible history because acceptance criteria are read-only.

Project JSON can describe source-file roles (`none`, `shared`, or `per_task`) and task-to-file
references. It never embeds file bytes or private local paths. During web import, the user selects
the actual PDF, DOCX, TXT, or Markdown files; IndexedDB stores the blobs while project/task records
store only local metadata and file IDs.

## Trust boundary

- Source code and examples may be public.
- Runtime data, `.env` files, access tokens, customer material, and exports remain private.
- Source-file binaries remain in the user's browser and are not included in JSON backup or Git.
- Each user deploys an independent instance and owns an independent database.
- PotatoFlow is not a hosted multi-user service.

## AI boundary

The web application does not call an AI API in the initial architecture. It records task questions. Codex reads them when the user's computer is available, performs analysis in the Codex task, and writes useful results back through the PotatoFlow client.
