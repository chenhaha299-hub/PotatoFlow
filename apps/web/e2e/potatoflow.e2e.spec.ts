import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const TEST_DATE = "2026-08-03";

const projectPlan = {
  project: {
    id: "e2e-project",
    revision: 1,
    name: "端到端验收项目",
    objective: "用完全虚构的数据验证 PotatoFlow 的完整执行闭环",
    success_criteria: ["任务可导入", "执行记录可保存", "数据可导出恢复"],
    background: "自动化测试专用虚构项目，不含用户信息。",
    constraints: ["只使用虚构数据"],
    assumptions: ["浏览器支持本地存储"],
    execution_tip_title: "先完成核心流程，再处理补充事项。",
    execution_tips: ["先查看任务目标。", "遇到真实阻碍再记录问题。"],
    source_file_mode: "shared",
    source_file_requirements: [
      { id: "e2e-source", label: "验收资料", description: "自动化测试生成的文件" },
    ],
  },
  tasks: [
    {
      id: "e2e-task-one",
      parent_id: null,
      milestone: "阶段一：准备",
      title: "验证完整执行流程",
      objective: "完成步骤、备注、汇报与问题记录的联动验证",
      why: "核心执行数据必须可靠保存",
      note: "这是虚构测试任务。",
      steps: ["检查任务信息", "保存执行结果"],
      acceptance_criteria: ["两项步骤可分别完成", "统一汇报可保存"],
      scheduled_date: TEST_DATE,
      estimated_minutes: 30,
      priority: 2,
      category: "work",
      source_file_refs: ["e2e-source"],
      dependencies: [],
    },
    {
      id: "e2e-task-two",
      parent_id: null,
      milestone: "阶段二：复核",
      title: "验证日历与项目联动",
      objective: "确认任务可以从日历进入并快速修改日期",
      why: "减少用户在页面间来回跳转",
      steps: ["打开日历", "修改任务日期"],
      acceptance_criteria: ["新日期能在首页显示"],
      scheduled_date: "2026-08-04",
      estimated_minutes: 20,
      priority: 3,
      category: "work",
      source_file_refs: ["e2e-source"],
      dependencies: ["e2e-task-one"],
    },
  ],
  deleted_task_ids: [],
  import_metadata: {
    base_project_id: "e2e-project",
    base_project_revision: 1,
    generated_at: "2026-08-03T08:00:00+08:00",
  },
};

async function clearLocalData(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("potatoflow-files");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    root: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.root).toBeLessThanOrEqual(metrics.viewport + 1);
}

async function navigateTo(page: Page, label: string) {
  const candidates = page
    .getByRole("navigation")
    .getByRole("button", { name: label, exact: true });
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }
  throw new Error(`没有找到可见导航：${label}`);
}

async function selectGraphNode(page: Page, graphName: string, label: string) {
  const text = page.getByLabel(graphName).getByText(label, { exact: true });
  const group = text.locator("xpath=..");
  const hitbox = group.locator("circle").last();
  const usesTouch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  if (usesTouch) {
    await hitbox.tap();
    return;
  }
  const box = await hitbox.boundingBox();
  if (!box) throw new Error(`无法定位网图圆点：${label}`);
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(34, box.height / 2));
}

async function importProject(page: Page, withFile = false) {
  await page.getByRole("button", { name: /导入项目/ }).first().click();
  await page.getByRole("button", { name: "导入项目 JSON" }).click();
  await page.getByLabel("项目 JSON").fill(JSON.stringify(projectPlan));
  await page.getByRole("button", { name: "检查变更" }).click();
  await expect(page.getByText("导入变更预览")).toBeVisible();
  await expect(page.getByText("新增 2")).toBeVisible();
  if (withFile) {
    await page.getByRole("button", { name: "全部任务共用", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "验收资料.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("PotatoFlow E2E synthetic fixture", "utf8"),
    });
  } else {
    await page.getByRole("button", { name: "没有源文件" }).click();
  }
  await page.getByRole("button", { name: "确认并导入" }).click();
  await expect(page.getByRole("button", { name: /验证完整执行流程/ }).first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await clearLocalData(page);
});

test("空白状态、导航和响应式布局可用", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "今天", exact: true })).toBeVisible();
  await expect(page.getByText("先让 Codex 了解你的项目，再导入任务")).toBeVisible();
  await expect(page.getByRole("button", { name: "复制建档提示词" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: /日历/ }).click();
  await expect(page.getByText("任务安排")).toBeVisible();
  await page.getByRole("button", { name: /项目/ }).click();
  await expect(page.getByText("这里会出现你的项目结构")).toBeVisible();
  await navigateTo(page, "问题");
  await expect(page.getByText("还没有执行问题")).toBeVisible();
  await page.getByRole("button", { name: /思维网图|网图/ }).click();
  await expect(page.getByRole("heading", { name: "想法笔记本" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("JSON 导入、文件关联、任务执行、问题与持久化形成闭环", async ({ page }) => {
  await importProject(page, true);
  await page.getByRole("button", { name: "关闭项目规划" }).click();
  await page.getByRole("button", { name: /验证完整执行流程/ }).first().click();
  await expect(page.getByRole("heading", { name: "验证完整执行流程" })).toBeVisible();
  await expect(page.getByText("源文件 1")).toBeVisible();
  await expect(page.getByText("验收资料.txt")).toBeVisible();

  await page.getByRole("button", { name: "完成步骤 1" }).click();
  await page.getByRole("button", { name: "备注", exact: true }).first().click();
  await page.getByLabel("步骤 1 备注").fill("第一步已核对，数据正常。 ");
  await page.getByLabel("任务完成情况与结果汇报").fill("完成第一轮验证，保留第二步继续测试。 ");
  await page.getByLabel("任务备注").fill("下次回归时继续使用虚构数据。 ");
  await page.getByLabel("记录执行问题").fill("测试阻碍：需要确认问题与原任务能够互相跳转。 ");
  await page.getByRole("checkbox", { name: /这个问题阻碍任务继续/ }).check();
  await page.getByRole("button", { name: "保存问题、标记阻碍并退出" }).click();
  await page
    .locator('[role="alertdialog"]:visible')
    .getByRole("button", { name: "保存并退出", exact: true })
    .click();

  await navigateTo(page, "问题");
  await expect(page.getByText("测试阻碍：需要确认问题与原任务能够互相跳转。")).toBeVisible();
  await page.getByText("测试阻碍：需要确认问题与原任务能够互相跳转。").click();
  await expect(page.getByRole("button", { name: "复制给 GPT 分析" })).toBeVisible();
  await expect(page.getByRole("button", { name: /进入原任务/ })).toBeVisible();
  await page.getByRole("button", { name: /进入原任务/ }).click();
  await expect(page.getByRole("heading", { name: "验证完整执行流程" })).toBeVisible();
  await expect(page.getByLabel("任务完成情况与结果汇报")).toHaveValue(/完成第一轮验证/);

  await page.getByRole("button", { name: "完成步骤 2" }).click();
  await expect(page.getByLabel("任务进度 100%")).toBeVisible();
  await expect(page.getByText("满分完成")).toBeVisible();
  await page.getByRole("button", { name: /关闭任务详情/ }).click();
  await page
    .locator('[role="alertdialog"]:visible')
    .getByRole("button", { name: "保存并退出", exact: true })
    .click();
  await page
    .getByText("测试阻碍：需要确认问题与原任务能够互相跳转。")
    .click();
  await page.getByRole("button", { name: "标记已解决" }).click();
  await navigateTo(page, "项目");
  await expect(
    page.locator("button:visible").filter({ hasText: "验证完整执行流程" }),
  ).toContainText("已完成");

  await page.reload();
  await navigateTo(page, "项目");
  await expect(page.getByText("验证完整执行流程", { exact: true })).toBeVisible();
  await expect(
    page.locator("button:visible").filter({ hasText: "验证完整执行流程" }),
  ).toContainText("已完成");
});

test("自定义重复任务和日历快速改期可用", async ({ page }) => {
  await page.getByRole("button", { name: /导入项目/ }).first().click();
  await page.getByRole("button", { name: "＋ 自定义任务" }).click();
  await page.getByLabel("任务标题 *").fill("每个工作日复盘");
  await page.getByLabel("任务详情 / 要达成的结果").fill("工作日结束前记录当天结果");
  await page.getByRole("button", { name: "＋ 添加执行步骤" }).click();
  await page.getByRole("textbox", { name: "执行步骤 1", exact: true }).fill("记录完成事项");
  await page.getByRole("button", { name: "＋ 添加执行步骤" }).click();
  await page.getByRole("textbox", { name: "执行步骤 2", exact: true }).fill("写下明日重点");
  await page.getByLabel("时间安排").selectOption("weekdays");
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill("2026-08-03");
  await dateInputs.nth(1).fill("2026-08-07");
  await page.getByRole("button", { name: "创建到首页" }).click();
  await expect(page.getByText("每个工作日复盘", { exact: true })).toBeVisible();

  await page.getByText("每个工作日复盘", { exact: true }).click();
  const taskDrawer = page.getByRole("button", { name: "关闭任务详情" }).locator("xpath=ancestor::aside");
  if ((page.viewportSize()?.width || 0) > 620) {
    const box = await taskDrawer.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box?.x || 0) + (box?.width || 0) / 2 - (page.viewportSize()?.width || 0) / 2)).toBeLessThan(8);
  }
  await page.getByRole("button", { name: "编辑任务" }).click();
  await page.getByLabel("编辑任务标题").fill("每个工作日复盘（已编辑）");
  await page.getByLabel("编辑任务分块").fill("第一阶段｜日常复盘");
  await page.getByRole("button", { name: "＋ 添加执行步骤" }).click();
  await page.getByRole("textbox", { name: "执行步骤 3", exact: true }).fill("归档复盘记录");
  await page.getByRole("button", { name: "关闭任务详情" }).click();
  await page
    .locator('[role="alertdialog"]:visible')
    .getByRole("button", { name: "保存并退出", exact: true })
    .click();
  await expect(page.getByText("每个工作日复盘（已编辑）", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /日历/ }).click();
  await page.locator('[role="button"][aria-label*="1 项任务"]:visible').click();
  await expect(page.getByRole("heading", { name: /8月[3-7]日/ })).toBeVisible();
  const quickDate = page.getByLabel(/修改“每个工作日复盘（已编辑）”的日期/);
  await quickDate.fill("2026-08-10");
  await expect(page.getByText(/日期已修改|已移动/)).toBeVisible();
});

test("思维网图支持页面、圆点、连线、子网图和安全删除", async ({ page }) => {
  await page.getByRole("button", { name: /思维网图|网图/ }).click();
  await page.getByRole("button", { name: "＋ 新建页面" }).click();
  await page.getByLabel("页面名称").fill("自动化验收");
  await page.getByRole("button", { name: "创建页面" }).click();
  await page.getByRole("button", { name: "目录", exact: true }).click();
  await page.getByRole("button", { name: "修改自动化验收的标题" }).click();
  await page.getByLabel("标题名称").fill("自动化验收已改名");
  await page.getByRole("button", { name: "保存标题" }).click();
  await page.getByText("自动化验收已改名", { exact: true }).click();
  await page.getByRole("button", { name: "记录第一个想法" }).click();
  await page.getByLabel("完整想法").fill("这是一个用于验证自动标题截取和圆点详情的完整想法");
  await expect(page.getByLabel(/圆点关键词/)).toHaveValue("这是一个用于");
  await page.getByRole("button", { name: "生成圆点" }).click();
  await expect(page.getByRole("heading", { name: "这是一个用于" })).toBeVisible();

  const keywordInput = page.getByLabel(/圆点关键词/);
  await keywordInput.fill("一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二");
  await expect(keywordInput).toHaveValue("一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十");
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles([
    { name: "界面截图.png", mimeType: "image/png", buffer: onePixelPng },
    { name: "参考图.png", mimeType: "image/png", buffer: onePixelPng },
  ]);
  await expect(page.getByRole("button", { name: /查看图片备注1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /查看图片备注2/ })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /思维网图|网图/ }).click();
  await page.getByText("自动化验收已改名", { exact: true }).click();
  await selectGraphNode(page, "自动化验收已改名网图", "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十");
  await expect(page.getByRole("button", { name: /查看图片备注1/ })).toBeVisible();
  await page.getByRole("button", { name: "删除图片备注2" }).click();
  await expect(page.getByRole("button", { name: /查看图片备注2/ })).toHaveCount(0);

  await page.getByRole("button", { name: "＋ 想法" }).click();
  await page.getByPlaceholder("可以输入一句完整的话，画布上只显示精简关键词。").fill("第二个关联点");
  await page.getByRole("button", { name: "生成圆点" }).click();
  await page.getByRole("button", { name: "关闭想法详情" }).click();
  await selectGraphNode(page, "自动化验收已改名网图", "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十");
  await expect(page.getByRole("button", { name: "连接其他点" })).toBeVisible();
  await page.getByRole("button", { name: "连接其他点" }).click();
  await selectGraphNode(page, "自动化验收已改名网图", "第二个关联点");

  await selectGraphNode(page, "自动化验收已改名网图", "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十");
  await expect(page.getByRole("heading", { name: "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十" })).toBeVisible();
  await page.getByRole("button", { name: /为这个点建立子网图/ }).click();
  await expect(page.getByText("第 2 层网图", { exact: true })).toBeVisible();
  await page.locator("button:visible").filter({ hasText: "目录" }).first().click();
  await expect(page.locator("h2:visible", { hasText: "想法笔记本" })).toBeVisible();

  await page.locator('button[aria-label="删除自动化验收已改名"]:visible').click();
  await expect(page.locator('button:visible', { hasText: "永久删除" })).toBeDisabled();
  await page.getByLabel(/请输入“确认”/).fill("确认");
  await page.locator('button:visible', { hasText: "永久删除" }).dispatchEvent("click");
  await expect(page.getByText("自动化验收已改名", { exact: true })).toHaveCount(0);
});

test("项目重复导入会被识别为无变化", async ({ page }) => {
  await importProject(page, true);
  await page.getByRole("button", { name: "关闭项目规划" }).click();
  await page.getByRole("button", { name: /导入项目/ }).first().click();
  await page.getByRole("button", { name: "导入项目 JSON" }).click();
  await page.getByRole("button", { name: "合并更新已有项目" }).click();
  await page.getByLabel("项目 JSON").fill(JSON.stringify(projectPlan));
  await page.getByRole("button", { name: "检查变更" }).click();
  await expect(page.getByText("没有变化")).toBeVisible();
  await expect(page.getByRole("button", { name: "确认并导入" })).toBeDisabled();
});

test("真实 Word、PDF、非法格式与超限文件均被正确处理", async ({ page }) => {
  await importProject(page, false);
  const sourceInput = page.locator('aside input[type="file"][accept*=".docx"]');
  const docxPath = path.resolve(process.cwd(), "e2e/fixtures/potatoflow-preview.docx");
  const pdfPath = path.resolve(process.cwd(), "e2e/fixtures/potatoflow-preview.pdf");
  await page.getByLabel("新原文件关联任务").selectOption("__all__");

  await sourceInput.setInputFiles(docxPath);
  await expect(page.getByText("potatoflow-preview.docx", { exact: true })).toBeVisible();
  await page.getByText("potatoflow-preview.docx", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "potatoflow-preview.docx" })).toBeVisible();
  await expect(page.getByText("PotatoFlow Word 预览验收内容")).toBeVisible();
  await page.getByRole("button", { name: "关闭原文件" }).click();

  await sourceInput.setInputFiles(pdfPath);
  await expect(page.getByText("potatoflow-preview.pdf", { exact: true })).toBeVisible();
  await page.getByText("potatoflow-preview.pdf", { exact: true }).click();
  await expect(page.locator('iframe[title="potatoflow-preview.pdf"]')).toBeVisible();
  await page.getByRole("button", { name: "关闭原文件" }).click();

  await sourceInput.setInputFiles({
    name: "unsafe.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not executable"),
  });
  await expect(page.getByText("当前支持 PDF、DOCX、TXT 和 Markdown 文件。")).toBeVisible();

  await sourceInput.setInputFiles({
    name: "oversized.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await expect(page.getByText("单个原文件暂时不能超过 20MB。")).toBeVisible();

  await page.getByRole("button", { name: "关闭项目规划" }).click();
  await page.reload();
  await navigateTo(page, "项目");
  await page
    .getByText("验证完整执行流程", { exact: true })
    .locator("xpath=ancestor::button[1]")
    .click();
  await expect(page.getByRole("heading", { name: "验证完整执行流程" })).toBeVisible();
  await expect(page.getByText("potatoflow-preview.docx", { exact: true })).toBeVisible();
  await expect(page.getByText("potatoflow-preview.pdf", { exact: true })).toBeVisible();
});

test("项目编辑撤销、全量备份、安全删除与完整恢复可闭环", async ({ page }) => {
  await importProject(page, false);
  await page.getByRole("button", { name: "编辑项目" }).click();
  const projectName = page.getByLabel("项目名称");
  await projectName.fill("端到端验收项目（临时修改）");
  await page.getByRole("button", { name: /返回上一步/ }).click();
  await expect(projectName).toHaveValue("端到端验收项目");

  await projectName.fill("端到端验收项目（已修订）");
  await page.getByRole("button", { name: "更新项目" }).click();
  await expect(
    page.getByRole("complementary").getByRole("heading", { name: "端到端验收项目（已修订）" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭项目规划" }).click();

  await page.getByRole("button", { name: "导出数据" }).click();
  await page.getByRole("button", { name: "全量备份" }).click();
  const backup = await page.getByLabel("可复制的完整数据").inputValue();
  const backupData = JSON.parse(backup);
  expect(backupData.projects).toHaveLength(1);
  expect(backupData.tasks).toHaveLength(2);
  await page.getByRole("dialog").locator("button").filter({ hasText: "关闭" }).click();

  await navigateTo(page, "项目");
  await page.getByRole("button", { name: /查看并制定项目/ }).click();
  await page.getByRole("button", { name: "删除项目" }).click();
  const deleteButton = page.getByRole("button", { name: "确认删除项目" });
  await expect(deleteButton).toBeDisabled();
  await page.getByPlaceholder("输入：确认").fill("确认");
  await deleteButton.click();
  await expect(page.getByText("这里会出现你的项目结构")).toBeVisible();

  await page.getByRole("button", { name: /导入项目/ }).first().click();
  await page.getByRole("button", { name: "恢复完整备份" }).click();
  await page.getByLabel("完整备份 JSON").fill(backup);
  const restoreButton = page.getByRole("button", { name: "确认恢复备份" });
  await expect(restoreButton).toBeDisabled();
  await page.getByPlaceholder("输入：恢复").fill("恢复");
  await restoreButton.click();
  await expect(
    page.getByRole("button", { name: /打开 端到端验收项目（已修订） 项目总览/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /打开 端到端验收项目（已修订） 项目总览/ }),
  ).toBeVisible();
});

test("未保存修改只在确实变更时提醒，继续编辑与放弃退出均可用", async ({ page }) => {
  await importProject(page, false);
  await page.getByRole("button", { name: "关闭项目规划" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await navigateTo(page, "项目");
  await page.getByRole("button", { name: /查看并制定项目/ }).click();
  await page.getByRole("button", { name: "编辑项目" }).click();
  await page.getByLabel("项目名称").fill("不应被保存的名称");
  await page.getByRole("button", { name: "关闭项目规划" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByLabel("项目名称")).toHaveValue("不应被保存的名称");
  await page.getByRole("button", { name: "关闭项目规划" }).click();
  await page.getByRole("button", { name: "不保存并退出" }).click();
  await expect(page.getByText("端到端验收项目", { exact: true })).toBeVisible();
});
