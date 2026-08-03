#!/usr/bin/env python3
"""Local-first PotatoFlow store and CLI.

The CLI deliberately uses only Python's standard library so the open-source
skill works without installing runtime dependencies.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
TASK_STATUSES = {"backlog", "scheduled", "doing", "blocked", "done", "cancelled"}
ISSUE_STATUSES = {"open", "answered", "resolved"}
TASK_CATEGORIES = {"daily", "work", "fun", "other"}
RECURRENCES = {"daily", "weekdays", "weekends"}


class PotatoFlowError(ValueError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def emit(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def slugify(value: str, prefix: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", value).strip("-")
    if not value:
        value = uuid.uuid4().hex[:10]
    return f"{prefix}-{value}" if not value.startswith(f"{prefix}-") else value


def default_state() -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "projects": [],
        "tasks": [],
        "issues": [],
        "events": [],
    }


def data_path(raw: str | None) -> Path:
    configured = raw or os.environ.get("POTATOFLOW_DATA_FILE")
    return Path(configured) if configured else Path.cwd() / ".potatoflow" / "data.json"


def load_state(path: Path, create: bool = False) -> dict[str, Any]:
    if not path.exists():
        if create:
            return default_state()
        raise PotatoFlowError(f"Data store does not exist: {path}")
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PotatoFlowError(f"Cannot read data store: {exc}") from exc
    validate_state(state)
    return state


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(state, ensure_ascii=False, indent=2) + "\n"
    fd, temp_name = tempfile.mkstemp(prefix=f"{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PotatoFlowError(f"Cannot read JSON input: {exc}") from exc
    if not isinstance(payload, dict):
        raise PotatoFlowError("JSON input must be an object")
    return payload


def require_text(obj: dict[str, Any], field: str, owner: str) -> str:
    value = obj.get(field)
    if not isinstance(value, str) or not value.strip():
        raise PotatoFlowError(f"{owner}.{field} must be a non-empty string")
    return value.strip()


def string_list(value: Any, field: str, required: bool = False) -> list[str]:
    if value is None:
        result: list[str] = []
    elif isinstance(value, list) and all(isinstance(item, str) and item.strip() for item in value):
        result = [item.strip() for item in value]
    else:
        raise PotatoFlowError(f"{field} must be an array of non-empty strings")
    if required and not result:
        raise PotatoFlowError(f"{field} must contain at least one item")
    return result


def valid_date(value: Any, field: str) -> str | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise PotatoFlowError(f"{field} must use YYYY-MM-DD")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise PotatoFlowError(f"{field} must use YYYY-MM-DD") from exc
    return value


def task_occurs_on(task: dict[str, Any], target: str) -> bool:
    start = task.get("scheduled_date")
    if not start:
        return False
    end = task.get("end_date")
    recurrence = task.get("recurrence")
    if recurrence:
        if target < start or not end or target > end:
            return False
        weekday = date.fromisoformat(target).weekday()
        return (
            recurrence == "daily"
            or (recurrence == "weekdays" and weekday < 5)
            or (recurrence == "weekends" and weekday >= 5)
        )
    if end:
        return start <= target <= end
    return start == target


def validate_plan(plan: dict[str, Any], existing_task_ids: set[str] | None = None) -> dict[str, Any]:
    project = plan.get("project")
    tasks = plan.get("tasks")
    if not isinstance(project, dict):
        raise PotatoFlowError("project must be an object")
    if not isinstance(tasks, list):
        raise PotatoFlowError("tasks must be an array")

    require_text(project, "name", "project")
    require_text(project, "objective", "project")
    project_revision = project.get("revision")
    if project_revision is not None and (
        not isinstance(project_revision, int) or project_revision < 1
    ):
        raise PotatoFlowError("project.revision must be a positive integer")
    string_list(project.get("success_criteria"), "project.success_criteria")
    string_list(project.get("constraints"), "project.constraints")
    string_list(project.get("assumptions"), "project.assumptions")
    execution_tip_title = project.get("execution_tip_title")
    if execution_tip_title is not None:
        require_text(project, "execution_tip_title", "project")
    string_list(project.get("execution_tips"), "project.execution_tips")
    source_file_mode = project.get("source_file_mode", "none")
    if source_file_mode not in {"none", "shared", "per_task"}:
        raise PotatoFlowError(
            "project.source_file_mode must be none, shared, or per_task"
        )
    source_requirements = project.get("source_file_requirements") or []
    if not isinstance(source_requirements, list):
        raise PotatoFlowError("project.source_file_requirements must be an array")
    source_requirement_ids: set[str] = set()
    for index, requirement in enumerate(source_requirements):
        if not isinstance(requirement, dict):
            raise PotatoFlowError(
                f"project.source_file_requirements[{index}] must be an object"
            )
        requirement_id = require_text(
            requirement,
            "id",
            f"project.source_file_requirements[{index}]",
        )
        require_text(
            requirement,
            "label",
            f"project.source_file_requirements[{index}]",
        )
        if requirement_id in source_requirement_ids:
            raise PotatoFlowError(
                "project.source_file_requirements IDs must be unique"
            )
        source_requirement_ids.add(requirement_id)

    normalized_ids: list[str] = []
    for index, task in enumerate(tasks):
        if not isinstance(task, dict):
            raise PotatoFlowError(f"tasks[{index}] must be an object")
        require_text(task, "title", f"tasks[{index}]")
        require_text(task, "objective", f"tasks[{index}]")
        steps = string_list(task.get("steps"), f"tasks[{index}].steps")
        criteria = string_list(
            task.get("acceptance_criteria"),
            f"tasks[{index}].acceptance_criteria",
            required=True,
        )
        if len(steps) != len(set(steps)):
            raise PotatoFlowError(
                f"tasks[{index}].steps must not contain duplicate text"
            )
        if len(criteria) != len(set(criteria)):
            raise PotatoFlowError(
                f"tasks[{index}].acceptance_criteria must not contain duplicate text"
            )
        string_list(task.get("dependencies"), f"tasks[{index}].dependencies")
        if task.get("note") is not None and not isinstance(task.get("note"), str):
            raise PotatoFlowError(f"tasks[{index}].note must be a string")
        source_file_refs = string_list(
            task.get("source_file_refs"),
            f"tasks[{index}].source_file_refs",
        )
        unknown_source_refs = set(source_file_refs) - source_requirement_ids
        if unknown_source_refs:
            raise PotatoFlowError(
                f"tasks[{index}] references unknown source file IDs: "
                f"{sorted(unknown_source_refs)}"
            )
        valid_date(task.get("scheduled_date"), f"tasks[{index}].scheduled_date")
        end_date = valid_date(task.get("end_date"), f"tasks[{index}].end_date")
        if end_date and task.get("scheduled_date") and end_date < task["scheduled_date"]:
            raise PotatoFlowError(f"tasks[{index}].end_date cannot be before scheduled_date")
        estimate = task.get("estimated_minutes")
        if estimate is not None and (not isinstance(estimate, int) or estimate <= 0):
            raise PotatoFlowError(f"tasks[{index}].estimated_minutes must be a positive integer")
        priority = task.get("priority", 2)
        if not isinstance(priority, int) or priority not in range(1, 6):
            raise PotatoFlowError(f"tasks[{index}].priority must be between 1 and 5")
        category = task.get("category", "work")
        if category not in TASK_CATEGORIES:
            raise PotatoFlowError(
                f"tasks[{index}].category must be one of {sorted(TASK_CATEGORIES)}"
            )
        recurrence = task.get("recurrence")
        if recurrence is not None and recurrence not in RECURRENCES:
            raise PotatoFlowError(
                f"tasks[{index}].recurrence must be one of {sorted(RECURRENCES)} or null"
            )
        if recurrence and not end_date:
            raise PotatoFlowError(f"tasks[{index}].end_date is required for recurrence")
        raw_id = task.get("id") or task["title"]
        normalized_ids.append(slugify(str(raw_id), "task"))

    deleted_task_ids = string_list(plan.get("deleted_task_ids"), "deleted_task_ids")
    if len(deleted_task_ids) != len(set(deleted_task_ids)):
        raise PotatoFlowError("deleted_task_ids must not contain duplicates")
    overlap = set(deleted_task_ids) & set(normalized_ids)
    if overlap:
        raise PotatoFlowError(
            f"Task IDs cannot appear in both tasks and deleted_task_ids: {sorted(overlap)}"
        )

    import_metadata = plan.get("import_metadata")
    if import_metadata is not None:
        if not isinstance(import_metadata, dict):
            raise PotatoFlowError("import_metadata must be an object")
        if import_metadata.get("base_project_id") is not None:
            require_text(import_metadata, "base_project_id", "import_metadata")
        base_revision = import_metadata.get("base_project_revision")
        if base_revision is not None and (
            not isinstance(base_revision, int) or base_revision < 1
        ):
            raise PotatoFlowError(
                "import_metadata.base_project_revision must be a positive integer"
            )

    if len(normalized_ids) != len(set(normalized_ids)):
        raise PotatoFlowError("Task IDs must be unique inside a plan")

    allowed_ids = set(normalized_ids) | (existing_task_ids or set())
    for index, task in enumerate(tasks):
        references = list(task.get("dependencies") or [])
        if task.get("parent_id"):
            references.append(task["parent_id"])
        for reference in references:
            normalized = slugify(str(reference), "task")
            if normalized not in allowed_ids:
                raise PotatoFlowError(
                    f"tasks[{index}] references unknown task ID: {reference}"
                )
    return {
        "valid": True,
        "project_name": project["name"].strip(),
        "task_count": len(tasks),
        "task_ids": normalized_ids,
    }


def validate_state(state: dict[str, Any]) -> None:
    if not isinstance(state, dict):
        raise PotatoFlowError("Data store root must be an object")
    if state.get("schema_version") != SCHEMA_VERSION:
        raise PotatoFlowError(
            f"Unsupported schema_version: {state.get('schema_version')!r}"
        )
    for field in ("projects", "tasks", "issues", "events"):
        if not isinstance(state.get(field), list):
            raise PotatoFlowError(f"Data store field {field} must be an array")


def find(items: list[dict[str, Any]], item_id: str, label: str) -> dict[str, Any]:
    for item in items:
        if item.get("id") == item_id:
            return item
    raise PotatoFlowError(f"{label} not found: {item_id}")


def add_event(state: dict[str, Any], event_type: str, target_id: str, detail: dict[str, Any]) -> None:
    state["events"].append(
        {
            "id": f"event-{uuid.uuid4().hex}",
            "type": event_type,
            "target_id": target_id,
            "detail": detail,
            "created_at": now_iso(),
        }
    )


def command_init(args: argparse.Namespace) -> dict[str, Any]:
    path = data_path(args.data)
    if path.exists() and not args.force:
        raise PotatoFlowError(f"Data store already exists: {path}")
    save_state(path, default_state())
    return {"ok": True, "data_file": str(path.resolve()), "schema_version": SCHEMA_VERSION}


def command_validate_plan(args: argparse.Namespace) -> dict[str, Any]:
    return validate_plan(read_json(Path(args.input)))


def command_import_plan(args: argparse.Namespace) -> dict[str, Any]:
    path = data_path(args.data)
    state = load_state(path, create=True)
    plan = read_json(Path(args.input))
    existing_task_ids = {task["id"] for task in state["tasks"]}
    result = validate_plan(plan, existing_task_ids)
    project_input = plan["project"]
    project_id = slugify(str(project_input.get("id") or project_input["name"]), "project")
    if any(project["id"] == project_id for project in state["projects"]):
        raise PotatoFlowError(f"Project already exists: {project_id}")

    timestamp = now_iso()
    project = {
        "id": project_id,
        "name": project_input["name"].strip(),
        "objective": project_input["objective"].strip(),
        "success_criteria": string_list(
            project_input.get("success_criteria"), "project.success_criteria"
        ),
        "background": str(project_input.get("background") or "").strip(),
        "constraints": string_list(project_input.get("constraints"), "project.constraints"),
        "assumptions": string_list(project_input.get("assumptions"), "project.assumptions"),
        "execution_tip_title": str(
            project_input.get("execution_tip_title") or "只处理今天真正重要的事。"
        ).strip(),
        "execution_tips": string_list(
            project_input.get("execution_tips"), "project.execution_tips"
        )
        or [
            "先看任务目标，不从步骤列表盲目开始。",
            "遇到阻碍就记录，不用重新解释项目背景。",
            "完成标准没有达到，就不急着标记完成。",
        ],
        "source_file_mode": project_input.get("source_file_mode", "none"),
        "source_file_requirements": project_input.get(
            "source_file_requirements", []
        ),
        "source_files": [],
        "status": "active",
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    state["projects"].append(project)

    created_tasks = []
    for task_input, task_id in zip(plan["tasks"], result["task_ids"]):
        scheduled_date = valid_date(task_input.get("scheduled_date"), "scheduled_date")
        task = {
            "id": task_id,
            "project_id": project_id,
            "parent_id": (
                slugify(str(task_input["parent_id"]), "task")
                if task_input.get("parent_id")
                else None
            ),
            "milestone": str(task_input.get("milestone") or "").strip(),
            "title": task_input["title"].strip(),
            "objective": task_input["objective"].strip(),
            "why": str(task_input.get("why") or "").strip(),
            "note": str(task_input.get("note") or "").strip(),
            "steps": string_list(task_input.get("steps"), "task.steps"),
            "acceptance_criteria": string_list(
                task_input.get("acceptance_criteria"),
                "task.acceptance_criteria",
                required=True,
            ),
            "scheduled_date": scheduled_date,
            "end_date": valid_date(task_input.get("end_date"), "end_date"),
            "recurrence": task_input.get("recurrence"),
            "estimated_minutes": task_input.get("estimated_minutes"),
            "priority": task_input.get("priority", 2),
            "category": task_input.get("category", "work"),
            "dependencies": [
                slugify(str(item), "task") for item in task_input.get("dependencies", [])
            ],
            "source_file_refs": string_list(
                task_input.get("source_file_refs"), "task.source_file_refs"
            ),
            "source_file_ids": [],
            "status": "scheduled" if scheduled_date else "backlog",
            "paused": False,
            "result_report": "",
            "step_results": [False for _ in task_input.get("steps", [])],
            "step_reports": ["" for _ in task_input.get("steps", [])],
            "criterion_results": [
                False for _ in task_input.get("acceptance_criteria", [])
            ],
            "occurrence_results": {},
            "notes": [],
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        state["tasks"].append(task)
        created_tasks.append(task)

    add_event(
        state,
        "project.imported",
        project_id,
        {"task_ids": [task["id"] for task in created_tasks]},
    )
    save_state(path, state)
    return {
        "ok": True,
        "project": project,
        "tasks_created": len(created_tasks),
        "next_task": min(
            (task for task in created_tasks if task["scheduled_date"]),
            key=lambda item: (item["scheduled_date"], item["priority"]),
            default=None,
        ),
    }


def command_today(args: argparse.Namespace) -> dict[str, Any]:
    state = load_state(data_path(args.data))
    target_date = valid_date(args.date or date.today().isoformat(), "date")
    tasks = [
        task
        for task in state["tasks"]
        if task_occurs_on(task, target_date) and task["status"] != "cancelled"
    ]
    tasks.sort(key=lambda item: (item["status"] == "done", item["priority"], item["id"]))
    return {
        "date": target_date,
        "tasks": tasks,
        "estimated_minutes": sum(task.get("estimated_minutes") or 0 for task in tasks),
    }


def command_context(args: argparse.Namespace) -> dict[str, Any]:
    state = load_state(data_path(args.data))
    task = find(state["tasks"], args.task_id, "Task")
    project = find(state["projects"], task["project_id"], "Project")
    issues = [issue for issue in state["issues"] if issue["task_id"] == task["id"]]
    dependencies = [
        find(state["tasks"], dep_id, "Dependency") for dep_id in task["dependencies"]
    ]
    history = [event for event in state["events"] if event["target_id"] == task["id"]]
    return {
        "project": project,
        "task": task,
        "dependencies": dependencies,
        "issues": issues,
        "history": history,
    }


def command_record_issue(args: argparse.Namespace) -> dict[str, Any]:
    path = data_path(args.data)
    state = load_state(path)
    task = find(state["tasks"], args.task_id, "Task")
    issue = {
        "id": f"issue-{uuid.uuid4().hex}",
        "project_id": task["project_id"],
        "task_id": task["id"],
        "question": args.question.strip(),
        "attempts": [item.strip() for item in args.attempt if item.strip()],
        "status": "open",
        "response": "",
        "created_at": now_iso(),
        "answered_at": None,
        "resolved_at": None,
    }
    if not issue["question"]:
        raise PotatoFlowError("question must not be empty")
    state["issues"].append(issue)
    if args.block:
        previous = task["status"]
        task["status"] = "blocked"
        task["updated_at"] = now_iso()
        add_event(state, "task.status_changed", task["id"], {"from": previous, "to": "blocked"})
    add_event(state, "issue.recorded", task["id"], {"issue_id": issue["id"]})
    save_state(path, state)
    return {"ok": True, "issue": issue, "task_status": task["status"]}


def command_answer_issue(args: argparse.Namespace) -> dict[str, Any]:
    path = data_path(args.data)
    state = load_state(path)
    issue = find(state["issues"], args.issue_id, "Issue")
    response = args.response
    if args.response_file:
        response = Path(args.response_file).read_text(encoding="utf-8")
    if not response or not response.strip():
        raise PotatoFlowError("A non-empty response or response file is required")
    issue["response"] = response.strip()
    issue["status"] = "answered"
    issue["answered_at"] = now_iso()
    add_event(state, "issue.answered", issue["task_id"], {"issue_id": issue["id"]})
    save_state(path, state)
    return {"ok": True, "issue": issue}


def command_resolve_issue(args: argparse.Namespace) -> dict[str, Any]:
    path = data_path(args.data)
    state = load_state(path)
    issue = find(state["issues"], args.issue_id, "Issue")
    if issue["status"] == "open":
        raise PotatoFlowError("Issue must be answered before it can be resolved")
    issue["status"] = "resolved"
    issue["resolved_at"] = now_iso()
    add_event(
        state,
        "issue.resolved",
        issue["task_id"],
        {"issue_id": issue["id"], "verification": args.verification},
    )
    save_state(path, state)
    return {"ok": True, "issue": issue, "verification": args.verification}


def command_set_paused(args: argparse.Namespace) -> dict[str, Any]:
    path = data_path(args.data)
    state = load_state(path)
    task = find(state["tasks"], args.task_id, "Task")
    previous = bool(task.get("paused"))
    task["paused"] = args.paused == "true"
    task["updated_at"] = now_iso()
    add_event(
        state,
        "task.pause_changed",
        task["id"],
        {"from": previous, "to": task["paused"]},
    )
    save_state(path, state)
    return {"ok": True, "task": task}


def command_reschedule(args: argparse.Namespace) -> dict[str, Any]:
    path = data_path(args.data)
    state = load_state(path)
    task = find(state["tasks"], args.task_id, "Task")
    new_date = valid_date(args.date, "date")
    previous = task["scheduled_date"]
    task["scheduled_date"] = new_date
    if task["status"] == "backlog":
        task["status"] = "scheduled"
    task["updated_at"] = now_iso()
    add_event(
        state,
        "task.rescheduled",
        task["id"],
        {"from": previous, "to": new_date, "reason": args.reason},
    )
    save_state(path, state)
    return {"ok": True, "task": task}


def command_review(args: argparse.Namespace) -> dict[str, Any]:
    state = load_state(data_path(args.data))
    tasks = state["tasks"]
    if args.project_id:
        find(state["projects"], args.project_id, "Project")
        tasks = [task for task in tasks if task["project_id"] == args.project_id]
    by_status = {
        status: [task for task in tasks if task["status"] == status]
        for status in sorted(TASK_STATUSES)
    }
    open_issues = [
        issue
        for issue in state["issues"]
        if issue["status"] != "resolved"
        and (not args.project_id or issue["project_id"] == args.project_id)
    ]
    return {
        "project_id": args.project_id,
        "task_count": len(tasks),
        "counts": {status: len(items) for status, items in by_status.items()},
        "blocked_tasks": by_status["blocked"],
        "open_issues": open_issues,
        "completed_tasks": by_status["done"],
    }


def add_data_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--data", help="Path to PotatoFlow JSON data store")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="PotatoFlow local-first project store")
    sub = parser.add_subparsers(dest="command", required=True)

    init_parser = sub.add_parser("init", help="Create an empty data store")
    add_data_argument(init_parser)
    init_parser.add_argument("--force", action="store_true")
    init_parser.set_defaults(handler=command_init)

    validate_parser = sub.add_parser("validate-plan", help="Validate a plan JSON file")
    validate_parser.add_argument("--input", required=True)
    validate_parser.set_defaults(handler=command_validate_plan)

    import_parser = sub.add_parser("import-plan", help="Import a validated project plan")
    import_parser.add_argument("--input", required=True)
    add_data_argument(import_parser)
    import_parser.set_defaults(handler=command_import_plan)

    today_parser = sub.add_parser("today", help="List tasks scheduled for a date")
    today_parser.add_argument("--date")
    add_data_argument(today_parser)
    today_parser.set_defaults(handler=command_today)

    context_parser = sub.add_parser("context", help="Load full task context")
    context_parser.add_argument("--task-id", required=True)
    add_data_argument(context_parser)
    context_parser.set_defaults(handler=command_context)

    issue_parser = sub.add_parser("record-issue", help="Record an execution issue")
    issue_parser.add_argument("--task-id", required=True)
    issue_parser.add_argument("--question", required=True)
    issue_parser.add_argument("--attempt", action="append", default=[])
    issue_parser.add_argument("--block", action="store_true")
    add_data_argument(issue_parser)
    issue_parser.set_defaults(handler=command_record_issue)

    answer_parser = sub.add_parser("answer-issue", help="Store a Codex response")
    answer_parser.add_argument("--issue-id", required=True)
    answer_parser.add_argument("--response")
    answer_parser.add_argument("--response-file")
    add_data_argument(answer_parser)
    answer_parser.set_defaults(handler=command_answer_issue)

    resolve_parser = sub.add_parser(
        "resolve-issue", help="Mark an answered issue as user-verified"
    )
    resolve_parser.add_argument("--issue-id", required=True)
    resolve_parser.add_argument("--verification", required=True)
    add_data_argument(resolve_parser)
    resolve_parser.set_defaults(handler=command_resolve_issue)

    pause_parser = sub.add_parser("set-paused", help="Pause or resume a task")
    pause_parser.add_argument("--task-id", required=True)
    pause_parser.add_argument("--paused", required=True, choices=("true", "false"))
    add_data_argument(pause_parser)
    pause_parser.set_defaults(handler=command_set_paused)

    schedule_parser = sub.add_parser("reschedule", help="Move a task to a new date")
    schedule_parser.add_argument("--task-id", required=True)
    schedule_parser.add_argument("--date", required=True)
    schedule_parser.add_argument("--reason", required=True)
    add_data_argument(schedule_parser)
    schedule_parser.set_defaults(handler=command_reschedule)

    review_parser = sub.add_parser("review", help="Summarize execution state")
    review_parser.add_argument("--project-id")
    add_data_argument(review_parser)
    review_parser.set_defaults(handler=command_review)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        emit(args.handler(args))
        return 0
    except (PotatoFlowError, OSError) as exc:
        emit({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
