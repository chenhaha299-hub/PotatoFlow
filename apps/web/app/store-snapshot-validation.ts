type ValidationResult = { ok: true } | { ok: false; error: string };

const LIMITS = {
  projects: 2_000,
  tasks: 20_000,
  issues: 20_000,
  graphPages: 5_000,
  graphNodesPerPage: 5_000,
  graphEdgesPerPage: 10_000,
  shortText: 2_000,
  longText: 100_000,
  listItems: 2_000,
} as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(
  value: unknown,
  label: string,
  maximum = LIMITS.shortText,
  allowEmpty = false,
): string | null {
  if (typeof value !== "string") return `${label}必须是文字。`;
  if (!allowEmpty && !value.trim()) return `${label}不能为空。`;
  if (value.length > maximum) return `${label}内容过长。`;
  return null;
}

function optionalText(value: unknown, label: string, maximum = LIMITS.longText) {
  return value === undefined || value === null
    ? null
    : text(value, label, maximum, true);
}

function textList(value: unknown, label: string, required = false) {
  if (value === undefined && !required) return null;
  if (!Array.isArray(value)) return `${label}必须是列表。`;
  if (value.length > LIMITS.listItems) return `${label}条目过多。`;
  for (const [index, item] of value.entries()) {
    const error = text(item, `${label}第 ${index + 1} 项`, LIMITS.longText, true);
    if (error) return error;
  }
  return null;
}

function uniqueIds(items: unknown[], label: string) {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    const value = record(item);
    const error = text(value?.id, `${label}第 ${index + 1} 项编号`, 300);
    if (error) return error;
    const id = value!.id as string;
    if (ids.has(id)) return `${label}包含重复编号。`;
    ids.add(id);
  }
  return null;
}

function validateProjects(projects: unknown[]) {
  if (projects.length > LIMITS.projects) return "项目数量超过安全上限。";
  const idError = uniqueIds(projects, "项目");
  if (idError) return idError;
  for (const [index, item] of projects.entries()) {
    const project = record(item)!;
    const prefix = `第 ${index + 1} 个项目`;
    const error =
      text(project.name, `${prefix}名称`) ||
      text(project.objective, `${prefix}目标`, LIMITS.longText, true) ||
      textList(project.success_criteria, `${prefix}成功标准`) ||
      textList(project.constraints, `${prefix}约束`) ||
      textList(project.assumptions, `${prefix}假设`) ||
      textList(project.milestones, `${prefix}阶段`);
    if (error) return error;
    if (project.source_files !== undefined) {
      if (!Array.isArray(project.source_files)) return `${prefix}源文件必须是列表。`;
      for (const file of project.source_files) {
        const metadata = record(file);
        if (
          !metadata ||
          text(metadata.id, `${prefix}源文件编号`, 300) ||
          text(metadata.name, `${prefix}源文件名`, LIMITS.shortText)
        ) {
          return `${prefix}包含无效的源文件信息。`;
        }
      }
    }
  }
  return null;
}

function validateTasks(tasks: unknown[]) {
  if (tasks.length > LIMITS.tasks) return "任务数量超过安全上限。";
  const idError = uniqueIds(tasks, "任务");
  if (idError) return idError;
  for (const [index, item] of tasks.entries()) {
    const task = record(item)!;
    const prefix = `第 ${index + 1} 个任务`;
    const error =
      text(task.project_id, `${prefix}项目编号`, 300) ||
      text(task.title, `${prefix}标题`) ||
      text(task.objective, `${prefix}目标`, LIMITS.longText, true) ||
      textList(task.steps, `${prefix}执行步骤`) ||
      textList(task.acceptance_criteria, `${prefix}完成标准`, true) ||
      textList(task.notes, `${prefix}记录`) ||
      textList(task.dependencies, `${prefix}依赖`) ||
      textList(task.source_file_refs, `${prefix}源文件关联`) ||
      optionalText(task.note, `${prefix}备注`) ||
      optionalText(task.result_report, `${prefix}结果汇报`);
    if (error) return error;
    for (const key of ["step_results", "criterion_results"] as const) {
      const values = task[key];
      if (
        values !== undefined &&
        (!Array.isArray(values) || values.some((value) => typeof value !== "boolean"))
      ) {
        return `${prefix}${key}格式无效。`;
      }
    }
  }
  return null;
}

function validateIssues(issues: unknown[]) {
  if (issues.length > LIMITS.issues) return "问题数量超过安全上限。";
  const idError = uniqueIds(issues, "问题");
  if (idError) return idError;
  for (const [index, item] of issues.entries()) {
    const issue = record(item)!;
    const prefix = `第 ${index + 1} 个问题`;
    const error =
      text(issue.task_id, `${prefix}任务编号`, 300) ||
      text(issue.project_id, `${prefix}项目编号`, 300) ||
      text(issue.question, `${prefix}内容`, LIMITS.longText) ||
      textList(issue.attempts, `${prefix}尝试记录`) ||
      optionalText(issue.response, `${prefix}答复`);
    if (error) return error;
  }
  return null;
}

function validateGraphPages(pages: unknown[]) {
  if (pages.length > LIMITS.graphPages) return "网图页面数量超过安全上限。";
  const idError = uniqueIds(pages, "网图页面");
  if (idError) return idError;
  for (const [index, item] of pages.entries()) {
    const page = record(item)!;
    const prefix = `第 ${index + 1} 个网图页面`;
    if (
      text(page.title, `${prefix}标题`) ||
      ![1, 2, 3].includes(page.level as number) ||
      !Array.isArray(page.nodes) ||
      !Array.isArray(page.edges)
    ) {
      return `${prefix}格式无效。`;
    }
    if (page.nodes.length > LIMITS.graphNodesPerPage) return `${prefix}思维点过多。`;
    if (page.edges.length > LIMITS.graphEdgesPerPage) return `${prefix}连线过多。`;
    const nodeIdError = uniqueIds(page.nodes, `${prefix}思维点`);
    if (nodeIdError) return nodeIdError;
    for (const nodeItem of page.nodes) {
      const node = record(nodeItem)!;
      if (
        text(node.label, `${prefix}思维点标题`, LIMITS.longText, true) ||
        text(node.content, `${prefix}思维点内容`, LIMITS.longText, true) ||
        typeof node.x !== "number" ||
        !Number.isFinite(node.x) ||
        typeof node.y !== "number" ||
        !Number.isFinite(node.y)
      ) {
        return `${prefix}包含无效思维点。`;
      }
    }
    for (const edgeItem of page.edges) {
      const edge = record(edgeItem);
      if (
        !edge ||
        text(edge.id, `${prefix}连线编号`, 300) ||
        text(edge.source, `${prefix}连线起点`, 300) ||
        text(edge.target, `${prefix}连线终点`, 300)
      ) {
        return `${prefix}包含无效连线。`;
      }
    }
  }
  return null;
}

export function validatePotatoFlowStore(value: unknown): ValidationResult {
  const store = record(value);
  if (!store || store.schema_version !== 1) {
    return { ok: false, error: "数据版本无法识别。" };
  }
  if (
    !Array.isArray(store.projects) ||
    !Array.isArray(store.tasks) ||
    !Array.isArray(store.issues) ||
    (store.logic_graph_pages !== undefined && !Array.isArray(store.logic_graph_pages))
  ) {
    return { ok: false, error: "项目、任务、问题或网图列表格式无效。" };
  }
  const error =
    validateProjects(store.projects) ||
    validateTasks(store.tasks) ||
    validateIssues(store.issues) ||
    validateGraphPages((store.logic_graph_pages as unknown[] | undefined) || []);
  return error ? { ok: false, error } : { ok: true };
}

export function isPotatoFlowStore(value: unknown) {
  return validatePotatoFlowStore(value).ok;
}
