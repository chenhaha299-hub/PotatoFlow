import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function render(pathname = "/", accept = "text/html") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders PotatoFlow without starter metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>PotatoFlow/);
  assert.match(html, /单人、自托管的项目执行系统/);
  assert.match(html, /正在打开执行台/);
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("cloud sync API rejects anonymous access before touching user data", async () => {
  const response = await render("/api/sync", "application/json");
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.match(body.error, /登录/);
});

test("cloud file API rejects anonymous access", async () => {
  const response = await render(
    "/api/files/source-00000000-0000-4000-8000-000000000000",
    "application/json",
  );
  assert.equal(response.status, 401);
});

test("sync comparison ignores internal revision metadata", async () => {
  const app = await readFile(
    new URL("../app/PotatoFlowApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /storesSemanticallyEqual/);
  assert.match(app, /NON_SEMANTIC_SYNC_KEYS/);
  assert.match(app, /POSITIONAL_BOOLEAN_ARRAYS/);
  assert.match(app, /isEmptySemanticValue/);
  assert.match(app, /semanticStore/);
  assert.match(app, /hasMeaningfulLogicGraphData/);
  assert.match(app, /page\.id !== "inbox"/);
  assert.match(app, /legacyManualDone/);
  assert.match(app, /legacyReportsToTaskReport\(task\.steps, task\.step_reports\)/);
  assert.match(app, /LOCAL_UPDATED_AT_KEY/);
  assert.match(app, /较新版本/);
  assert.match(app, /最后修改/);
  assert.match(
    app,
    /data\.snapshot && storesSemanticallyEqual\(store, data\.snapshot\)/,
  );
});

test("source files use account-scoped cloud storage", async () => {
  const route = await readFile(
    new URL("../app/api/files/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /fileKey\(user\.userId, id\)/);
  assert.match(route, /env\.FILES/);
  assert.match(route, /MAX_FILE_BYTES/);
  assert.match(route, /\^\(source\|image\)-/);
  assert.match(route, /"jpeg"/);
  assert.match(route, /"png"/);
  assert.match(route, /"webp"/);
});

test("source keeps the app empty and local-first", async () => {
  const [app, layout, packageJson, css] = await Promise.all([
    readFile(new URL("../app/PotatoFlowApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(
      new URL("../app/potatoflow.module.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(app, /projects:\s*\[\]/);
  assert.match(app, /tasks:\s*\[\]/);
  assert.match(app, /issues:\s*\[\]/);
  assert.match(app, /上传数据仅本人可见/);
  assert.doesNotMatch(app, /个人上传数据仅本人可见/);
  assert.match(app, /selectedSyncCopy/);
  assert.match(app, /使用所选的本机数据并同步/);
  assert.match(app, /localStorage/);
  assert.match(layout, /PotatoFlow/);
  assert.match(layout, /width:\s*"device-width"/);
  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(app, /_sites-preview|SkeletonPreview/);
  assert.match(app, /ONBOARDING_PROMPT/);
  assert.match(app, /需要先安装 PotatoFlow Skill/);
  assert.match(app, /保存本次问题修改吗？/);
  assert.match(app, /taskScheduleType/);
  assert.match(app, /parseBackup/);
  assert.match(app, /恢复完整备份/);
  assert.match(app, /backupConfirmText\.trim\(\)\s*!==\s*"恢复"/);
  assert.match(app, /source_files:\s*\[\]/);
  assert.match(app, /deleted_task_ids/);
  assert.match(app, /import_metadata/);
  assert.match(app, /buildImportPreview/);
  assert.match(app, /saveImportSnapshot/);
  assert.match(app, /检查变更/);
  assert.match(app, /最近导入前快照/);
  assert.match(app, /会造成流程显示和历史对比歧义/);
  assert.match(app, /统一设置项目任务标签/);
  assert.match(app, /updateAllProjectTaskCategories/);
  assert.match(app, /新增阶段/);
  assert.match(app, /＋ 具体任务/);
  assert.match(app, /projectEditDraft && addingMilestone/);
  assert.match(app, /projectTaskSwipeStartRef/);
  assert.match(app, /projectTaskEditorShellSwiped/);
  assert.match(app, /confirmRemoveProjectTask/);
  assert.match(app, /milestones: projectMilestoneDrafts/);
  assert.match(app, /source_file_mode/);
  assert.match(app, /source_file_refs/);
  assert.match(app, /导入源文件关联/);
  assert.match(app, /全部任务共用/);
  assert.match(app, /每个任务不同/);
  assert.match(app, /执行这条任务时需要查看的资料/);
  assert.match(app, /新原文件关联层级/);
  assert.match(app, /__milestone__:/);
  assert.match(app, /assignSourceFile/);
  assert.match(app, /已上传文件可在下方随时重新关联/);
  assert.doesNotMatch(app, /toggleAllTaskResults/);
  assert.match(app, /taskMilestoneGroup/);
  assert.match(app, /onToggleComplete/);
  assert.match(app, /result_report/);
  assert.match(app, /legacyReportsToTaskReport/);
  assert.match(app, /completedSteps/);
  assert.match(app, /setDraftStepCompleted/);
  assert.match(app, /setDraftStepNote/);
  assert.match(app, /本步骤备注/);
  assert.match(app, /步骤旁的备注用于记录局部信息/);
  assert.match(app, /统一记录本任务的结果/);
  assert.doesNotMatch(app, /toggleTaskChecklist/);
  assert.doesNotMatch(app, /本步骤完成情况\s*\/\s*结果数据/);
  assert.match(css, /\.calendarTaskCount/);
  assert.match(css, /\.taskMilestoneHeader/);
  assert.match(css, /\.taskReportPanel/);
  assert.match(css, /\.stepCheckButton/);
  assert.match(css, /\.stepNoteButton/);
  assert.match(css, /\.projectTaskSwipeDelete/);
  assert.match(css, /\.newMilestoneForm/);
  assert.doesNotMatch(css, /\.calendarGrid\s*\{\s*min-width:\s*700px/);
  assert.match(app, /使用所选的本机数据并同步/);
  assert.match(app, /使用所选的云端数据/);
  assert.match(app, /syncReadyRef/);
  assert.match(css, /\.syncBar/);
});

test("logic graph keeps automatic labels short and manual labels IME-safe", async () => {
  const graph = await readFile(
    new URL("../app/LogicGraphPrototype.tsx", import.meta.url),
    "utf8",
  );

  assert.match(graph, /slice\(0, 6\)/);
  assert.match(graph, /slice\(0, 30\)/);
  assert.match(graph, /nativeEvent\.isComposing/);
  assert.match(graph, /logicGraphIdentity/);
  assert.match(graph, /手动输入最长30个字符/);
  assert.match(graph, /图片备注/);
  assert.match(graph, /最多 9 张/);
});
