# PotatoFlow architecture

PotatoFlow is a single-user, self-hosted execution system.

## Components

- `skills/potatoflow`: Codex workflow and deterministic client scripts.
- `apps/web`: responsive local-first PWA with six modules: today, calendar, projects, issues, mind graph, and memo studio. Optional cloud sync via `apps/web/worker/index.ts` (Cloudflare Worker) and D1 (`apps/web/db/`), with `apps/web/db/sync-store.ts` handling version conflicts and history.
- `apps/web/worker/index.ts`: Cloudflare Worker API for authenticated sync (stable user identity from the ChatGPT account; client-submitted user IDs are rejected).
- `apps/web/db`: D1 schema and migrations for the cloud snapshot store.

### Mind graph & memo studio

- **Mind graph**: canvas-based visual network — draggable nodes, edges, zoom/pan, per-node status and child pages, standalone graph generation. Node labels are truncated on canvas (8 chars + ellipsis); full text lives in the detail panel.
- **Memo studio**: hierarchical memos (1–3 levels), ideas with four statuses (重点/推进中/已验证/普通), image notes (up to 9), attached files, double-click detail panel, and one-click memo → mind graph generation.
- Both modules render into a single `PotatoFlowApp.tsx` with responsive CSS: on mobile, inspector panels become fixed overlays (scrolling isolated from the background).

The Skill CLI uses a local JSON store. The web app starts with an empty browser-local store and can sync to the D1 cloud snapshot after the user logs in and explicitly chooses the sync direction. Both follow the same project, task, and issue shapes; the sync adapter preserves the data contract.

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
