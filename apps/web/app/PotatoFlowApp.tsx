"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  INITIAL_LOGIC_GRAPH_PAGES,
  type GraphPage,
} from "./logic-graph-model";
import {
  readSourceFileBlob,
  readSourceFileFromCloud,
  removeSourceFileBlob,
  removeSourceFileFromCloud,
  saveSourceFileBlob,
  uploadSourceFileToCloud,
} from "./source-file-storage";
import { isPotatoFlowStore } from "./store-snapshot-validation";
import styles from "./potatoflow.module.css";

const LogicGraphPrototype = lazy(() => import("./LogicGraphPrototype"));

type ProjectInput = {
  id?: string;
  name: string;
  objective: string;
  success_criteria?: string[];
  background?: string;
  constraints?: string[];
  assumptions?: string[];
  execution_improvements?: string;
  execution_tip_title?: string;
  execution_tips?: string[];
  milestones?: string[];
  source_file_mode?: SourceFileMode;
  source_file_requirements?: SourceFileRequirement[];
  revision?: number;
  updated_at?: string;
};

type SourceFileMode = "none" | "shared" | "per_task";

type SourceFileRequirement = {
  id: string;
  label: string;
  description?: string;
};

type SourceFileMeta = {
  id: string;
  name: string;
  type: string;
  size: number;
  uploaded_at: string;
  requirement_id?: string;
};

type TaskCategory = "daily" | "work" | "fun" | "other";

type TaskInput = {
  id?: string;
  parent_id?: string | null;
  milestone?: string;
  title: string;
  objective: string;
  why?: string;
  steps?: string[];
  acceptance_criteria: string[];
  scheduled_date?: string | null;
  end_date?: string | null;
  estimated_minutes?: number | null;
  priority?: number;
  dependencies?: string[];
  category?: TaskCategory;
  source_file_refs?: string[];
  note?: string;
  result_report?: string;
  recurrence?: "daily" | "weekdays" | "weekends" | null;
  revision?: number;
  updated_at?: string;
  source_memo_page_id?: string;
  source_idea_node_id?: string;
};

type TaskRevision = {
  revision: number;
  changed_at: string;
  source: "import" | "manual";
  title: string;
  objective: string;
  note: string;
  steps: string[];
  acceptance_criteria: string[];
  step_results: boolean[];
  step_reports: string[];
  criterion_results: boolean[];
  result_report?: string;
};

type Project = Required<
  Pick<ProjectInput, "name" | "objective">
> &
  Omit<ProjectInput, "name" | "objective" | "id"> & {
    id: string;
    status: "active";
    created_at: string;
    source_files?: SourceFileMeta[];
    revision?: number;
    updated_at?: string;
  };

type TaskStatus =
  | "backlog"
  | "scheduled"
  | "doing"
  | "blocked"
  | "done"
  | "cancelled";

type Task = Required<
  Pick<TaskInput, "title" | "objective" | "acceptance_criteria">
> &
  Omit<TaskInput, "title" | "objective" | "acceptance_criteria" | "id"> & {
    id: string;
    project_id: string;
    status: TaskStatus;
    created_at: string;
    notes: string[];
    step_results?: boolean[];
    step_reports?: string[];
    criterion_results?: boolean[];
    result_report?: string;
    paused?: boolean;
    recurrence?: "daily" | "weekdays" | "weekends" | null;
    occurrence_results?: Record<
      string,
      {
        step_results: boolean[];
        step_reports: string[];
        criterion_results: boolean[];
        result_report?: string;
        completed?: boolean;
        paused?: boolean;
      }
    >;
    occurrence_date?: string;
    revision?: number;
    updated_at?: string;
    revision_history?: TaskRevision[];
    source_file_ids?: string[];
    /** Legacy field retained only so existing local data can be migrated safely. */
    manual_status?: "done" | "incomplete" | "pending" | null;
  };

type Issue = {
  id: string;
  task_id: string;
  project_id: string;
  question: string;
  attempts: string[];
  status: "open" | "answered" | "resolved";
  response: string;
  created_at: string;
  blocks_task?: boolean;
};

function legacyReportsToTaskReport(
  steps: string[] | undefined,
  reports: string[] | undefined,
) {
  return (reports || [])
    .map((report, index) => {
      const value = report.trim();
      if (!value) return "";
      const step = steps?.[index]?.trim();
      return step ? `${step}：${value}` : value;
    })
    .filter(Boolean)
    .join("\n");
}

type Store = {
  schema_version: 1;
  projects: Project[];
  tasks: Task[];
  issues: Issue[];
  logic_graph_pages?: GraphPage[];
  export_meta?: {
    exported_at: string;
    scope: "task" | "project" | "all";
    project_id?: string;
    project_revision?: number;
  };
};

type SyncStatus =
  | "local"
  | "checking"
  | "ready"
  | "saving"
  | "offline"
  | "choice"
  | "error";

type SyncChoice = {
  kind: "first-upload" | "different" | "conflict";
  cloudStore: Store | null;
  cloudRevision: number;
  cloudUpdatedAt: string | null;
  localUpdatedAt: string | null;
};

type PlanPayload = {
  project: ProjectInput;
  tasks: TaskInput[];
  deleted_task_ids: string[];
  import_metadata?: {
    base_project_id?: string;
    base_project_revision?: number;
    generated_at?: string;
  };
};

type ImportPreview = {
  plan: PlanPayload;
  projectId: string;
  nextStore: Store;
  projectChanged: boolean;
  additions: string[];
  updates: string[];
  unchanged: string[];
  retained: string[];
  deletions: string[];
  conflicts: string[];
  stale: boolean;
  sourceRevision: number;
  hasChanges: boolean;
};

type ImportSourceSelection = {
  mode: SourceFileMode;
  shared: File[];
  byTask: Record<string, File[]>;
};

type ImportSnapshot = {
  id: string;
  created_at: string;
  label: string;
  store: Store;
};

type ProjectEditDraft = {
  projectId: string;
  name: string;
  objective: string;
  background: string;
  successCriteria: string;
  constraints: string;
  assumptions: string;
};

type PlanUndoSnapshot = {
  projectEditDraft: ProjectEditDraft | null;
  projectTaskDrafts: Task[];
  projectMilestoneDrafts: string[];
  improvementDraft: string;
  executionTipTitleDraft: string;
  executionTipsDraft: string;
};

const DEFAULT_EXECUTION_TIP_TITLE = "只处理今天真正重要的事。";
const DEFAULT_EXECUTION_TIPS = [
  "先看任务目标，不从步骤列表盲目开始。",
  "遇到阻碍就记录，不用重新解释项目背景。",
  "完成标准没有达到，就不急着标记完成。",
];
const ONBOARDING_PROMPT = [
  "使用 $potatoflow 帮助当前用户创建一个新项目。请先检查当前会话是否已经安装并能识别 PotatoFlow Skill：如果无法识别，请停止建档，明确提示需要先安装 PotatoFlow Skill，并说明安装后重新打开 Codex 或新建任务再继续，不要降级成普通回答。",
  "",
  "确认 Skill 可用后，请先发送以下建档方式选择，不要直接开始提问：",
  "",
  "欢迎使用 PotatoFlow。在创建项目之前，请先选择建档方式：",
  "",
  "A｜对话构思",
  "适合只有初步想法、仍在思考方向的用户。AI 会逐步提问，帮助明确目标、分析可行性、整理项目结构并制定任务。",
  "",
  "B｜直接整理",
  "适合已经有明确想法、现成文字或项目文档的用户。AI 会读取已有信息，只询问关键缺失内容，再整理成任务。",
  "",
  "C｜帮忙判断",
  "AI 会先简单了解用户目前掌握的信息，再推荐更适合的建档方式，最终由用户确认。",
  "",
  "请回复：A、B 或 C。",
  "",
  "后续建档采用自然问答方式。不要把 PotatoFlow 字段当成表格让用户逐项填写，也不要依次要求用户填写总项目、任务名、执行步骤和备注。先通过几轮简短对话理解用户想完成什么、目前有什么想法或准备、希望怎样推进和安排，以及有哪些提醒、限制或顾虑。提问要结合用户上一轮回答继续展开，已经说过的信息不要重复询问；只有缺失信息会明显改变任务拆分或执行方式时才继续追问。",
  "",
  "用户不需要自己决定任务怎么拆。理解用户想法后，由 AI 主动归纳为“总项目→具体任务→执行步骤”：总项目概括最终想完成的整件事情；任务名是可以分别完成的子任务；执行步骤是完成任务的实际顺序；备注记录用户提到的提醒、偏好、限制和补充说明。不要把每个细小操作都建立成任务，细小操作应归入对应任务的执行步骤。项目阶段和其他系统必需字段可根据上下文归纳或使用安全默认值，不要为了填字段机械追问。",
  "",
  "如果用户提到现成文字、Word、PDF、Markdown 或文本资料，再确认这些资料在执行时是否需要保留，以及是全部任务共用还是分别关联；没有提到资料时不要把源文件问题作为固定问卷。时间安排也要通过自然对话整体了解，不要逐项反复询问。任何未知内容保持为空、标为待确认假设或采用系统默认值，不要自行编造。",
  "",
  "信息足够后，由 AI 先输出简洁的建档摘要，按总项目以及每个任务的任务名、执行步骤、备注进行归纳，并简短说明这样拆分的原因和先后关系。用户可以继续用自然语言提出合并、拆开、调序或改写，不需要自己修改字段。等待用户回复‘确认生成’后，再输出可导入 PotatoFlow 的 JSON；新建 JSON 不要预填完成状态、执行记录或虚构内容。",
].join("\n");
const PERSONAL_PROJECT_ID = "project-personal-tasks";
const NEW_PROJECT_OPTION = "__new_task_project__";

type ScheduleType =
  | "backlog"
  | "once"
  | "daily"
  | "weekdays"
  | "weekends"
  | "range";

type CustomTaskDraft = {
  projectId: string;
  newProjectName: string;
  newProjectObjective: string;
  title: string;
  objective: string;
  milestone: string;
  why: string;
  note: string;
  steps: string[];
  acceptanceCriteria: string;
  scheduleType: ScheduleType;
  startDate: string;
  endDate: string;
  estimatedMinutes: string;
  category: TaskCategory;
  priority: number;
};

type NewProjectStructureTaskDraft = {
  id: string;
  title: string;
  objective: string;
  scheduleType: "backlog" | "once";
  scheduledDate: string;
  estimatedMinutes: string;
};

type NewProjectStructureStageDraft = {
  id: string;
  name: string;
  tasks: NewProjectStructureTaskDraft[];
};

type TabId = "today" | "calendar" | "projects" | "issues" | "logic-graph" | "memo";

const STORAGE_KEY = "potatoflow:v1";
const STORAGE_BACKUP_KEY = "potatoflow:v1:backup";
const LOCAL_UPDATED_AT_KEY = "potatoflow:v1:updated-at";
const IMPORT_SNAPSHOTS_KEY = "potatoflow:v1:import-snapshots";
const LOCAL_BACKUP_MAX_CHARS = 1_500_000;
const EMPTY_STORE: Store = {
  schema_version: 1,
  projects: [],
  tasks: [],
  issues: [],
  logic_graph_pages: INITIAL_LOGIC_GRAPH_PAGES,
};

function isStore(value: unknown): value is Store {
  return isPotatoFlowStore(value);
}

function readStoredData() {
  for (const key of [STORAGE_KEY, STORAGE_BACKUP_KEY]) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      const parsed: unknown = JSON.parse(stored);
      if (isStore(parsed)) {
        const explicitlyBlocked = new Set(
          parsed.issues
            .filter(
              (issue) =>
                issue.status !== "resolved" && issue.blocks_task === true,
            )
            .map((issue) => issue.task_id),
        );
        return {
          ...parsed,
          logic_graph_pages: parsed.logic_graph_pages ?? INITIAL_LOGIC_GRAPH_PAGES,
          projects: parsed.projects.map((project) => ({
            ...project,
            revision: project.revision || 1,
            updated_at: project.updated_at || project.created_at,
          })),
          tasks: parsed.tasks.map((task) => {
            const legacyManualDone = task.manual_status === "done";
            const { manual_status: _legacyManualStatus, ...taskWithoutManual } =
              task;
            void _legacyManualStatus;
            const checks = [
              ...(task.steps || []).map(
                (_, index) =>
                  legacyManualDone ||
                  task.status === "done" ||
                  task.step_results?.[index] ||
                  false,
              ),
              ...task.acceptance_criteria.map(
                (_, index) =>
                  legacyManualDone ||
                  task.status === "done" ||
                  task.criterion_results?.[index] ||
                  false,
              ),
            ];
            const allChecksComplete =
              checks.length > 0 && checks.every(Boolean);
            const resultReport =
              task.result_report ||
              legacyReportsToTaskReport(task.steps, task.step_reports);
            const hasActivity =
              checks.some(Boolean) ||
              resultReport.trim().length > 0;
            return {
              ...taskWithoutManual,
              revision: task.revision || 1,
              updated_at: task.updated_at || task.created_at,
              revision_history: task.revision_history || [],
              paused:
                task.paused === true || task.manual_status === "pending",
              step_results: (task.steps || []).map(
                (_, index) =>
                  legacyManualDone ||
                  task.status === "done" ||
                  task.step_results?.[index] ||
                  false,
              ),
              criterion_results: task.acceptance_criteria.map(
                (_, index) =>
                  legacyManualDone ||
                  task.criterion_results?.[index] ||
                  false,
              ),
              result_report: resultReport,
              occurrence_results: Object.fromEntries(
                Object.entries(task.occurrence_results || {}).map(
                  ([date, occurrence]) => {
                    const occurrenceChecks = [
                      ...(occurrence.step_results || []),
                      ...(occurrence.criterion_results || []),
                    ];
                    return [
                      date,
                      {
                        ...occurrence,
                        completed:
                          occurrence.completed === true ||
                          (occurrenceChecks.length > 0 &&
                            occurrenceChecks.every(Boolean)),
                        result_report:
                          occurrence.result_report ||
                          legacyReportsToTaskReport(
                            task.steps,
                            occurrence.step_reports,
                          ),
                      },
                    ];
                  },
                ),
              ),
              status:
                task.status === "cancelled"
                  ? "cancelled"
                  : explicitlyBlocked.has(task.id)
                    ? "blocked"
                    : task.status === "done" ||
                        legacyManualDone ||
                        allChecksComplete
                      ? "done"
                      : hasActivity
                        ? "doing"
                        : task.scheduled_date
                          ? "scheduled"
                          : "backlog",
            };
          }),
        };
      }
    } catch {
      // Try the backup instead of deleting a potentially recoverable snapshot.
    }
  }
  return null;
}

type LocalWriteResult = "saved" | "unchanged" | "quota" | "error";

function isStorageQuotaError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function writeStoredData(value: Store): LocalWriteResult {
  try {
    const serialized = JSON.stringify(value);
    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous === serialized) return "unchanged";
    if (previous && previous.length <= LOCAL_BACKUP_MAX_CHARS) {
      localStorage.setItem(STORAGE_BACKUP_KEY, previous);
    } else {
      localStorage.removeItem(STORAGE_BACKUP_KEY);
    }
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(LOCAL_UPDATED_AT_KEY, new Date().toISOString());
    return "saved";
  } catch (error) {
    if (!isStorageQuotaError(error)) return "error";
    try {
      // Prefer the current data over an older duplicate when storage is tight.
      const serialized = JSON.stringify(value);
      localStorage.removeItem(STORAGE_BACKUP_KEY);
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(LOCAL_UPDATED_AT_KEY, new Date().toISOString());
      return "saved";
    } catch (retryError) {
      return isStorageQuotaError(retryError) ? "quota" : "error";
    }
  }
}

function storeLatestTimestamp(value: Store) {
  const candidates = [
    ...value.projects.flatMap((project) => [
      project.updated_at,
      project.created_at,
      ...(project.source_files || []).map((file) => file.uploaded_at),
    ]),
    ...value.tasks.flatMap((task) => [task.updated_at, task.created_at]),
    ...value.issues.map((issue) => issue.created_at),
  ].filter((timestamp): timestamp is string => Boolean(timestamp));
  const latest = candidates.reduce((maximum, timestamp) => {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? Math.max(maximum, parsed) : maximum;
  }, 0);
  return latest ? new Date(latest).toISOString() : null;
}

function readLocalUpdatedAt(value: Store) {
  return localStorage.getItem(LOCAL_UPDATED_AT_KEY) || storeLatestTimestamp(value);
}

function formatSyncTime(value: string | null) {
  if (!value) return "暂无修改时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "修改时间未知";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function storeForSync(value: Store): Store {
  return { ...value, export_meta: undefined };
}

function hasMeaningfulLogicGraphData(value: Store) {
  return (value.logic_graph_pages || []).some(
    (page) =>
      page.id !== "inbox" ||
      page.title !== "灵感收集" ||
      page.nodes.length > 0 ||
      page.edges.length > 0 ||
      Boolean(page.parentPageId),
  );
}

function storeHasContent(value: Store) {
  return (
    value.projects.length > 0 ||
    value.tasks.length > 0 ||
    value.issues.length > 0 ||
    hasMeaningfulLogicGraphData(value)
  );
}

function serializedStore(value: Store) {
  return JSON.stringify(storeForSync(value));
}

const NON_SEMANTIC_SYNC_KEYS = new Set([
  "export_meta",
  "revision",
  "revision_history",
  "updated_at",
  "created_at",
  "uploaded_at",
  "occurrence_date",
  "manual_status",
]);

const UNORDERED_SYNC_ARRAYS = new Set([
  "projects",
  "tasks",
  "issues",
  "source_files",
  "source_file_ids",
  "logic_graph_pages",
]);

const POSITIONAL_BOOLEAN_ARRAYS = new Set([
  "step_results",
  "criterion_results",
]);

const POSITIONAL_TEXT_ARRAYS = new Set(["step_reports"]);

function semanticStore(value: Store) {
  return {
    ...storeForSync(value),
    logic_graph_pages: hasMeaningfulLogicGraphData(value)
      ? value.logic_graph_pages
      : undefined,
    projects: value.projects.map((project) =>
      Object.fromEntries(
        Object.entries(project).filter(([key]) => key !== "status"),
      ),
    ),
    tasks: value.tasks.map((task) => {
      const legacyManualDone = task.manual_status === "done";
      const normalizedTask = {
        ...task,
        paused: task.paused === true || task.manual_status === "pending",
        step_results: (task.steps || []).map(
          (_, index) =>
            legacyManualDone ||
            task.status === "done" ||
            task.step_results?.[index] ||
            false,
        ),
        criterion_results: task.acceptance_criteria.map(
          (_, index) =>
            legacyManualDone ||
            task.status === "done" ||
            task.criterion_results?.[index] ||
            false,
        ),
        result_report:
          task.result_report ||
          legacyReportsToTaskReport(task.steps, task.step_reports),
        occurrence_results: Object.fromEntries(
          Object.entries(task.occurrence_results || {}).map(
            ([date, occurrence]) => {
              const occurrenceChecks = [
                ...(occurrence.step_results || []),
                ...(occurrence.criterion_results || []),
              ];
              return [
                date,
                {
                  ...occurrence,
                  completed:
                    occurrence.completed === true ||
                    (occurrenceChecks.length > 0 &&
                      occurrenceChecks.every(Boolean)),
                  result_report:
                    occurrence.result_report ||
                    legacyReportsToTaskReport(
                      task.steps,
                      occurrence.step_reports,
                    ),
                },
              ];
            },
          ),
        ),
      };
      return Object.fromEntries(
        Object.entries(normalizedTask).filter(
          ([key]) => key !== "status" && key !== "manual_status",
        ),
      );
    }),
  };
}

function isEmptySemanticValue(value: unknown, key: string) {
  if (value === undefined || value === null || value === "" || value === false) {
    return true;
  }
  if (key === "source_file_mode" && value === "none") return true;
  if (key === "category" && value === "work") return true;
  if (key === "priority" && value === 3) return true;
  if (
    key === "execution_tip_title" &&
    value === DEFAULT_EXECUTION_TIP_TITLE
  ) {
    return true;
  }
  if (
    key === "execution_tips" &&
    Array.isArray(value) &&
    JSON.stringify(value) === JSON.stringify(DEFAULT_EXECUTION_TIPS)
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.length === 0;
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 0
  );
}

function canonicalSyncValue(value: unknown, parentKey = ""): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => canonicalSyncValue(item));
    if (POSITIONAL_BOOLEAN_ARRAYS.has(parentKey)) {
      while (normalized.at(-1) === false) normalized.pop();
    } else if (POSITIONAL_TEXT_ARRAYS.has(parentKey)) {
      while (normalized.at(-1) === "") normalized.pop();
    }
    if (normalized.length === 0) return undefined;
    if (!UNORDERED_SYNC_ARRAYS.has(parentKey)) return normalized;
    return normalized.sort((left, right) => {
      const leftKey =
        left && typeof left === "object" && "id" in left
          ? String((left as { id?: unknown }).id || "")
          : JSON.stringify(left);
      const rightKey =
        right && typeof right === "object" && "id" in right
          ? String((right as { id?: unknown }).id || "")
          : JSON.stringify(right);
      return leftKey.localeCompare(rightKey);
    });
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !NON_SEMANTIC_SYNC_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, child]) => {
        const normalized = canonicalSyncValue(child, key);
        return isEmptySemanticValue(normalized, key) ? [] : [[key, normalized]];
      });
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

function storesSemanticallyEqual(left: Store, right: Store) {
  return (
    JSON.stringify(canonicalSyncValue(semanticStore(left))) ===
    JSON.stringify(canonicalSyncValue(semanticStore(right)))
  );
}

function readImportSnapshots(): ImportSnapshot[] {
  try {
    const raw = localStorage.getItem(IMPORT_SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (snapshot): snapshot is ImportSnapshot =>
        Boolean(
          snapshot &&
            typeof snapshot === "object" &&
            typeof snapshot.id === "string" &&
            typeof snapshot.created_at === "string" &&
            typeof snapshot.label === "string" &&
            isStore(snapshot.store),
        ),
    );
  } catch {
    return [];
  }
}

function saveImportSnapshot(store: Store, label: string) {
  try {
    const snapshot: ImportSnapshot = {
      id: `snapshot-${Date.now()}`,
      created_at: new Date().toISOString(),
      label,
      store: { ...store, export_meta: undefined },
    };
    const candidates = [snapshot, ...readImportSnapshots()].slice(0, 3);
    while (
      candidates.length > 1 &&
      JSON.stringify(candidates).length > 1_800_000
    ) {
      candidates.pop();
    }
    localStorage.setItem(IMPORT_SNAPSHOTS_KEY, JSON.stringify(candidates));
  } catch {
    // Import must remain possible even when browser storage is near its quota.
  }
}

const NAV_ITEMS: Array<{ id: TabId; label: string; mobileLabel?: string; mark: string }> = [
  { id: "today", label: "今天", mark: "今" },
  { id: "calendar", label: "日历", mark: "日" },
  { id: "projects", label: "项目", mark: "项" },
  { id: "issues", label: "问题", mark: "问" },
  { id: "logic-graph", label: "思维网图", mobileLabel: "网图", mark: "网" },
  { id: "memo", label: "备忘录", mark: "备" },
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "待安排",
  scheduled: "已安排",
  doing: "执行中",
  blocked: "有阻碍",
  done: "已完成",
  cancelled: "已取消",
};

function taskLevel(task: Task) {
  if (task.paused) return "pending";
  if (task.status === "done") return "done";
  if (task.status === "blocked") return "blocked";
  if (task.status === "doing") return "incomplete";
  if (task.status === "cancelled") return "cancelled";
  return "incomplete";
}

function moveArrayItem<T>(items: T[], from: number, to: number) {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function taskCompletion(task: Task) {
  if (task.status === "done") return 100;
  const steps = task.steps || [];
  if (steps.length === 0) return 0;
  const completedSteps = steps.reduce(
    (total, _, index) => total + Number(task.step_results?.[index] === true),
    0,
  );
  return Math.round((completedSteps / steps.length) * 100);
}

function taskStatusFromProgress(task: Task, isBlocked?: boolean): TaskStatus {
  if (task.status === "cancelled") return "cancelled";
  const progress = taskCompletion(task);
  if (progress === 100) return "done";
  if (isBlocked === true || (isBlocked === undefined && task.status === "blocked")) {
    return "blocked";
  }
  if (progress > 0 || (task.result_report || "").trim()) return "doing";
  return task.scheduled_date ? "scheduled" : "backlog";
}

const TASK_LEVEL_LABELS = {
  pending: "待定",
  incomplete: "未完成",
  blocked: "有阻碍",
  done: "已完成",
  cancelled: "已取消",
} as const;

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  daily: "日常",
  work: "工作",
  fun: "娱乐",
  other: "其他",
};

const CATEGORY_MARKS: Record<TaskCategory, string> = {
  daily: "日",
  work: "工",
  fun: "乐",
  other: "其",
};

function taskCategory(task: Task): TaskCategory {
  return task.category && task.category in CATEGORY_LABELS
    ? task.category
    : "work";
}

function compactTitle(title: string) {
  const trimmed = title.trim();
  return trimmed.length > 16 ? `${trimmed.slice(0, 16)}…` : trimmed;
}

function priorityLabel(priority?: number) {
  const value = priority || 3;
  return ["", "P1 最高", "P2 较高", "P3 普通", "P4 较低", "P5 最低"][
    value
  ];
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function shiftDateValue(value: string, offsetDays: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return localDate(date);
}

function dateDistance(from: string, to: string) {
  return Math.round(
    (new Date(`${to}T12:00:00`).getTime() -
      new Date(`${from}T12:00:00`).getTime()) /
      86400000,
  );
}

function makeId(prefix: string, value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${slug || crypto.randomUUID().slice(0, 8)}`;
}

function minutesLabel(value?: number | null) {
  if (!value) return "未估时";
  if (value < 60) return `${value} 分钟`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
}

function dateTitle(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${value}T12:00:00`));
}

function relativeDateTitle(value: string) {
  const selected = new Date(`${value}T12:00:00`);
  const today = new Date(`${localDate()}T12:00:00`);
  const difference = Math.round(
    (selected.getTime() - today.getTime()) / 86400000,
  );
  if (difference === 0) return "今天";
  return difference > 0
    ? `${difference}天后`
    : `${Math.abs(difference)}天前`;
}

function monthTitle(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(value);
}

function taskOccursOnDate(task: Task, dateValue: string) {
  if (!task.scheduled_date) return false;
  if (task.recurrence && task.end_date) {
    if (dateValue < task.scheduled_date || dateValue > task.end_date) {
      return false;
    }
    const weekday = new Date(`${dateValue}T12:00:00`).getDay();
    return (
      task.recurrence === "daily" ||
      (task.recurrence === "weekdays" && weekday >= 1 && weekday <= 5) ||
      (task.recurrence === "weekends" &&
        (weekday === 0 || weekday === 6))
    );
  }
  if (task.end_date) {
    return (
      task.scheduled_date <= dateValue &&
      dateValue <= task.end_date
    );
  }
  return task.scheduled_date === dateValue;
}

function taskScheduleType(task: Task): ScheduleType {
  if (!task.scheduled_date) return "backlog";
  if (task.recurrence === "daily") return "daily";
  if (task.recurrence === "weekdays") return "weekdays";
  if (task.recurrence === "weekends") return "weekends";
  return task.end_date ? "range" : "once";
}

function taskForDate(task: Task, dateValue: string): Task {
  if (!task.recurrence) return task;
  const occurrence = task.occurrence_results?.[dateValue];
  const legacyChecks = [
    ...(occurrence?.step_results || []),
    ...(occurrence?.criterion_results || []),
  ];
  const completed =
    occurrence?.completed === true ||
    (legacyChecks.length > 0 && legacyChecks.every(Boolean));
  const resultReport =
    occurrence?.result_report ||
    legacyReportsToTaskReport(task.steps, occurrence?.step_reports);
  const occurrenceTask: Task = {
    ...task,
    occurrence_date: dateValue,
    step_results:
      completed
        ? (task.steps || []).map(() => true)
        : occurrence?.step_results || (task.steps || []).map(() => false),
    step_reports:
      occurrence?.step_reports || (task.steps || []).map(() => ""),
    criterion_results:
      occurrence?.criterion_results ||
      task.acceptance_criteria.map(() => false),
    result_report: resultReport,
    paused: occurrence?.paused || false,
    status: completed
      ? "done"
      : task.status === "blocked"
        ? "blocked"
      : resultReport.trim()
        ? "doing"
        : task.scheduled_date
          ? "scheduled"
          : "backlog",
  };
  return occurrenceTask;
}

function taskOverallCompletion(task: Task) {
  if (!task.recurrence || !task.scheduled_date || !task.end_date) {
    return taskCompletion(task);
  }
  const start = new Date(`${task.scheduled_date}T12:00:00`);
  const end = new Date(`${task.end_date}T12:00:00`);
  const dates: string[] = [];
  for (
    const current = new Date(start);
    current <= end;
    current.setDate(current.getDate() + 1)
  ) {
    const value = localDate(current);
    if (taskOccursOnDate(task, value)) dates.push(value);
  }
  if (dates.length === 0) return 0;
  return Math.round(
    dates.reduce(
      (total, value) => total + taskCompletion(taskForDate(task, value)),
      0,
    ) / dates.length,
  );
}

function taskDefinition(task: Task | TaskInput) {
  return {
    parent_id: task.parent_id || null,
    milestone: task.milestone || "",
    title: task.title.trim(),
    objective: task.objective.trim(),
    why: task.why || "",
    steps: task.steps || [],
    acceptance_criteria: task.acceptance_criteria,
    scheduled_date: task.scheduled_date || null,
    end_date: task.end_date || null,
    recurrence: task.recurrence || null,
    estimated_minutes: task.estimated_minutes || null,
    priority: task.priority || 2,
    category: task.category || "work",
    dependencies: task.dependencies || [],
    source_file_refs: task.source_file_refs || [],
    note: task.note || "",
  };
}

function projectDefinition(project: Project | ProjectInput) {
  return {
    name: project.name.trim(),
    objective: project.objective.trim(),
    success_criteria: project.success_criteria || [],
    background: project.background || "",
    constraints: project.constraints || [],
    assumptions: project.assumptions || [],
    execution_improvements: project.execution_improvements || "",
    execution_tip_title:
      project.execution_tip_title || DEFAULT_EXECUTION_TIP_TITLE,
    execution_tips: project.execution_tips?.length
      ? project.execution_tips
      : DEFAULT_EXECUTION_TIPS,
    source_file_mode: project.source_file_mode || "none",
    source_file_requirements: project.source_file_requirements || [],
  };
}

function parsePlan(raw: string): PlanPayload {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("JSON 格式无法识别，请检查逗号、引号和括号。");
  }
  if (!value || typeof value !== "object") {
    throw new Error("导入内容必须是一个 JSON 对象。");
  }
  const candidate = value as {
    project?: ProjectInput;
    projects?: Project[];
    tasks?: TaskInput[];
    deleted_task_ids?: string[];
    import_metadata?: PlanPayload["import_metadata"];
    export_meta?: Store["export_meta"];
  };
  let plan: PlanPayload;
  if (candidate.project) {
    plan = {
      project: candidate.project,
      tasks: candidate.tasks || [],
      deleted_task_ids: candidate.deleted_task_ids || [],
      import_metadata: candidate.import_metadata,
    };
  } else if (
    Array.isArray(candidate.projects) &&
    candidate.projects.length === 1 &&
    Array.isArray(candidate.tasks)
  ) {
    const project = candidate.projects[0];
    plan = {
      project,
      tasks: candidate.tasks.filter(
        (task) =>
          !("project_id" in task) ||
          (task as Task).project_id === project.id,
      ),
      deleted_task_ids: [],
      import_metadata: {
        base_project_id: project.id,
        base_project_revision:
          candidate.export_meta?.project_revision || project.revision || 1,
        generated_at: candidate.export_meta?.exported_at,
      },
    };
  } else {
    throw new Error(
      "项目 JSON 必须包含 project + tasks，或只包含一个项目的 PotatoFlow 导出数据。",
    );
  }
  if (!plan.project?.name?.trim() || !plan.project.objective?.trim()) {
    throw new Error("项目必须包含 name 和 objective。");
  }
  const sourceMode = plan.project.source_file_mode || "none";
  if (!["none", "shared", "per_task"].includes(sourceMode)) {
    throw new Error(
      "source_file_mode 只能是 none、shared 或 per_task。",
    );
  }
  if (
    plan.project.source_file_requirements &&
    !Array.isArray(plan.project.source_file_requirements)
  ) {
    throw new Error("source_file_requirements 必须是数组。");
  }
  const sourceRequirementIds = new Set(
    (plan.project.source_file_requirements || []).map((requirement) =>
      requirement.id?.trim(),
    ),
  );
  if (
    sourceRequirementIds.has("") ||
    sourceRequirementIds.size !==
      (plan.project.source_file_requirements || []).length
  ) {
    throw new Error("源文件要求必须使用不重复的 id。");
  }
  if (!Array.isArray(plan.tasks)) {
    throw new Error("项目必须包含 tasks 数组；没有任务时请填写空数组。");
  }
  if (!Array.isArray(plan.deleted_task_ids)) {
    throw new Error("deleted_task_ids 必须是任务 ID 数组。");
  }
  const providedIds = plan.tasks
    .map((task) => task.id?.trim())
    .filter((id): id is string => Boolean(id));
  if (new Set(providedIds).size !== providedIds.length) {
    throw new Error("导入内容中存在重复的任务 id，请先修正。");
  }
  if (new Set(plan.deleted_task_ids).size !== plan.deleted_task_ids.length) {
    throw new Error("deleted_task_ids 中存在重复任务 ID。");
  }
  for (const [index, task] of plan.tasks.entries()) {
    if (
      !task?.title?.trim() ||
      !task.objective?.trim() ||
      !Array.isArray(task.acceptance_criteria) ||
      task.acceptance_criteria.length === 0
    ) {
      throw new Error(
        `第 ${index + 1} 个任务缺少 title、objective 或 acceptance_criteria。`,
      );
    }
    const steps = task.steps || [];
    if (new Set(steps).size !== steps.length) {
      throw new Error(
        `第 ${index + 1} 个任务包含重复执行步骤，会造成流程显示和历史对比歧义。`,
      );
    }
    if (
      new Set(task.acceptance_criteria).size !==
      task.acceptance_criteria.length
    ) {
      throw new Error(
        `第 ${index + 1} 个任务包含重复完成标准，会造成流程显示和历史对比歧义。`,
      );
    }
    if (task.source_file_refs && !Array.isArray(task.source_file_refs)) {
      throw new Error(`第 ${index + 1} 个任务的 source_file_refs 必须是数组。`);
    }
    if (task.note !== undefined && typeof task.note !== "string") {
      throw new Error(`第 ${index + 1} 个任务的 note 必须是文字。`);
    }
    const unknownRefs = (task.source_file_refs || []).filter(
      (reference) => !sourceRequirementIds.has(reference),
    );
    if (unknownRefs.length) {
      throw new Error(
        `第 ${index + 1} 个任务引用了未定义的源文件：${unknownRefs.join("、")}。`,
      );
    }
  }
  return plan;
}

function parseBackup(raw: string): Store {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("备份 JSON 无法识别，请检查内容是否完整。");
  }
  if (!isStore(value)) {
    throw new Error(
      "这不是 PotatoFlow 完整备份。完整备份必须包含 projects、tasks 和 issues。",
    );
  }
  if (
    value.projects.some(
      (project) => !project.id || !project.name || !project.objective,
    ) ||
    value.tasks.some(
      (task) =>
        !task.id ||
        !task.project_id ||
        !task.title ||
        !Array.isArray(task.acceptance_criteria),
    ) ||
    value.issues.some(
      (issue) => !issue.id || !issue.task_id || !issue.question,
    )
  ) {
    throw new Error("备份中有项目、任务或问题缺少必要字段。");
  }
  return value;
}

export default function PotatoFlowApp({
  syncEnabled,
}: {
  syncEnabled: boolean;
}) {
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [requestedLogicGraphPageId, setRequestedLogicGraphPageId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const dateInputRef = useRef<HTMLInputElement>(null);
  const taskDrawerRef = useRef<HTMLElement>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<
    "project" | "backup" | "task"
  >("project");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importStrategy, setImportStrategy] = useState<"new" | "update">(
    "new",
  );
  const [importTargetProjectId, setImportTargetProjectId] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [allowStaleImport, setAllowStaleImport] = useState(false);
  const [importSources, setImportSources] = useState<ImportSourceSelection>({
    mode: "none",
    shared: [],
    byTask: {},
  });
  const [importSourceBusy, setImportSourceBusy] = useState(false);
  const [backupConfirmText, setBackupConfirmText] = useState("");
  const [customTaskDraft, setCustomTaskDraft] = useState<CustomTaskDraft>({
    projectId: PERSONAL_PROJECT_ID,
    newProjectName: "",
    newProjectObjective: "",
    title: "",
    objective: "",
    milestone: "",
    why: "",
    note: "",
    steps: [],
    acceptanceCriteria: "",
    scheduleType: "once",
    startDate: localDate(),
    endDate: localDate(),
    estimatedMinutes: "30",
    category: "work",
    priority: 3,
  });
  const [newProjectStructureStages, setNewProjectStructureStages] = useState<
    NewProjectStructureStageDraft[]
  >([
    {
      id: "stage-draft-1",
      name: "",
      tasks: [
        {
          id: "task-draft-1",
          title: "",
          objective: "",
          scheduleType: "backlog",
          scheduledDate: localDate(),
          estimatedMinutes: "30",
        },
      ],
    },
  ]);
  const [collapsedNewProjectStages, setCollapsedNewProjectStages] = useState<
    Record<string, boolean>
  >({});
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const [exportScope, setExportScope] = useState<
    "task" | "project" | "all"
  >("project");
  const [exportProjectId, setExportProjectId] = useState("");
  const [exportTaskId, setExportTaskId] = useState("");
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [cloudDeleteConfirm, setCloudDeleteConfirm] = useState("");
  const [cloudDeleteBusy, setCloudDeleteBusy] = useState(false);
  const [cloudDeleteError, setCloudDeleteError] = useState("");
  const [cloudDeleteDone, setCloudDeleteDone] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<
    string | null
  >(null);
  const [calendarMoveNotice, setCalendarMoveNotice] = useState<{
    taskId: string;
    taskTitle: string;
    targetDate: string | null;
    previousScheduledDate: string | null;
    previousEndDate: string | null;
    previousRecurrence: Task["recurrence"];
    previousStatus: TaskStatus;
  } | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDate, setSelectedTaskDate] = useState<string | null>(
    null,
  );
  const [executionDraft, setExecutionDraft] = useState<Task | null>(null);
  const [taskDefinitionEditing, setTaskDefinitionEditing] = useState(false);
  const [openStepNoteIndex, setOpenStepNoteIndex] = useState<number | null>(
    null,
  );
  const [issueText, setIssueText] = useState("");
  const [issueBlocksTask, setIssueBlocksTask] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [issueQuestionDraft, setIssueQuestionDraft] = useState("");
  const [issueResponseDraft, setIssueResponseDraft] = useState("");
  const [issuePromptCopied, setIssuePromptCopied] = useState(false);
  const [issueExitConfirmOpen, setIssueExitConfirmOpen] = useState(false);
  const [issueExitAction, setIssueExitAction] = useState<"close" | "task">(
    "close",
  );
  const [onboardingCopied, setOnboardingCopied] = useState(false);
  const [organizationDraft, setOrganizationDraft] = useState<{
    taskId: string;
    category: TaskCategory;
    priority: number;
  } | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [selectedPlanProjectId, setSelectedPlanProjectId] = useState<
    string | null
  >(null);
  const [planExitConfirmOpen, setPlanExitConfirmOpen] = useState(false);
  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] =
    useState(false);
  const [deleteProjectConfirmText, setDeleteProjectConfirmText] =
    useState("");
  const [improvementDraft, setImprovementDraft] = useState("");
  const [executionTipTitleDraft, setExecutionTipTitleDraft] = useState("");
  const [executionTipsDraft, setExecutionTipsDraft] = useState("");
  const [projectEditDraft, setProjectEditDraft] =
    useState<ProjectEditDraft | null>(null);
  const [projectTaskDrafts, setProjectTaskDrafts] = useState<Task[]>([]);
  const [projectTaskDraftProjectId, setProjectTaskDraftProjectId] = useState<
    string | null
  >(null);
  const [projectTaskBaseline, setProjectTaskBaseline] = useState("[]");
  const [projectMilestoneDrafts, setProjectMilestoneDrafts] = useState<string[]>([]);
  const [projectMilestoneBaseline, setProjectMilestoneBaseline] = useState("[]");
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [collapsedProjectMilestones, setCollapsedProjectMilestones] = useState<
    Record<string, boolean>
  >({});
  const collapsedProjectMilestonesLoadedRef = useRef(false);
  const [swipedProjectTaskId, setSwipedProjectTaskId] = useState<string | null>(null);
  const projectTaskSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [planUndoStack, setPlanUndoStack] = useState<PlanUndoSnapshot[]>([]);
  const planOperationKeyRef = useRef<string | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [collapsedTaskGroups, setCollapsedTaskGroups] = useState<
    Partial<Record<TaskCategory, boolean>>
  >({});
  const [filePreview, setFilePreview] = useState<{
    name: string;
    kind: "pdf" | "text";
    url?: string;
    content?: string;
  } | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [sourceUploadTarget, setSourceUploadTarget] = useState("__all__");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    syncEnabled ? "checking" : "local",
  );
  const [syncError, setSyncError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [syncChoice, setSyncChoice] = useState<SyncChoice | null>(null);
  const [selectedSyncCopy, setSelectedSyncCopy] = useState<"local" | "cloud" | null>(null);
  const [cloudRevision, setCloudRevision] = useState(0);
  const [syncRetry, setSyncRetry] = useState(0);
  const syncReadyRef = useRef(false);
  const lastCloudPayloadRef = useRef("");
  const syncRequestRef = useRef(false);
  const latestStoreRef = useRef(store);
  latestStoreRef.current = store;

  useEffect(() => {
    const stored = readStoredData();
    // Hydrate once from the browser-owned local store after SSR has finished.
    if (stored) setStore(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const result = writeStoredData(store);
      setStorageError(
        result === "quota"
          ? "本机存储空间不足，最新修改暂时无法保存。请先导出备份或清理浏览器空间。"
          : result === "error"
            ? "本机保存出现问题，请先导出备份后刷新重试。"
            : "",
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [store, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const flushLatestStore = () => {
      writeStoredData(latestStoreRef.current);
    };
    window.addEventListener("pagehide", flushLatestStore);
    return () => window.removeEventListener("pagehide", flushLatestStore);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !syncEnabled) return;
    let cancelled = false;
    syncReadyRef.current = false;

    async function loadCloudData() {
      setSyncStatus("checking");
      setSyncError("");
      try {
        const response = await fetch("/api/sync", { cache: "no-store" });
        if (!response.ok) throw new Error("暂时无法读取云端数据。");
        const data = (await response.json()) as {
          snapshot: Store | null;
          revision: number;
          updated_at: string | null;
        };
        if (cancelled) return;

        const localStore = readStoredData() || EMPTY_STORE;
        const localPayload = serializedStore(localStore);
        setCloudRevision(data.revision);

        if (!data.snapshot) {
          if (storeHasContent(localStore)) {
            setSyncChoice({
              kind: "first-upload",
              cloudStore: null,
              cloudRevision: 0,
              cloudUpdatedAt: null,
              localUpdatedAt: readLocalUpdatedAt(localStore),
            });
            setSyncStatus("choice");
          } else {
            lastCloudPayloadRef.current = "";
            syncReadyRef.current = true;
            setSyncStatus("ready");
          }
          return;
        }

        const cloudPayload = serializedStore(data.snapshot);
        if (!storeHasContent(localStore)) {
          setStore(data.snapshot);
          writeStoredData(data.snapshot);
          lastCloudPayloadRef.current = cloudPayload;
          syncReadyRef.current = true;
          setSyncStatus("ready");
        } else if (storesSemanticallyEqual(localStore, data.snapshot)) {
          lastCloudPayloadRef.current = localPayload;
          syncReadyRef.current = true;
          setSyncStatus("ready");
        } else {
          setSyncChoice({
            kind: "different",
            cloudStore: data.snapshot,
            cloudRevision: data.revision,
            cloudUpdatedAt: data.updated_at,
            localUpdatedAt: readLocalUpdatedAt(localStore),
          });
          setSyncStatus("choice");
        }
      } catch (error) {
        if (cancelled) return;
        setSyncError(
          error instanceof Error ? error.message : "暂时无法连接云端。",
        );
        setSyncStatus("offline");
      }
    }

    void loadCloudData();
    return () => {
      cancelled = true;
    };
  }, [hydrated, syncEnabled, syncRetry]);

  useEffect(() => {
    function retryWhenOnline() {
      if (syncEnabled && syncStatus === "offline") {
        setSyncRetry((value) => value + 1);
      }
    }
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [syncStatus, syncEnabled]);

  useEffect(() => {
    if (
      !hydrated ||
      !syncEnabled ||
      !syncReadyRef.current ||
      syncChoice ||
      syncRequestRef.current
    ) {
      return;
    }
    const timer = window.setTimeout(async () => {
      const payload = serializedStore(store);
      if (payload === lastCloudPayloadRef.current) return;
      syncRequestRef.current = true;
      setSyncStatus("saving");
      try {
        const response = await fetch("/api/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot: storeForSync(store),
            base_revision: cloudRevision,
          }),
        });
        const data = (await response.json()) as {
          error?: string;
          snapshot?: Store | null;
          revision?: number;
          updated_at?: string | null;
        };
        if (response.status === 409) {
          if (data.snapshot && storesSemanticallyEqual(store, data.snapshot)) {
            lastCloudPayloadRef.current = payload;
            setCloudRevision(data.revision || cloudRevision);
            syncReadyRef.current = true;
            setSyncChoice(null);
            setSelectedSyncCopy(null);
            setSyncError("");
            setSyncStatus("ready");
            return;
          }
          syncReadyRef.current = false;
          setSyncChoice({
            kind: "conflict",
            cloudStore: data.snapshot || null,
            cloudRevision: data.revision || 0,
            cloudUpdatedAt: data.updated_at || null,
            localUpdatedAt: readLocalUpdatedAt(store),
          });
          setSyncStatus("choice");
          return;
        }
        if (!response.ok || typeof data.revision !== "number") {
          throw new Error(data.error || "同步没有完成。你的数据仍保存在本机。");
        }
        lastCloudPayloadRef.current = payload;
        setCloudRevision(data.revision);
        setSyncError("");
        setSyncStatus("ready");
      } catch (error) {
        setSyncError(
          error instanceof Error
            ? error.message
            : "同步没有完成。你的数据仍保存在本机。",
        );
        setSyncStatus("offline");
      } finally {
        syncRequestRef.current = false;
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [store, hydrated, syncEnabled, cloudRevision, syncChoice]);

  function applyCloudCopy() {
    if (!syncChoice?.cloudStore) return;
    if (storeHasContent(store)) {
      saveImportSnapshot(store, "切换云端数据前的本机备份");
    }
    const next = syncChoice.cloudStore;
    setStore(next);
    writeStoredData(next);
    lastCloudPayloadRef.current = serializedStore(next);
    setCloudRevision(syncChoice.cloudRevision);
    syncReadyRef.current = true;
    setSyncChoice(null);
    setSelectedSyncCopy(null);
    setSyncError("");
    setSyncStatus("ready");
  }

  async function uploadLocalCopy() {
    if (!syncChoice || syncRequestRef.current) return;
    syncRequestRef.current = true;
    setSyncStatus("saving");
    setSyncError("");
    const payload = serializedStore(store);
    try {
      const response = await fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: storeForSync(store),
          base_revision: syncChoice.cloudRevision,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        snapshot?: Store | null;
        revision?: number;
        updated_at?: string | null;
      };
      if (response.status === 409) {
        if (data.snapshot && storesSemanticallyEqual(store, data.snapshot)) {
          lastCloudPayloadRef.current = payload;
          setCloudRevision(data.revision || syncChoice.cloudRevision);
          syncReadyRef.current = true;
          setSyncChoice(null);
          setSelectedSyncCopy(null);
          setSyncStatus("ready");
          return;
        }
        setSyncChoice({
          kind: "conflict",
          cloudStore: data.snapshot || null,
          cloudRevision: data.revision || 0,
          cloudUpdatedAt: data.updated_at || null,
          localUpdatedAt: readLocalUpdatedAt(store),
        });
        setSyncStatus("choice");
        return;
      }
      if (!response.ok || typeof data.revision !== "number") {
        throw new Error(data.error || "本机数据暂时无法上传。");
      }
      lastCloudPayloadRef.current = payload;
      setCloudRevision(data.revision);
      syncReadyRef.current = true;
      setSyncChoice(null);
      setSelectedSyncCopy(null);
      setSyncStatus("ready");
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "本机数据暂时无法上传。",
      );
      setSyncStatus("offline");
    } finally {
      syncRequestRef.current = false;
    }
  }

  function updateStore(updater: (current: Store) => Store) {
    setStore((current) => {
      const next = updater(current);
      writeStoredData(next);
      return next;
    });
  }

  function moveTaskFromCalendar(
    taskId: string,
    occurrenceDate: string,
    targetDate: string,
  ) {
    if (!targetDate || targetDate === occurrenceDate) return;
    const storedTask = store.tasks.find((task) => task.id === taskId);
    if (!storedTask) return;
    const offsetDays = dateDistance(occurrenceDate, targetDate);
    updateStore((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const nextStart = task.scheduled_date
          ? shiftDateValue(task.scheduled_date, offsetDays)
          : targetDate;
        return {
          ...task,
          scheduled_date: nextStart,
          end_date: task.end_date
            ? shiftDateValue(task.end_date, offsetDays)
            : null,
          status: task.status === "backlog" ? "scheduled" : task.status,
          revision: (task.revision || 1) + 1,
          updated_at: new Date().toISOString(),
        };
      }),
    }));
    setCalendarMoveNotice({
      taskId: storedTask.id,
      taskTitle: storedTask.title,
      targetDate,
      previousScheduledDate: storedTask.scheduled_date,
      previousEndDate: storedTask.end_date,
      previousRecurrence: storedTask.recurrence,
      previousStatus: storedTask.status,
    });
  }

  function moveTaskToBacklog(taskId: string) {
    const storedTask = store.tasks.find((task) => task.id === taskId);
    if (!storedTask) return;
    updateStore((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              scheduled_date: null,
              end_date: null,
              recurrence: null,
              status: task.status === "done" ? "done" : "backlog",
              paused: false,
              revision: (task.revision || 1) + 1,
              updated_at: new Date().toISOString(),
            }
          : task,
      ),
    }));
    setCalendarMoveNotice({
      taskId: storedTask.id,
      taskTitle: storedTask.title,
      targetDate: null,
      previousScheduledDate: storedTask.scheduled_date,
      previousEndDate: storedTask.end_date,
      previousRecurrence: storedTask.recurrence,
      previousStatus: storedTask.status,
    });
  }

  function scheduleBacklogTask(taskId: string, targetDate: string) {
    if (!targetDate) return;
    updateStore((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              scheduled_date: targetDate,
              end_date: null,
              recurrence: null,
              status: task.status === "done" ? "done" : "scheduled",
              revision: (task.revision || 1) + 1,
              updated_at: new Date().toISOString(),
            }
          : task,
      ),
    }));
  }

  function undoCalendarMove() {
    if (!calendarMoveNotice) return;
    const notice = calendarMoveNotice;
    updateStore((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === notice.taskId
          ? {
              ...task,
              scheduled_date: notice.previousScheduledDate,
              end_date: notice.previousEndDate,
              recurrence: notice.previousRecurrence,
              status: notice.previousStatus,
              revision: (task.revision || 1) + 1,
              updated_at: new Date().toISOString(),
            }
          : task,
      ),
    }));
    setCalendarMoveNotice(null);
  }

  function createTaskForCalendarDate(dateValue: string) {
    setCustomTaskDraft((current) => ({
      ...current,
      scheduleType: "once",
      startDate: dateValue,
      endDate: dateValue,
    }));
    setImportMode("task");
    setImportOpen(true);
    setSelectedCalendarDate(null);
    setCalendarMoveNotice(null);
  }

  const storedSelectedTask = store.tasks.find(
    (task) => task.id === selectedTaskId,
  );
  const datedSelectedTask =
    storedSelectedTask && selectedTaskDate
      ? taskForDate(storedSelectedTask, selectedTaskDate)
      : storedSelectedTask;
  const selectedTask =
    executionDraft?.id === selectedTaskId
      ? executionDraft
      : datedSelectedTask;
  const selectedTaskProgress = selectedTask
    ? taskCompletion(selectedTask)
    : 0;
  const selectedProject = selectedTask
    ? store.projects.find((project) => project.id === selectedTask.project_id)
    : undefined;
  const selectedTaskMilestones = selectedProject
    ? Array.from(
        new Set(
          [
            ...(selectedProject.milestones || []),
            ...store.tasks
              .filter((task) => task.project_id === selectedProject.id)
              .map((task) => task.milestone?.trim() || "未分组任务"),
          ].filter(Boolean),
        ),
      )
    : [];
  const selectedTaskMilestone =
    selectedTask?.milestone?.trim() || "未分组任务";
  const selectedTaskMilestoneIndex = Math.max(
    0,
    selectedTaskMilestones.indexOf(selectedTaskMilestone),
  );
  const selectedTaskThemeClass = [
    styles.taskThemeBlue,
    styles.taskThemeOrange,
    styles.taskThemePurple,
    styles.taskThemeGreen,
  ][selectedTaskMilestoneIndex % 4];
  const selectedTaskSourceFiles = selectedProject
    ? (selectedProject.source_files || []).filter((file) =>
        (selectedTask?.source_file_ids || []).includes(file.id),
      )
    : [];
  const planProject = store.projects.find(
    (project) => project.id === selectedPlanProjectId,
  );

  useEffect(() => {
    if (!selectedTaskId) {
      // Reset drafts when the user leaves the task workspace.
      setOrganizationDraft(null);
      setExecutionDraft(null);
      setTaskDefinitionEditing(false);
      setOpenStepNoteIndex(null);
      setTaskDefinitionEditing(false);
      return;
    }
    const storedTask = store.tasks.find((item) => item.id === selectedTaskId);
    const task =
      storedTask && selectedTaskDate
        ? taskForDate(storedTask, selectedTaskDate)
        : storedTask;
    if (task) {
      setExecutionDraft({
        ...task,
        step_results: [...(task.step_results || [])],
        step_reports: [...(task.step_reports || [])],
        criterion_results: [...(task.criterion_results || [])],
        result_report: task.result_report || "",
      });
      setOrganizationDraft({
        taskId: task.id,
        category: taskCategory(task),
        priority: task.priority || 3,
      });
      setOpenStepNoteIndex(null);
    }
    // Drafts intentionally refresh only when the selected task occurrence changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId, selectedTaskDate]);

  useEffect(() => {
    if (selectedTaskId && taskDrawerRef.current) {
      taskDrawerRef.current.scrollTop = 0;
    }
  }, [selectedTaskId, selectedTaskDate]);

  useEffect(() => {
    if (planProject) {
      // A different project needs a fresh, independent editing session.
      setPlanUndoStack([]);
      planOperationKeyRef.current = null;
      setProjectEditDraft(null);
      const taskDrafts = store.tasks
        .filter((task) => task.project_id === planProject.id)
        .map((task) => ({
          ...task,
          steps: [...(task.steps || [])],
          acceptance_criteria: [...task.acceptance_criteria],
          dependencies: [...(task.dependencies || [])],
          notes: [...(task.notes || [])],
          step_results: [...(task.step_results || [])],
          step_reports: [...(task.step_reports || [])],
          criterion_results: [...(task.criterion_results || [])],
        }));
      setProjectTaskDrafts(taskDrafts);
      setProjectTaskBaseline(JSON.stringify(taskDrafts));
      const milestoneDrafts = Array.from(
        new Set([
          ...(planProject.milestones || []),
          ...taskDrafts.map((task) => task.milestone?.trim()).filter(Boolean),
        ] as string[]),
      );
      setProjectMilestoneDrafts(milestoneDrafts);
      setProjectMilestoneBaseline(JSON.stringify(milestoneDrafts));
      setNewMilestoneName("");
      setAddingMilestone(false);
      setSwipedProjectTaskId(null);
      setProjectTaskDraftProjectId(planProject.id);
      setImprovementDraft(planProject.execution_improvements || "");
      setExecutionTipTitleDraft(
        planProject.execution_tip_title || DEFAULT_EXECUTION_TIP_TITLE,
      );
      setExecutionTipsDraft(
        (planProject.execution_tips?.length
          ? planProject.execution_tips
          : DEFAULT_EXECUTION_TIPS
        ).join("\n"),
      );
      setFileError("");
    }
    // The project editor must not be overwritten by background store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanProjectId]);

  const projectContentChanged =
    Boolean(planProject && projectEditDraft?.projectId === planProject.id) &&
    (projectEditDraft?.name.trim() !== planProject?.name ||
      projectEditDraft?.objective.trim() !== planProject?.objective ||
      projectEditDraft?.background.trim() !==
        (planProject?.background || "") ||
      projectEditDraft?.successCriteria.trim() !==
        (planProject?.success_criteria || []).join("\n") ||
      projectEditDraft?.constraints.trim() !==
        (planProject?.constraints || []).join("\n") ||
      projectEditDraft?.assumptions.trim() !==
        (planProject?.assumptions || []).join("\n"));
  const projectTasksChanged =
    Boolean(
      planProject &&
        projectTaskDraftProjectId === planProject.id,
    ) &&
    JSON.stringify(projectTaskDrafts.map(taskDefinition)) !==
      JSON.stringify(
        (JSON.parse(projectTaskBaseline) as Task[]).map(taskDefinition),
      );
  const projectMilestonesChanged =
    JSON.stringify(projectMilestoneDrafts) !== projectMilestoneBaseline;
  const planHasUnsavedChanges =
    Boolean(
      planProject &&
        projectTaskDraftProjectId === planProject.id,
    ) &&
    (projectContentChanged ||
      projectTasksChanged ||
      projectMilestonesChanged ||
      executionTipTitleDraft.trim() !==
        (planProject?.execution_tip_title || DEFAULT_EXECUTION_TIP_TITLE) ||
      executionTipsDraft.trim() !==
        (planProject?.execution_tips?.length
          ? planProject.execution_tips
          : DEFAULT_EXECUTION_TIPS
        ).join("\n") ||
      improvementDraft.trim() !==
        (planProject?.execution_improvements || ""));
  const projectCommonCategory =
    projectTaskDrafts.length > 0 &&
    projectTaskDrafts.every(
      (task) =>
        taskCategory(task) === taskCategory(projectTaskDrafts[0]),
    )
      ? taskCategory(projectTaskDrafts[0])
      : null;
  const visibleMilestones = (() => {
    const ungroupedMilestone = "未分组任务";
    const orderedMilestones = Array.from(
      new Set([
        ...projectMilestoneDrafts,
        ...projectTaskDrafts.map(
          (task) => task.milestone?.trim() || ungroupedMilestone,
        ),
      ]),
    );

    // Milestones are a timeline: keep their saved/creation order and always
    // place the fallback group at the end. Adding a milestone must never
    // renumber an existing stage by inserting before it.
    return [
      ...orderedMilestones.filter(
        (milestone) => milestone !== ungroupedMilestone,
      ),
      ...orderedMilestones.filter(
        (milestone) => milestone === ungroupedMilestone,
      ),
    ];
  })();
  const projectTaskGroups = visibleMilestones.map((milestone) => ({
    milestone,
    tasks: projectTaskDrafts.filter(
      (task) => (task.milestone?.trim() || "未分组任务") === milestone,
    ),
  }));
  const projectMilestoneKey = (milestone: string) =>
    `${selectedPlanProjectId || "unknown"}:${milestone}`;
  const allProjectMilestonesCollapsed =
    projectTaskGroups.length > 0 &&
    projectTaskGroups.every(
      (group) => collapsedProjectMilestones[projectMilestoneKey(group.milestone)],
    );

  useEffect(() => {
    try {
      const stored = localStorage.getItem("potatoflow:collapsed-project-milestones");
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        setCollapsedProjectMilestones(parsed);
      }
    } catch {
      // A damaged UI preference must never prevent the project from opening.
    } finally {
      collapsedProjectMilestonesLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!collapsedProjectMilestonesLoadedRef.current) return;
    localStorage.setItem(
      "potatoflow:collapsed-project-milestones",
      JSON.stringify(collapsedProjectMilestones),
    );
  }, [collapsedProjectMilestones]);

  const todayTasks = useMemo(
    () =>
      store.tasks
        .filter(
          (task) =>
            taskOccursOnDate(task, selectedDate) &&
            task.status !== "cancelled",
        )
        .map((task) => taskForDate(task, selectedDate))
        .sort(
          (a, b) =>
            Number(taskCompletion(a) === 100) -
              Number(taskCompletion(b) === 100) ||
            (a.priority || 2) - (b.priority || 2),
        ),
    [selectedDate, store.tasks],
  );

  function openTask(taskId: string, occurrenceDate?: string | null) {
    setSelectedTaskDate(occurrenceDate || null);
    setSelectedTaskId(taskId);
  }

  function jumpToTaskSection(section: string) {
    taskDrawerRef.current
      ?.querySelector<HTMLElement>(`[data-task-section="${section}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const todayGroups = useMemo(() => {
    const groups = new Map<
      TaskCategory,
      {
        category: TaskCategory;
        tasks: Task[];
      }
    >();
    todayTasks.forEach((task) => {
      const category = taskCategory(task);
      const current = groups.get(category);
      if (current) {
        current.tasks.push(task);
      } else {
        groups.set(category, {
          category,
          tasks: [task],
        });
      }
    });
    const order: TaskCategory[] = ["daily", "work", "fun", "other"];
    return order.flatMap((category) => {
      const group = groups.get(category);
      return group ? [group] : [];
    });
  }, [todayTasks]);

  const recentImportSnapshots =
    hydrated && importOpen ? readImportSnapshots() : [];

  const openIssues = store.issues.filter((issue) => issue.status !== "resolved");
  const selectedIssue = store.issues.find(
    (issue) => issue.id === selectedIssueId,
  );
  const selectedIssueTask = selectedIssue
    ? store.tasks.find((task) => task.id === selectedIssue.task_id)
    : undefined;
  const selectedIssueProject = selectedIssue
    ? store.projects.find((project) => project.id === selectedIssue.project_id)
    : undefined;
  const selectedIssueSourceFiles = selectedIssueProject
    ? (selectedIssueProject.source_files || []).filter((file) =>
        (selectedIssueTask?.source_file_ids || []).includes(file.id),
      )
    : [];
  const issueHasUnsavedChanges =
    Boolean(selectedIssue) &&
    (issueQuestionDraft.trim() !== selectedIssue?.question ||
      issueResponseDraft.trim() !== (selectedIssue?.response || ""));
  const exportSelectedProject =
    store.projects.find((project) => project.id === exportProjectId) ||
    store.projects[0];
  const exportProjectTasks = exportSelectedProject
    ? store.tasks.filter(
        (task) => task.project_id === exportSelectedProject.id,
      )
    : [];
  const exportSelectedTask =
    exportProjectTasks.find((task) => task.id === exportTaskId) ||
    exportProjectTasks[0];
  const exportMeta: Store["export_meta"] = {
    exported_at: new Date().toISOString(),
    scope: exportScope,
    project_id: exportSelectedProject?.id,
    project_revision: exportSelectedProject?.revision || 1,
  };
  const exportData: Store =
    exportScope === "all"
      ? { ...store, export_meta: exportMeta }
      : exportScope === "task" && exportSelectedTask
        ? {
            schema_version: 1,
            projects: exportSelectedProject ? [exportSelectedProject] : [],
            tasks: [exportSelectedTask],
            issues: store.issues.filter(
              (issue) => issue.task_id === exportSelectedTask.id,
            ),
            export_meta: exportMeta,
          }
        : {
            schema_version: 1,
            projects: exportSelectedProject ? [exportSelectedProject] : [],
            tasks: exportProjectTasks,
            issues: exportSelectedProject
              ? store.issues.filter(
                  (issue) =>
                    issue.project_id === exportSelectedProject.id,
                )
              : [],
            export_meta: exportMeta,
          };
  useEffect(() => {
    // Issue drafts are scoped to the issue the user explicitly opened.
    setIssueQuestionDraft(selectedIssue?.question || "");
    setIssueResponseDraft(selectedIssue?.response || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssueId]);
  const organizationChanged =
    Boolean(storedSelectedTask && organizationDraft) &&
    organizationDraft?.taskId === storedSelectedTask?.id &&
    (organizationDraft.category !== taskCategory(storedSelectedTask) ||
      organizationDraft.priority !== (storedSelectedTask.priority || 3));
  const executionChanged =
    Boolean(datedSelectedTask && executionDraft) &&
    (executionDraft?.status !== datedSelectedTask?.status ||
      JSON.stringify(executionDraft?.step_results || []) !==
        JSON.stringify(datedSelectedTask?.step_results || []) ||
      JSON.stringify(executionDraft?.step_reports || []) !==
        JSON.stringify(datedSelectedTask?.step_reports || []) ||
      JSON.stringify(taskDefinition(executionDraft as Task)) !==
        JSON.stringify(taskDefinition(datedSelectedTask as Task)) ||
      (executionDraft?.result_report || "") !==
        (datedSelectedTask?.result_report || "") ||
      executionDraft?.paused !== datedSelectedTask?.paused ||
      (executionDraft?.note || "") !== (datedSelectedTask?.note || ""));
  const taskHasUnsavedChanges =
    organizationChanged ||
    executionChanged ||
    issueText.trim().length > 0 ||
    issueBlocksTask;

  function finishClosingTask() {
    setExitConfirmOpen(false);
    setSelectedTaskId(null);
    setSelectedTaskDate(null);
    setOrganizationDraft(null);
    setExecutionDraft(null);
    setTaskDefinitionEditing(false);
    setOpenStepNoteIndex(null);
    setIssueText("");
    setIssueBlocksTask(false);
  }

  function requestCloseTask() {
    if (taskHasUnsavedChanges) {
      setExitConfirmOpen(true);
    } else {
      finishClosingTask();
    }
  }

  function saveOrganizationAndClose() {
    if (!selectedTask) return;
    const keptStepIndexes = (selectedTask.steps || [])
      .map((step, index) => ({ step: step.trim(), index }))
      .filter((item) => item.step.length > 0);
    const cleanedCriteria = selectedTask.acceptance_criteria
      .map((criterion) => criterion.trim())
      .filter(Boolean);
    const taskToSave: Task = {
      ...selectedTask,
      title: selectedTask.title.trim(),
      objective: selectedTask.objective.trim() || selectedTask.title.trim(),
      milestone: selectedTask.milestone?.trim() || "",
      why: selectedTask.why?.trim() || "",
      steps: keptStepIndexes.map((item) => item.step),
      step_results: keptStepIndexes.map(
        (item) => selectedTask.step_results?.[item.index] === true,
      ),
      step_reports: keptStepIndexes.map(
        (item) => selectedTask.step_reports?.[item.index] || "",
      ),
      acceptance_criteria: cleanedCriteria.length
        ? cleanedCriteria
        : [`完成“${selectedTask.title.trim()}”并记录结果`],
    };
    const issue: Issue | null = issueText.trim()
      ? {
          id: `issue-${crypto.randomUUID()}`,
          task_id: taskToSave.id,
          project_id: taskToSave.project_id,
          question: issueText.trim(),
          attempts: [],
          status: "open",
          response: "",
          created_at: new Date().toISOString(),
          blocks_task: issueBlocksTask,
        }
      : null;
    updateStore((current) => ({
      ...current,
      projects: current.projects.map((project) => {
        if (project.id !== taskToSave.project_id) return project;
        const milestone = taskToSave.milestone?.trim();
        if (!milestone || (project.milestones || []).includes(milestone)) {
          return project;
        }
        return {
          ...project,
          milestones: [...(project.milestones || []), milestone],
          revision: (project.revision || 1) + 1,
          updated_at: new Date().toISOString(),
        };
      }),
      tasks: current.tasks.map((task) => {
        if (task.id !== taskToSave.id) return task;
        const category =
          organizationDraft?.category || taskCategory(taskToSave);
        const priority =
          organizationDraft?.priority || taskToSave.priority || 3;
        if (task.recurrence && selectedTaskDate) {
          const occurrence_results = {
            ...(task.occurrence_results || {}),
            [selectedTaskDate]: {
              step_results: [...(taskToSave.step_results || [])],
              step_reports: [...(taskToSave.step_reports || [])],
              criterion_results: [
                ...(taskToSave.criterion_results || []),
              ],
              result_report: taskToSave.result_report || "",
              completed: taskToSave.status === "done",
              paused: taskToSave.paused || false,
            },
          };
          return {
            ...task,
            title: taskToSave.title,
            objective: taskToSave.objective,
            milestone: taskToSave.milestone,
            why: taskToSave.why,
            steps: taskToSave.steps,
            acceptance_criteria: taskToSave.acceptance_criteria,
            scheduled_date: taskToSave.scheduled_date,
            end_date: taskToSave.end_date,
            recurrence: taskToSave.recurrence,
            estimated_minutes: taskToSave.estimated_minutes,
            category,
            priority,
            note: taskToSave.note || "",
            occurrence_results,
            status:
              issue?.blocks_task === true
                ? "blocked"
                : task.status === "done"
                  ? task.scheduled_date
                    ? "scheduled"
                    : "backlog"
                  : task.status,
          };
        }
        return {
          ...taskToSave,
          occurrence_date: undefined,
          category,
          priority,
          result_report: taskToSave.result_report || "",
          status:
            issue?.blocks_task === true
              ? "blocked"
              : taskStatusFromProgress(taskToSave),
        };
      }),
      issues: issue ? [...current.issues, issue] : current.issues,
    }));
    finishClosingTask();
  }

  function saveIssueChanges() {
    if (!selectedIssue || !issueQuestionDraft.trim()) return;
    updateStore((current) => ({
      ...current,
      issues: current.issues.map((issue) =>
        issue.id === selectedIssue.id
          ? {
              ...issue,
              question: issueQuestionDraft.trim(),
              response: issueResponseDraft.trim(),
              status: issueResponseDraft.trim() ? "answered" : "open",
            }
          : issue,
      ),
    }));
  }

  async function writeClipboardText(content: string) {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  async function copyIssuePrompt() {
    if (!selectedIssue) return;
    const task = selectedIssueTask;
    const project = selectedIssueProject;
    const steps = task?.steps?.length
      ? task.steps
          .map(
            (step, index) =>
              `- [${task.step_results?.[index] ? "已完成" : "未完成"}] ${step}${
                task.step_reports?.[index]
                  ? `\n  步骤备注：${task.step_reports[index]}`
                  : ""
              }`,
          )
          .join("\n")
      : "未记录执行步骤";
    const prompt = `请作为问题解决顾问，结合下面的完整上下文，帮我解决当前任务阻碍。不要只给泛泛建议，也不要重新复述问题。

【项目】${project?.name || "原项目已不存在"}
【项目目标】${project?.objective || "未记录"}
【项目背景】${project?.background || "未记录"}
【限制条件】${project?.constraints?.length ? project.constraints.join("；") : "未记录"}

【当前任务】${task?.title || "原任务已不存在"}
【任务目标】${task?.objective || "未记录"}
【为什么做】${task?.why || "未记录"}
【任务备注】${task?.note || "无"}
【相关源文件】${selectedIssueSourceFiles.length ? selectedIssueSourceFiles.map((file) => file.name).join("、") : "无"}

【执行步骤与当前进度】
${steps}

【完成标准】
${task?.acceptance_criteria?.length ? task.acceptance_criteria.map((criterion) => `- ${criterion}`).join("\n") : "未记录"}

【当前完成情况】
${task?.result_report || "尚未汇报"}

【当前阻碍】
${issueQuestionDraft.trim() || selectedIssue.question}

【已经尝试】
${selectedIssue.attempts?.length ? selectedIssue.attempts.map((attempt) => `- ${attempt}`).join("\n") : "尚未记录"}

请按以下结构回答：
1. 最可能的原因（按可能性排序）
2. 现在最应该先做的一件事
3. 可直接执行的解决步骤
4. 每一步如何判断是否有效
5. 如果方案失败，下一套备选方案
6. 需要我补充的关键信息（仅列真正影响判断的内容）`;
    await writeClipboardText(prompt);
    setIssuePromptCopied(true);
    window.setTimeout(() => setIssuePromptCopied(false), 2200);
  }

  function beginSwipe(event: React.TouchEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) {
      swipeStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    swipeStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function finishSwipe(
    event: React.TouchEvent<HTMLElement>,
    onLeft?: () => void,
    onRight?: () => void,
  ) {
    const start = swipeStartRef.current;
    const touch = event.changedTouches[0];
    swipeStartRef.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) {
      return;
    }
    if (deltaX < 0) onLeft?.();
    else onRight?.();
  }

  function moveSelectedDate(offset: number) {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + offset);
    setSelectedDate(localDate(date));
  }

  function finishClosingIssue(action: "close" | "task" = issueExitAction) {
    const taskId = selectedIssue?.task_id;
    const taskDate = selectedIssueTask?.scheduled_date;
    setIssueExitConfirmOpen(false);
    setSelectedIssueId(null);
    setIssueQuestionDraft("");
    setIssueResponseDraft("");
    if (action === "task" && taskId) {
      openTask(taskId, taskDate);
    }
  }

  function requestCloseIssue(action: "close" | "task" = "close") {
    setIssueExitAction(action);
    if (issueHasUnsavedChanges) {
      setIssueExitConfirmOpen(true);
    } else {
      finishClosingIssue(action);
    }
  }

  function saveIssueAndContinue() {
    if (!selectedIssue || !issueQuestionDraft.trim()) return;
    const action = issueExitAction;
    saveIssueChanges();
    finishClosingIssue(action);
  }

  async function copyOnboardingPrompt() {
    await writeClipboardText(ONBOARDING_PROMPT);
    setOnboardingCopied(true);
    window.setTimeout(() => setOnboardingCopied(false), 1800);
  }

  function validateSourceFileList(files: File[]) {
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error(`“${file.name}”超过 20MB，暂时无法添加。`);
      }
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["pdf", "docx", "txt", "md"].includes(extension)) {
        throw new Error(
          `“${file.name}”格式不支持。请选择 PDF、DOCX、TXT 或 Markdown。`,
        );
      }
    }
  }

  function resetImportSources(mode: SourceFileMode = "none") {
    setImportSources({ mode, shared: [], byTask: {} });
  }

  function setSharedImportFiles(files: File[]) {
    try {
      validateSourceFileList(files);
      setImportError("");
      setImportSources((current) => ({ ...current, shared: files }));
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "源文件无法读取。",
      );
    }
  }

  function setTaskImportFiles(taskKey: string, files: File[]) {
    try {
      validateSourceFileList(files);
      setImportError("");
      setImportSources((current) => ({
        ...current,
        byTask: { ...current.byTask, [taskKey]: files },
      }));
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "源文件无法读取。",
      );
    }
  }

  function importSourceSelectionComplete(preview: ImportPreview | null) {
    if (!preview || importSources.mode === "none") return true;
    if (importSources.mode === "shared") {
      return importSources.shared.length > 0;
    }
    return preview.plan.tasks.every(
      (task) => (importSources.byTask[task.title] || []).length > 0,
    );
  }

  function hasPendingImportFiles() {
    return (
      importSources.shared.length > 0 ||
      Object.values(importSources.byTask).some((files) => files.length > 0)
    );
  }

  function setIssueResolved(resolved: boolean) {
    if (!selectedIssue) return;
    updateStore((current) => {
      const issues = current.issues.map((issue) =>
        issue.id === selectedIssue.id
          ? {
              ...issue,
              status: resolved
                ? ("resolved" as const)
                : issue.response
                  ? ("answered" as const)
                  : ("open" as const),
              blocks_task: resolved ? false : issue.blocks_task,
            }
          : issue,
      );
      const taskStillBlocked = issues.some(
        (issue) =>
          issue.task_id === selectedIssue.task_id &&
          issue.status !== "resolved" &&
          issue.blocks_task === true,
      );
      return {
        ...current,
        issues,
        tasks: current.tasks.map((task) =>
          task.id === selectedIssue.task_id
            ? {
                ...task,
                status: taskStatusFromProgress(task, taskStillBlocked),
              }
            : task,
        ),
      };
    });
    setSelectedIssueId(null);
  }

  function deleteSelectedIssue() {
    if (!selectedIssue) return;
    updateStore((current) => {
      const issues = current.issues.filter(
        (issue) => issue.id !== selectedIssue.id,
      );
      const taskStillBlocked = issues.some(
        (issue) =>
          issue.task_id === selectedIssue.task_id &&
          issue.status !== "resolved" &&
          issue.blocks_task === true,
      );
      return {
        ...current,
        issues,
        tasks: current.tasks.map((task) =>
          task.id === selectedIssue.task_id
            ? {
                ...task,
                status: taskStatusFromProgress(task, taskStillBlocked),
              }
            : task,
        ),
      };
    });
    setSelectedIssueId(null);
  }

  function buildImportPreview(): ImportPreview {
    const plan = parsePlan(importText);
    const targetProject =
      importStrategy === "update"
        ? store.projects.find(
            (project) => project.id === importTargetProjectId,
          )
        : undefined;
    if (importStrategy === "update" && !targetProject) {
      throw new Error("请选择需要更新的现有项目。");
    }
    const projectId =
      targetProject?.id ||
      makeId("project", plan.project.id || plan.project.name);
    if (
      importStrategy === "new" &&
      store.projects.some((project) => project.id === projectId)
    ) {
      throw new Error(
        "这个项目已经存在。请改用“合并更新已有项目”，避免创建重复项目。",
      );
    }

    const now = new Date().toISOString();
    const existingProjectTasks = store.tasks.filter(
      (task) => task.project_id === projectId,
    );
    const existingIds = new Set(store.tasks.map((task) => task.id));
    const idMap = new Map<string, string>();
    const matchedIds = new Set<string>();
    const conflicts: string[] = [];
    const incomingTitleCounts = new Map<string, number>();
    plan.tasks.forEach((task) => {
      const title = task.title.trim();
      incomingTitleCounts.set(
        title,
        (incomingTitleCounts.get(title) || 0) + 1,
      );
    });
    incomingTitleCounts.forEach((count, title) => {
      if (count > 1) {
        conflicts.push(
          `导入内容中有 ${count} 条同名任务“${title}”，请使用不同标题和稳定 ID。`,
        );
      }
    });

    plan.tasks.forEach((task) => {
      const rawId = task.id?.trim() || task.title.trim();
      const generatedId = makeId("task", rawId);
      const exactIdMatch = existingProjectTasks.find(
        (item) => item.id === generatedId,
      );
      const titleMatches = existingProjectTasks.filter(
        (item) => item.title.trim() === task.title.trim(),
      );
      if (
        exactIdMatch &&
        titleMatches.length === 1 &&
        titleMatches[0].id !== exactIdMatch.id
      ) {
        conflicts.push(
          `“${task.title}”的任务 ID 与标题分别指向两条旧任务，请先统一 ID。`,
        );
      }
      if (!exactIdMatch && titleMatches.length > 1) {
        conflicts.push(
          `项目中有多条同名任务“${task.title}”，无法安全判断更新哪一条。`,
        );
      }
      const existing = exactIdMatch || titleMatches[0];
      let finalId = existing?.id || generatedId;
      if (!existing && existingIds.has(finalId)) {
        finalId = makeId("task", `${projectId}-${rawId}`);
        let suffix = 2;
        while (existingIds.has(finalId)) {
          finalId = makeId("task", `${projectId}-${rawId}-${suffix}`);
          suffix += 1;
        }
      }
      if (matchedIds.has(finalId)) {
        conflicts.push(
          `两条导入任务会合并到同一个 ID“${finalId}”，请修正重复标题或 ID。`,
        );
      }
      matchedIds.add(finalId);
      existingIds.add(finalId);
      idMap.set(rawId, finalId);
    });

    const additions: string[] = [];
    const updates: string[] = [];
    const unchanged: string[] = [];
    const tasks: Task[] = plan.tasks.map((task) => {
      const id = idMap.get(task.id?.trim() || task.title.trim())!;
      const existing = existingProjectTasks.find((item) => item.id === id);
      const steps = task.steps || [];
      const criteria = task.acceptance_criteria;
      const dependencies = (task.dependencies || []).map(
        (dependencyId) =>
          idMap.get(dependencyId) || makeId("task", dependencyId),
      );
      const draft: Task = {
        id,
        project_id: projectId,
        parent_id: task.parent_id
          ? idMap.get(task.parent_id) || makeId("task", task.parent_id)
          : null,
        milestone: task.milestone || "",
        title: task.title.trim(),
        objective: task.objective.trim(),
        why: task.why || "",
        steps,
        acceptance_criteria: criteria,
        scheduled_date: task.scheduled_date || null,
        end_date: task.end_date || null,
        recurrence: task.recurrence || null,
        occurrence_results: existing?.occurrence_results || {},
        estimated_minutes: task.estimated_minutes || null,
        priority: task.priority || 2,
        category: task.category || "work",
        dependencies,
        source_file_refs:
          task.source_file_refs ?? existing?.source_file_refs ?? [],
        note: task.note ?? existing?.note ?? "",
        result_report: existing?.result_report || "",
        source_file_ids: existing?.source_file_ids || [],
        status:
          existing?.status ||
          (task.scheduled_date ? "scheduled" : "backlog"),
        paused: existing?.paused || false,
        created_at: existing?.created_at || now,
        notes: existing?.notes || [],
        step_results: steps.map((step) => {
          const oldIndex = existing?.steps?.findIndex(
            (oldStep) => oldStep === step,
          );
          return oldIndex !== undefined && oldIndex >= 0
            ? existing?.step_results?.[oldIndex] === true
            : false;
        }),
        step_reports: steps.map((step) => {
          const oldIndex = existing?.steps?.findIndex(
            (oldStep) => oldStep === step,
          );
          return oldIndex !== undefined && oldIndex >= 0
            ? existing?.step_reports?.[oldIndex] || ""
            : "";
        }),
        criterion_results: criteria.map((criterion) => {
          const oldIndex = existing?.acceptance_criteria?.findIndex(
            (oldCriterion) => oldCriterion === criterion,
          );
          return oldIndex !== undefined && oldIndex >= 0
            ? existing?.criterion_results?.[oldIndex] === true
            : false;
        }),
        revision: existing?.revision || 1,
        updated_at: existing?.updated_at || existing?.created_at || now,
        revision_history: existing?.revision_history || [],
      };
      const changed =
        !existing ||
        JSON.stringify(taskDefinition(existing)) !==
          JSON.stringify(taskDefinition(draft));
      if (!existing) {
        additions.push(draft.title);
      } else if (changed) {
        updates.push(draft.title);
        const revisionSnapshot: TaskRevision = {
          revision: existing.revision || 1,
          changed_at: now,
          source: "import",
          title: existing.title,
          objective: existing.objective,
          note: existing.note || "",
          steps: [...(existing.steps || [])],
          acceptance_criteria: [...existing.acceptance_criteria],
          step_results: [...(existing.step_results || [])],
          step_reports: [...(existing.step_reports || [])],
          criterion_results: [...(existing.criterion_results || [])],
          result_report: existing.result_report || "",
        };
        draft.revision = (existing.revision || 1) + 1;
        draft.updated_at = now;
        draft.revision_history = [
          ...(existing.revision_history || []),
          revisionSnapshot,
        ].slice(-10);
      } else {
        unchanged.push(draft.title);
      }
      const isBlocked = store.issues.some(
        (issue) =>
          issue.task_id === draft.id &&
          issue.status !== "resolved" &&
          issue.blocks_task === true,
      );
      draft.status = taskStatusFromProgress(draft, isBlocked);
      return draft;
    });

    const deletionSet = new Set(plan.deleted_task_ids);
    const incomingIds = new Set(tasks.map((task) => task.id));
    plan.deleted_task_ids
      .filter((id) => incomingIds.has(id))
      .forEach((id) =>
        conflicts.push(
          `任务 ID“${id}”同时出现在 tasks 和 deleted_task_ids 中。`,
        ),
      );
    const unknownDeletions = plan.deleted_task_ids.filter(
      (id) => !existingProjectTasks.some((task) => task.id === id),
    );
    if (unknownDeletions.length) {
      conflicts.push(
        `待删除任务不存在：${unknownDeletions.join("、")}。请使用当前项目导出重新生成。`,
      );
    }
    const deletions = existingProjectTasks
      .filter((task) => deletionSet.has(task.id))
      .map((task) => task.title);
    const retainedTasks = existingProjectTasks.filter(
      (task) => !matchedIds.has(task.id) && !deletionSet.has(task.id),
    );
    const retained = retainedTasks.map((task) => task.title);

    const projectBase: Project = {
      id: projectId,
      name: plan.project.name.trim(),
      objective: plan.project.objective.trim(),
      success_criteria:
        plan.project.success_criteria ??
        targetProject?.success_criteria ??
        [],
      background:
        plan.project.background ?? targetProject?.background ?? "",
      constraints:
        plan.project.constraints ?? targetProject?.constraints ?? [],
      assumptions:
        plan.project.assumptions ?? targetProject?.assumptions ?? [],
      execution_improvements:
        plan.project.execution_improvements ??
        targetProject?.execution_improvements ??
        "",
      execution_tip_title:
        plan.project.execution_tip_title ??
        targetProject?.execution_tip_title ??
        DEFAULT_EXECUTION_TIP_TITLE,
      execution_tips:
        plan.project.execution_tips ??
        targetProject?.execution_tips ??
        DEFAULT_EXECUTION_TIPS,
      source_file_mode:
        plan.project.source_file_mode ??
        targetProject?.source_file_mode ??
        "none",
      source_file_requirements:
        plan.project.source_file_requirements ??
        targetProject?.source_file_requirements ??
        [],
      status: "active",
      created_at: targetProject?.created_at || now,
      source_files: targetProject?.source_files || [],
      revision: targetProject?.revision || 1,
      updated_at: targetProject?.updated_at || targetProject?.created_at || now,
    };
    const projectChanged =
      !targetProject ||
      JSON.stringify(projectDefinition(targetProject)) !==
        JSON.stringify(projectDefinition(projectBase));
    const hasChanges =
      projectChanged ||
      additions.length > 0 ||
      updates.length > 0 ||
      deletions.length > 0;
    const project: Project = {
      ...projectBase,
      revision: targetProject
        ? (targetProject.revision || 1) + (hasChanges ? 1 : 0)
        : 1,
      updated_at: hasChanges
        ? now
        : targetProject?.updated_at || targetProject?.created_at || now,
    };
    const sourceRevision =
      plan.import_metadata?.base_project_revision ??
      plan.project.revision ??
      targetProject?.revision ??
      1;
    const stale =
      Boolean(targetProject) &&
      sourceRevision < (targetProject?.revision || 1);
    if (
      plan.import_metadata?.base_project_id &&
      targetProject &&
      plan.import_metadata.base_project_id !== targetProject.id &&
      makeId("project", plan.import_metadata.base_project_id) !== targetProject.id
    ) {
      conflicts.push(
        "导入内容来自另一个项目 ID，不能直接覆盖当前项目。",
      );
    }

    const nextStore: Store = {
      ...store,
      export_meta: undefined,
      projects: targetProject
        ? store.projects.map((item) =>
            item.id === projectId ? project : item,
          )
        : [...store.projects, project],
      tasks: [
        ...store.tasks.filter((task) => task.project_id !== projectId),
        ...retainedTasks,
        ...tasks,
      ],
      issues: store.issues.filter(
        (issue) =>
          issue.project_id !== projectId ||
          !deletionSet.has(issue.task_id),
      ),
    };
    return {
      plan,
      projectId,
      nextStore,
      projectChanged,
      additions,
      updates,
      unchanged,
      retained,
      deletions,
      conflicts,
      stale,
      sourceRevision: targetProject?.revision || 0,
      hasChanges,
    };
  }

  function reviewImportPlan() {
    setImportError("");
    setImportPreview(null);
    setAllowStaleImport(false);
    try {
      const preview = buildImportPreview();
      const requestedMode =
        preview.plan.project.source_file_mode ||
        (preview.plan.tasks.some(
          (task) => (task.source_file_refs || []).length > 0,
        )
          ? "per_task"
          : "none");
      setImportPreview(preview);
      resetImportSources(requestedMode);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "导入失败。");
    }
  }

  async function confirmImportPlan() {
    if (!importPreview || importPreview.conflicts.length > 0) return;
    if (importPreview.stale && !allowStaleImport) return;
    if (!importSourceSelectionComplete(importPreview)) {
      setImportError(
        importSources.mode === "shared"
          ? "请选择至少一个供全部任务共用的源文件。"
          : "请为每一条导入任务选择对应的源文件。",
      );
      return;
    }
    const currentRevision =
      store.projects.find(
        (project) => project.id === importPreview.projectId,
      )?.revision || 0;
    if (currentRevision !== importPreview.sourceRevision) {
      setImportPreview(null);
      setImportError(
        "项目在预览后又发生了变化。请重新点击“检查变更”，避免覆盖新数据。",
      );
      return;
    }
    if (!importPreview.hasChanges && !hasPendingImportFiles()) {
      setImportError("导入内容与当前项目完全一致，无需重复导入。");
      return;
    }
    const selectedFiles =
      importSources.mode === "shared"
        ? importSources.shared.map((file) => ({ file, taskTitle: null }))
        : Object.entries(importSources.byTask).flatMap(([taskTitle, files]) =>
            files.map((file) => ({ file, taskTitle })),
          );
    const storedIds: string[] = [];
    try {
      setImportSourceBusy(true);
      validateSourceFileList(selectedFiles.map((entry) => entry.file));
      const uploaded = await Promise.all(
        selectedFiles.map(async ({ file, taskTitle }) => {
          const matchingTask = importPreview.plan.tasks.find(
            (task) => task.title === taskTitle,
          );
          const requirementId =
            matchingTask?.source_file_refs?.[0] ||
            importPreview.plan.project.source_file_requirements?.[0]?.id;
          const metadata: SourceFileMeta = {
            id: `source-${crypto.randomUUID()}`,
            name: file.name,
            type:
              file.type ||
              file.name.split(".").pop()?.toLowerCase() ||
              "file",
            size: file.size,
            uploaded_at: new Date().toISOString(),
            requirement_id: requirementId,
          };
          await saveSourceFileBlob(metadata.id, file);
          if (syncEnabled) await uploadSourceFileToCloud(metadata.id, file);
          storedIds.push(metadata.id);
          return { metadata, taskTitle };
        }),
      );
      const metadata = uploaded.map((entry) => entry.metadata);
      const filesByTask = new Map<string, string[]>();
      uploaded.forEach(({ metadata: fileMetadata, taskTitle }) => {
        if (!taskTitle) return;
        filesByTask.set(taskTitle, [
          ...(filesByTask.get(taskTitle) || []),
          fileMetadata.id,
        ]);
      });
      const nextStore: Store = {
        ...importPreview.nextStore,
        projects: importPreview.nextStore.projects.map((project) =>
          project.id === importPreview.projectId
            ? {
                ...project,
                source_file_mode: importSources.mode,
                source_files: [
                  ...(project.source_files || []),
                  ...metadata,
                ],
              }
            : project,
        ),
        tasks: importPreview.nextStore.tasks.map((task) => {
          if (task.project_id !== importPreview.projectId) return task;
          const attachedIds =
            importSources.mode === "shared"
              ? metadata.map((file) => file.id)
              : filesByTask.get(task.title) || [];
          return {
            ...task,
            source_file_ids: Array.from(
              new Set([...(task.source_file_ids || []), ...attachedIds]),
            ),
          };
        }),
      };
      saveImportSnapshot(
        store,
        `导入“${nextStore.projects.find((project) => project.id === importPreview.projectId)?.name || "项目"}”之前`,
      );
      updateStore(() => nextStore);
      setImportText("");
      setImportPreview(null);
      setAllowStaleImport(false);
      resetImportSources();
      setImportOpen(false);
      setActiveTab("projects");
    } catch (error) {
      await Promise.allSettled(storedIds.map(removeSourceFileBlob));
      if (syncEnabled) {
        await Promise.allSettled(storedIds.map(removeSourceFileFromCloud));
      }
      setImportError(
        error instanceof Error
          ? error.message
          : "源文件保存失败，请重新选择后再试。",
      );
    } finally {
      setImportSourceBusy(false);
    }
  }

  function restoreBackup() {
    setImportError("");
    try {
      if (backupConfirmText.trim() !== "恢复") {
        throw new Error("请输入“恢复”后再继续。");
      }
      const backup = parseBackup(importText);
      const restored: Store = {
        ...backup,
        export_meta: undefined,
        logic_graph_pages: (backup.logic_graph_pages ?? INITIAL_LOGIC_GRAPH_PAGES).map(
          (page) => ({
            ...page,
            nodes: page.nodes.map((node) => ({ ...node, sourceFiles: [] })),
          }),
        ),
        projects: backup.projects.map((project) => ({
          ...project,
          source_files: [],
          revision: project.revision || 1,
          updated_at: project.updated_at || project.created_at,
        })),
        tasks: backup.tasks.map((task) => ({
          ...task,
          source_file_ids: [],
          revision: task.revision || 1,
          updated_at: task.updated_at || task.created_at,
          revision_history: task.revision_history || [],
        })),
      };
      saveImportSnapshot(store, "恢复完整备份之前");
      updateStore(() => restored);
      setImportText("");
      setBackupConfirmText("");
      setImportOpen(false);
      setActiveTab("today");
      setSelectedDate(localDate());
      setSelectedTaskId(null);
      setSelectedIssueId(null);
      setSelectedPlanProjectId(null);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "恢复备份失败。",
      );
    }
  }

  function addNewProjectStructureStage() {
    setNewProjectStructureStages((current) => [
      ...current,
      {
        id: `stage-draft-${crypto.randomUUID()}`,
        name: "",
        tasks: [],
      },
    ]);
  }

  function updateNewProjectStructureStage(stageId: string, name: string) {
    setNewProjectStructureStages((current) =>
      current.map((stage) => (stage.id === stageId ? { ...stage, name } : stage)),
    );
  }

  function moveNewProjectStructureStage(stageId: string, direction: -1 | 1) {
    setNewProjectStructureStages((current) => {
      const index = current.findIndex((stage) => stage.id === stageId);
      if (index < 0) return current;
      return moveArrayItem(current, index, index + direction);
    });
  }

  function removeNewProjectStructureStage(stageId: string) {
    setNewProjectStructureStages((current) =>
      current.length === 1
        ? current
        : current.filter((stage) => stage.id !== stageId),
    );
  }

  function addNewProjectStructureTask(stageId: string) {
    setNewProjectStructureStages((current) =>
      current.map((stage) =>
        stage.id === stageId
          ? {
              ...stage,
              tasks: [
                ...stage.tasks,
                {
                  id: `task-draft-${crypto.randomUUID()}`,
                  title: "",
                  objective: "",
                  scheduleType: "backlog",
                  scheduledDate: localDate(),
                  estimatedMinutes: "30",
                },
              ],
            }
          : stage,
      ),
    );
  }

  function updateNewProjectStructureTask(
    stageId: string,
    taskId: string,
    patch: Partial<NewProjectStructureTaskDraft>,
  ) {
    setNewProjectStructureStages((current) =>
      current.map((stage) =>
        stage.id === stageId
          ? {
              ...stage,
              tasks: stage.tasks.map((task) =>
                task.id === taskId ? { ...task, ...patch } : task,
              ),
            }
          : stage,
      ),
    );
  }

  function removeNewProjectStructureTask(stageId: string, taskId: string) {
    setNewProjectStructureStages((current) =>
      current.map((stage) =>
        stage.id === stageId
          ? {
              ...stage,
              tasks: stage.tasks.filter((task) => task.id !== taskId),
            }
          : stage,
      ),
    );
  }

  function moveNewProjectStructureTask(
    stageId: string,
    taskId: string,
    direction: -1 | 1,
  ) {
    setNewProjectStructureStages((current) =>
      current.map((stage) => {
        if (stage.id !== stageId) return stage;
        const index = stage.tasks.findIndex((task) => task.id === taskId);
        if (index < 0) return stage;
        return {
          ...stage,
          tasks: moveArrayItem(stage.tasks, index, index + direction),
        };
      }),
    );
  }

  function transferNewProjectStructureTask(
    sourceStageId: string,
    taskId: string,
    targetStageId: string,
  ) {
    if (sourceStageId === targetStageId) return;
    setNewProjectStructureStages((current) => {
      const movingTask = current
        .find((stage) => stage.id === sourceStageId)
        ?.tasks.find((task) => task.id === taskId);
      if (!movingTask) return current;
      return current.map((stage) => {
        if (stage.id === sourceStageId) {
          return {
            ...stage,
            tasks: stage.tasks.filter((task) => task.id !== taskId),
          };
        }
        if (stage.id === targetStageId) {
          return { ...stage, tasks: [...stage.tasks, movingTask] };
        }
        return stage;
      });
    });
  }

  function createCustomTask() {
    setImportError("");
    const title = customTaskDraft.title.trim();
    if (!title) {
      setImportError("请填写任务标题。");
      return;
    }
    const lines = (value: string) =>
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    const steps = customTaskDraft.steps.map((step) => step.trim()).filter(Boolean);
    const acceptanceCriteria = lines(customTaskDraft.acceptanceCriteria);
    const createdAt = new Date().toISOString();
    const usesPersonalProject =
      customTaskDraft.projectId === PERSONAL_PROJECT_ID;
    const createsNewProject =
      customTaskDraft.projectId === NEW_PROJECT_OPTION;
    if (createsNewProject && !customTaskDraft.newProjectName.trim()) {
      setImportError("请填写新任务项目的名称。");
      return;
    }
    const projectId = usesPersonalProject
      ? PERSONAL_PROJECT_ID
      : createsNewProject
        ? `project-${crypto.randomUUID()}`
        : customTaskDraft.projectId;
    const isBacklog = customTaskDraft.scheduleType === "backlog";
    const startDate = isBacklog ? null : customTaskDraft.startDate;
    const endDate =
      isBacklog
        ? null
        : customTaskDraft.scheduleType === "once"
        ? startDate
        : customTaskDraft.endDate;
    if (!isBacklog && (!startDate || !endDate || endDate < startDate)) {
      setImportError("请填写正确的开始和结束日期。");
      return;
    }
    const start = startDate ? new Date(`${startDate}T12:00:00`) : null;
    const end = endDate ? new Date(`${endDate}T12:00:00`) : null;
    const days = start && end
      ? Math.round((end.getTime() - start.getTime()) / 86400000) + 1
      : 0;
    if (days > 366) {
      setImportError("单次最多创建一年范围内的任务，请缩短日期范围。");
      return;
    }
    const occurrenceDates: Array<string | null> = [];
    if (isBacklog) {
      occurrenceDates.push(null);
    } else if (
      customTaskDraft.scheduleType === "once" ||
      customTaskDraft.scheduleType === "range"
    ) {
      occurrenceDates.push(startDate);
    } else {
      occurrenceDates.push(startDate);
    }
    if (occurrenceDates.length === 0) {
      setImportError("所选日期范围内没有符合条件的任务日期。");
      return;
    }
    const criteria = acceptanceCriteria.length
      ? acceptanceCriteria
      : [`完成“${title}”并记录结果`];
    const tasks: Task[] = occurrenceDates.map((dateValue) => ({
      id: `task-${crypto.randomUUID()}`,
      project_id: projectId,
      parent_id: null,
      milestone: customTaskDraft.milestone.trim(),
      title,
      objective: customTaskDraft.objective.trim() || title,
      why: customTaskDraft.why.trim(),
      note: customTaskDraft.note.trim(),
      result_report: "",
      steps,
      acceptance_criteria: criteria,
      scheduled_date: dateValue,
      end_date:
        customTaskDraft.scheduleType === "once" ? null : endDate,
      recurrence:
        customTaskDraft.scheduleType === "daily" ||
        customTaskDraft.scheduleType === "weekdays" ||
        customTaskDraft.scheduleType === "weekends"
          ? customTaskDraft.scheduleType
          : null,
      occurrence_results: {},
      estimated_minutes:
        Number(customTaskDraft.estimatedMinutes) > 0
          ? Number(customTaskDraft.estimatedMinutes)
          : 30,
      priority: customTaskDraft.priority,
      dependencies: [],
      category: customTaskDraft.category,
      status: dateValue ? "scheduled" : "backlog",
      created_at: createdAt,
      revision: 1,
      updated_at: createdAt,
      revision_history: [],
      notes: [],
      step_results: steps.map(() => false),
      step_reports: steps.map(() => ""),
      criterion_results: criteria.map(() => false),
    }));
    updateStore((current) => {
      const personalProjectExists = current.projects.some(
        (project) => project.id === PERSONAL_PROJECT_ID,
      );
      const personalProject: Project = {
        id: PERSONAL_PROJECT_ID,
        name: "个人任务",
        objective: "记录不属于现有项目的日常、工作、娱乐和其他任务。",
        success_criteria: [],
        background: "",
        constraints: [],
        assumptions: [],
        execution_improvements: "",
        execution_tip_title: DEFAULT_EXECUTION_TIP_TITLE,
        execution_tips: DEFAULT_EXECUTION_TIPS,
        status: "active",
        created_at: createdAt,
        source_files: [],
        revision: 1,
        updated_at: createdAt,
      };
      const newProject: Project = {
        id: projectId,
        name: customTaskDraft.newProjectName.trim(),
        objective:
          customTaskDraft.newProjectObjective.trim() ||
          `管理“${customTaskDraft.newProjectName.trim()}”相关任务。`,
        success_criteria: [],
        background: "",
        constraints: [],
        assumptions: [],
        execution_improvements: "",
        execution_tip_title: DEFAULT_EXECUTION_TIP_TITLE,
        execution_tips: DEFAULT_EXECUTION_TIPS,
        status: "active",
        created_at: createdAt,
        source_files: [],
        revision: 1,
        updated_at: createdAt,
      };
      const projects =
        usesPersonalProject && !personalProjectExists
          ? [...current.projects, personalProject]
          : createsNewProject
            ? [...current.projects, newProject]
            : current.projects;
      return {
        ...current,
        projects,
        tasks: [...current.tasks, ...tasks],
      };
    });
    setSelectedDate(startDate || selectedDate);
    setActiveTab(isBacklog ? "projects" : "today");
    setImportOpen(false);
    setCustomTaskDraft({
      projectId: PERSONAL_PROJECT_ID,
      newProjectName: "",
      newProjectObjective: "",
      title: "",
      objective: "",
      milestone: "",
      why: "",
      note: "",
      steps: [],
      acceptanceCriteria: "",
      scheduleType: "once",
      startDate: startDate || localDate(),
      endDate: startDate || localDate(),
      estimatedMinutes: "30",
      category: "work",
      priority: 3,
    });
  }

  function createCalendarTaskFromIdea(input: {
    sourcePageId: string;
    sourceNodeId: string;
    title: string;
    objective: string;
    scheduledDate: string | null;
    estimatedMinutes: number;
  }) {
    const createdAt = new Date().toISOString();
    const taskId = `task-${crypto.randomUUID()}`;
    const title = input.title.trim() || "备忘录待办";
    const objective = input.objective.trim() || title;
    const task: Task = {
      id: taskId,
      project_id: PERSONAL_PROJECT_ID,
      parent_id: null,
      milestone: "来自备忘录",
      title,
      objective,
      why: "",
      note: "由备忘录思维点添加。",
      result_report: "",
      steps: [],
      acceptance_criteria: [`完成“${title}”并记录结果`],
      scheduled_date: input.scheduledDate,
      end_date: null,
      recurrence: null,
      occurrence_results: {},
      estimated_minutes: input.estimatedMinutes,
      priority: 3,
      dependencies: [],
      category: "work",
      status: input.scheduledDate ? "scheduled" : "backlog",
      created_at: createdAt,
      revision: 1,
      updated_at: createdAt,
      revision_history: [],
      notes: [],
      step_results: [],
      step_reports: [],
      criterion_results: [false],
      source_memo_page_id: input.sourcePageId,
      source_idea_node_id: input.sourceNodeId,
    };
    updateStore((current) => {
      const personalProjectExists = current.projects.some(
        (project) => project.id === PERSONAL_PROJECT_ID,
      );
      const personalProject: Project = {
        id: PERSONAL_PROJECT_ID,
        name: "个人任务",
        objective: "记录不属于现有项目的日常、工作、娱乐和其他任务。",
        success_criteria: [],
        background: "",
        constraints: [],
        assumptions: [],
        execution_improvements: "",
        execution_tip_title: DEFAULT_EXECUTION_TIP_TITLE,
        execution_tips: DEFAULT_EXECUTION_TIPS,
        status: "active",
        created_at: createdAt,
        source_files: [],
        revision: 1,
        updated_at: createdAt,
      };
      return {
        ...current,
        projects: personalProjectExists
          ? current.projects
          : [...current.projects, personalProject],
        tasks: [...current.tasks, task],
      };
    });
    return taskId;
  }

  function openCalendarTaskFromIdea(taskId: string, scheduledDate: string | null) {
    if (scheduledDate) {
      const [year, month] = scheduledDate.split("-").map(Number);
      if (year && month) setCalendarMonth(new Date(year, month - 1, 1));
      setSelectedCalendarDate(scheduledDate);
      setActiveTab("calendar");
    } else {
      setActiveTab("projects");
    }
    openTask(taskId, scheduledDate);
  }

  function toggleTaskCompletion(taskId: string, occurrenceDate?: string) {
    updateStore((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        if (task.recurrence && occurrenceDate) {
          const currentOccurrence = taskForDate(task, occurrenceDate);
          const completed = currentOccurrence.status !== "done";
          const stepResults = (task.steps || []).map(() => completed);
          return {
            ...task,
            occurrence_results: {
              ...(task.occurrence_results || {}),
              [occurrenceDate]: {
                step_results: stepResults,
                step_reports: [
                  ...(currentOccurrence.step_reports || []),
                ],
                criterion_results: [
                  ...(currentOccurrence.criterion_results || []),
                ],
                result_report: currentOccurrence.result_report || "",
                completed,
                paused: completed ? false : currentOccurrence.paused,
              },
            },
          };
        }
        const completed = task.status !== "done";
        return {
          ...task,
          step_results: (task.steps || []).map(() => completed),
          status: completed
            ? "done"
            : (task.result_report || "").trim()
              ? "doing"
              : task.scheduled_date
                ? "scheduled"
                : "backlog",
          paused: completed ? false : task.paused,
        };
      }),
    }));
  }

  function setDraftStepCompleted(stepIndex: number, completed: boolean) {
    setExecutionDraft((task) => {
      if (!task) return task;
      const stepResults = (task.steps || []).map(
        (_, index) =>
          index === stepIndex
            ? completed
            : task.step_results?.[index] === true,
      );
      const allComplete =
        stepResults.length > 0 && stepResults.every(Boolean);
      const hasProgress = stepResults.some(Boolean);
      return {
        ...task,
        step_results: stepResults,
        status: allComplete
          ? "done"
          : task.status === "cancelled"
            ? "cancelled"
            : task.status === "blocked"
              ? "blocked"
              : hasProgress || (task.result_report || "").trim()
                ? "doing"
                : task.scheduled_date
                  ? "scheduled"
                  : "backlog",
        paused: allComplete ? false : task.paused,
      };
    });
  }

  function setDraftStepNote(stepIndex: number, note: string) {
    setExecutionDraft((task) => {
      if (!task) return task;
      const stepReports = (task.steps || []).map((_, index) =>
        index === stepIndex ? note : task.step_reports?.[index] || "",
      );
      return { ...task, step_reports: stepReports };
    });
  }

  function updateDraftStepDefinition(
    operation:
      | { type: "add" }
      | { type: "change"; index: number; value: string }
      | { type: "remove"; index: number }
      | { type: "move"; index: number; direction: -1 | 1 },
  ) {
    setExecutionDraft((task) => {
      if (!task) return task;
      let steps = [...(task.steps || [])];
      let stepResults = steps.map((_, index) => task.step_results?.[index] === true);
      let stepReports = steps.map((_, index) => task.step_reports?.[index] || "");
      if (operation.type === "add") {
        steps.push("");
        stepResults.push(false);
        stepReports.push("");
      } else if (operation.type === "change") {
        steps[operation.index] = operation.value;
      } else if (operation.type === "remove") {
        steps = steps.filter((_, index) => index !== operation.index);
        stepResults = stepResults.filter((_, index) => index !== operation.index);
        stepReports = stepReports.filter((_, index) => index !== operation.index);
      } else {
        const target = operation.index + operation.direction;
        steps = moveArrayItem(steps, operation.index, target);
        stepResults = moveArrayItem(stepResults, operation.index, target);
        stepReports = moveArrayItem(stepReports, operation.index, target);
      }
      const allComplete = steps.length > 0 && stepResults.every(Boolean);
      const hasProgress = stepResults.some(Boolean);
      return {
        ...task,
        steps,
        step_results: stepResults,
        step_reports: stepReports,
        status: allComplete
          ? "done"
          : hasProgress || (task.result_report || "").trim()
            ? "doing"
            : task.scheduled_date
              ? "scheduled"
              : "backlog",
        paused: allComplete ? false : task.paused,
      };
    });
  }

  function toggleTaskPaused(taskId: string, occurrenceDate?: string) {
    updateStore((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        if (task.recurrence && occurrenceDate) {
          const currentOccurrence = taskForDate(task, occurrenceDate);
          return {
            ...task,
            occurrence_results: {
              ...(task.occurrence_results || {}),
              [occurrenceDate]: {
                step_results: [...(currentOccurrence.step_results || [])],
                step_reports: [...(currentOccurrence.step_reports || [])],
                criterion_results: [
                  ...(currentOccurrence.criterion_results || []),
                ],
                result_report: currentOccurrence.result_report || "",
                completed: currentOccurrence.status === "done",
                paused: !currentOccurrence.paused,
              },
            },
          };
        }
        return { ...task, paused: !task.paused };
      }),
    }));
  }

  function checkpointPlanOperation(operationKey: string) {
    if (planOperationKeyRef.current === operationKey) return;
    const snapshot: PlanUndoSnapshot = {
      projectEditDraft: projectEditDraft
        ? { ...projectEditDraft }
        : null,
      projectTaskDrafts: JSON.parse(
        JSON.stringify(projectTaskDrafts),
      ) as Task[],
      projectMilestoneDrafts: [...projectMilestoneDrafts],
      improvementDraft,
      executionTipTitleDraft,
      executionTipsDraft,
    };
    setPlanUndoStack((stack) => [
      ...stack.slice(-29),
      snapshot,
    ]);
    planOperationKeyRef.current = operationKey;
  }

  function undoLastPlanOperation() {
    const snapshot = planUndoStack.at(-1);
    if (!snapshot) return;
    setProjectEditDraft(
      snapshot.projectEditDraft
        ? { ...snapshot.projectEditDraft }
        : null,
    );
    setProjectTaskDrafts(
      JSON.parse(JSON.stringify(snapshot.projectTaskDrafts)) as Task[],
    );
    setProjectMilestoneDrafts([...snapshot.projectMilestoneDrafts]);
    setImprovementDraft(snapshot.improvementDraft);
    setExecutionTipTitleDraft(snapshot.executionTipTitleDraft);
    setExecutionTipsDraft(snapshot.executionTipsDraft);
    setPlanUndoStack((stack) => stack.slice(0, -1));
    planOperationKeyRef.current = null;
  }

  function startProjectEdit() {
    if (!planProject) return;
    checkpointPlanOperation("enter-project-edit");
    setProjectEditDraft({
      projectId: planProject.id,
      name: planProject.name,
      objective: planProject.objective,
      background: planProject.background || "",
      successCriteria: (planProject.success_criteria || []).join("\n"),
      constraints: (planProject.constraints || []).join("\n"),
      assumptions: (planProject.assumptions || []).join("\n"),
    });
  }

  function updateProjectTaskDraft(
    taskId: string,
    changes: Partial<Task>,
  ) {
    checkpointPlanOperation(
      `task:${taskId}:${Object.keys(changes).sort().join(",")}`,
    );
    setProjectTaskDrafts((tasks) =>
      tasks.map((task) =>
        task.id === taskId ? { ...task, ...changes } : task,
      ),
    );
  }

  function updateAllProjectTaskCategories(category: TaskCategory) {
    if (!projectEditDraft || projectTaskDrafts.length === 0) return;
    checkpointPlanOperation(`all-task-categories:${category}`);
    setProjectTaskDrafts((tasks) =>
      tasks.map((task) => ({ ...task, category })),
    );
  }

  function updateProjectTaskSchedule(task: Task, scheduleType: ScheduleType) {
    const startDate = task.scheduled_date || localDate();
    if (scheduleType === "backlog") {
      updateProjectTaskDraft(task.id, {
        scheduled_date: null,
        end_date: null,
        recurrence: null,
        status: task.status === "done" ? "done" : "backlog",
        paused: false,
      });
      return;
    }
    if (scheduleType === "once") {
      const occurrence = task.occurrence_results?.[startDate];
      updateProjectTaskDraft(task.id, {
        recurrence: null,
        end_date: null,
        step_results: occurrence?.step_results || task.step_results || [],
        step_reports: occurrence?.step_reports || task.step_reports || [],
        criterion_results:
          occurrence?.criterion_results || task.criterion_results || [],
        result_report:
          occurrence?.result_report || task.result_report || "",
        status:
          occurrence?.completed === true
            ? "done"
            : task.status === "done"
              ? "scheduled"
              : task.status,
        paused: occurrence?.paused || task.paused || false,
      });
      return;
    }
    if (scheduleType === "range") {
      updateProjectTaskDraft(task.id, {
        recurrence: null,
        end_date: task.end_date || startDate,
      });
      return;
    }
    const occurrence_results = { ...(task.occurrence_results || {}) };
    if (!task.recurrence && task.scheduled_date) {
      occurrence_results[startDate] = {
        step_results: [...(task.step_results || [])],
        step_reports: [...(task.step_reports || [])],
        criterion_results: [...(task.criterion_results || [])],
        result_report: task.result_report || "",
        completed: task.status === "done",
        paused: task.paused || false,
      };
    }
    updateProjectTaskDraft(task.id, {
      recurrence: scheduleType,
      end_date: task.end_date || startDate,
      occurrence_results,
    });
  }

  function addProjectMilestoneDraft() {
    const milestone = newMilestoneName.trim();
    if (!projectEditDraft || !milestone) return;
    if (projectMilestoneDrafts.includes(milestone)) return;
    checkpointPlanOperation(`add-milestone:${milestone}`);
    setProjectMilestoneDrafts((milestones) => [...milestones, milestone]);
    setNewMilestoneName("");
    setAddingMilestone(false);
  }

  function renameProjectMilestone(previous: string, nextValue: string) {
    const next = nextValue.trim();
    if (!projectEditDraft || !next || previous === next) return;
    if (projectMilestoneDrafts.includes(next)) {
      window.alert("已经存在同名阶段，请换一个名称。");
      return;
    }
    checkpointPlanOperation(`rename-milestone:${previous}`);
    setProjectMilestoneDrafts((milestones) =>
      milestones.map((milestone) => (milestone === previous ? next : milestone)),
    );
    setProjectTaskDrafts((tasks) =>
      tasks.map((task) =>
        (task.milestone?.trim() || "未分组任务") === previous
          ? { ...task, milestone: next }
          : task,
      ),
    );
  }

  function removeProjectMilestone(milestone: string) {
    if (!projectEditDraft) return;
    const milestoneTasks = projectTaskDrafts.filter(
      (task) => (task.milestone?.trim() || "未分组任务") === milestone,
    );
    const message = milestoneTasks.length
      ? `“${milestone}”中有 ${milestoneTasks.length} 项具体任务。删除阶段会同时删除这些任务，保存后无法恢复。确定继续吗？`
      : `确定删除空阶段“${milestone}”吗？`;
    if (!window.confirm(message)) return;
    checkpointPlanOperation(`remove-milestone:${milestone}`);
    setProjectMilestoneDrafts((milestones) =>
      milestones.filter((item) => item !== milestone),
    );
    setProjectTaskDrafts((tasks) =>
      tasks.filter(
        (task) => (task.milestone?.trim() || "未分组任务") !== milestone,
      ),
    );
  }

  function addProjectTaskDraft(milestone: string) {
    if (!planProject || !projectEditDraft) return;
    checkpointPlanOperation(`add-task:${milestone}:${projectTaskDrafts.length}`);
    const createdAt = new Date().toISOString();
    setProjectTaskDrafts((tasks) => [
      ...tasks,
      {
        id: `task-${crypto.randomUUID()}`,
        project_id: planProject.id,
        parent_id: null,
        milestone,
        title: "未命名具体任务",
        objective: "填写这项任务需要达成的结果。",
        why: "",
        note: "",
        result_report: "",
        steps: [],
        acceptance_criteria: ["完成任务并记录结果"],
        scheduled_date: localDate(),
        end_date: null,
        recurrence: null,
        occurrence_results: {},
        estimated_minutes: 30,
        priority: 3,
        dependencies: [],
        category: projectCommonCategory || "work",
        status: "scheduled",
        created_at: createdAt,
        notes: [],
        step_results: [],
        step_reports: [],
        criterion_results: [false],
      },
    ]);
  }

  function removeProjectTaskDraft(taskId: string) {
    checkpointPlanOperation(`remove-task:${taskId}`);
    setProjectTaskDrafts((tasks) =>
      tasks.filter((task) => task.id !== taskId),
    );
    setSwipedProjectTaskId(null);
  }

  function confirmRemoveProjectTask(task: Task) {
    if (
      window.confirm(`确定删除“${task.title || "未命名具体任务"}”吗？保存项目后将无法恢复。`)
    ) {
      removeProjectTaskDraft(task.id);
    }
  }

  function finishClosingPlan() {
    setPlanExitConfirmOpen(false);
    setSelectedPlanProjectId(null);
    setProjectEditDraft(null);
    setProjectTaskDrafts([]);
    setProjectTaskDraftProjectId(null);
    setProjectTaskBaseline("[]");
    setProjectMilestoneDrafts([]);
    setProjectMilestoneBaseline("[]");
    setNewMilestoneName("");
    setAddingMilestone(false);
    setSwipedProjectTaskId(null);
    setPlanUndoStack([]);
    planOperationKeyRef.current = null;
  }

  function requestClosePlan() {
    if (planHasUnsavedChanges) {
      setPlanExitConfirmOpen(true);
    } else {
      finishClosingPlan();
    }
  }

  function savePlanChanges(closeAfterSave: boolean) {
    if (
      !planProject ||
      projectTaskDraftProjectId !== planProject.id
    ) {
      return;
    }
    const lines = (value: string) =>
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    const tips = lines(executionTipsDraft);
    const hasProjectEdit = projectEditDraft?.projectId === planProject.id;
    updateStore((current) => {
      const now = new Date().toISOString();
      const oldProjectTasks = current.tasks.filter(
        (task) => task.project_id === planProject.id,
      );
      const retainedTaskIds = new Set(
        projectTaskDrafts.map((task) => task.id),
      );
      const revisedTasks = projectTaskDrafts.map((draft) => {
        const existing = oldProjectTasks.find(
          (task) => task.id === draft.id,
        );
        if (
          !existing ||
          JSON.stringify(taskDefinition(existing)) ===
            JSON.stringify(taskDefinition(draft))
        ) {
          return draft;
        }
        const revisionSnapshot: TaskRevision = {
          revision: existing.revision || 1,
          changed_at: now,
          source: "manual",
          title: existing.title,
          objective: existing.objective,
          note: existing.note || "",
          steps: [...(existing.steps || [])],
          acceptance_criteria: [...existing.acceptance_criteria],
          step_results: [...(existing.step_results || [])],
          step_reports: [...(existing.step_reports || [])],
          criterion_results: [...(existing.criterion_results || [])],
          result_report: existing.result_report || "",
        };
        return {
          ...draft,
          revision: (existing.revision || 1) + 1,
          updated_at: now,
          revision_history: [
            ...(existing.revision_history || []),
            revisionSnapshot,
          ].slice(-10),
        };
      });
      return {
        ...current,
        projects: current.projects.map((project) =>
          project.id === planProject.id
            ? {
                ...project,
                name: hasProjectEdit
                  ? projectEditDraft.name.trim() || project.name
                  : project.name,
                objective: hasProjectEdit
                  ? projectEditDraft.objective.trim() || project.objective
                  : project.objective,
                background: hasProjectEdit
                  ? projectEditDraft.background.trim()
                  : project.background,
                success_criteria: hasProjectEdit
                  ? lines(projectEditDraft.successCriteria)
                  : project.success_criteria,
                constraints: hasProjectEdit
                  ? lines(projectEditDraft.constraints)
                  : project.constraints,
                assumptions: hasProjectEdit
                  ? lines(projectEditDraft.assumptions)
                  : project.assumptions,
                execution_tip_title:
                  executionTipTitleDraft.trim() ||
                  DEFAULT_EXECUTION_TIP_TITLE,
                execution_tips: tips.length
                  ? tips
                  : DEFAULT_EXECUTION_TIPS,
                execution_improvements: improvementDraft.trim(),
                milestones: projectMilestoneDrafts,
                revision:
                  (project.revision || 1) +
                  (planHasUnsavedChanges ? 1 : 0),
                updated_at: planHasUnsavedChanges
                  ? now
                  : project.updated_at || project.created_at,
              }
            : project,
        ),
        tasks: [
          ...current.tasks.filter(
            (task) => task.project_id !== planProject.id,
          ),
          ...revisedTasks,
        ],
        issues: current.issues.filter(
          (issue) =>
            issue.project_id !== planProject.id ||
            retainedTaskIds.has(issue.task_id),
        ),
      };
    });
    if (closeAfterSave) {
      finishClosingPlan();
    } else {
      setProjectEditDraft(null);
      setProjectTaskBaseline(JSON.stringify(projectTaskDrafts));
      setProjectMilestoneBaseline(JSON.stringify(projectMilestoneDrafts));
      setAddingMilestone(false);
      setNewMilestoneName("");
      setPlanUndoStack([]);
      planOperationKeyRef.current = null;
    }
  }

  function savePlanAndClose() {
    savePlanChanges(true);
  }

  async function deletePlanProject() {
    if (!planProject || deleteProjectConfirmText.trim() !== "确认") return;
    const projectId = planProject.id;
    const fileIds = (planProject.source_files || []).map((file) => file.id);
    await Promise.allSettled(fileIds.map(removeSourceFileBlob));
    if (syncEnabled) {
      await Promise.allSettled(fileIds.map(removeSourceFileFromCloud));
    }
    updateStore((current) => ({
      ...current,
      projects: current.projects.filter(
        (project) => project.id !== projectId,
      ),
      tasks: current.tasks.filter(
        (task) => task.project_id !== projectId,
      ),
      issues: current.issues.filter(
        (issue) => issue.project_id !== projectId,
      ),
    }));
    setDeleteProjectConfirmOpen(false);
    setDeleteProjectConfirmText("");
    finishClosingPlan();
  }

  const milestoneSourceTarget = (milestone: string) =>
    `__milestone__:${milestone}`;

  function sourceAssignmentValue(
    fileId: string,
    tasks: Task[],
    milestones: string[],
  ) {
    const assigned = tasks.filter((task) =>
      (task.source_file_ids || []).includes(fileId),
    );
    if (assigned.length === 0) return "__none__";
    if (tasks.length > 0 && assigned.length === tasks.length) return "__all__";
    const matchingMilestone = milestones.find((milestone) => {
      const milestoneTasks = tasks.filter(
        (task) => (task.milestone?.trim() || "未分组任务") === milestone,
      );
      return (
        milestoneTasks.length > 0 &&
        assigned.length === milestoneTasks.length &&
        milestoneTasks.every((task) =>
          (task.source_file_ids || []).includes(fileId),
        )
      );
    });
    if (matchingMilestone) return milestoneSourceTarget(matchingMilestone);
    return "__multiple__";
  }

  function assignSourceFile(
    projectId: string,
    fileId: string,
    target: string,
  ) {
    const targetMilestone = target.startsWith("__milestone__:")
      ? target.slice("__milestone__:".length)
      : null;
    const applyAssignment = (task: Task) => {
      if (task.project_id !== projectId) return task;
      const withoutFile = (task.source_file_ids || []).filter(
        (id) => id !== fileId,
      );
      const shouldAttach =
        target === "__all__" ||
        (targetMilestone !== null &&
          (task.milestone?.trim() || "未分组任务") === targetMilestone);
      return {
        ...task,
        source_file_ids: shouldAttach
          ? [...withoutFile, fileId]
          : withoutFile,
      };
    };
    updateStore((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              source_file_mode:
                target === "__all__"
                  ? "shared"
                  : target === "__none__"
                    ? project.source_file_mode || "none"
                    : "per_task",
            }
          : project,
      ),
      tasks: current.tasks.map(applyAssignment),
    }));
    if (projectTaskDraftProjectId === projectId) {
      setProjectTaskDrafts((current) => current.map(applyAssignment));
    }
  }

  async function uploadSourceFile(
    projectId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError("");
    if (file.size > 20 * 1024 * 1024) {
      setFileError("单个原文件暂时不能超过 20MB。");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "docx", "txt", "md"].includes(extension)) {
      setFileError("当前支持 PDF、DOCX、TXT 和 Markdown 文件。");
      return;
    }
    const metadata: SourceFileMeta = {
      id: `source-${crypto.randomUUID()}`,
      name: file.name,
      type: file.type || extension,
      size: file.size,
      uploaded_at: new Date().toISOString(),
    };
    try {
      setFileBusy(true);
      await saveSourceFileBlob(metadata.id, file);
      if (syncEnabled) await uploadSourceFileToCloud(metadata.id, file);
      updateStore((current) => {
        const effectiveTarget = sourceUploadTarget;
        const targetMilestone = effectiveTarget.startsWith("__milestone__:")
          ? effectiveTarget.slice("__milestone__:".length)
          : null;
        const tasks = current.tasks.map((task) => {
          if (task.project_id !== projectId) return task;
          const shouldAttach =
            effectiveTarget === "__all__" ||
            (targetMilestone !== null &&
              (task.milestone?.trim() || "未分组任务") === targetMilestone);
          return shouldAttach
            ? {
                ...task,
                source_file_ids: Array.from(
                  new Set([...(task.source_file_ids || []), metadata.id]),
                ),
              }
            : task;
        });
        return {
          ...current,
          projects: current.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  source_file_mode:
                    effectiveTarget === "__all__"
                      ? "shared"
                      : effectiveTarget === "__none__"
                        ? project.source_file_mode || "none"
                        : "per_task",
                  source_files: [
                    ...(project.source_files || []),
                    metadata,
                  ],
                }
              : project,
          ),
          tasks,
        };
      });
      if (projectTaskDraftProjectId === projectId) {
        const targetMilestone = sourceUploadTarget.startsWith("__milestone__:")
          ? sourceUploadTarget.slice("__milestone__:".length)
          : null;
        setProjectTaskDrafts((current) =>
          current.map((task) => {
            const shouldAttach =
              sourceUploadTarget === "__all__" ||
              (targetMilestone !== null &&
                (task.milestone?.trim() || "未分组任务") === targetMilestone);
            return shouldAttach
              ? {
                  ...task,
                  source_file_ids: Array.from(
                    new Set([...(task.source_file_ids || []), metadata.id]),
                  ),
                }
              : task;
          }),
        );
      }
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : "原文件保存失败，请重新选择。",
      );
    } finally {
      setFileBusy(false);
    }
  }

  function closeFilePreview() {
    if (filePreview?.url) URL.revokeObjectURL(filePreview.url);
    setFilePreview(null);
  }

  async function openSourceFile(metadata: SourceFileMeta) {
    setFileError("");
    setFileBusy(true);
    try {
      let blob = await readSourceFileBlob(metadata.id);
      if (!blob && syncEnabled) {
        blob = await readSourceFileFromCloud(metadata.id);
        if (blob) {
          await saveSourceFileBlob(
            metadata.id,
            new File([blob], metadata.name, { type: metadata.type }),
          );
        }
      }
      if (!blob) throw new Error("missing");
      closeFilePreview();
      const extension = metadata.name.split(".").pop()?.toLowerCase();
      if (extension === "pdf") {
        setFilePreview({
          name: metadata.name,
          kind: "pdf",
          url: URL.createObjectURL(blob),
        });
      } else if (extension === "docx") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({
          arrayBuffer: await blob.arrayBuffer(),
        });
        setFilePreview({
          name: metadata.name,
          kind: "text",
          content: result.value,
        });
      } else {
        setFilePreview({
          name: metadata.name,
          kind: "text",
          content: await blob.text(),
        });
      }
    } catch {
      setFileError("无法打开这个原文件，请重新上传后再试。");
    } finally {
      setFileBusy(false);
    }
  }

  async function copyExportData() {
    const content = JSON.stringify(exportData, null, 2);
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setExportCopied(true);
  }

  async function deleteCloudData() {
    if (cloudDeleteConfirm.trim() !== "删除云端数据" || cloudDeleteBusy) return;
    setCloudDeleteBusy(true);
    setCloudDeleteError("");
    setCloudDeleteDone(false);
    try {
      const response = await fetch("/api/sync", { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "云端数据暂时无法删除。");
      lastCloudPayloadRef.current = serializedStore(store);
      syncReadyRef.current = false;
      setCloudRevision(0);
      setSyncChoice(null);
      setSelectedSyncCopy(null);
      setSyncStatus("local");
      setCloudDeleteConfirm("");
      setCloudDeleteDone(true);
    } catch (error) {
      setCloudDeleteError(
        error instanceof Error ? error.message : "云端数据暂时无法删除。",
      );
    } finally {
      setCloudDeleteBusy(false);
    }
  }

  const syncStatusLabel =
    syncStatus === "checking"
      ? "正在检查云端数据"
      : syncStatus === "saving"
        ? "正在同步"
        : syncStatus === "ready"
          ? "云同步已完成"
          : syncStatus === "choice"
            ? "等待确认同步方式"
            : syncStatus === "offline"
              ? "当前离线，修改已保存在本机"
              : syncStatus === "error"
                ? "云同步出现问题"
                : "当前仅保存在此浏览器";
  const localSyncTime = syncChoice?.localUpdatedAt
    ? Date.parse(syncChoice.localUpdatedAt)
    : Number.NaN;
  const cloudSyncTime = syncChoice?.cloudUpdatedAt
    ? Date.parse(syncChoice.cloudUpdatedAt)
    : Number.NaN;
  const recommendedSyncCopy: "local" | "cloud" | "same-time" =
    !syncChoice?.cloudStore || !Number.isFinite(cloudSyncTime)
      ? "local"
      : !Number.isFinite(localSyncTime)
        ? "cloud"
        : localSyncTime > cloudSyncTime
          ? "local"
          : cloudSyncTime > localSyncTime
            ? "cloud"
            : "same-time";
  const effectiveSyncCopy =
    selectedSyncCopy ||
    (recommendedSyncCopy === "cloud" && syncChoice?.cloudStore ? "cloud" : "local");

  if (!hydrated) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingMark}>PF</div>
        <span>正在打开执行台…</span>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>PF</span>
          <span>
            <strong>PotatoFlow</strong>
            <small>个人执行系统</small>
          </span>
        </div>

        <nav className={styles.nav} aria-label="主要导航">
          {NAV_ITEMS.map((item) => (
            <button
              aria-label={item.label}
              className={activeTab === item.id ? styles.navActive : ""}
              key={item.id}
              onClick={() => {
                if (item.id === "logic-graph") setRequestedLogicGraphPageId(null);
                setActiveTab(item.id);
                if (item.id === "today") setSelectedDate(localDate());
              }}
            >
              <span>{item.mark}</span>
              {item.label}
              {item.id === "issues" && openIssues.length > 0 && (
                <b>{openIssues.length}</b>
              )}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarNote}>
          <span>{syncEnabled ? "云同步" : "本地模式"}</span>
          <p>{syncStatusLabel}</p>
          {syncEnabled ? (
            <small>身份仅在服务端用于隔离数据</small>
          ) : (
            <a href="/signin-with-chatgpt?return_to=%2F">
              登录后在手机和电脑同步
            </a>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>上传数据仅本人可见</p>
            <h1>
              {activeTab === "today"
                ? relativeDateTitle(selectedDate)
                : NAV_ITEMS.find((item) => item.id === activeTab)?.label}
            </h1>
          </div>
          <div className={styles.topbarUtilities}>
            {activeTab === "logic-graph" || activeTab === "memo" ? (
              <span className={styles.prototypeStatus}>
                {syncEnabled ? "自动保存 · 跨设备同步" : "自动保存 · 当前设备"}
              </span>
            ) : activeTab === "today" || activeTab === "projects" ? (
              <div className={styles.topActions}>
              <button
                className={`${styles.quietButton} ${styles.mobileExportButton}`}
                onClick={() => {
                  setExportCopied(false);
                  const preferredProjectId =
                    selectedPlanProjectId ||
                    selectedProject?.id ||
                    store.projects[0]?.id ||
                    "";
                  setExportProjectId(preferredProjectId);
                  setExportTaskId(
                    selectedTaskId ||
                      store.tasks.find(
                        (task) => task.project_id === preferredProjectId,
                      )?.id ||
                      "",
                  );
                  setExportOpen(true);
                }}
              >
                导出数据
              </button>
              <button
                className={styles.primaryButton}
                onClick={() => setImportOpen(true)}
              >
                <span>＋</span> 导入项目
              </button>
              </div>
            ) : null}
            <button
              className={`${styles.quietButton} ${styles.privacyButton}`}
              onClick={() => {
                setCloudDeleteConfirm("");
                setCloudDeleteError("");
                setCloudDeleteDone(false);
                setPrivacyOpen(true);
              }}
            >
              数据与隐私
            </button>
          </div>
        </header>

        {storageError && (
          <p className={styles.syncError} role="alert">
            {storageError}
          </p>
        )}


        {activeTab === "today" && (
          <section
            className={styles.pageGrid}
            onTouchStart={beginSwipe}
            onTouchEnd={(event) =>
              finishSwipe(event, () => moveSelectedDate(1), () => moveSelectedDate(-1))
            }
          >
            <div className={styles.primaryColumn}>
              <div className={styles.dateStrip}>
                <button
                  aria-label="前一天"
                  onClick={() => moveSelectedDate(-1)}
                >
                  ←
                </button>
                <div
                  className={styles.dateChooser}
                  title="点击选择日期"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const input = dateInputRef.current;
                    if (input?.showPicker) {
                      input.showPicker();
                    } else {
                      input?.click();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      const input = dateInputRef.current;
                      if (input?.showPicker) {
                        input.showPicker();
                      } else {
                        input?.click();
                      }
                    }
                  }}
                >
                  <p>{dateTitle(selectedDate)}</p>
                  <span>
                    {todayTasks.length} 项任务 ·{" "}
                    {minutesLabel(
                      todayTasks.reduce(
                        (total, task) => total + (task.estimated_minutes || 0),
                        0,
                      ),
                    )}
                  </span>
                  <input
                    ref={dateInputRef}
                    type="date"
                    aria-label="选择要展示任务的日期"
                    value={selectedDate}
                    onChange={(event) => {
                      if (event.target.value) {
                        setSelectedDate(event.target.value);
                      }
                    }}
                  />
                </div>
                <button
                  aria-label="后一天"
                  onClick={() => moveSelectedDate(1)}
                >
                  →
                </button>
              </div>

              {todayTasks.length === 0 ? (
                store.projects.length === 0 ? (
                  <GettingStarted
                    copied={onboardingCopied}
                    onCopy={copyOnboardingPrompt}
                    onImport={() => setImportOpen(true)}
                  />
                ) : (
                  <EmptyState
                    title="今天还没有任务"
                    description="这个日期没有安排。任务不会被系统自动填满。"
                  />
                )
              ) : (
                <div className={styles.taskGroups}>
                  {todayGroups.map((group) => {
                    const isCollapsed = Boolean(
                      collapsedTaskGroups[group.category],
                    );
                    return (
                    <section className={styles.taskGroup} key={group.category}>
                      <header className={styles.taskGroupHeader}>
                        <span
                          className={`${styles.categoryMark} ${
                            styles[`category_${group.category}`]
                          }`}
                        >
                          {CATEGORY_MARKS[group.category]}
                        </span>
                        <div>
                          <small>{group.tasks.length} 项并行任务</small>
                          <h2>{CATEGORY_LABELS[group.category]}</h2>
                        </div>
                        <div className={styles.taskGroupActions}>
                          <button
                            className={`${styles.taskGroupCollapseButton} ${
                              isCollapsed
                                ? styles.taskGroupCollapseButtonCollapsed
                                : ""
                            }`}
                            type="button"
                            aria-expanded={!isCollapsed}
                            aria-label={`${isCollapsed ? "展开" : "折叠"}${
                              CATEGORY_LABELS[group.category]
                            }任务`}
                            title={isCollapsed ? "展开任务" : "折叠任务"}
                            onClick={() =>
                              setCollapsedTaskGroups((current) => ({
                                ...current,
                                [group.category]: !current[group.category],
                              }))
                            }
                          >
                            <span aria-hidden="true">▼</span>
                          </button>
                        </div>
                      </header>
                      {!isCollapsed && <div className={styles.taskList}>
                        {Array.from(
                          group.tasks.reduce((projects, task) => {
                            const tasks = projects.get(task.project_id) || [];
                            tasks.push(task);
                            projects.set(task.project_id, tasks);
                            return projects;
                          }, new Map<string, Task[]>()),
                        ).map(([projectId, projectTasks]) => {
                          const project = store.projects.find(
                            (item) => item.id === projectId,
                          );
                          return (
                            <div
                              className={styles.taskProjectGroup}
                              key={projectId}
                            >
                              <div className={styles.taskProjectGroupHeader}>
                                <span>{project?.name || "未知项目"}</span>
                                <button
                                  onClick={() =>
                                    setSelectedPlanProjectId(projectId)
                                  }
                                >
                                  查看项目 →
                                </button>
                              </div>
                              {Array.from(
                                projectTasks.reduce((milestones, task) => {
                                  const milestone =
                                    task.milestone?.trim() || "未分组任务";
                                  const tasks = milestones.get(milestone) || [];
                                  tasks.push(task);
                                  milestones.set(milestone, tasks);
                                  return milestones;
                                }, new Map<string, Task[]>()),
                              ).map(([milestone, milestoneTasks]) => {
                                const completed = milestoneTasks.filter(
                                  (task) => taskCompletion(task) === 100,
                                ).length;
                                return (
                                  <section
                                    className={styles.taskMilestoneGroup}
                                    key={`${projectId}-${milestone}`}
                                  >
                                    <header
                                      className={styles.taskMilestoneHeader}
                                    >
                                      <div>
                                        <span>阶段</span>
                                        <strong>{milestone}</strong>
                                      </div>
                                      <small>
                                        {completed}/{milestoneTasks.length}
                                      </small>
                                    </header>
                                    {milestoneTasks.map((task) => {
                                      const visibleTask =
                                        executionDraft?.id === task.id
                                          ? executionDraft
                                          : task;
                                      return (
                                        <TaskCard
                                          key={`${task.id}-${task.occurrence_date || ""}`}
                                          task={visibleTask}
                                          onOpen={() =>
                                            openTask(
                                              task.id,
                                              task.occurrence_date,
                                            )
                                          }
                                          onToggleComplete={() =>
                                            toggleTaskCompletion(
                                              task.id,
                                              task.occurrence_date,
                                            )
                                          }
                                          onPause={() =>
                                            toggleTaskPaused(
                                              task.id,
                                              task.occurrence_date,
                                            )
                                          }
                                        />
                                      );
                                    })}
                                  </section>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>}
                    </section>
                    );
                  })}
                </div>
              )}
            </div>

            
          </section>
        )}

        {activeTab === "calendar" && (
          <CalendarView
            month={calendarMonth}
            tasks={store.tasks}
            onMonthChange={setCalendarMonth}
            onDayOpen={(dateValue) => {
              setCalendarMoveNotice(null);
              setSelectedCalendarDate(dateValue);
            }}
          />
        )}

        {activeTab === "projects" && (
          <section>
            {store.projects.length === 0 ? (
              <EmptyState
                title="这里会出现你的项目结构"
                description="PotatoFlow 不内置任何人的任务。导入你自己的项目文档后，才会生成项目和任务。"
                action={() => setImportOpen(true)}
              />
            ) : (
              <>
              <section className={styles.pendingScheduleBoard}>
                <div className={styles.pendingScheduleHeader}>
                  <div>
                    <p className={styles.eyebrow}>待安排任务</p>
                    <h2>先保留任务，确定时间后再进入日历</h2>
                  </div>
                  <strong>
                    {store.tasks.filter(
                      (task) =>
                        !task.scheduled_date &&
                        task.status !== "done" &&
                        task.status !== "cancelled",
                    ).length}
                  </strong>
                </div>
                <div className={styles.pendingScheduleList}>
                  {store.tasks.filter(
                    (task) =>
                      !task.scheduled_date &&
                      task.status !== "done" &&
                      task.status !== "cancelled",
                  ).length === 0 ? (
                    <p>当前没有待安排任务。</p>
                  ) : (
                    store.tasks
                      .filter(
                        (task) =>
                          !task.scheduled_date &&
                          task.status !== "done" &&
                          task.status !== "cancelled",
                      )
                      .map((task) => {
                        const project = store.projects.find(
                          (item) => item.id === task.project_id,
                        );
                        return (
                          <article key={task.id}>
                            <button onClick={() => openTask(task.id)}>
                              <small>
                                {project?.name || "个人任务"}
                                {task.milestone ? ` · ${task.milestone}` : ""}
                              </small>
                              <strong>{task.title}</strong>
                            </button>
                            <label>
                              <span>安排日期</span>
                              <input
                                type="date"
                                aria-label={`为“${task.title}”安排日期`}
                                onChange={(event) =>
                                  scheduleBacklogTask(task.id, event.target.value)
                                }
                              />
                            </label>
                          </article>
                        );
                      })
                  )}
                </div>
              </section>
              <div className={styles.projectGrid}>
                {store.projects.map((project) => {
                  const tasks = store.tasks.filter(
                    (task) => task.project_id === project.id,
                  );
                  const done = tasks.filter(
                    (task) => taskOverallCompletion(task) === 100,
                  ).length;
                  const pending = tasks.filter(
                    (task) =>
                      !task.scheduled_date &&
                      task.status !== "done" &&
                      task.status !== "cancelled",
                  ).length;
                  const scheduled = tasks.filter(
                    (task) =>
                      Boolean(task.scheduled_date) &&
                      task.status !== "done" &&
                      task.status !== "cancelled",
                  ).length;
                  const progress = tasks.length
                    ? Math.round(
                        tasks.reduce(
                          (total, task) =>
                            total + taskOverallCompletion(task),
                          0,
                        ) / tasks.length,
                      )
                    : 0;
                  return (
                    <article
                      className={styles.projectCard}
                      key={project.id}
                    >
                      <div className={styles.projectTop}>
                        <span>进行中</span>
                        <b>
                          {done}/{tasks.length}
                        </b>
                      </div>
                      <h2>{project.name}</h2>
                      <p>{project.objective}</p>
                      <div className={styles.projectStats}>
                        <span><b>{tasks.length}</b> 总任务</span>
                        <span><b>{scheduled}</b> 已安排</span>
                        <span><b>{pending}</b> 待安排</span>
                        <span><b>{done}</b> 已完成</span>
                      </div>
                      <button
                        className={styles.projectOpenButton}
                        onClick={() => setSelectedPlanProjectId(project.id)}
                      >
                        查看并制定项目 →
                      </button>
                      <div className={styles.progressTrack}>
                        <i
                          style={{
                            transform: `scaleX(${progress / 100})`,
                          }}
                        />
                      </div>
                      <div className={styles.projectTasks}>
                        {tasks.length === 0 ? (
                          <p>这个项目还没有任务。</p>
                        ) : (
                          tasks.slice(0, 4).map((task) => (
                            <button
                              key={task.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                openTask(task.id, task.scheduled_date);
                              }}
                            >
                              <span className={styles.taskDot} />
                              <span>{task.title}</span>
                              <small>
                                {taskOverallCompletion(task) === 100
                                  ? "已完成"
                                  : !task.scheduled_date
                                    ? "待安排"
                                  : `${taskOverallCompletion(task)}%`}
                              </small>
                            </button>
                          ))
                        )}
                        {tasks.length > 4 && (
                          <button
                            className={styles.projectMoreTasks}
                            onClick={() => setSelectedPlanProjectId(project.id)}
                          >
                            还有 {tasks.length - 4} 项任务 · 查看全部 →
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              </>
            )}
          </section>
        )}

        {activeTab === "logic-graph" && (
          <Suspense fallback={<div className={styles.loading}>正在打开思维网图…</div>}>
            <LogicGraphPrototype
              mode="graph"
              openPageId={requestedLogicGraphPageId}
              pages={store.logic_graph_pages ?? INITIAL_LOGIC_GRAPH_PAGES}
              syncEnabled={syncEnabled}
              onPagesChange={(updater) =>
                updateStore((current) => ({
                  ...current,
                  logic_graph_pages: updater(
                    current.logic_graph_pages ?? INITIAL_LOGIC_GRAPH_PAGES,
                  ),
                }))
              }
            />
          </Suspense>
        )}

        {activeTab === "memo" && (
          <Suspense fallback={<div className={styles.loading}>正在打开备忘录…</div>}>
            <LogicGraphPrototype
              mode="memo"
              onOpenGraphPage={(pageId) => {
                setRequestedLogicGraphPageId(pageId);
                setActiveTab("logic-graph");
              }}
              pages={store.logic_graph_pages ?? INITIAL_LOGIC_GRAPH_PAGES}
              syncEnabled={syncEnabled}
              calendarTasks={store.tasks
                .filter((task) => task.status !== "cancelled")
                .map((task) => ({
                  id: task.id,
                  title: task.title,
                  scheduledDate: task.scheduled_date || null,
                }))}
              onCreateCalendarTask={createCalendarTaskFromIdea}
              onOpenCalendarTask={openCalendarTaskFromIdea}
              onPagesChange={(updater) =>
                updateStore((current) => ({
                  ...current,
                  logic_graph_pages: updater(
                    current.logic_graph_pages ?? INITIAL_LOGIC_GRAPH_PAGES,
                  ),
                }))
              }
            />
          </Suspense>
        )}

        {activeTab === "issues" && (
          <section>
            {store.issues.length === 0 ? (
              <EmptyState
                title="还没有执行问题"
                description="只有确实需要分析的问题才会出现在这里；步骤完成情况会保留在任务详情中。"
              />
            ) : (
              <div className={styles.issueList}>
                {store.issues.map((issue) => {
                  const task = store.tasks.find(
                    (item) => item.id === issue.task_id,
                  );
                    return (
                      <button
                        className={
                          issue.status === "resolved"
                            ? styles.issueResolved
                            : ""
                        }
                        key={issue.id}
                        onClick={() => setSelectedIssueId(issue.id)}
                      >
                      <span>
                        {issue.status === "open"
                          ? "待分析"
                          : issue.status === "answered"
                            ? "待验证"
                            : "已解决"}
                      </span>
                      <strong>{issue.question}</strong>
                      <small>{task?.title || "未知任务"}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      <nav className={styles.mobileNav} aria-label="移动端导航">
        {NAV_ITEMS.map((item) => (
          <button
            aria-label={item.mobileLabel || item.label}
            key={item.id}
            className={activeTab === item.id ? styles.mobileActive : ""}
            onClick={() => {
              if (item.id === "logic-graph") setRequestedLogicGraphPageId(null);
              setActiveTab(item.id);
              if (item.id === "today") setSelectedDate(localDate());
            }}
          >
            <span>{item.mark}</span>
            {item.mobileLabel || item.label}
          </button>
        ))}
      </nav>

      {importOpen && (
        <div className={styles.modalBackdrop}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>添加到 PotatoFlow</p>
                <h2 id="import-title">
                  {importMode === "project"
                    ? "导入项目"
                    : importMode === "backup"
                      ? "恢复完整备份"
                      : "手动创建项目或任务"}
                </h2>
              </div>
              <button
                aria-label="关闭"
                onClick={() => {
                  setImportOpen(false);
                  setImportError("");
                  setImportPreview(null);
                  setAllowStaleImport(false);
                  resetImportSources();
                }}
              >
                ×
              </button>
            </div>
            <div className={styles.importModeTabs}>
              <button
                className={importMode === "project" ? styles.importModeActive : ""}
                onClick={() => {
                  setImportMode("project");
                  setImportError("");
                  setImportPreview(null);
                  resetImportSources();
                }}
              >
                导入项目 JSON
              </button>
              <button
                className={importMode === "backup" ? styles.importModeActive : ""}
                onClick={() => {
                  setImportMode("backup");
                  setImportError("");
                  setImportPreview(null);
                  resetImportSources();
                  setBackupConfirmText("");
                }}
              >
                恢复完整备份
              </button>
              <button
                className={importMode === "task" ? styles.importModeActive : ""}
                onClick={() => {
                  setImportMode("task");
                  setImportError("");
                  setImportPreview(null);
                  resetImportSources();
                  setCustomTaskDraft((current) => ({
                    ...current,
                    projectId: NEW_PROJECT_OPTION,
                    startDate: current.startDate || selectedDate,
                    endDate: current.endDate || selectedDate,
                  }));
                }}
              >
                ＋ 手动创建
              </button>
            </div>

            {importMode === "project" ? (
              <>
                <p className={styles.modalHint}>
                  粘贴 PotatoFlow Skill 生成的项目 JSON。系统不会自动读取聊天，也不会上传内容。
                </p>
                <section className={styles.importGuide}>
                  <div>
                    <strong>还没有项目 JSON？</strong>
                    <span>
                      复制建档提示词，在 Codex 中发送。Skill 会先提问和确认，再生成 JSON。
                    </span>
                  </div>
                  <button
                    className={styles.quietButton}
                    onClick={copyOnboardingPrompt}
                  >
                    {onboardingCopied ? "已复制提示词" : "复制建档提示词"}
                  </button>
                </section>
                <div className={styles.importStrategy}>
                  <button
                    className={
                      importStrategy === "new"
                        ? styles.importModeActive
                        : ""
                    }
                    onClick={() => {
                      setImportStrategy("new");
                      setImportPreview(null);
                      setImportError("");
                      resetImportSources();
                    }}
                  >
                    新建项目
                  </button>
                  <button
                    className={
                      importStrategy === "update"
                        ? styles.importModeActive
                        : ""
                    }
                    disabled={store.projects.length === 0}
                    onClick={() => {
                      setImportStrategy("update");
                      setImportPreview(null);
                      setImportError("");
                      resetImportSources();
                      setImportTargetProjectId(
                        importTargetProjectId || store.projects[0]?.id || "",
                      );
                    }}
                  >
                    合并更新已有项目
                  </button>
                </div>
                {importStrategy === "update" && (
                  <label className={styles.importProjectTarget}>
                    <span>更新到哪个项目</span>
                    <select
                      value={importTargetProjectId}
                      onChange={(event) => {
                        setImportTargetProjectId(event.target.value);
                        setImportPreview(null);
                        setImportError("");
                        resetImportSources();
                      }}
                    >
                      {store.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <small>
                      系统先预览新增、修改、保留和删除内容；只有
                      deleted_task_ids 明确列出的旧任务才会删除。
                    </small>
                  </label>
                )}
                <textarea
                  aria-label="项目 JSON"
                  value={importText}
                  onChange={(event) => {
                    setImportText(event.target.value);
                    setImportPreview(null);
                    setAllowStaleImport(false);
                    setImportError("");
                    resetImportSources();
                  }}
                  placeholder={'{\n  "project": { ... },\n  "tasks": [],\n  "deleted_task_ids": [],\n  "import_metadata": { "base_project_revision": 1 }\n}'}
                  spellCheck={false}
                />
                {importPreview && (
                  <section className={styles.importPreview}>
                    <div className={styles.importPreviewHeader}>
                      <div>
                        <strong>导入变更预览</strong>
                        <span>
                          导入前不会写入数据；完全相同的内容不会重复处理。
                        </span>
                      </div>
                      <span
                        className={
                          importPreview.conflicts.length
                            ? styles.previewDanger
                            : importPreview.hasChanges ||
                                hasPendingImportFiles()
                              ? styles.previewReady
                              : styles.previewNeutral
                        }
                      >
                        {importPreview.conflicts.length
                          ? "需要修正"
                          : importPreview.hasChanges ||
                              hasPendingImportFiles()
                            ? "可以导入"
                            : "没有变化"}
                      </span>
                    </div>
                    <div className={styles.importPreviewStats}>
                      <span>新增 {importPreview.additions.length}</span>
                      <span>修改 {importPreview.updates.length}</span>
                      <span>不变 {importPreview.unchanged.length}</span>
                      <span>保留 {importPreview.retained.length}</span>
                      <span>删除 {importPreview.deletions.length}</span>
                    </div>
                    {importPreview.projectChanged && (
                      <p>项目名称、目标或规则资料将更新。</p>
                    )}
                    {importPreview.additions.length > 0 && (
                      <p>新增：{importPreview.additions.join("、")}</p>
                    )}
                    {importPreview.updates.length > 0 && (
                      <p>
                        修改：{importPreview.updates.join("、")}。相同文字的步骤和验收记录会按内容保留，改写内容会建立历史版本。
                      </p>
                    )}
                    {importPreview.retained.length > 0 && (
                      <p>
                        未出现在 JSON 中但继续保留：
                        {importPreview.retained.join("、")}
                      </p>
                    )}
                    {importPreview.deletions.length > 0 && (
                      <p className={styles.previewDelete}>
                        明确删除：{importPreview.deletions.join("、")}。关联问题也会删除。
                      </p>
                    )}
                    {importPreview.conflicts.map((conflict) => (
                      <p className={styles.previewDelete} key={conflict}>
                        {conflict}
                      </p>
                    ))}
                    {importPreview.stale && (
                      <label className={styles.staleImportConfirm}>
                        <input
                          type="checkbox"
                          checked={allowStaleImport}
                          onChange={(event) =>
                            setAllowStaleImport(event.target.checked)
                          }
                        />
                        <span>
                          这份 JSON 基于旧版本项目生成。我已核对预览，确认仍要覆盖这些字段。
                        </span>
                      </label>
                    )}
                  </section>
                )}
                {importPreview && (
                  <section
                    className={styles.importSourcePanel}
                    aria-label="导入源文件关联"
                  >
                    <div className={styles.importSourceHeader}>
                      <div>
                        <strong>源文件关联</strong>
                        <span>
                          文件本体不会写进 JSON，只会保存在当前浏览器并关联到任务。
                        </span>
                      </div>
                      <span>
                        {importSources.mode === "none"
                          ? "不添加"
                          : importSources.mode === "shared"
                            ? "全部任务共用"
                            : "按任务分别关联"}
                      </span>
                    </div>
                    <div className={styles.importSourceModes}>
                      {(
                        [
                          ["none", "没有源文件"],
                          ["shared", "全部任务共用"],
                          ["per_task", "每个任务不同"],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          type="button"
                          key={mode}
                          className={
                            importSources.mode === mode
                              ? styles.importModeActive
                              : ""
                          }
                          onClick={() => resetImportSources(mode)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {importSources.mode === "shared" && (
                      <label className={styles.importFilePicker}>
                        <span>选择全部任务共用的文件</span>
                        <small>
                          可多选 PDF、DOCX、TXT、Markdown，单个不超过 20MB。
                        </small>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.docx,.txt,.md"
                          onChange={(event) =>
                            setSharedImportFiles(
                              Array.from(event.target.files || []),
                            )
                          }
                        />
                        <b>
                          {importSources.shared.length
                            ? `已选择 ${importSources.shared.length} 个：${importSources.shared
                                .map((file) => file.name)
                                .join("、")}`
                            : "尚未选择文件"}
                        </b>
                      </label>
                    )}
                    {importSources.mode === "per_task" && (
                      <div className={styles.importTaskFiles}>
                        {importPreview.plan.tasks.map((task) => {
                          const requirementLabels = (
                            task.source_file_refs || []
                          )
                            .map(
                              (reference) =>
                                importPreview.plan.project.source_file_requirements?.find(
                                  (requirement) =>
                                    requirement.id === reference,
                                )?.label,
                            )
                            .filter(Boolean)
                            .join("、");
                          const files =
                            importSources.byTask[task.title] || [];
                          return (
                            <label key={task.id || task.title}>
                              <span>{task.title}</span>
                              <small>
                                {requirementLabels ||
                                  "为这条任务选择执行时需要查看的文件"}
                              </small>
                              <input
                                type="file"
                                multiple
                                accept=".pdf,.docx,.txt,.md"
                                onChange={(event) =>
                                  setTaskImportFiles(
                                    task.title,
                                    Array.from(event.target.files || []),
                                  )
                                }
                              />
                              <b>
                                {files.length
                                  ? `已选择 ${files.length} 个：${files
                                      .map((file) => file.name)
                                      .join("、")}`
                                  : "尚未选择文件"}
                              </b>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
                {importError && <p className={styles.error}>{importError}</p>}
                <div className={styles.modalActions}>
                  <button
                    className={styles.quietButton}
                    onClick={() => {
                      if (importPreview) {
                        setImportPreview(null);
                        setAllowStaleImport(false);
                      } else {
                        setImportOpen(false);
                      }
                    }}
                  >
                    {importPreview ? "返回修改" : "取消"}
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={
                      !importText.trim() ||
                      Boolean(
                        importPreview &&
                          (importPreview.conflicts.length > 0 ||
                            (!importPreview.hasChanges &&
                              !hasPendingImportFiles()) ||
                            (importPreview.stale && !allowStaleImport) ||
                            !importSourceSelectionComplete(importPreview) ||
                            importSourceBusy),
                      )
                    }
                    onClick={
                      importPreview
                        ? confirmImportPlan
                        : reviewImportPlan
                    }
                  >
                    {importPreview
                      ? importSourceBusy
                        ? "正在保存文件…"
                        : "确认并导入"
                      : "检查变更"}
                  </button>
                </div>
              </>
            ) : importMode === "backup" ? (
              <>
                <p className={styles.modalHint}>
                  用“导出数据 → 全量备份”得到的 JSON
                  可以恢复项目、任务、完成记录和问题。原文件不会写入 JSON；登录同一账号仍可从云端读取。
                </p>
                <div className={styles.backupWarning}>
                  <strong>恢复会替换当前浏览器里的全部数据</strong>
                  <span>请先导出当前全量备份，避免覆盖后无法找回。</span>
                </div>
                {recentImportSnapshots.length > 0 && (
                  <section className={styles.importSnapshots}>
                    <div>
                      <strong>最近导入前快照</strong>
                      <span>
                        系统在项目导入前自动保留最多 3 个恢复点。
                      </span>
                    </div>
                    {recentImportSnapshots.map((snapshot) => (
                      <button
                        key={snapshot.id}
                        onClick={() => {
                          setImportText(
                            JSON.stringify(snapshot.store, null, 2),
                          );
                          setBackupConfirmText("");
                          setImportError("");
                        }}
                      >
                        <span>{snapshot.label}</span>
                        <small>
                          {new Date(snapshot.created_at).toLocaleString(
                            "zh-CN",
                          )}
                        </small>
                      </button>
                    ))}
                  </section>
                )}
                <textarea
                  aria-label="完整备份 JSON"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder={'{\n  "schema_version": 1,\n  "projects": [],\n  "tasks": [],\n  "issues": []\n}'}
                  spellCheck={false}
                />
                <label className={styles.backupConfirmField}>
                  <span>
                    请输入“<strong>恢复</strong>”确认替换当前数据
                  </span>
                  <input
                    value={backupConfirmText}
                    onChange={(event) =>
                      setBackupConfirmText(event.target.value)
                    }
                    placeholder="输入：恢复"
                  />
                </label>
                {importError && <p className={styles.error}>{importError}</p>}
                <div className={styles.modalActions}>
                  <button
                    className={styles.quietButton}
                    onClick={() => setImportOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={
                      !importText.trim() ||
                      backupConfirmText.trim() !== "恢复"
                    }
                    onClick={restoreBackup}
                  >
                    确认恢复备份
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.modalHint}>
                  一个总项目下面可以放多个任务。只填写任务名、执行步骤和备注即可，其余由系统使用默认值。
                </p>
                <div className={styles.creationTypeTabs}>
                  <button
                    className={
                      customTaskDraft.projectId === NEW_PROJECT_OPTION
                        ? styles.creationTypeActive
                        : ""
                    }
                    type="button"
                    onClick={() =>
                      setCustomTaskDraft((current) => ({
                        ...current,
                        projectId: NEW_PROJECT_OPTION,
                      }))
                    }
                  >
                    <strong>新建总项目</strong>
                    <small>总项目就是总任务标题</small>
                  </button>
                  <button
                    className={
                      customTaskDraft.projectId !== NEW_PROJECT_OPTION &&
                      customTaskDraft.projectId !== PERSONAL_PROJECT_ID
                        ? styles.creationTypeActive
                        : ""
                    }
                    type="button"
                    disabled={
                      store.projects.filter(
                        (project) => project.id !== PERSONAL_PROJECT_ID,
                      ).length === 0
                    }
                    onClick={() => {
                      const firstProject = store.projects.find(
                        (project) => project.id !== PERSONAL_PROJECT_ID,
                      );
                      if (firstProject) {
                        setCustomTaskDraft((current) => ({
                          ...current,
                          projectId: firstProject.id,
                          milestone: firstProject.milestones?.[0] || "",
                        }));
                      }
                    }}
                  >
                    <strong>添加具体任务</strong>
                    <small>任务名就是子任务标题</small>
                  </button>
                  <button
                    className={
                      customTaskDraft.projectId === PERSONAL_PROJECT_ID
                        ? styles.creationTypeActive
                        : ""
                    }
                    type="button"
                    onClick={() =>
                      setCustomTaskDraft((current) => ({
                        ...current,
                        projectId: PERSONAL_PROJECT_ID,
                        milestone: "",
                      }))
                    }
                  >
                    <strong>独立任务</strong>
                    <small>放入“个人任务”总项目</small>
                  </button>
                </div>
                <div className={styles.customTaskForm}>
                  {customTaskDraft.projectId !== NEW_PROJECT_OPTION &&
                    customTaskDraft.projectId !== PERSONAL_PROJECT_ID && (
                  <label className={styles.customTaskWide}>
                    <span>总项目（总任务标题）</span>
                    <select
                      value={customTaskDraft.projectId}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          projectId: event.target.value,
                        }))
                      }
                    >
                      {store.projects
                        .filter(
                          (project) => project.id !== PERSONAL_PROJECT_ID,
                        )
                        .map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  )}
                  {customTaskDraft.projectId === PERSONAL_PROJECT_ID && (
                    <label className={styles.customTaskWide}>
                      <span>总项目（总任务标题）</span>
                      <input value="个人任务" readOnly />
                    </label>
                  )}
                  {customTaskDraft.projectId === NEW_PROJECT_OPTION && (
                    <>
                      <label>
                        <span>总项目（总任务标题）*</span>
                        <input
                          value={customTaskDraft.newProjectName}
                          onChange={(event) =>
                            setCustomTaskDraft((current) => ({
                              ...current,
                              newProjectName: event.target.value,
                            }))
                          }
                          placeholder="例如：个人内容运营"
                        />
                      </label>
                      <label className={styles.customTaskWide} hidden>
                        <span>新项目目标</span>
                        <textarea
                          value={customTaskDraft.newProjectObjective}
                          onChange={(event) =>
                            setCustomTaskDraft((current) => ({
                              ...current,
                              newProjectObjective: event.target.value,
                            }))
                          }
                          placeholder="说明这个项目希望达成的总体结果。"
                        />
                      </label>
                      <section className={`${styles.newProjectStructureBuilder} ${styles.customTaskWide}`} hidden>
                        <div className={styles.newProjectStructureHeader}>
                          <div>
                            <strong>项目结构</strong>
                            <small>先建立多个项目阶段，再给每个阶段添加具体任务。</small>
                          </div>
                          <button type="button" onClick={addNewProjectStructureStage}>
                            ＋ 新增阶段
                          </button>
                        </div>
                        <div className={styles.newProjectStageList}>
                          {newProjectStructureStages.map((stage, stageIndex) => {
                            const stageCollapsed =
                              collapsedNewProjectStages[stage.id] || false;
                            return (
                            <section className={styles.newProjectStageCard} key={stage.id}>
                              <header>
                                <span>阶段 {String(stageIndex + 1).padStart(2, "0")}</span>
                                <input
                                  aria-label={`阶段 ${stageIndex + 1} 名称`}
                                  value={stage.name}
                                  onChange={(event) =>
                                    updateNewProjectStructureStage(
                                      stage.id,
                                      event.target.value,
                                    )
                                  }
                                  placeholder="例如：内容准备"
                                />
                                <button
                                  type="button"
                                  onClick={() => addNewProjectStructureTask(stage.id)}
                                >
                                  ＋ 具体任务
                                </button>
                                <div className={styles.newProjectStageMoveActions}>
                                  <button
                                    type="button"
                                    disabled={stageIndex === 0}
                                    aria-label={`上移阶段 ${stageIndex + 1}`}
                                    onClick={() =>
                                      moveNewProjectStructureStage(stage.id, -1)
                                    }
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      stageIndex ===
                                      newProjectStructureStages.length - 1
                                    }
                                    aria-label={`下移阶段 ${stageIndex + 1}`}
                                    onClick={() =>
                                      moveNewProjectStructureStage(stage.id, 1)
                                    }
                                  >
                                    ↓
                                  </button>
                                </div>
                                <button
                                  className={styles.newProjectStructureDelete}
                                  type="button"
                                  disabled={newProjectStructureStages.length === 1}
                                  onClick={() => removeNewProjectStructureStage(stage.id)}
                                >
                                  删除阶段
                                </button>
                                <button
                                  className={styles.newProjectStageCollapse}
                                  type="button"
                                  aria-expanded={!stageCollapsed}
                                  onClick={() =>
                                    setCollapsedNewProjectStages((current) => ({
                                      ...current,
                                      [stage.id]: !stageCollapsed,
                                    }))
                                  }
                                >
                                  {stageCollapsed ? "展开" : "折叠"}
                                </button>
                              </header>
                              {!stageCollapsed && (
                              <div className={styles.newProjectStructureTaskList}>
                                {stage.tasks.length === 0 ? (
                                  <button
                                    className={styles.newProjectEmptyTaskButton}
                                    type="button"
                                    onClick={() => addNewProjectStructureTask(stage.id)}
                                  >
                                    ＋ 添加这个阶段的第一项具体任务
                                  </button>
                                ) : (
                                  stage.tasks.map((task, taskIndex) => (
                                    <details
                                      className={styles.newProjectStructureTask}
                                      key={task.id}
                                      open={!task.title}
                                    >
                                      <summary>
                                        <span>{String(taskIndex + 1).padStart(2, "0")}</span>
                                        <strong>{task.title || "未命名具体任务"}</strong>
                                        <small>
                                          {task.scheduleType === "backlog"
                                            ? "待安排"
                                            : task.scheduledDate}
                                        </small>
                                      </summary>
                                      <div className={styles.newProjectStructureTaskFields}>
                                        <label>
                                          <span>具体任务 *</span>
                                          <input
                                            value={task.title}
                                            onChange={(event) =>
                                              updateNewProjectStructureTask(
                                                stage.id,
                                                task.id,
                                                { title: event.target.value },
                                              )
                                            }
                                            placeholder="例如：完成第一版拍摄"
                                          />
                                        </label>
                                        <label>
                                          <span>要达成的结果</span>
                                          <textarea
                                            value={task.objective}
                                            onChange={(event) =>
                                              updateNewProjectStructureTask(
                                                stage.id,
                                                task.id,
                                                { objective: event.target.value },
                                              )
                                            }
                                            placeholder="说明完成后应该得到什么结果。"
                                          />
                                        </label>
                                        <label>
                                          <span>时间安排</span>
                                          <select
                                            value={task.scheduleType}
                                            onChange={(event) =>
                                              updateNewProjectStructureTask(
                                                stage.id,
                                                task.id,
                                                {
                                                  scheduleType: event.target.value as
                                                    | "backlog"
                                                    | "once",
                                                },
                                              )
                                            }
                                          >
                                            <option value="backlog">以后再安排</option>
                                            <option value="once">安排日期</option>
                                          </select>
                                        </label>
                                        {task.scheduleType === "once" && (
                                          <label>
                                            <span>任务日期</span>
                                            <input
                                              type="date"
                                              value={task.scheduledDate}
                                              onChange={(event) =>
                                                updateNewProjectStructureTask(
                                                  stage.id,
                                                  task.id,
                                                  { scheduledDate: event.target.value },
                                                )
                                              }
                                            />
                                          </label>
                                        )}
                                        <label>
                                          <span>预计用时（分钟）</span>
                                          <input
                                            type="number"
                                            min="1"
                                            value={task.estimatedMinutes}
                                            onChange={(event) =>
                                              updateNewProjectStructureTask(
                                                stage.id,
                                                task.id,
                                                { estimatedMinutes: event.target.value },
                                              )
                                            }
                                          />
                                        </label>
                                        {newProjectStructureStages.length > 1 && (
                                          <label>
                                            <span>移动到项目阶段</span>
                                            <select
                                              value={stage.id}
                                              onChange={(event) =>
                                                transferNewProjectStructureTask(
                                                  stage.id,
                                                  task.id,
                                                  event.target.value,
                                                )
                                              }
                                            >
                                              {newProjectStructureStages.map(
                                                (targetStage, targetIndex) => (
                                                  <option
                                                    key={targetStage.id}
                                                    value={targetStage.id}
                                                  >
                                                    阶段 {String(targetIndex + 1).padStart(2, "0")}
                                                    {targetStage.name
                                                      ? ` · ${targetStage.name}`
                                                      : " · 未命名"}
                                                  </option>
                                                ),
                                              )}
                                            </select>
                                          </label>
                                        )}
                                        <div className={styles.newProjectTaskMoveActions}>
                                          <button
                                            type="button"
                                            disabled={taskIndex === 0}
                                            onClick={() =>
                                              moveNewProjectStructureTask(
                                                stage.id,
                                                task.id,
                                                -1,
                                              )
                                            }
                                          >
                                            ↑ 上移任务
                                          </button>
                                          <button
                                            type="button"
                                            disabled={
                                              taskIndex === stage.tasks.length - 1
                                            }
                                            onClick={() =>
                                              moveNewProjectStructureTask(
                                                stage.id,
                                                task.id,
                                                1,
                                              )
                                            }
                                          >
                                            ↓ 下移任务
                                          </button>
                                        </div>
                                        <button
                                          className={styles.newProjectStructureDelete}
                                          type="button"
                                          onClick={() =>
                                            removeNewProjectStructureTask(
                                              stage.id,
                                              task.id,
                                            )
                                          }
                                        >
                                          删除具体任务
                                        </button>
                                      </div>
                                    </details>
                                  ))
                                )}
                              </div>
                              )}
                            </section>
                            );
                          })}
                        </div>
                      </section>
                    </>
                  )}
                  {true && (
                  <>
                  <label>
                    <span>任务名（子任务标题）*</span>
                    <input
                      value={customTaskDraft.title}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="例如：整理本周素材"
                    />
                  </label>
                  <label className={styles.customTaskWide} hidden>
                    <span>任务详情 / 要达成的结果</span>
                    <textarea
                      value={customTaskDraft.objective}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          objective: event.target.value,
                        }))
                      }
                      placeholder="说明这项任务最终要完成什么。"
                    />
                  </label>
                  {customTaskDraft.projectId !== PERSONAL_PROJECT_ID && <label hidden>
                    <span>项目阶段</span>
                    <input
                      list="custom-task-milestones"
                      value={customTaskDraft.milestone}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          milestone: event.target.value,
                        }))
                      }
                      placeholder="例如：首条口播视频"
                    />
                    <datalist id="custom-task-milestones">
                      {Array.from(
                        new Set(
                          store.tasks
                            .filter(
                              (task) =>
                                task.project_id === customTaskDraft.projectId &&
                                task.milestone?.trim(),
                            )
                            .map((task) => task.milestone?.trim() || ""),
                        ),
                      ).map((milestone) => (
                        <option key={milestone} value={milestone} />
                      ))}
                    </datalist>
                    <small className={styles.fieldHelp}>
                      选择具体任务归属的项目阶段，也可以直接输入新阶段名称。
                    </small>
                  </label>}
                  <label hidden>
                    <span>为什么做</span>
                    <input
                      value={customTaskDraft.why}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          why: event.target.value,
                        }))
                      }
                      placeholder="这项任务对当前目标的作用"
                    />
                  </label>
                  <label className={styles.customTaskWide} hidden>
                    <span>任务备注（可选）</span>
                    <textarea
                      value={customTaskDraft.note}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      placeholder="补充提醒、注意事项或执行时需要记住的信息；没有可留空。"
                    />
                  </label>
                  <div className={styles.customTaskWide}>
                    <EditableSteps
                      steps={customTaskDraft.steps}
                      onAdd={() =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          steps: [...current.steps, ""],
                        }))
                      }
                      onChange={(index, value) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          steps: current.steps.map((step, stepIndex) =>
                            stepIndex === index ? value : step,
                          ),
                        }))
                      }
                      onRemove={(index) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
                        }))
                      }
                      onMove={(index, direction) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          steps: moveArrayItem(current.steps, index, index + direction),
                        }))
                      }
                    />
                  </div>
                  <label className={styles.customTaskWide}>
                    <span>备注（可选）</span>
                    <textarea
                      value={customTaskDraft.note}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      placeholder="其他想说的、提醒或注意事项都写在这里；没有可留空。"
                    />
                  </label>
                  <label className={styles.customTaskWide} hidden>
                    <span>完成标准（用于判断整项任务，每行一条）</span>
                    <textarea
                      value={customTaskDraft.acceptanceCriteria}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          acceptanceCriteria: event.target.value,
                        }))
                      }
                      placeholder="留空时会自动生成一条基础完成标准"
                    />
                  </label>
                  <label className={styles.customTaskWide} hidden>
                    <span>时间安排</span>
                    <select
                      value={customTaskDraft.scheduleType}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          scheduleType: event.target.value as ScheduleType,
                        }))
                      }
                    >
                      <option value="backlog">以后再安排</option>
                      <option value="once">一次性任务</option>
                      <option value="daily">每天</option>
                      <option value="weekdays">每个工作日</option>
                      <option value="weekends">每个周末</option>
                      <option value="range">持续一段时间</option>
                    </select>
                  </label>
                  {customTaskDraft.scheduleType !== "backlog" && <label hidden>
                    <span>
                      {customTaskDraft.scheduleType === "once"
                        ? "任务日期"
                        : "开始日期"}
                    </span>
                    <input
                      type="date"
                      value={customTaskDraft.startDate}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          startDate: event.target.value,
                          endDate:
                            current.endDate < event.target.value
                              ? event.target.value
                              : current.endDate,
                        }))
                      }
                    />
                  </label>}
                  {customTaskDraft.scheduleType !== "once" && customTaskDraft.scheduleType !== "backlog" && (
                      <label hidden>
                      <span>结束日期</span>
                      <input
                        type="date"
                        min={customTaskDraft.startDate}
                        value={customTaskDraft.endDate}
                        onChange={(event) =>
                          setCustomTaskDraft((current) => ({
                            ...current,
                            endDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                  )}
                  {false && customTaskDraft.scheduleType === "once" && (
                    <div className={styles.scheduleHint}>
                      只在所选日期生成一次
                    </div>
                  )}
                  <p
                    className={`${styles.scheduleDescription} ${styles.customTaskWide}`}
                    hidden
                  >
                    {customTaskDraft.scheduleType === "backlog"
                      ? "暂不进入首页和日历，之后可在项目页面直接安排日期。"
                      : customTaskDraft.scheduleType === "range"
                      ? "持续任务会在起止日期内每天显示，并共享同一份完成进度。"
                      : customTaskDraft.scheduleType === "once"
                        ? "一次性任务只创建一条记录。"
                        : "重复任务只保存一条规则，每个执行日期的完成情况会分别记录。"}
                  </p>
                  <label hidden>
                    <span>预计用时（分钟）</span>
                    <input
                      type="number"
                      min="1"
                      value={customTaskDraft.estimatedMinutes}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          estimatedMinutes: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label hidden>
                    <span>任务标签</span>
                    <select
                      value={customTaskDraft.category}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          category: event.target.value as TaskCategory,
                        }))
                      }
                    >
                      {(Object.keys(CATEGORY_LABELS) as TaskCategory[]).map(
                        (category) => (
                          <option key={category} value={category}>
                            {CATEGORY_LABELS[category]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label hidden>
                    <span>优先级</span>
                    <select
                      value={customTaskDraft.priority}
                      onChange={(event) =>
                        setCustomTaskDraft((current) => ({
                          ...current,
                          priority: Number(event.target.value),
                        }))
                      }
                    >
                      {[1, 2, 3, 4, 5].map((priority) => (
                        <option key={priority} value={priority}>
                          {priorityLabel(priority)}
                        </option>
                      ))}
                    </select>
                  </label>
                  </>
                  )}
                </div>
                {importError && <p className={styles.error}>{importError}</p>}
                <div className={styles.modalActions}>
                  <button
                    className={styles.quietButton}
                    onClick={() => setImportOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={
                      !customTaskDraft.title.trim() ||
                      (customTaskDraft.projectId === NEW_PROJECT_OPTION &&
                        !customTaskDraft.newProjectName.trim())
                    }
                    onClick={createCustomTask}
                  >
                    创建任务
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {exportOpen && (
        <div className={styles.modalBackdrop}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>复制给 Codex</p>
                <h2 id="export-title">导出当前数据</h2>
              </div>
              <button
                aria-label="关闭"
                onClick={() => setExportOpen(false)}
              >
                ×
              </button>
            </div>
            <p className={styles.modalHint}>
              选择这次真正需要交给 Codex 的范围，避免附带无关的个人项目。
            </p>
            <div className={styles.exportScopePicker}>
              {(
                [
                  ["task", "当前任务"],
                  ["project", "当前项目"],
                  ["all", "全量备份"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={
                    exportScope === value ? styles.importModeActive : ""
                  }
                  disabled={
                    value !== "all" && store.projects.length === 0
                  }
                  onClick={() => setExportScope(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {exportScope !== "all" && (
              <div className={styles.exportTargets}>
                <label>
                  <span>项目</span>
                  <select
                    value={exportSelectedProject?.id || ""}
                    onChange={(event) => {
                      const projectId = event.target.value;
                      setExportProjectId(projectId);
                      setExportTaskId(
                        store.tasks.find(
                          (task) => task.project_id === projectId,
                        )?.id || "",
                      );
                    }}
                  >
                    {store.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                {exportScope === "task" && (
                  <label>
                    <span>任务</span>
                    <select
                      value={exportSelectedTask?.id || ""}
                      onChange={(event) =>
                        setExportTaskId(event.target.value)
                      }
                    >
                      {exportProjectTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            <textarea
              aria-label="可复制的完整数据"
              value={JSON.stringify(exportData, null, 2)}
              readOnly
              spellCheck={false}
            />
            <div className={styles.modalActions}>
              <button
                className={styles.quietButton}
                onClick={() => setExportOpen(false)}
              >
                关闭
              </button>
              <button
                className={styles.primaryButton}
                onClick={copyExportData}
              >
                {exportCopied ? "已复制" : "复制全部"}
              </button>
            </div>
          </section>
        </div>
      )}

      {privacyOpen && (
        <div className={styles.modalBackdrop}>
          <section
            className={`${styles.modal} ${styles.privacyModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>数据控制权</p>
                <h2 id="privacy-title">数据与隐私</h2>
              </div>
              <button aria-label="关闭" onClick={() => setPrivacyOpen(false)}>
                ×
              </button>
            </div>

            <div className={styles.privacySummary}>
              <article>
                <strong>本机数据</strong>
                <p>项目、任务和网图会自动保存在当前浏览器。源文件保存在浏览器文件库中。</p>
              </article>
              <article>
                <strong>云端同步</strong>
                <p>
                  {syncEnabled
                    ? "登录后，数据和源文件按你的账户隔离保存，用于电脑和手机同步。"
                    : "当前没有启用账户同步，数据只保存在这台设备的浏览器中。"}
                </p>
              </article>
            </div>

            <div className={styles.privacyActions}>
              <button
                className={styles.quietButton}
                onClick={() => {
                  setPrivacyOpen(false);
                  setExportCopied(false);
                  setExportScope("all");
                  setExportOpen(true);
                }}
              >
                导出完整备份
              </button>
            </div>

            {syncEnabled ? (
              <div className={styles.cloudDeletePanel}>
                <strong>删除云端数据</strong>
                <p>
                  这会删除云端项目快照、历史版本和上传文件。本机数据不会删除，刷新后可重新选择是否上传。
                </p>
                <label>
                  <span>输入“删除云端数据”确认</span>
                  <input
                    value={cloudDeleteConfirm}
                    onChange={(event) => setCloudDeleteConfirm(event.target.value)}
                    placeholder="删除云端数据"
                  />
                </label>
                {cloudDeleteError && <p className={styles.error}>{cloudDeleteError}</p>}
                {cloudDeleteDone && (
                  <p className={styles.privacySuccess} role="status">
                    云端数据和文件已经删除，当前内容仍安全保留在本机。
                  </p>
                )}
                <button
                  className={styles.dangerButton}
                  disabled={
                    cloudDeleteBusy || cloudDeleteConfirm.trim() !== "删除云端数据"
                  }
                  onClick={deleteCloudData}
                >
                  {cloudDeleteBusy ? "正在删除…" : "删除全部云端数据"}
                </button>
              </div>
            ) : (
              <p className={styles.modalHint}>
                未登录状态没有云端数据。如果需要跨设备同步，可以使用 ChatGPT 账户登录。
              </p>
            )}

            <div className={styles.modalActions}>
              <button className={styles.quietButton} onClick={() => setPrivacyOpen(false)}>
                完成
              </button>
            </div>
          </section>
        </div>
      )}

      {planProject && (
        <div className={styles.drawerBackdrop}>
          <aside className={`${styles.drawer} ${styles.planDrawer} ${
            projectEditDraft ? styles.planDrawerEditing : ""
          }`}>
            <div className={styles.drawerHeader}>
              <span>任务总体规划</span>
              <button
                aria-label="关闭项目规划"
                onClick={requestClosePlan}
              >
                ×
              </button>
            </div>
            <nav
              className={styles.projectActionBar}
              aria-label="项目操作"
            >
              <button
                className={styles.projectBackButton}
                disabled={planUndoStack.length === 0}
                title="撤销最近一次项目编辑操作"
                onClick={undoLastPlanOperation}
              >
                ↶ 返回上一步
              </button>
              <div>
                <button
                  className={styles.projectActionButton}
                  onClick={() =>
                    projectEditDraft
                      ? savePlanChanges(false)
                      : startProjectEdit()
                  }
                >
                  {projectEditDraft ? "完成编辑" : "编辑项目"}
                </button>
                <button
                  className={styles.projectDeleteButton}
                  onClick={() => {
                    setDeleteProjectConfirmText("");
                    setDeleteProjectConfirmOpen(true);
                  }}
                >
                  删除项目
                </button>
              </div>
            </nav>
            {!projectEditDraft && <>
            <section className={styles.projectPicker}>
              <div>
                <p className={styles.eyebrow}>选择项目</p>
                <small>当前共导入 {store.projects.length} 个项目</small>
              </div>
              <label>
                <select
                  aria-label="选择要查看的项目"
                  value={planProject.id}
                  onChange={(event) =>
                    setSelectedPlanProjectId(event.target.value)
                  }
                >
                  {store.projects.map((project) => {
                    const projectTasks = store.tasks.filter(
                      (task) => task.project_id === project.id,
                    );
                    const completedTasks = projectTasks.filter(
                      (task) => taskCompletion(task) === 100,
                    ).length;
                    return (
                      <option key={project.id} value={project.id}>
                        {project.name}（{completedTasks}/{projectTasks.length}）
                      </option>
                    );
                  })}
                </select>
              </label>
            </section>
            <p className={styles.eyebrow}>PROJECT PLAN</p>
            <div className={styles.projectPlanHeading}>
              <h2>{planProject.name}</h2>
            </div>
            </>}

            {projectEditDraft?.projectId === planProject.id ? (
              <section className={styles.projectEditor} data-project-edit-surface>
                <header className={styles.projectEditorHeader}>
                  <div>
                    <p className={styles.eyebrow}>编辑项目</p>
                    <h3>先明确目标，再补充判断依据</h3>
                  </div>
                  <small>修改内容会与下方任务规划一起保存</small>
                </header>
                <section className={styles.projectEditorGroup}>
                  <div className={styles.projectEditorGroupHeading}>
                    <span>01</span>
                    <div><strong>基本信息</strong><small>项目叫什么，最终要做到什么</small></div>
                  </div>
                  <label>
                    <span>项目名称</span>
                    <input
                      value={projectEditDraft.name}
                      onChange={(event) => {
                        checkpointPlanOperation("project:name");
                        setProjectEditDraft((current) =>
                          current ? { ...current, name: event.target.value } : current,
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>项目说明 / 总体目标</span>
                    <textarea
                      value={projectEditDraft.objective}
                      onChange={(event) => {
                        checkpointPlanOperation("project:objective");
                        setProjectEditDraft((current) =>
                          current ? { ...current, objective: event.target.value } : current,
                        );
                      }}
                    />
                  </label>
                </section>
                <section className={styles.projectEditorGroup}>
                  <div className={styles.projectEditorGroupHeading}>
                    <span>02</span>
                    <div><strong>背景与判断</strong><small>为什么现在做，以及目前基于什么判断</small></div>
                  </div>
                  <label>
                    <span>项目背景</span>
                    <textarea
                      value={projectEditDraft.background}
                      onChange={(event) => {
                        checkpointPlanOperation("project:background");
                        setProjectEditDraft((current) =>
                          current ? { ...current, background: event.target.value } : current,
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>当前假设（每行一条）</span>
                    <textarea
                      value={projectEditDraft.assumptions}
                      onChange={(event) => {
                        checkpointPlanOperation("project:assumptions");
                        setProjectEditDraft((current) =>
                          current ? { ...current, assumptions: event.target.value } : current,
                        );
                      }}
                    />
                  </label>
                </section>
                <section className={styles.projectEditorGroup}>
                  <div className={styles.projectEditorGroupHeading}>
                    <span>03</span>
                    <div><strong>执行标准</strong><small>怎样算完成，执行时有哪些边界</small></div>
                  </div>
                  <label>
                    <span>成功标准（每行一条）</span>
                    <textarea
                      value={projectEditDraft.successCriteria}
                      onChange={(event) => {
                        checkpointPlanOperation("project:success-criteria");
                        setProjectEditDraft((current) =>
                          current ? { ...current, successCriteria: event.target.value } : current,
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>限制条件（每行一条）</span>
                    <textarea
                      value={projectEditDraft.constraints}
                      onChange={(event) => {
                        checkpointPlanOperation("project:constraints");
                        setProjectEditDraft((current) =>
                          current ? { ...current, constraints: event.target.value } : current,
                        );
                      }}
                    />
                  </label>
                </section>
              </section>
            ) : (
              <>
                <p className={styles.taskObjective}>{planProject.objective}</p>

                <details className={styles.projectContextDetails}>
                  <summary>
                    <span>
                      <strong>项目说明</strong>
                      <small>需要时再查看背景、标准和边界</small>
                    </span>
                    <b aria-hidden="true">⌄</b>
                  </summary>
                  <div className={styles.planDetails}>
                    <PlanBlock title="项目背景">
                      <p>{planProject.background || "还没有记录项目背景。"}</p>
                    </PlanBlock>
                    <PlanBlock title="成功标准">
                      <ul>
                        {(planProject.success_criteria || []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </PlanBlock>
                    <PlanBlock title="限制条件">
                      <ul>
                        {(planProject.constraints || []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </PlanBlock>
                    <PlanBlock title="当前假设">
                      <ul>
                        {(planProject.assumptions || []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </PlanBlock>
                  </div>
                </details>
              </>
            )}

            {projectEditDraft ? (
              <section className={styles.projectCategoryPanel} data-project-edit-surface>
                <div className={styles.projectCategoryHeader}>
                  <div>
                    <p className={styles.eyebrow}>任务标签</p>
                    <h3>
                      {projectTaskDrafts.length === 0
                        ? "还没有任务"
                        : projectCommonCategory
                          ? CATEGORY_LABELS[projectCommonCategory]
                          : "当前包含多个标签"}
                    </h3>
                  </div>
                  <span>{projectTaskDrafts.length} 项任务</span>
                </div>
                <div
                  className={styles.categoryPicker}
                  aria-label="统一设置项目任务标签"
                >
                  {(Object.keys(CATEGORY_LABELS) as TaskCategory[]).map(
                    (category) => (
                      <button
                        className={
                          projectCommonCategory === category
                            ? styles.categorySelected
                            : ""
                        }
                        disabled={projectTaskDrafts.length === 0}
                        key={category}
                        onClick={() =>
                          updateAllProjectTaskCategories(category)
                        }
                        type="button"
                      >
                        {CATEGORY_LABELS[category]}
                      </button>
                    ),
                  )}
                </div>
                <small>
                  统一设置本项目任务标签；需要不同标签时，可在下方逐条任务中单独修改。
                </small>
              </section>
            ) : null}

            <section className={styles.projectTaskPlanner} data-project-edit-surface>
              <fieldset
                className={styles.projectEditFieldset}
                disabled={!projectEditDraft}
              >
              <div className={styles.projectTaskPlannerHeader}>
                <div className={styles.planModuleHeader}>
                  <span className={styles.planModuleNumber}>01</span>
                  <div>
                  <p className={styles.eyebrow}>项目结构</p>
                  <h3>
                    {projectEditDraft
                      ? "统一调整任务、内容与日期"
                      : "阶段与任务"}
                  </h3>
                  <small>先看阶段，再展开具体任务</small>
                  </div>
                </div>
                <div className={styles.projectTaskPlannerHeaderActions}>
                  {projectTaskGroups.length > 0 && (
                    <div
                      className={styles.collapseAllMilestonesButton}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setCollapsedProjectMilestones((current) => {
                          const next = { ...current };
                          projectTaskGroups.forEach((group) => {
                            next[projectMilestoneKey(group.milestone)] =
                              !allProjectMilestonesCollapsed;
                          });
                          return next;
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.currentTarget.click();
                        }
                      }}
                    >
                      {allProjectMilestonesCollapsed ? "全部展开" : "全部折叠"}
                    </div>
                  )}
                  {projectEditDraft && (
                    <button
                      className={styles.projectEditButton}
                      onClick={() => setAddingMilestone(true)}
                      type="button"
                    >
                      ＋ 新增阶段
                    </button>
                  )}
                </div>
              </div>
              {projectEditDraft && addingMilestone && (
                <div className={styles.newMilestoneForm}>
                  <label>
                    <span>新阶段名称</span>
                    <input
                      autoFocus
                      value={newMilestoneName}
                      onChange={(event) => setNewMilestoneName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addProjectMilestoneDraft();
                        }
                        if (event.key === "Escape") {
                          setAddingMilestone(false);
                          setNewMilestoneName("");
                        }
                      }}
                      placeholder="例如：内容准备"
                    />
                  </label>
                  <button
                    className={styles.quietButton}
                    type="button"
                    onClick={() => {
                      setAddingMilestone(false);
                      setNewMilestoneName("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    disabled={!newMilestoneName.trim()}
                    onClick={addProjectMilestoneDraft}
                  >
                    创建阶段
                  </button>
                </div>
              )}
              {projectTaskDrafts.length === 0 ? (
                <div className={styles.projectTaskPlannerEmpty}>
                  当前项目还没有任务，可以从这里开始制定。
                </div>
              ) : (
                <div className={styles.projectTaskEditorList}>
                  {projectTaskGroups.map((group, groupIndex) => {
                    const milestoneKey = projectMilestoneKey(group.milestone);
                    const milestoneCollapsed =
                      collapsedProjectMilestones[milestoneKey] || false;
                    const completedTasks = group.tasks.filter(
                      (task) => taskCompletion(task) === 100,
                    ).length;
                    return (
                    <section className={styles.projectMilestoneGroup} key={group.milestone}>
                      <header className={styles.projectMilestoneHeader}>
                        <span>阶段 {String(groupIndex + 1).padStart(2, "0")}</span>
                        {projectEditDraft ? (
                          <input
                            key={group.milestone}
                            aria-label={`修改阶段名称：${group.milestone}`}
                            defaultValue={group.milestone}
                            onBlur={(event) =>
                              renameProjectMilestone(
                                group.milestone,
                                event.target.value,
                              )
                            }
                          />
                        ) : (
                          <strong>{group.milestone}</strong>
                        )}
                        <div className={styles.projectMilestoneHeaderActions}>
                          <small>
                            {completedTasks}/{group.tasks.length} 已完成
                          </small>
                          {projectEditDraft && (
                            <>
                              <button
                                type="button"
                                onClick={() => addProjectTaskDraft(group.milestone)}
                              >
                                ＋ 具体任务
                              </button>
                              <button
                                className={styles.milestoneDeleteButton}
                                type="button"
                                onClick={() => removeProjectMilestone(group.milestone)}
                              >
                                删除阶段
                              </button>
                            </>
                          )}
                          <div
                            className={`${styles.milestoneCollapseButton} ${
                              milestoneCollapsed
                                ? styles.milestoneCollapseButtonClosed
                                : ""
                            }`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${milestoneCollapsed ? "展开" : "折叠"}阶段：${group.milestone}`}
                            aria-expanded={!milestoneCollapsed}
                            onClick={() =>
                              setCollapsedProjectMilestones((current) => ({
                                ...current,
                                [milestoneKey]: !milestoneCollapsed,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.currentTarget.click();
                              }
                            }}
                          >
                            <span aria-hidden="true">⌄</span>
                          </div>
                        </div>
                      </header>
                      {!milestoneCollapsed && (
                      <div className={styles.projectMilestoneTasks}>
                  {group.tasks.map((task, taskIndex) => {
                    return (
                    <div
                      className={`${styles.projectTaskEditorShell} ${
                        swipedProjectTaskId === task.id
                          ? styles.projectTaskEditorShellSwiped
                          : ""
                      }`}
                      key={task.id}
                    >
                      {projectEditDraft && (
                        <button
                          className={styles.projectTaskSwipeDelete}
                          type="button"
                          onClick={() => confirmRemoveProjectTask(task)}
                        >
                          删除
                        </button>
                      )}
                      <div
                        className={styles.projectTaskSwipeSurface}
                        onPointerDown={(event) => {
                          if (!projectEditDraft) return;
                          if (event.pointerType === "mouse" && event.button !== 0) return;
                          projectTaskSwipeStartRef.current = {
                            x: event.clientX,
                            y: event.clientY,
                          };
                        }}
                        onPointerUp={(event) => {
                          if (!projectEditDraft) return;
                          const start = projectTaskSwipeStartRef.current;
                          projectTaskSwipeStartRef.current = null;
                          if (!start) return;
                          const deltaX = event.clientX - start.x;
                          const deltaY = event.clientY - start.y;
                          if (
                            Math.abs(deltaX) < 55 ||
                            Math.abs(deltaX) < Math.abs(deltaY) * 1.3
                          ) {
                            return;
                          }
                          event.preventDefault();
                          setSwipedProjectTaskId(deltaX < 0 ? task.id : null);
                        }}
                        onPointerCancel={() => {
                          projectTaskSwipeStartRef.current = null;
                        }}
                      >
                      <details className={styles.projectTaskEditor}>
                        <summary>
                          <span>{String(taskIndex + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{task.title || "未命名任务"}</strong>
                            <small>
                              {task.scheduled_date || "未安排日期"} ·{" "}
                              {minutesLabel(task.estimated_minutes)}
                            </small>
                          </div>
                          <i>
                            {projectEditDraft ? "编辑任务" : "查看任务"}
                          </i>
                          {projectEditDraft && (
                            <button
                              className={styles.projectTaskInlineDelete}
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                confirmRemoveProjectTask(task);
                              }}
                            >
                              删除任务
                            </button>
                          )}
                        </summary>
                        <div className={`${styles.projectTaskFields} ${styles.taskEditorTemplate}`}>
                        <label className={`${styles.projectTaskWide} ${styles.numberedTaskField}`} data-field-number="01">
                          <span>项目阶段</span>
                          <select
                            aria-label={`选择“${task.title}”的项目阶段`}
                            value={
                              visibleMilestones.includes(task.milestone?.trim() || "")
                                ? task.milestone?.trim()
                                : "__new__"
                            }
                            onChange={(event) =>
                              updateProjectTaskDraft(task.id, {
                                milestone:
                                  event.target.value === "__new__"
                                    ? ""
                                    : event.target.value,
                              })
                            }
                          >
                            {visibleMilestones.map((milestone) => (
                              <option key={milestone} value={milestone}>
                                {milestone}
                              </option>
                            ))}
                            <option value="__new__">＋ 新建阶段</option>
                          </select>
                          {!visibleMilestones.includes(task.milestone?.trim() || "") && (
                            <input
                              aria-label={`新建“${task.title}”的项目阶段`}
                              placeholder="输入新阶段名称"
                              value={task.milestone || ""}
                              onChange={(event) =>
                                updateProjectTaskDraft(task.id, {
                                  milestone: event.target.value,
                                })
                              }
                            />
                          )}
                          <small className={styles.fieldHelp}>
                            可选择已有阶段，也可以直接输入新阶段名称。
                          </small>
                        </label>
                        <label className={`${styles.projectTaskWide} ${styles.numberedTaskField}`} data-field-number="02">
                          <span>任务标题</span>
                          <input
                            value={task.title}
                            onChange={(event) =>
                              updateProjectTaskDraft(task.id, {
                                title: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div className={`${styles.projectTaskWide} ${styles.numberedTaskField}`} data-field-number="03">
                          <EditableSteps
                            steps={task.steps || []}
                            onAdd={() =>
                              updateProjectTaskDraft(task.id, {
                                steps: [...(task.steps || []), ""],
                                step_results: [...(task.step_results || []), false],
                                step_reports: [...(task.step_reports || []), ""],
                              })
                            }
                            onChange={(index, value) =>
                              updateProjectTaskDraft(task.id, {
                                steps: (task.steps || []).map((step, stepIndex) =>
                                  stepIndex === index ? value : step,
                                ),
                              })
                            }
                            onRemove={(index) =>
                              updateProjectTaskDraft(task.id, {
                                steps: (task.steps || []).filter((_, stepIndex) => stepIndex !== index),
                                step_results: (task.step_results || []).filter((_, stepIndex) => stepIndex !== index),
                                step_reports: (task.step_reports || []).filter((_, stepIndex) => stepIndex !== index),
                              })
                            }
                            onMove={(index, direction) =>
                              updateProjectTaskDraft(task.id, {
                                steps: moveArrayItem(task.steps || [], index, index + direction),
                                step_results: moveArrayItem(task.step_results || [], index, index + direction),
                                step_reports: moveArrayItem(task.step_reports || [], index, index + direction),
                              })
                            }
                          />
                        </div>
                        <label className={`${styles.projectTaskWide} ${styles.numberedTaskField}`} data-field-number="04">
                          <span>完成标准（每行一条）</span>
                          <textarea
                            value={task.acceptance_criteria.join("\n")}
                            onChange={(event) => {
                              const criteria = event.target.value
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean);
                              updateProjectTaskDraft(task.id, {
                                acceptance_criteria: criteria,
                                criterion_results: criteria.map(
                                  (_, itemIndex) =>
                                    task.criterion_results?.[itemIndex] || false,
                                ),
                              });
                            }}
                          />
                        </label>
                        <label>
                          <span>时间安排</span>
                          <select
                            aria-label={`时间安排：${task.title}`}
                            value={taskScheduleType(task)}
                            onChange={(event) =>
                              updateProjectTaskSchedule(
                                task,
                                event.target.value as ScheduleType,
                              )
                            }
                          >
                            <option value="backlog">以后再安排</option>
                            <option value="once">一次性任务</option>
                            <option value="daily">每天</option>
                            <option value="weekdays">每个工作日</option>
                            <option value="weekends">每个周末</option>
                            <option value="range">持续一段时间</option>
                          </select>
                        </label>
                        {taskScheduleType(task) !== "backlog" && <label>
                          <span>开始日期</span>
                          <input
                            type="date"
                            value={task.scheduled_date || ""}
                            onChange={(event) =>
                              updateProjectTaskDraft(task.id, {
                                scheduled_date:
                                  event.target.value || null,
                              })
                            }
                          />
                        </label>}
                        {taskScheduleType(task) !== "once" && taskScheduleType(task) !== "backlog" && (
                          <label>
                            <span>结束日期</span>
                            <input
                              type="date"
                              min={task.scheduled_date || undefined}
                              value={task.end_date || ""}
                              onChange={(event) =>
                                updateProjectTaskDraft(task.id, {
                                  end_date: event.target.value || null,
                                })
                              }
                            />
                          </label>
                        )}
                        <label>
                          <span>预计时长（分钟）</span>
                          <input
                            type="number"
                            min="1"
                            value={task.estimated_minutes || ""}
                            onChange={(event) =>
                              updateProjectTaskDraft(task.id, {
                                estimated_minutes:
                                  Number(event.target.value) || null,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>任务标签</span>
                          <select
                            value={taskCategory(task)}
                            onChange={(event) =>
                              updateProjectTaskDraft(task.id, {
                                category:
                                  event.target.value as TaskCategory,
                              })
                            }
                          >
                            {(
                              Object.keys(
                                CATEGORY_LABELS,
                              ) as TaskCategory[]
                            ).map((category) => (
                              <option key={category} value={category}>
                                {CATEGORY_LABELS[category]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>优先级</span>
                          <select
                            value={task.priority || 3}
                            onChange={(event) =>
                              updateProjectTaskDraft(task.id, {
                                priority: Number(event.target.value),
                              })
                            }
                          >
                            {[1, 2, 3, 4, 5].map((priority) => (
                              <option key={priority} value={priority}>
                                {priorityLabel(priority)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.projectTaskWide}>
                          <span>任务备注（可选）</span>
                          <textarea
                            value={task.note || ""}
                            onChange={(event) =>
                              updateProjectTaskDraft(task.id, {
                                note: event.target.value,
                              })
                            }
                            placeholder="补充提醒、注意事项或执行时需要记住的信息。"
                          />
                        </label>
                        </div>
                        {projectEditDraft && (
                        <div className={styles.projectTaskEditorActions}>
                          <button
                            className={styles.projectTaskDeleteButton}
                            onClick={() => confirmRemoveProjectTask(task)}
                          >
                            删除此任务
                          </button>
                        </div>
                        )}
                      </details>
                      </div>
                    </div>
                    );
                  })}
                      </div>
                      )}
                    </section>
                    );
                  })}
                </div>
              )}
              <small className={styles.projectTaskPlannerHint}>
                {projectEditDraft
                  ? "所有任务调整会与项目内容一起，在底部统一保存。"
                  : "点击上方“编辑项目”后，才能修改任务规划。"}
              </small>
              </fieldset>
            </section>

            <section className={styles.improvementPanel} data-project-edit-surface>
              <div className={styles.planModuleHeader}>
                <span className={styles.planModuleNumber}>02</span>
                <div>
                <p className={styles.eyebrow}>执行提升</p>
                <h3>根据实际执行持续修正规划</h3>
                <small>记录复盘结论，不与任务正文混在一起</small>
                </div>
              </div>
              <textarea
                disabled={!projectEditDraft}
                value={improvementDraft}
                onChange={(event) => {
                  checkpointPlanOperation("project:improvement");
                  setImprovementDraft(event.target.value);
                }}
                placeholder="记录流程应该怎样优化、下一轮要调整什么、哪些步骤可以删减或自动化。"
              />
            </section>

            {!projectEditDraft && <section className={styles.sourceFilesPanel}>
              <div className={styles.sourceFilesHeader}>
                <div className={styles.planModuleHeader}>
                  <span className={styles.planModuleNumber}>03</span>
                  <div>
                  <p className={styles.eyebrow}>原文件索引</p>
                  <h3>项目依据与原始资料</h3>
                  <small>集中管理资料，并指定它属于哪项任务</small>
                  </div>
                </div>
                <div className={styles.sourceUploadControls}>
                  <label>
                    <span>上传后关联到</span>
                    <select
                      aria-label="新原文件关联层级"
                      value={sourceUploadTarget}
                      disabled={fileBusy}
                      onChange={(event) =>
                        setSourceUploadTarget(event.target.value)
                      }
                    >
                      <option value="__all__">本项目</option>
                      {visibleMilestones.map((milestone, index) => (
                        <option
                          key={milestone}
                          value={milestoneSourceTarget(milestone)}
                        >
                          阶段 {String(index + 1).padStart(2, "0")}：{milestone}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.fileUploadButton}>
                    {fileBusy ? "处理中…" : "＋ 添加原文件"}
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      disabled={fileBusy}
                      onChange={(event) =>
                        uploadSourceFile(planProject.id, event)
                      }
                    />
                  </label>
                </div>
              </div>
              <p className={styles.filePrivacy}>
                支持 PDF、Word（DOCX）、TXT、Markdown，单个不超过
                20MB；登录同一账号可在电脑和手机查看。已上传文件可在下方随时重新关联。
              </p>
              {fileError && <p className={styles.error}>{fileError}</p>}
              <div className={styles.sourceFileList}>
                {(planProject.source_files || []).length === 0 ? (
                  <p>还没有添加原文件。</p>
                ) : (
                  (planProject.source_files || []).map((file) => {
                    const assignment = sourceAssignmentValue(
                      file.id,
                      projectTaskDrafts,
                      visibleMilestones,
                    );
                    return (
                      <div className={styles.sourceFileRow} key={file.id}>
                        <button
                          className={styles.sourceFileOpen}
                          disabled={fileBusy}
                          onClick={() => openSourceFile(file)}
                        >
                          <span>
                            {file.name.split(".").pop()?.toUpperCase() ||
                              "FILE"}
                          </span>
                          <strong>{file.name}</strong>
                          <small>{fileSizeLabel(file.size)} · 点击查看</small>
                        </button>
                        <label>
                          <span>关联范围</span>
                          <select
                            aria-label={`设置 ${file.name} 的项目阶段关联`}
                            value={assignment}
                            disabled={fileBusy}
                            onChange={(event) =>
                              assignSourceFile(
                                planProject.id,
                                file.id,
                                event.target.value,
                              )
                            }
                          >
                            <option value="__all__">本项目</option>
                            {(assignment === "__none__" || assignment === "__multiple__") && (
                              <option value={assignment} disabled>
                                {assignment === "__none__"
                                  ? "尚未设置关联层级"
                                  : "原有文件关联跨越多个阶段"}
                              </option>
                            )}
                            {visibleMilestones.map((milestone, index) => (
                              <option
                                key={milestone}
                                value={milestoneSourceTarget(milestone)}
                              >
                                阶段 {String(index + 1).padStart(2, "0")}：{milestone}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
            </section>}
            <footer className={styles.planFooter}>
              <button
                className={styles.primaryButton}
                onClick={requestClosePlan}
              >
                保存并退出
              </button>
            </footer>
          </aside>
        </div>
      )}

      {selectedIssue && (
        <div className={styles.drawerBackdrop}>
          <aside
            className={`${styles.drawer} ${styles.issueDrawer}`}
            onTouchStart={beginSwipe}
            onTouchEnd={(event) =>
              finishSwipe(event, undefined, () => requestCloseIssue("close"))
            }
          >
            <div className={styles.drawerHeader}>
              <span>{selectedIssueProject?.name || "问题详情"}</span>
              <button
                aria-label="关闭问题详情"
                onClick={() => requestCloseIssue("close")}
              >
                ×
              </button>
            </div>
            <p className={styles.eyebrow}>TASK ISSUE</p>
            <div className={styles.issueDetailTitle}>
              <span
                className={
                  selectedIssue.blocks_task
                    ? styles.issueBlockingBadge
                    : styles.issueStatusBadge
                }
              >
                {selectedIssue.blocks_task
                  ? "阻碍任务"
                  : selectedIssue.status === "open"
                    ? "待分析"
                    : selectedIssue.status === "answered"
                      ? "待验证"
                      : "已解决"}
              </span>
              <textarea
                className={styles.issueQuestionEditor}
                aria-label="修改问题内容"
                value={issueQuestionDraft}
                onChange={(event) =>
                  setIssueQuestionDraft(event.target.value)
                }
              />
            </div>

            <section className={styles.issueContextCard}>
              <p className={styles.eyebrow}>关联任务</p>
              <h3>{selectedIssueTask?.title || "原任务已不存在"}</h3>
              <p>
                {selectedIssueTask?.objective ||
                  "无法读取原任务详情，但问题记录仍然保留。"}
              </p>
              <div>
                <span>
                  {selectedIssueTask
                    ? STATUS_LABELS[selectedIssueTask.status]
                    : "未知状态"}
                </span>
                <span>
                  {selectedIssueTask?.scheduled_date || "未安排日期"}
                </span>
                <span>
                  {new Date(selectedIssue.created_at).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </section>

            {(selectedIssue.attempts || []).length > 0 && (
              <section className={styles.issueDetailBlock}>
                <p className={styles.eyebrow}>已经尝试</p>
                <ul>
                  {selectedIssue.attempts.map((attempt) => (
                    <li key={attempt}>{attempt}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className={styles.issueAiAssist}>
              <div>
                <p className={styles.eyebrow}>交给 GPT 分析</p>
                <h3>复制完整任务上下文和当前阻碍</h3>
                <p>
                  将自动整理项目背景、任务目标、执行进度、已尝试内容和问题，不包含源文件正文。
                </p>
              </div>
              <button
                className={styles.issueCopyButton}
                type="button"
                onClick={copyIssuePrompt}
              >
                {issuePromptCopied ? "已复制，可以粘贴给 GPT" : "复制给 GPT 分析"}
              </button>
            </section>

            <section className={styles.issueDetailBlock}>
              <p className={styles.eyebrow}>分析结果</p>
              <textarea
                aria-label="填写 Codex 分析结果"
                value={issueResponseDraft}
                onChange={(event) =>
                  setIssueResponseDraft(event.target.value)
                }
                placeholder="粘贴或填写分析结论、建议动作和验证方法。"
              />
              <button
                className={styles.quietButton}
                disabled={
                  !issueQuestionDraft.trim() || !issueHasUnsavedChanges
                }
                onClick={saveIssueChanges}
              >
                {issueHasUnsavedChanges ? "保存问题和分析结果" : "已保存"}
              </button>
            </section>

            <footer className={styles.issueDrawerFooter}>
              <button
                className={styles.issueDeleteButton}
                onClick={deleteSelectedIssue}
              >
                删除问题
              </button>
              <button
                className={styles.quietButton}
                onClick={() =>
                  setIssueResolved(selectedIssue.status !== "resolved")
                }
              >
                {selectedIssue.status === "resolved"
                  ? "重新打开"
                  : "标记已解决"}
              </button>
              <button
                className={styles.primaryButton}
                disabled={!selectedIssueTask}
                onClick={() => requestCloseIssue("task")}
              >
                进入原任务 →
              </button>
            </footer>
          </aside>
        </div>
      )}

      {deleteProjectConfirmOpen && planProject && (
        <div className={`${styles.modalBackdrop} ${styles.confirmBackdrop}`}>
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <p className={styles.eyebrow}>删除项目</p>
            <h2 id="delete-project-title">确定删除“{planProject.name}”吗？</h2>
            <p>
              删除后项目和任务无法恢复。项目内全部任务、问题记录和原文件都会从当前浏览器永久删除。
            </p>
            <label className={styles.deleteConfirmField}>
              <span>
                请输入“<strong>确认</strong>”后继续
              </span>
              <input
                autoFocus
                value={deleteProjectConfirmText}
                onChange={(event) =>
                  setDeleteProjectConfirmText(event.target.value)
                }
                placeholder="输入：确认"
              />
            </label>
            <div className={styles.confirmActions}>
              <button
                className={styles.quietButton}
                onClick={() => {
                  setDeleteProjectConfirmOpen(false);
                  setDeleteProjectConfirmText("");
                }}
              >
                取消
              </button>
              <button
                className={`${styles.quietButton} ${styles.discardButton}`}
                disabled={deleteProjectConfirmText.trim() !== "确认"}
                onClick={deletePlanProject}
              >
                确认删除项目
              </button>
            </div>
          </section>
        </div>
      )}

      {planExitConfirmOpen && planProject && (
        <div className={`${styles.modalBackdrop} ${styles.confirmBackdrop}`}>
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="save-plan-changes-title"
          >
            <p className={styles.eyebrow}>确认退出项目总览</p>
            <h2 id="save-plan-changes-title">保存本次项目修改吗？</h2>
            <p>
              将统一保存项目内容和执行提升；原文件上传后已单独保存在当前浏览器。
            </p>
            <div className={styles.confirmActions}>
              <button
                className={`${styles.quietButton} ${styles.discardButton}`}
                onClick={finishClosingPlan}
              >
                不保存并退出
              </button>
              <button
                className={`${styles.quietButton} ${styles.continueButton}`}
                onClick={() => setPlanExitConfirmOpen(false)}
              >
                继续编辑
              </button>
              <button
                className={styles.primaryButton}
                onClick={savePlanAndClose}
              >
                保存并退出
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedCalendarDate && (
        <div className={styles.modalBackdrop}>
          <section className={`${styles.modal} ${styles.dayAgendaDialog}`}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>当日安排</p>
                <h2>{dateTitle(selectedCalendarDate)}</h2>
              </div>
              <button
                aria-label="关闭当日任务清单"
                onClick={() => {
                  setSelectedCalendarDate(null);
                  setCalendarMoveNotice(null);
                }}
              >
                ×
              </button>
            </div>
            {calendarMoveNotice && (
              <div className={styles.calendarMoveNotice} role="status">
                <span>
                  <strong>
                    {calendarMoveNotice.targetDate ? "日期已修改" : "已移至待安排"}
                  </strong>
                  “{compactTitle(calendarMoveNotice.taskTitle)}”
                  {calendarMoveNotice.targetDate
                    ? `已移到${dateTitle(calendarMoveNotice.targetDate)}。`
                    : "已从日历移除，任务内容和进度仍然保留。"}
                </span>
                <div className={styles.calendarMoveActions}>
                  <button onClick={undoCalendarMove}>撤销</button>
                  {calendarMoveNotice.targetDate ? (
                    <button
                      onClick={() => {
                        setSelectedCalendarDate(calendarMoveNotice.targetDate);
                        setCalendarMoveNotice(null);
                      }}
                    >
                      查看新日期 →
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedCalendarDate(null);
                        setCalendarMoveNotice(null);
                        setActiveTab("projects");
                      }}
                    >
                      前往待安排 →
                    </button>
                  )}
                </div>
              </div>
            )}
            {store.tasks.filter((task) =>
              taskOccursOnDate(task, selectedCalendarDate),
            ).length === 0 ? (
              <div className={styles.dayAgendaEmpty}>
                <strong>这一天没有安排任务</strong>
                <span>可以直接为这一天创建任务，不必返回后重新选择日期。</span>
                <button
                  className={styles.primaryButton}
                  onClick={() => createTaskForCalendarDate(selectedCalendarDate)}
                >
                  ＋ 新建该日任务
                </button>
              </div>
            ) : (
              <>
                <p className={styles.dayAgendaSummary}>
                  共{" "}
                  {
                    store.tasks.filter((task) =>
                      taskOccursOnDate(task, selectedCalendarDate),
                    ).length
                  }{" "}
                  项任务，可直接修改日期；点击标题查看详情
                </p>
                <div className={styles.dayAgendaList}>
                  {store.tasks
                    .filter((task) =>
                      taskOccursOnDate(task, selectedCalendarDate),
                    )
                    .map((storedTask) => {
                      const task = taskForDate(
                        storedTask,
                        selectedCalendarDate,
                      );
                      const project = store.projects.find(
                        (item) => item.id === task.project_id,
                      );
                      const progress = taskCompletion(task);
                      return (
                        <article key={task.id} className={styles.dayAgendaTask}>
                          <button
                            className={styles.dayAgendaTaskOpen}
                            onClick={() => {
                              setSelectedCalendarDate(null);
                              setCalendarMoveNotice(null);
                              openTask(task.id, selectedCalendarDate);
                            }}
                          >
                            <span>
                              {project?.name || "个人任务"}
                              {task.milestone ? ` · ${task.milestone}` : ""}
                            </span>
                            <strong>{task.title}</strong>
                            <div>
                              <small>{minutesLabel(task.estimated_minutes)}</small>
                              <small
                                className={
                                  progress === 100
                                    ? styles.dayAgendaDone
                                    : undefined
                                }
                              >
                                {progress === 100
                                  ? "已完成"
                                  : progress > 0
                                    ? `完成 ${progress}%`
                                    : TASK_LEVEL_LABELS[taskLevel(task)]}
                              </small>
                              <i aria-hidden="true">查看详情 →</i>
                            </div>
                          </button>
                          <div className={styles.dayAgendaQuickDate}>
                            <label>
                              <span>修改日期</span>
                              <input
                                type="date"
                                value={selectedCalendarDate}
                                aria-label={`修改“${task.title}”的日期`}
                                onChange={(event) =>
                                  moveTaskFromCalendar(
                                    storedTask.id,
                                    selectedCalendarDate,
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            {storedTask.end_date && (
                              <small>
                                {storedTask.recurrence ? "将同步移动整个周期" : "将同步移动日期范围"}
                              </small>
                            )}
                            <button
                              className={styles.moveToBacklogButton}
                              type="button"
                              onClick={() => moveTaskToBacklog(storedTask.id)}
                            >
                              移至待安排
                            </button>
                          </div>
                        </article>
                      );
                    })}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {selectedTask && selectedProject && (
        <div className={styles.drawerBackdrop}>
          <aside
            className={`${styles.drawer} ${styles.taskDetailDrawer} ${selectedTaskThemeClass}`}
            ref={taskDrawerRef}
            onTouchStart={beginSwipe}
            onTouchEnd={(event) =>
              finishSwipe(event, undefined, requestCloseTask)
            }
          >
            <div className={styles.drawerHeader}>
              <span>{selectedProject.name}</span>
              <div className={styles.taskDrawerActions}>
                <button
                  type="button"
                  className={styles.taskEditButton}
                  aria-pressed={taskDefinitionEditing}
                  onClick={() => setTaskDefinitionEditing((current) => !current)}
                >
                  {taskDefinitionEditing ? "完成编辑" : "编辑任务"}
                </button>
                <button aria-label="关闭任务详情" onClick={requestCloseTask}>×</button>
              </div>
            </div>
            {taskDefinitionEditing && (
              <section className={styles.taskDefinitionEditor} aria-label="编辑任务内容">
                <div className={styles.taskDefinitionEditorHeading}>
                  <div>
                    <p className={styles.eyebrow}>编辑任务</p>
                    <h3>修改任务的内容与执行流程</h3>
                  </div>
                  <span>所有修改在退出时统一保存</span>
                </div>
                <div className={`${styles.customTaskForm} ${styles.taskEditorTemplate}`}>
                  <label className={styles.numberedTaskField} data-field-number="01">
                    <span>项目阶段</span>
                    <select
                      aria-label="选择项目阶段"
                      value={
                        selectedTaskMilestones.includes(selectedTask.milestone?.trim() || "")
                          ? selectedTask.milestone?.trim()
                          : "__new__"
                      }
                      onChange={(event) =>
                        setExecutionDraft((task) =>
                          task
                            ? {
                                ...task,
                                milestone:
                                  event.target.value === "__new__"
                                    ? ""
                                    : event.target.value,
                              }
                            : task,
                        )
                      }
                    >
                      {selectedTaskMilestones.map((milestone) => (
                        <option key={milestone} value={milestone}>
                          {milestone}
                        </option>
                      ))}
                      <option value="__new__">＋ 新建阶段</option>
                    </select>
                    {!selectedTaskMilestones.includes(selectedTask.milestone?.trim() || "") && (
                      <input
                        aria-label="新项目阶段名称"
                        placeholder="输入新阶段名称"
                        value={selectedTask.milestone || ""}
                        onChange={(event) =>
                          setExecutionDraft((task) =>
                            task ? { ...task, milestone: event.target.value } : task,
                          )
                        }
                      />
                    )}
                    <small className={styles.fieldHelp}>
                      选择同一总项目中的已有阶段，或直接输入新阶段名称。保存后任务会归入对应阶段。
                    </small>
                  </label>
                  <label className={styles.numberedTaskField} data-field-number="02">
                    <span>任务标题</span>
                    <input
                      aria-label="编辑任务标题"
                      value={selectedTask.title}
                      onChange={(event) => setExecutionDraft((task) => task ? { ...task, title: event.target.value } : task)}
                    />
                  </label>
                  <div className={`${styles.customTaskWide} ${styles.numberedTaskField}`} data-field-number="03">
                    <EditableSteps
                      steps={selectedTask.steps || []}
                      onAdd={() => updateDraftStepDefinition({ type: "add" })}
                      onChange={(index, value) => updateDraftStepDefinition({ type: "change", index, value })}
                      onRemove={(index) => updateDraftStepDefinition({ type: "remove", index })}
                      onMove={(index, direction) => updateDraftStepDefinition({ type: "move", index, direction })}
                    />
                  </div>
                  <label className={`${styles.customTaskWide} ${styles.numberedTaskField}`} data-field-number="04">
                    <span>完成标准（每行一条）</span>
                    <textarea
                      aria-label="编辑完成标准"
                      value={selectedTask.acceptance_criteria.join("\n")}
                      onChange={(event) => setExecutionDraft((task) => task ? { ...task, acceptance_criteria: event.target.value.split("\n") } : task)}
                    />
                  </label>
                  {taskScheduleType(selectedTask) !== "backlog" && <label>
                    <span>开始日期</span>
                    <input
                      aria-label="编辑任务开始日期"
                      type="date"
                      value={selectedTask.scheduled_date || ""}
                      onChange={(event) => setExecutionDraft((task) => task ? { ...task, scheduled_date: event.target.value || null } : task)}
                    />
                  </label>}
                  {taskScheduleType(selectedTask) !== "backlog" && <label>
                    <span>结束日期</span>
                    <input
                      aria-label="编辑任务结束日期"
                      type="date"
                      min={selectedTask.scheduled_date || undefined}
                      value={selectedTask.end_date || ""}
                      onChange={(event) => setExecutionDraft((task) => task ? { ...task, end_date: event.target.value || null } : task)}
                    />
                  </label>}
                  <label>
                    <span>重复方式</span>
                    <select
                      aria-label="编辑任务重复方式"
                      value={taskScheduleType(selectedTask)}
                      onChange={(event) => {
                        const value = event.target.value as ScheduleType;
                        setExecutionDraft((task) => task ? {
                          ...task,
                          scheduled_date:
                            value === "backlog"
                              ? null
                              : task.scheduled_date || localDate(),
                          recurrence: value === "daily" || value === "weekdays" || value === "weekends" ? value : null,
                          end_date:
                            value === "backlog" || value === "once"
                              ? null
                              : task.end_date || task.scheduled_date || localDate(),
                          status:
                            value === "backlog" && task.status !== "done"
                              ? "backlog"
                              : value !== "backlog" && task.status === "backlog"
                                ? "scheduled"
                                : task.status,
                          paused: value === "backlog" ? false : task.paused,
                        } : task);
                      }}
                    >
                      <option value="backlog">以后再安排</option>
                      <option value="once">一次性任务</option>
                      <option value="range">持续一段时间</option>
                      <option value="daily">每天</option>
                      <option value="weekdays">每个工作日</option>
                      <option value="weekends">每个周末</option>
                    </select>
                  </label>
                  <label>
                    <span>预计用时（分钟）</span>
                    <input
                      aria-label="编辑预计用时"
                      type="number"
                      min="1"
                      value={selectedTask.estimated_minutes || 30}
                      onChange={(event) => setExecutionDraft((task) => task ? { ...task, estimated_minutes: Math.max(1, Number(event.target.value) || 1) } : task)}
                    />
                  </label>
                </div>
              </section>
            )}
            {!taskDefinitionEditing && <>
            <p className={styles.eyebrow}>
              {selectedTask.milestone || "未设置项目阶段"}
            </p>
            <div className={styles.detailTaskTitle}>
              <button
                type="button"
                className={`${styles.detailCompletionCheck} ${
                  selectedTask.status === "done"
                    ? styles.detailCompletionCheckDone
                    : ""
                }`}
                aria-label={
                  selectedTask.status === "done"
                    ? `将“${selectedTask.title}”标记为未完成`
                    : `将“${selectedTask.title}”标记为已完成`
                }
                aria-pressed={selectedTask.status === "done"}
                onClick={() =>
                  setExecutionDraft((task) => {
                    if (!task) return task;
                    const completed = task.status !== "done";
                    return {
                      ...task,
                      step_results: (task.steps || []).map(() => completed),
                      status: completed
                        ? "done"
                        : (task.result_report || "").trim()
                          ? "doing"
                          : task.scheduled_date
                            ? "scheduled"
                            : "backlog",
                      paused: completed ? false : task.paused,
                    };
                  })
                }
              >
                {selectedTask.status === "done" ? "✓" : ""}
              </button>
              <h2>{selectedTask.title}</h2>
            </div>
            <div className={styles.detailMeta}>
              <span>
                {selectedTaskProgress === 100
                  ? "已完成"
                  : selectedTask.paused
                    ? "已暂停"
                    : STATUS_LABELS[selectedTask.status]}
              </span>
              <span>{minutesLabel(selectedTask.estimated_minutes)}</span>
              <span>
                {selectedTaskSourceFiles.length
                  ? `源文件 ${selectedTaskSourceFiles.length}`
                  : "未关联源文件"}
              </span>
              <span>
                {selectedTask.end_date
                  ? `${selectedTask.scheduled_date} 至 ${selectedTask.end_date}`
                  : selectedTask.scheduled_date || "未安排日期"}
              </span>
              {selectedTaskProgress < 100 && (
                <button
                  className={styles.detailPauseButton}
                  onClick={() =>
                    setExecutionDraft((task) =>
                      task ? { ...task, paused: !task.paused } : task,
                    )
                  }
                >
                  {selectedTask.paused ? "恢复任务" : "暂停任务"}
                </button>
              )}
            </div>

            <nav className={styles.taskSectionNav} aria-label="任务内容快速导航">
              <span>快速到达</span>
              <button onClick={() => jumpToTaskSection("progress")}>进度</button>
              <button onClick={() => jumpToTaskSection("files")}>文件</button>
              <button onClick={() => jumpToTaskSection("steps")}>步骤</button>
              <button onClick={() => jumpToTaskSection("report")}>汇报</button>
              <button onClick={() => jumpToTaskSection("issue")}>问题</button>
            </nav>

            <section
              data-task-section="progress"
              className={`${styles.taskProgressPanel} ${
                selectedTaskProgress === 100
                  ? styles.taskProgressComplete
                  : ""
              }`}
              aria-label={`任务进度 ${selectedTaskProgress}%`}
            >
              <div className={styles.taskProgressHeader}>
                <div>
                  <p className={styles.eyebrow}>任务进度</p>
                  <strong>
                    {selectedTaskProgress === 100
                      ? "全部步骤已完成"
                      : `已完成 ${
                          (selectedTask.step_results || []).filter(Boolean)
                            .length
                        } / ${selectedTask.steps?.length || 0} 个步骤`}
                  </strong>
                </div>
                <b>{selectedTaskProgress}</b>
              </div>
              <div
                className={styles.taskProgressTrack}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={selectedTaskProgress}
              >
                <i
                  style={{
                    transform: `scaleX(${selectedTaskProgress / 100})`,
                  }}
                />
              </div>
              {selectedTaskProgress === 100 && (
                <div className={styles.crownReward}>
                  <span className={styles.crownIcon} aria-hidden="true">
                    👑
                  </span>
                  <strong>满分完成</strong>
                </div>
              )}
            </section>

            <section className={styles.taskControls}>
              {taskHasUnsavedChanges && (
                <p className={styles.unsavedNotice}>当前任务有尚未保存的修改</p>
              )}
              <div className={styles.controlGroup}>
                <div className={styles.controlLabel}>
                  <span>任务标签</span>
                  <b>
                    {
                      CATEGORY_LABELS[
                        organizationDraft?.category ||
                          taskCategory(selectedTask)
                      ]
                    }
                  </b>
                </div>
                <div className={styles.categoryPicker}>
                  {(Object.keys(CATEGORY_LABELS) as TaskCategory[]).map(
                    (category) => (
                      <button
                        className={
                          (organizationDraft?.category ||
                            taskCategory(selectedTask)) === category
                            ? styles.categorySelected
                            : ""
                        }
                        key={category}
                        onClick={() =>
                          setOrganizationDraft((current) => ({
                            taskId: selectedTask.id,
                            category,
                            priority:
                              current?.priority ||
                              selectedTask.priority ||
                              3,
                          }))
                        }
                      >
                        {CATEGORY_LABELS[category]}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className={styles.controlGroup}>
                <div className={styles.controlLabel}>
                  <span>任务优先级</span>
                  <b>
                    {priorityLabel(
                      organizationDraft?.priority || selectedTask.priority,
                    )}
                  </b>
                </div>
                <input
                  className={styles.prioritySlider}
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={
                    organizationDraft?.priority || selectedTask.priority || 3
                  }
                  aria-label="选择任务优先级"
                  onChange={(event) =>
                    setOrganizationDraft((current) => ({
                      taskId: selectedTask.id,
                      category:
                        current?.category || taskCategory(selectedTask),
                      priority: Number(event.target.value),
                    }))
                  }
                />
                <div className={styles.priorityScale}>
                  <span>最高</span>
                  <span>普通</span>
                  <span>最低</span>
                </div>
              </div>
            </section>

            <DetailBlock
              number="01"
              title="项目阶段"
              variant="reason"
            >
              <p>{selectedTask.milestone || "未设置项目阶段"}</p>
            </DetailBlock>
            <DetailBlock
              number="02"
              title="任务标题"
              variant="criteria"
            >
              <p>{selectedTask.title}</p>
            </DetailBlock>

            <DetailBlock
              number="03"
              title="执行步骤"
              variant="steps"
              sectionKey="steps"
            >
              {selectedTask.steps?.length ? (
                <ol className={styles.stepList}>
                  {selectedTask.steps.map((step, stepIndex) => {
                    const completed =
                      selectedTask.step_results?.[stepIndex] === true;
                    const note = selectedTask.step_reports?.[stepIndex] || "";
                    const noteOpen = openStepNoteIndex === stepIndex;
                    const noteId = `step-note-${selectedTask.id}-${stepIndex}`;
                    return (
                    <li
                      className={completed ? styles.stepItemDone : undefined}
                      key={`${stepIndex}-${step}`}
                    >
                      <div className={styles.stepItemRow}>
                        <span>{step}</span>
                        <button
                          type="button"
                          className={`${styles.stepCheckButton} ${
                            completed ? styles.stepCheckButtonDone : ""
                          }`}
                          aria-label={
                            completed
                              ? `取消完成步骤 ${stepIndex + 1}`
                              : `完成步骤 ${stepIndex + 1}`
                          }
                          aria-pressed={completed}
                          onClick={() =>
                            setDraftStepCompleted(stepIndex, !completed)
                          }
                        >
                          {completed ? "✓" : ""}
                        </button>
                        <button
                          type="button"
                          className={`${styles.stepNoteButton} ${
                            note ? styles.stepNoteButtonHasContent : ""
                          }`}
                          aria-expanded={noteOpen}
                          aria-controls={noteId}
                          onClick={() =>
                            setOpenStepNoteIndex((current) =>
                              current === stepIndex ? null : stepIndex,
                            )
                          }
                        >
                          {noteOpen ? "收起" : note ? "有备注" : "备注"}
                        </button>
                      </div>
                      {noteOpen && (
                        <label className={styles.stepReport} id={noteId}>
                          <span>本步骤备注</span>
                          <textarea
                            aria-label={`步骤 ${stepIndex + 1} 备注`}
                            value={note}
                            onChange={(event) =>
                              setDraftStepNote(stepIndex, event.target.value)
                            }
                            placeholder="记录这一步的补充信息、结果或下次要注意的事项。"
                          />
                        </label>
                      )}
                    </li>
                    );
                  })}
                </ol>
              ) : (
                <p>还没有拆分步骤。</p>
              )}
            </DetailBlock>
            <DetailBlock
              number="04"
              title="完成标准"
              variant="criteria"
            >
              <ul className={styles.criteriaList}>
                {selectedTask.acceptance_criteria.map((criterion) => (
                  <li key={criterion}>
                    <span>{criterion}</span>
                  </li>
                ))}
              </ul>
            </DetailBlock>

            <section className={styles.taskSourceFilesPanel} data-task-section="files">
              <div>
                <p className={styles.eyebrow}>相关源文件</p>
                <h3>执行这条任务时需要查看的资料</h3>
              </div>
              {selectedTaskSourceFiles.length ? (
                <div className={styles.sourceFileList}>
                  {selectedTaskSourceFiles.map((file) => (
                    <button
                      key={file.id}
                      disabled={fileBusy}
                      onClick={() => openSourceFile(file)}
                    >
                      <span>
                        {file.name.split(".").pop()?.toUpperCase() || "FILE"}
                      </span>
                      <strong>{file.name}</strong>
                      <small>{fileSizeLabel(file.size)} · 点击查看</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.taskSourceEmpty}>
                  这条任务还没有关联源文件。可在项目总览中添加，或重新导入时选择关联方式。
                </p>
              )}
            </section>

            <section className={styles.taskReportPanel} data-task-section="report">
              <div>
                <p className={styles.eyebrow}>任务完成情况</p>
                <h3>统一记录本任务的结果</h3>
                <p>
                  步骤旁的备注用于记录局部信息；完成整项任务后，在这里统一汇总实际产出、数据、偏差和未完成事项。
                </p>
              </div>
              <textarea
                aria-label="任务完成情况与结果汇报"
                value={selectedTask.result_report || ""}
                onChange={(event) =>
                  setExecutionDraft((task) =>
                    task
                      ? {
                          ...task,
                          result_report: event.target.value,
                          status:
                            task.status === "done"
                              ? "done"
                              : event.target.value.trim()
                                ? "doing"
                                : task.scheduled_date
                                  ? "scheduled"
                                  : "backlog",
                        }
                      : task,
                  )
                }
                placeholder="实际完成了什么？获得了什么结果或数据？与原计划有什么偏差？还有什么没有完成？"
              />
            </section>

            <div className={styles.issueComposer} data-task-section="issue">
              <div>
                <p className={styles.eyebrow}>执行中遇到问题？</p>
                <h3>只记录确实需要分析的问题</h3>
                <p className={styles.issueInputHint}>
                  普通完成汇报请写在上方统一汇报框；这里不要填写“没有问题”。
                </p>
              </div>
              <textarea
                aria-label="记录执行问题"
                value={issueText}
                onChange={(event) => setIssueText(event.target.value)}
                placeholder="发生了什么？你已经尝试过什么？"
              />
              <label className={styles.blockingToggle}>
                <input
                  type="checkbox"
                  checked={issueBlocksTask}
                  onChange={(event) =>
                    setIssueBlocksTask(event.target.checked)
                  }
                />
                <span>
                  <strong>这个问题阻碍任务继续</strong>
                  <small>只有勾选后，任务才会显示“有阻碍”。</small>
                </span>
              </label>
              <label className={styles.taskNoteField}>
                <span>
                  <strong>任务备注</strong>
                  <small>
                    可随时补充提醒、注意事项或执行背景；没有内容可以留空。
                  </small>
                </span>
                <textarea
                  aria-label="任务备注"
                  value={selectedTask.note || ""}
                  onChange={(event) =>
                    setExecutionDraft((task) =>
                      task
                        ? {
                            ...task,
                            note: event.target.value,
                          }
                        : task,
                    )
                  }
                  placeholder="例如：下次开始前先确认资料版本。"
                />
              </label>
              <button
                className={styles.primaryButton}
                onClick={requestCloseTask}
              >
                {issueText.trim()
                  ? issueBlocksTask
                    ? "保存问题、标记阻碍并退出"
                    : "保存问题并退出"
                  : "保存并退出"}
              </button>
            </div>
            </>}
          </aside>
        </div>
      )}

      {exitConfirmOpen && (
        <div className={`${styles.modalBackdrop} ${styles.confirmBackdrop}`}>
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="save-changes-title"
          >
            <p className={styles.eyebrow}>发现未保存修改</p>
            <h2 id="save-changes-title">保存本次任务修改吗？</h2>
            <p>
              将保存步骤完成状态、步骤备注、任务汇报、任务备注和问题记录。
            </p>
            <div className={styles.confirmActions}>
              <button
                className={`${styles.quietButton} ${styles.discardButton}`}
                onClick={finishClosingTask}
              >
                不保存并退出
              </button>
              <button
                className={`${styles.quietButton} ${styles.continueButton}`}
                onClick={() => setExitConfirmOpen(false)}
              >
                继续编辑
              </button>
              <button
                className={styles.primaryButton}
                onClick={saveOrganizationAndClose}
              >
                保存并退出
              </button>
            </div>
          </section>
        </div>
      )}

      {issueExitConfirmOpen && selectedIssue && (
        <div className={`${styles.modalBackdrop} ${styles.confirmBackdrop}`}>
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="save-issue-changes-title"
          >
            <p className={styles.eyebrow}>发现未保存修改</p>
            <h2 id="save-issue-changes-title">保存本次问题修改吗？</h2>
            <p>将保存修改后的问题内容和 Codex 分析结果。</p>
            <div className={styles.confirmActions}>
              <button
                className={`${styles.quietButton} ${styles.discardButton}`}
                onClick={() => finishClosingIssue(issueExitAction)}
              >
                不保存并继续
              </button>
              <button
                className={`${styles.quietButton} ${styles.continueButton}`}
                onClick={() => setIssueExitConfirmOpen(false)}
              >
                继续编辑
              </button>
              <button
                className={styles.primaryButton}
                disabled={!issueQuestionDraft.trim()}
                onClick={saveIssueAndContinue}
              >
                保存并继续
              </button>
            </div>
          </section>
        </div>
      )}

      {filePreview && (
        <div className={`${styles.modalBackdrop} ${styles.filePreviewBackdrop}`}>
          <section
            className={styles.filePreviewDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-preview-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>原文件内容</p>
                <h2 id="file-preview-title">{filePreview.name}</h2>
              </div>
              <button aria-label="关闭原文件" onClick={closeFilePreview}>
                ×
              </button>
            </div>
            {filePreview.kind === "pdf" && filePreview.url ? (
              <iframe title={filePreview.name} src={filePreview.url} />
            ) : (
              <pre>{filePreview.content || "文件中没有可读取的文字。"}</pre>
            )}
          </section>
        </div>
      )}

      {syncChoice && (
        <div className={`${styles.modalBackdrop} ${styles.confirmBackdrop}`}>
          <section
            className={`${styles.confirmDialog} ${styles.syncChoiceDialog}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sync-choice-title"
          >
            <p className={styles.eyebrow}>安全开启跨设备同步</p>
            <h2 id="sync-choice-title">
              {syncChoice.kind === "first-upload"
                ? "把本机数据上传到云端吗？"
                : syncChoice.kind === "conflict"
                  ? "电脑和手机的数据发生了冲突"
                  : "发现本机和云端各有一份数据"}
            </h2>
            <p>
              系统不会自动覆盖。下方会根据最后修改记录标出较新版本；切换到云端前还会额外建立一份本机恢复快照。
            </p>
            <div className={styles.syncRecommendation}>
              <strong>
                {recommendedSyncCopy === "local"
                  ? "建议：使用本机数据"
                  : recommendedSyncCopy === "cloud"
                    ? "建议：使用云端数据"
                    : "两边修改时间一致，请根据内容选择"}
              </strong>
              <span>
                {recommendedSyncCopy === "same-time"
                  ? "系统无法仅凭时间判断哪份内容应保留，不会替你覆盖。"
                  : "这是根据记录到的最后修改时间判断的，你仍可以选择另一份。"}
              </span>
            </div>
            <div className={styles.syncComparison}>
              <button
                type="button"
                aria-pressed={effectiveSyncCopy === "local"}
                className={`${
                  recommendedSyncCopy === "local" ? styles.syncCopyRecommended : ""
                } ${effectiveSyncCopy === "local" ? styles.syncCopySelected : ""}`}
                onClick={() => setSelectedSyncCopy("local")}
              >
                <span>
                  本机数据
                  <i>
                    {recommendedSyncCopy === "local" && <b>较新版本</b>}
                    {effectiveSyncCopy === "local" && <em>已选择</em>}
                  </i>
                </span>
                <strong>
                  {store.projects.length} 个项目 · {store.tasks.length} 项任务
                </strong>
                <small>最后修改：{formatSyncTime(syncChoice.localUpdatedAt)}</small>
              </button>
              <button
                type="button"
                aria-pressed={effectiveSyncCopy === "cloud"}
                disabled={!syncChoice.cloudStore}
                className={`${
                  recommendedSyncCopy === "cloud" ? styles.syncCopyRecommended : ""
                } ${effectiveSyncCopy === "cloud" ? styles.syncCopySelected : ""}`}
                onClick={() => setSelectedSyncCopy("cloud")}
              >
                <span>
                  云端数据
                  <i>
                    {recommendedSyncCopy === "cloud" && <b>较新版本</b>}
                    {effectiveSyncCopy === "cloud" && <em>已选择</em>}
                  </i>
                </span>
                <strong>
                  {syncChoice.cloudStore
                    ? `${syncChoice.cloudStore.projects.length} 个项目 · ${syncChoice.cloudStore.tasks.length} 项任务`
                    : "目前为空"}
                </strong>
                <small>最后修改：{formatSyncTime(syncChoice.cloudUpdatedAt)}</small>
              </button>
            </div>
            {syncError && <p className={styles.syncError}>{syncError}</p>}
            <div className={styles.confirmActions}>
              <button
                className={`${styles.quietButton} ${styles.continueButton}`}
                onClick={() => {
                  syncReadyRef.current = false;
                  setSyncChoice(null);
                  setSelectedSyncCopy(null);
                  setSyncStatus("local");
                }}
              >
                暂时只用本机
              </button>
              <button
                className={styles.primaryButton}
                onClick={() =>
                  effectiveSyncCopy === "cloud"
                    ? applyCloudCopy()
                    : void uploadLocalCopy()
                }
              >
                {effectiveSyncCopy === "cloud"
                  ? "使用所选的云端数据"
                  : "使用所选的本机数据并同步"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: () => void;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyVisual}>
        <span />
        <i>✓</i>
      </div>
      <p className={styles.eyebrow}>从空白开始</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && (
        <button className={styles.primaryButton} onClick={action}>
          导入第一个项目
        </button>
      )}
    </div>
  );
}

function GettingStarted({
  copied,
  onCopy,
  onImport,
}: {
  copied: boolean;
  onCopy: () => void;
  onImport: () => void;
}) {
  return (
    <section className={styles.gettingStarted}>
      <div className={styles.gettingStartedIntro}>
        <p className={styles.eyebrow}>首次使用 · 约 3 分钟</p>
        <h2>先让 Codex 了解你的项目，再导入任务</h2>
        <p>
          不需要自己编写 JSON。复制提示词后，PotatoFlow Skill
          会分轮提问、整理建档摘要，并在你确认后生成可导入内容。
        </p>
      </div>
      <ol className={styles.gettingStartedSteps}>
        <li>
          <b>01</b>
          <div>
            <strong>复制建档提示词</strong>
            <span>在安装了 Skill 的 Codex 对话中发送。</span>
          </div>
        </li>
        <li>
          <b>02</b>
          <div>
            <strong>回答问题并确认规划</strong>
            <span>自然说明想做什么、目前情况和安排偏好，由 AI 帮你归纳成任务。</span>
          </div>
        </li>
        <li>
          <b>03</b>
          <div>
            <strong>粘贴 JSON 开始执行</strong>
            <span>数据只会保存在你当前使用的浏览器中。</span>
          </div>
        </li>
      </ol>
      <div className={styles.gettingStartedActions}>
        <button className={styles.primaryButton} onClick={onCopy}>
          {copied ? "建档提示词已复制" : "复制建档提示词"}
        </button>
        <button className={styles.quietButton} onClick={onImport}>
          我已有 JSON，直接导入
        </button>
      </div>
    </section>
  );
}

function TaskCard({
  task,
  onOpen,
  onToggleComplete,
  onPause,
}: {
  task: Task;
  onOpen: () => void;
  onToggleComplete: () => void;
  onPause: () => void;
}) {
  const progress = taskCompletion(task);
  const level = progress >= 100 ? "done" : taskLevel(task);
  const progressLabel =
    progress >= 100
      ? "已完成"
      : task.paused
        ? "已暂停"
        : level === "blocked"
          ? "有阻碍"
          : progress > 0
            ? `完成 ${progress}%`
            : "未完成";
  return (
    <article
      className={`${styles.taskCard} ${styles[`taskLevel_${level}`]} ${
        level === "done" ? styles.taskDone : ""
      }`}
    >
      <button
        type="button"
        className={`${styles.checkButton} ${
          level === "incomplete" ? styles.checkButtonPartial : ""
        } ${level === "blocked" ? styles.checkButtonBlocked : ""}`}
        aria-label={
          level === "done"
            ? `将“${task.title}”标记为未完成`
            : `将“${task.title}”标记为已完成`
        }
        aria-pressed={level === "done"}
        onClick={onToggleComplete}
      >
        {level === "done"
          ? "✓"
          : level === "blocked"
            ? "!"
            : ""}
      </button>
      <button className={styles.taskContent} onClick={onOpen}>
        <div className={styles.taskTitleLine}>
          <strong title={task.title}>{compactTitle(task.title)}</strong>
          <small className={styles[`inlineLevel_${level}`]}>
            {progressLabel}
          </small>
        </div>
        <em>
          {priorityLabel(task.priority)} ·{" "}
          {minutesLabel(task.estimated_minutes)}
        </em>
      </button>
      <div className={styles.taskMeta}>
        <span
          className={`${styles.progressBadge} ${styles[`level_${level}`]}`}
          title={`当前状态：${progressLabel}`}
        >
          {progressLabel}
        </span>
        {progress < 100 && (
          <button
            className={styles.pauseButton}
            type="button"
            aria-label={`${task.paused ? "恢复" : "暂停"}“${task.title}”`}
            onClick={onPause}
          >
            {task.paused ? "恢复" : "暂停"}
          </button>
        )}
      </div>
    </article>
  );
}

function CalendarView({
  month,
  tasks,
  onMonthChange,
  onDayOpen,
}: {
  month: Date;
  tasks: Task[];
  onMonthChange: (value: Date) => void;
  onDayOpen: (date: string) => void;
}) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <section
      className={styles.calendarPanel}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        swipeStart.current = touch
          ? { x: touch.clientX, y: touch.clientY }
          : null;
      }}
      onTouchEnd={(event) => {
        const start = swipeStart.current;
        const touch = event.changedTouches[0];
        swipeStart.current = null;
        if (!start || !touch) return;
        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;
        if (
          Math.abs(deltaX) < 70 ||
          Math.abs(deltaX) < Math.abs(deltaY) * 1.35
        ) {
          return;
        }
        onMonthChange(
          new Date(year, monthIndex + (deltaX < 0 ? 1 : -1), 1),
        );
      }}
    >
      <div className={styles.calendarHeader}>
        <div>
          <p className={styles.eyebrow}>任务安排</p>
          <h2>{monthTitle(month)}</h2>
        </div>
        <div>
          <button
            className={styles.calendarTodayButton}
            onClick={() => {
              const today = new Date();
              onMonthChange(
                new Date(today.getFullYear(), today.getMonth(), 1),
              );
            }}
          >
            回到今天
          </button>
          <button
            aria-label="上个月"
            onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          >
            ←
          </button>
          <button
            aria-label="下个月"
            onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          >
            →
          </button>
        </div>
      </div>
      <div className={styles.weekdays}>
        {"日一二三四五六".split("").map((day) => (
          <span key={day}>周{day}</span>
        ))}
      </div>
      <div className={styles.calendarGrid}>
        {cells.map((day, index) => {
          const dateValue = day
            ? `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(
                day,
              ).padStart(2, "0")}`
            : "";
          const dayTasks = day
            ? tasks.filter((task) => taskOccursOnDate(task, dateValue))
            : [];
          return (
            <div
              className={`${styles.calendarCell} ${
                dateValue === localDate() ? styles.calendarToday : ""
              }`}
              key={`${index}-${day || "blank"}`}
              role={day ? "button" : undefined}
              tabIndex={day ? 0 : undefined}
              aria-label={
                day
                  ? `${dateTitle(dateValue)}，${dayTasks.length} 项任务`
                  : undefined
              }
              onClick={() => day && onDayOpen(dateValue)}
              onKeyDown={(event) => {
                if (day && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onDayOpen(dateValue);
                }
              }}
            >
              {day && (
                <span className={styles.calendarDayNumber}>{day}</span>
              )}
              {dayTasks.slice(0, 3).map((task) => (
                <span className={styles.calendarTaskChip} key={task.id}>
                  {task.title}
                </span>
              ))}
              {dayTasks.length > 0 && (
                <span
                  className={styles.calendarTaskCount}
                  aria-hidden="true"
                >
                  {dayTasks.length}
                </span>
              )}
              {dayTasks.length > 3 && <small>还有 {dayTasks.length - 3} 项</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EditableSteps({
  steps,
  onAdd,
  onChange,
  onRemove,
  onMove,
}: {
  steps: string[];
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <section className={styles.stepEditor} aria-label="执行步骤编辑器">
      <div className={styles.stepEditorHeader}>
        <div>
          <strong>执行步骤</strong>
          <small>按实际顺序逐步添加；创建后每一步都可以单独勾选。</small>
        </div>
        <button type="button" onClick={onAdd}>＋ 添加执行步骤</button>
      </div>
      {steps.length ? (
        <div className={styles.stepEditorList}>
          {steps.map((step, index) => (
            <article className={styles.stepEditorItem} key={`draft-step-${index}`}>
              <span className={styles.stepEditorNumber}>{String(index + 1).padStart(2, "0")}</span>
              <textarea
                aria-label={`执行步骤 ${index + 1}`}
                value={step}
                onChange={(event) => onChange(index, event.target.value)}
                placeholder="填写这一步具体要做什么，可以写较长的操作说明。"
              />
              <div className={styles.stepEditorActions}>
                <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label={`上移执行步骤 ${index + 1}`}>↑</button>
                <button type="button" disabled={index === steps.length - 1} onClick={() => onMove(index, 1)} aria-label={`下移执行步骤 ${index + 1}`}>↓</button>
                <button type="button" className={styles.stepEditorDelete} onClick={() => onRemove(index)} aria-label={`删除执行步骤 ${index + 1}`}>删除</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.stepEditorEmpty}>暂未添加步骤。任务创建后仍可在详情中继续补充。</p>
      )}
    </section>
  );
}

function DetailBlock({
  number,
  title,
  variant,
  sectionKey,
  children,
}: {
  number: string;
  title: string;
  variant: "reason" | "steps" | "criteria";
  sectionKey?: string;
  children: React.ReactNode;
}) {
  const variantClass =
    variant === "reason"
      ? styles.detailReason
      : variant === "steps"
        ? styles.detailSteps
        : styles.detailCriteria;

  return (
    <section className={`${styles.detailBlock} ${variantClass}`} data-task-section={sectionKey}>
      <div className={styles.detailBlockHeader}>
        <span className={styles.detailIndex}>{number}</span>
        <div>
          <h3>{title}</h3>
        </div>
      </div>
      <div className={styles.detailBlockContent}>{children}</div>
    </section>
  );
}

function PlanBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.planBlock}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
