# PotatoFlow data contract

## Plan import

`import-plan` accepts one UTF-8 JSON file:

```json
{
  "project": {
    "id": "sample-research-project",
    "name": "公开资料整理示例",
    "objective": "把分散的公开资料整理成可检索的主题目录",
    "success_criteria": [
      "资料使用统一命名规则",
      "每条资料都能追溯公开来源"
    ],
    "background": "这是完全虚构的通用示例，不包含任何用户数据。",
    "constraints": [
      "单人执行",
      "只整理公开信息"
    ],
    "assumptions": [
      "首轮只处理一个主题"
    ]
  },
  "tasks": [
    {
      "id": "define-catalog",
      "parent_id": null,
      "milestone": "完成目录基础结构",
      "title": "定义资料目录字段",
      "objective": "建立可以统一记录公开资料的字段结构",
      "why": "先统一字段可以减少后续返工",
      "steps": [
        "列出需要记录的信息",
        "确定必填字段",
        "录入两条虚构样例验证结构"
      ],
      "acceptance_criteria": [
        "字段名称没有重复",
        "两条虚构样例均能完整录入"
      ],
      "scheduled_date": "2026-07-28",
      "estimated_minutes": 45,
      "priority": 1,
      "dependencies": []
    }
  ]
}
```

## Required project fields

- `name`: non-empty string
- `objective`: non-empty string

Recommended project fields:

- `id`: stable lowercase slug; generated when omitted
- `success_criteria`: string array
- `background`: string
- `constraints`: string array
- `assumptions`: string array

## Required task fields

- `title`: non-empty string
- `objective`: non-empty string
- `acceptance_criteria`: non-empty string array

Recommended task fields:

- `id`: stable slug; generated when omitted
- `parent_id`: another task ID or `null`
- `milestone`: outcome-oriented milestone name
- `why`: reason the task matters
- `steps`: ordered string array
- `scheduled_date`: `YYYY-MM-DD` or `null`
- `estimated_minutes`: positive integer or `null`
- `priority`: integer 1-4, where 1 is highest
- `dependencies`: task ID array

## Stored task states

- `backlog`: defined but not scheduled
- `scheduled`: assigned to a date
- `doing`: currently being executed
- `blocked`: cannot proceed
- `done`: acceptance criteria met
- `cancelled`: intentionally stopped

## Issue states

- `open`: recorded but unanswered
- `answered`: Codex response recorded
- `resolved`: user verified that the problem is solved

## Compatibility rules

- `schema_version` is currently `1`.
- Unknown fields in imported plans are ignored.
- IDs must be unique inside a plan.
- Dependencies and `parent_id` must refer to tasks in the same plan or existing store.
- Dates are calendar dates in the user's configured timezone.
- Text data is UTF-8.
