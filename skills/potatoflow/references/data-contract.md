# PotatoFlow data contract

## Import payload

Return one UTF-8 JSON object:

```json
{
  "project": {
    "id": "sample-public-research",
    "revision": 1,
    "name": "虚构的公开资料整理项目",
    "objective": "把公开资料整理成可检索目录",
    "success_criteria": [
      "资料采用统一字段",
      "每条资料可追溯公开来源"
    ],
    "background": "完全虚构的结构示例，必须替换后才能用于真实项目。",
    "constraints": ["只使用公开信息"],
    "assumptions": ["首轮只处理一个主题"],
    "execution_tip_title": "先验证目录结构。",
    "execution_tips": [
      "先定义字段，再录入样例。",
      "遇到无法归类的资料时记录原因。"
    ],
    "source_file_mode": "shared",
    "source_file_requirements": [
      {
        "id": "research-reference",
        "label": "公开资料原文",
        "description": "执行全部任务时共同查阅的资料"
      }
    ]
  },
  "tasks": [
    {
      "id": "define-catalog",
      "parent_id": null,
      "milestone": "完成目录基础结构",
      "title": "定义资料目录字段",
      "objective": "建立统一记录公开资料的字段结构",
      "why": "先统一字段可减少返工",
      "note": "先用两条虚构样例验证，不要直接批量录入。",
      "steps": [
        "列出需要记录的信息",
        "确定必填字段",
        "录入两条虚构样例"
      ],
      "acceptance_criteria": [
        "字段名称没有重复",
        "两条虚构样例均能完整录入"
      ],
      "scheduled_date": "2026-01-15",
      "end_date": null,
      "recurrence": null,
      "estimated_minutes": 45,
      "priority": 2,
      "category": "work",
      "source_file_refs": ["research-reference"],
      "dependencies": []
    }
  ],
  "deleted_task_ids": [],
  "import_metadata": {
    "base_project_id": "sample-public-research",
    "base_project_revision": 1,
    "generated_at": "2026-01-15T09:00:00+08:00"
  }
}
```

This example is fictional. Never preserve its values in a user's project.

## Project fields

Required:

- `name`: non-empty string
- `objective`: non-empty string

Recommended:

- `id`: stable lowercase slug
- `revision`: preserve the exported integer during updates; omit for a new project
- `success_criteria`: string array
- `background`: string
- `constraints`: string array
- `assumptions`: string array
- `execution_tip_title`: short homepage headline
- `execution_tips`: actionable string array
- `source_file_mode`: `none`, `shared`, or `per_task`
- `source_file_requirements`: an array of stable file-role objects with unique `id`, user-facing
  `label`, and optional `description`

## Task fields

Required:

- `title`: non-empty string
- `objective`: non-empty string
- `acceptance_criteria`: non-empty string array

Recommended:

- `id`: stable slug; preserve it during updates
- `parent_id`: task ID or `null`
- `milestone`: outcome-oriented milestone
- `why`: reason the task matters
- `note`: optional user-provided reminder, caution, or task-specific context; omit or leave blank
  when the user does not need one
- `steps`: ordered string array
- `scheduled_date`: `YYYY-MM-DD` or `null`
- `end_date`: `YYYY-MM-DD` or `null`
- `recurrence`: `daily`, `weekdays`, `weekends`, or `null`
- `estimated_minutes`: positive integer
- `priority`: integer 1–5; 1 is highest
- `category`: `daily`, `work`, `fun`, or `other`
- `source_file_refs`: IDs from `project.source_file_requirements` needed by this task
- `dependencies`: task ID array

Task notes are part of the task definition. They can be added or edited later in the task detail
page or through a merge update. An omitted `note` retains the existing note during a merge update;
an explicit empty string clears it.

## Source-file relationships

- `none`: the project has no task source files.
- `shared`: the user selects one or more files during import and PotatoFlow associates them with
  every task in the project.
- `per_task`: the import screen asks for files separately for every imported task.
- JSON stores file roles and associations only. It must never contain file bytes, access tokens,
  private absolute paths, or pretend that Codex can upload a local file automatically.
- The actual PDF, DOCX, TXT, or Markdown file is selected by the user in the web app after
  “检查变更”. The browser stores it locally and adds it to both the project index and the related
  task details.
- When updating an existing project, omitted local files and task file associations are retained.
  Do not use `source_file_refs` as a deletion mechanism.

## Update envelope

For a new project, use `deleted_task_ids: []`; `import_metadata` may be omitted.

For an existing project, include:

- `import_metadata.base_project_id`: the exact exported project ID;
- `import_metadata.base_project_revision`: the exact exported project revision;
- `import_metadata.generated_at`: ISO timestamp for traceability;
- `deleted_task_ids`: only task IDs the user explicitly approved for deletion.

The app first shows a change preview. It will:

- match by stable task ID, with exact title fallback for older data;
- reject duplicate IDs, duplicate task titles, ambiguous matches, and duplicate step or criterion text;
- keep existing tasks omitted from `tasks`;
- preserve completion evidence for unchanged step and criterion text, even if reordered;
- make changed wording a new unchecked item and retain the prior definition in task revision history;
- refuse exact-repeat imports as “没有变化”;
- warn when the payload was generated from an older project revision;
- save an import-before snapshot before writing changes.

Do not use `deleted_task_ids` for a new project. Do not place the same task ID in both `tasks` and
`deleted_task_ids`.

## Completion and pause

- Do not output `manual_status`.
- Completion is calculated from `step_results` and `criterion_results` after execution.
- New import plans normally omit execution result arrays.
- `paused` is independent from progress and defaults to `false`.
- A recurring task is one task rule. The app stores each date's results in `occurrence_results`.

## Issue states

- `open`: recorded but unanswered
- `answered`: analysis recorded, awaiting verification
- `resolved`: user verified or dismissed the issue

Execution reports belong to task step reports, not the issue list.

## Update behavior

- Preserve project and task IDs.
- Use “合并更新已有项目” for an existing project.
- Matching tasks retain compatible completion records.
- Tasks absent from an update payload are retained by the app.
- Deletion occurs only for IDs in `deleted_task_ids`.
- Re-importing the same payload is idempotent and must not create another project or task.
- Do not change `base_project_revision` to silence a stale warning; export the latest project.
- Never include unrelated projects in a project-scoped update.

## Compatibility

- `schema_version` is `1`.
- Dates use the user's timezone.
- Text is UTF-8.
- Do not include comments inside JSON.
