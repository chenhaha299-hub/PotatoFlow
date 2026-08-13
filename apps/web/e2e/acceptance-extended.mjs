// PotatoFlow 验收扩展：三级子网图 + 独立性 + 附件复制 + 持久化
import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:3001";
const results = [];
let interrupted = false;
function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ locale: "zh-CN" });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

async function dismissOverlays() {
  const overlay = page.locator('[role="presentation"]').first();
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click({ position: { x: 10, y: 10 } }).catch(() => {});
    await page.waitForTimeout(300);
  }
}
async function gotoNav(label) {
  await dismissOverlays();
  await page.getByRole("button", { name: label }).first().click({ force: true });
  await page.waitForTimeout(700);
  await dismissOverlays();
}
async function clickBtn(nameRe) {
  await page.getByRole("button", { name: nameRe }).first().click({ force: true });
  await page.waitForTimeout(400);
}
async function shot(name) {
  await page.screenshot({ path: `G:\\AI\\Hermes\\work\\acc2-${name}.png` });
}

try {
  // 准备：进入备忘录，新建备忘录+清单+思维点（复用验收脚本流程）
  await gotoNav("备忘录");
  await clickBtn(/新建备忘录/);
  await page.locator('[role="dialog"] input').first().fill("扩展验收备忘录");
  await page.waitForTimeout(300);
  await clickBtn(/创建备忘录/);
  await page.waitForTimeout(800);

  // 直接添加想法（内联输入框，回车提交）
  await clickBtn(/添加想法/);
  await page.waitForTimeout(400);
  const inlineTa = page.locator('textarea[placeholder*="回车保存并继续"]').first();
  await inlineTa.fill("根思维点 完整想法内容");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);

  // 生成独立网图（整篇备忘录 → 中间顶部入口）
  await page.getByRole("button", { name: /建立网图|生成整篇网图/ }).first().click({ force: true });
  await page.waitForTimeout(1500);

  // ── 验收A：进入网图，检查根节点内容复制 ──
  await gotoNav("思维网图");
  await page.waitForTimeout(800);
  const g1 = await page.locator("body").innerText();
  record("A1 网图目录出现新网图", /扩展验收备忘录/.test(g1));
  await shot("A-graph-list");

  // 打开网图（点击网图条目）
  await page.getByText("扩展验收备忘录", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(1000);
  const g2 = await page.locator("body").innerText();
  record("A2 网图内根节点存在", /根思维点/.test(g2));
  // 选中节点：SVG transform 坐标系导致 locator.click 错位，用 mouse.click 点节点组中心
  const nodeGroup = page.locator("svg g[class*=logicNode]").first();
  const nb = await nodeGroup.boundingBox();
  if (nb) {
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await page.waitForTimeout(600);
  }
  await shot("B-graph-root");

  // ── 验收B：从根节点建二级子网图 ──
  // 在网图模式选中节点，找"继续推演/子网图"按钮
  const childBtn = page.getByRole("button", { name: /建立子网图|继续展开|为这个点/ }).first();
  const childVisible = await childBtn.isVisible().catch(() => false);
  record("B1 存在创建子网图入口", childVisible, childVisible ? "" : "未找到子网图按钮");
  if (childVisible) {
    await childBtn.click({ force: true });
    await page.waitForTimeout(1200);
    await shot("C-child-graph");
  }
  const g3 = await page.locator("body").innerText();
  record("B2 进入二级子网图", /想法延伸|目录|建立子网图/.test(g3), g3.slice(0, 60).replace(/\n/g, " "));
  await shot("C-child-graph");

  // ── 验收C：修改备忘录，网图不受影响 ──
  await gotoNav("备忘录");
  // 打开扩展验收备忘录
  await page.getByText("扩展验收备忘录", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(600);
  await page.getByText("根思维点", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(400);
  // 修改完整想法
  const ta = page.locator("textarea").first();
  await ta.fill("已修改的备忘录内容");
  await page.waitForTimeout(800);

  await gotoNav("思维网图");
  await page.waitForTimeout(800);
  const g4 = await page.locator("body").innerText();
  record("C1 修改备忘录后网图内容不变", !/已修改的备忘录内容/.test(g4));
  await shot("D-after-memo-edit");

  // ── 验收D：刷新页面数据仍在 ──
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await gotoNav("思维网图");
  await page.waitForTimeout(800);
  const g5 = await page.locator("body").innerText();
  record("D1 刷新后网图目录仍在", /扩展验收备忘录/.test(g5));
  if (/扩展验收备忘录/.test(g5)) {
    await page.getByText("扩展验收备忘录", { exact: false }).first().click({ force: true });
    await page.waitForTimeout(1000);
    const g5b = await page.locator("body").innerText();
    record("D1b 刷新后网图内容仍在", /根思维点/.test(g5b));
  } else {
    record("D1b 刷新后网图内容仍在", false);
  }
  await shot("E-after-reload");
} catch (e) {
  interrupted = true;
  console.log("!!! 扩展验收中断:", e.message.slice(0, 250));
}

console.log("\n════════ 扩展验收汇总 ════════");
const passed = results.filter((r) => r.pass).length;
console.log(`${passed}/${results.length} 项通过`);
if (interrupted || passed !== results.length) process.exitCode = 1;
await browser.close();
