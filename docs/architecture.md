# PotatoFlow architecture

PotatoFlow is a single-user, self-hosted execution system.

## Components

- `skills/potatoflow`: Codex workflow and deterministic client scripts.
- `apps/web`: responsive local-first PWA for projects, calendar, tasks, and issue capture.
- `workers/api`: future Cloudflare Worker API.
- `database`: future Cloudflare D1 migrations.

The Skill CLI uses a local JSON store. The first web implementation uses an empty browser-local store. Both follow the same project, task, and issue shapes so a later HTTP adapter can preserve the data contract.

## Trust boundary

- Source code and examples may be public.
- Runtime data, `.env` files, access tokens, customer material, and exports remain private.
- Each user deploys an independent instance and owns an independent database.
- PotatoFlow is not a hosted multi-user service.

## AI boundary

The web application does not call an AI API in the initial architecture. It records task questions. Codex reads them when the user's computer is available, performs analysis in the Codex task, and writes useful results back through the PotatoFlow client.
