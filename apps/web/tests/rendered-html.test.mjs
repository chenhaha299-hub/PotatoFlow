import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
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
  assert.match(app, /个人上传数据仅本人可见/);
  assert.match(app, /localStorage/);
  assert.match(layout, /PotatoFlow/);
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
  assert.match(app, /无法安全对应原有完成记录/);
  assert.match(app, /统一设置项目任务标签/);
  assert.match(app, /updateAllProjectTaskCategories/);
  assert.match(app, /source_file_mode/);
  assert.match(app, /source_file_refs/);
  assert.match(app, /导入源文件关联/);
  assert.match(app, /全部任务共用/);
  assert.match(app, /每个任务不同/);
  assert.match(app, /执行这条任务时需要查看的资料/);
  assert.match(app, /新原文件关联任务/);
  assert.match(app, /assignSourceFile/);
  assert.match(app, /已上传文件可在下方随时重新关联/);
  assert.doesNotMatch(app, /toggleAllTaskResults/);
  assert.match(css, /\.calendarTaskCount/);
  assert.doesNotMatch(css, /\.calendarGrid\s*\{\s*min-width:\s*700px/);
});
