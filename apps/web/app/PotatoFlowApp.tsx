"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./potatoflow.module.css";

type ProjectInput = {
  id?: string;
  name: string;
  objective: string;
  success_criteria?: string[];
  background?: string;
  constraints?: string[];
  assumptions?: string[];
};

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
  estimated_minutes?: number | null;
  priority?: number;
  dependencies?: string[];
};

type Project = Required<
  Pick<ProjectInput, "name" | "objective">
> &
  Omit<ProjectInput, "name" | "objective" | "id"> & {
    id: string;
    status: "active";
    created_at: string;
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
};

type Store = {
  schema_version: 1;
  projects: Project[];
  tasks: Task[];
  issues: Issue[];
};

type TabId = "today" | "calendar" | "projects" | "issues";

const STORAGE_KEY = "potatoflow:v1";
const EMPTY_STORE: Store = {
  schema_version: 1,
  projects: [],
  tasks: [],
  issues: [],
};

const NAV_ITEMS: Array<{ id: TabId; label: string; mark: string }> = [
  { id: "today", label: "今天", mark: "今" },
  { id: "calendar", label: "日历", mark: "日" },
  { id: "projects", label: "项目", mark: "项" },
  { id: "issues", label: "问题", mark: "问" },
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "待安排",
  scheduled: "已安排",
  doing: "执行中",
  blocked: "有阻碍",
  done: "已完成",
  cancelled: "已取消",
};

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
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

function monthTitle(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(value);
}

function parsePlan(raw: string): { project: ProjectInput; tasks: TaskInput[] } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("JSON 格式无法识别，请检查逗号、引号和括号。");
  }
  if (!value || typeof value !== "object") {
    throw new Error("导入内容必须是一个 JSON 对象。");
  }
  const plan = value as { project?: ProjectInput; tasks?: TaskInput[] };
  if (!plan.project?.name?.trim() || !plan.project.objective?.trim()) {
    throw new Error("项目必须包含 name 和 objective。");
  }
  if (!Array.isArray(plan.tasks)) {
    throw new Error("项目必须包含 tasks 数组；没有任务时请填写空数组。");
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
  }
  return { project: plan.project, tasks: plan.tasks };
}

export default function PotatoFlowApp() {
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [issueText, setIssueText] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Store;
        if (parsed.schema_version === 1) setStore(parsed);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }
  }, [store, hydrated]);

  const selectedTask = store.tasks.find((task) => task.id === selectedTaskId);
  const selectedProject = selectedTask
    ? store.projects.find((project) => project.id === selectedTask.project_id)
    : undefined;

  const todayTasks = useMemo(
    () =>
      store.tasks
        .filter(
          (task) =>
            task.scheduled_date === selectedDate && task.status !== "cancelled",
        )
        .sort(
          (a, b) =>
            Number(a.status === "done") - Number(b.status === "done") ||
            (a.priority || 2) - (b.priority || 2),
        ),
    [selectedDate, store.tasks],
  );

  const openIssues = store.issues.filter((issue) => issue.status !== "resolved");

  function importPlan() {
    setImportError("");
    try {
      const plan = parsePlan(importText);
      const projectId = makeId("project", plan.project.id || plan.project.name);
      if (store.projects.some((project) => project.id === projectId)) {
        throw new Error("这个项目已经存在，请修改项目 id 后再导入。");
      }
      const createdAt = new Date().toISOString();
      const project: Project = {
        id: projectId,
        name: plan.project.name.trim(),
        objective: plan.project.objective.trim(),
        success_criteria: plan.project.success_criteria || [],
        background: plan.project.background || "",
        constraints: plan.project.constraints || [],
        assumptions: plan.project.assumptions || [],
        status: "active",
        created_at: createdAt,
      };
      const idMap = new Map<string, string>();
      plan.tasks.forEach((task) => {
        const rawId = task.id || task.title;
        idMap.set(rawId, makeId("task", rawId));
      });
      const tasks: Task[] = plan.tasks.map((task) => ({
        id: idMap.get(task.id || task.title)!,
        project_id: projectId,
        parent_id: task.parent_id
          ? idMap.get(task.parent_id) || makeId("task", task.parent_id)
          : null,
        milestone: task.milestone || "",
        title: task.title.trim(),
        objective: task.objective.trim(),
        why: task.why || "",
        steps: task.steps || [],
        acceptance_criteria: task.acceptance_criteria,
        scheduled_date: task.scheduled_date || null,
        estimated_minutes: task.estimated_minutes || null,
        priority: task.priority || 2,
        dependencies: (task.dependencies || []).map(
          (id) => idMap.get(id) || makeId("task", id),
        ),
        status: task.scheduled_date ? "scheduled" : "backlog",
        created_at: createdAt,
        notes: [],
      }));
      setStore((current) => ({
        ...current,
        projects: [...current.projects, project],
        tasks: [...current.tasks, ...tasks],
      }));
      setImportText("");
      setImportOpen(false);
      setActiveTab("projects");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "导入失败。");
    }
  }

  function updateTaskStatus(taskId: string, status: TaskStatus) {
    setStore((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId ? { ...task, status } : task,
      ),
    }));
  }

  function saveIssue() {
    if (!selectedTask || !issueText.trim()) return;
    const issue: Issue = {
      id: `issue-${crypto.randomUUID()}`,
      task_id: selectedTask.id,
      project_id: selectedTask.project_id,
      question: issueText.trim(),
      attempts: [],
      status: "open",
      response: "",
      created_at: new Date().toISOString(),
    };
    setStore((current) => ({
      ...current,
      issues: [...current.issues, issue],
      tasks: current.tasks.map((task) =>
        task.id === selectedTask.id ? { ...task, status: "blocked" } : task,
      ),
    }));
    setIssueText("");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(store, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `potatoflow-export-${localDate()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
              className={activeTab === item.id ? styles.navActive : ""}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
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
          <span>本地模式</span>
          <p>数据只保存在当前浏览器，没有预置任何项目。</p>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>单人 · 自托管 · 可开源</p>
            <h1>{NAV_ITEMS.find((item) => item.id === activeTab)?.label}</h1>
          </div>
          <div className={styles.topActions}>
            <button className={styles.quietButton} onClick={exportData}>
              导出数据
            </button>
            <button
              className={styles.primaryButton}
              onClick={() => setImportOpen(true)}
            >
              <span>＋</span> 导入项目
            </button>
          </div>
        </header>

        {activeTab === "today" && (
          <section className={styles.pageGrid}>
            <div className={styles.primaryColumn}>
              <div className={styles.dateStrip}>
                <button
                  aria-label="前一天"
                  onClick={() => {
                    const date = new Date(`${selectedDate}T12:00:00`);
                    date.setDate(date.getDate() - 1);
                    setSelectedDate(localDate(date));
                  }}
                >
                  ←
                </button>
                <div>
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
                </div>
                <button
                  aria-label="后一天"
                  onClick={() => {
                    const date = new Date(`${selectedDate}T12:00:00`);
                    date.setDate(date.getDate() + 1);
                    setSelectedDate(localDate(date));
                  }}
                >
                  →
                </button>
              </div>

              {todayTasks.length === 0 ? (
                <EmptyState
                  title="今天还没有任务"
                  description={
                    store.projects.length === 0
                      ? "先在 Codex 中整理项目，再把生成的 JSON 导入这里。"
                      : "这个日期没有安排。任务不会被系统自动填满。"
                  }
                  action={
                    store.projects.length === 0
                      ? () => setImportOpen(true)
                      : undefined
                  }
                />
              ) : (
                <div className={styles.taskList}>
                  {todayTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      project={store.projects.find(
                        (project) => project.id === task.project_id,
                      )}
                      onOpen={() => setSelectedTaskId(task.id)}
                      onToggle={() =>
                        updateTaskStatus(
                          task.id,
                          task.status === "done" ? "scheduled" : "done",
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <aside className={styles.contextPanel}>
              <div className={styles.contextMark}>→</div>
              <p className={styles.eyebrow}>执行提示</p>
              <h2>只处理今天真正重要的事。</h2>
              <ul>
                <li>先看任务目标，不从步骤列表盲目开始。</li>
                <li>遇到阻碍就记录，不用重新解释项目背景。</li>
                <li>完成标准没有达到，就不急着标记完成。</li>
              </ul>
            </aside>
          </section>
        )}

        {activeTab === "calendar" && (
          <CalendarView
            month={calendarMonth}
            tasks={store.tasks}
            onMonthChange={setCalendarMonth}
            onTaskOpen={setSelectedTaskId}
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
              <div className={styles.projectGrid}>
                {store.projects.map((project) => {
                  const tasks = store.tasks.filter(
                    (task) => task.project_id === project.id,
                  );
                  const done = tasks.filter(
                    (task) => task.status === "done",
                  ).length;
                  return (
                    <article className={styles.projectCard} key={project.id}>
                      <div className={styles.projectTop}>
                        <span>进行中</span>
                        <b>
                          {done}/{tasks.length}
                        </b>
                      </div>
                      <h2>{project.name}</h2>
                      <p>{project.objective}</p>
                      <div className={styles.progressTrack}>
                        <i
                          style={{
                            width: `${
                              tasks.length ? (done / tasks.length) * 100 : 0
                            }%`,
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
                              onClick={() => setSelectedTaskId(task.id)}
                            >
                              <span className={styles.taskDot} />
                              <span>{task.title}</span>
                              <small>{STATUS_LABELS[task.status]}</small>
                            </button>
                          ))
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === "issues" && (
          <section>
            {openIssues.length === 0 ? (
              <EmptyState
                title="没有待处理问题"
                description="执行任务时记录的阻碍会集中出现在这里，电脑打开后再交给 Codex 分析。"
              />
            ) : (
              <div className={styles.issueList}>
                {openIssues.map((issue) => {
                  const task = store.tasks.find(
                    (item) => item.id === issue.task_id,
                  );
                  return (
                    <button
                      key={issue.id}
                      onClick={() => setSelectedTaskId(issue.task_id)}
                    >
                      <span>{issue.status === "open" ? "待分析" : "待验证"}</span>
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
            key={item.id}
            className={activeTab === item.id ? styles.mobileActive : ""}
            onClick={() => setActiveTab(item.id)}
          >
            <span>{item.mark}</span>
            {item.label}
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
                <p className={styles.eyebrow}>从 Codex 导入</p>
                <h2 id="import-title">导入你自己的项目</h2>
              </div>
              <button
                aria-label="关闭"
                onClick={() => {
                  setImportOpen(false);
                  setImportError("");
                }}
              >
                ×
              </button>
            </div>
            <p className={styles.modalHint}>
              粘贴 PotatoFlow Skill 生成的项目 JSON。系统不会自动读取聊天，也不会上传内容。
            </p>
            <textarea
              aria-label="项目 JSON"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={'{\n  "project": { ... },\n  "tasks": []\n}'}
              spellCheck={false}
            />
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
                disabled={!importText.trim()}
                onClick={importPlan}
              >
                检查并导入
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedTask && selectedProject && (
        <div className={styles.drawerBackdrop}>
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <span>{selectedProject.name}</span>
              <button
                aria-label="关闭任务详情"
                onClick={() => setSelectedTaskId(null)}
              >
                ×
              </button>
            </div>
            <p className={styles.eyebrow}>
              {selectedTask.milestone || "未设置里程碑"}
            </p>
            <h2>{selectedTask.title}</h2>
            <p className={styles.taskObjective}>{selectedTask.objective}</p>

            <div className={styles.detailMeta}>
              <span>{STATUS_LABELS[selectedTask.status]}</span>
              <span>{minutesLabel(selectedTask.estimated_minutes)}</span>
              <span>{selectedTask.scheduled_date || "未安排日期"}</span>
            </div>

            <DetailBlock title="为什么做">
              <p>{selectedTask.why || "项目中还没有记录原因。"}</p>
            </DetailBlock>
            <DetailBlock title="执行步骤">
              {selectedTask.steps?.length ? (
                <ol>
                  {selectedTask.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : (
                <p>还没有拆分步骤。</p>
              )}
            </DetailBlock>
            <DetailBlock title="完成标准">
              <ul>
                {selectedTask.acceptance_criteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            </DetailBlock>

            <div className={styles.issueComposer}>
              <div>
                <p className={styles.eyebrow}>执行中遇到问题？</p>
                <h3>先记录，之后交给 Codex 分析</h3>
              </div>
              <textarea
                aria-label="记录执行问题"
                value={issueText}
                onChange={(event) => setIssueText(event.target.value)}
                placeholder="发生了什么？你已经尝试过什么？"
              />
              <button
                className={styles.primaryButton}
                disabled={!issueText.trim()}
                onClick={saveIssue}
              >
                保存问题并标记阻碍
              </button>
            </div>
          </aside>
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

function TaskCard({
  task,
  project,
  onOpen,
  onToggle,
}: {
  task: Task;
  project?: Project;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <article
      className={`${styles.taskCard} ${
        task.status === "done" ? styles.taskDone : ""
      }`}
    >
      <button
        className={styles.checkButton}
        aria-label={task.status === "done" ? "恢复任务" : "完成任务"}
        onClick={onToggle}
      >
        {task.status === "done" ? "✓" : ""}
      </button>
      <button className={styles.taskContent} onClick={onOpen}>
        <span>
          {project?.name || "未知项目"} · {task.milestone || "未分组"}
        </span>
        <strong>{task.title}</strong>
        <p>{task.objective}</p>
      </button>
      <div className={styles.taskMeta}>
        <small>{minutesLabel(task.estimated_minutes)}</small>
        <b className={styles[`status_${task.status}`]}>
          {STATUS_LABELS[task.status]}
        </b>
      </div>
    </article>
  );
}

function CalendarView({
  month,
  tasks,
  onMonthChange,
  onTaskOpen,
}: {
  month: Date;
  tasks: Task[];
  onMonthChange: (value: Date) => void;
  onTaskOpen: (taskId: string) => void;
}) {
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
    <section className={styles.calendarPanel}>
      <div className={styles.calendarHeader}>
        <div>
          <p className={styles.eyebrow}>任务安排</p>
          <h2>{monthTitle(month)}</h2>
        </div>
        <div>
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
            ? tasks.filter((task) => task.scheduled_date === dateValue)
            : [];
          return (
            <div
              className={`${styles.calendarCell} ${
                dateValue === localDate() ? styles.calendarToday : ""
              }`}
              key={`${index}-${day || "blank"}`}
            >
              {day && <span>{day}</span>}
              {dayTasks.slice(0, 3).map((task) => (
                <button key={task.id} onClick={() => onTaskOpen(task.id)}>
                  {task.title}
                </button>
              ))}
              {dayTasks.length > 3 && <small>还有 {dayTasks.length - 3} 项</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.detailBlock}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
