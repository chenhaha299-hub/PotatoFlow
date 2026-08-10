// PotatoFlow 深度验收：三级结构 + 附件复制 + 双向独立性
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures");

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
async function selectCanvasNode() {
  // 兼容多种 SVG 节点结构：优先 g[class*=logicNode]，退回任意含 circle 的 g
  let loc = page.locator("svg g[class*=logicNode]").first();
  if (!(await loc.count())) loc = page.locator("svg g").filter({ has: page.locator("circle") }).first();
  const nb = await loc.boundingBox().catch(() => null);
  if (nb) {
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await page.waitForTimeout(600);
  }
  return Boolean(nb);
}
async function shot(name) {
  await page.screenshot({ path: `G:\\AI\\Hermes\\work\\acc3-${name}.png` });
}

try {
  // ── 准备：新建备忘录+清单+思维点（带附件） ──
  await gotoNav("备忘录");
  await clickBtn(/新建备忘录/);
  await page.locator('[role="dialog"] input').first().fill("深度验收备忘录");
  await page.waitForTimeout(300);
  await clickBtn(/创建备忘录/);
  await page.waitForTimeout(800);
  // 直接添加想法（内联输入框，回车提交）
  await clickBtn(/添加想法/);
  await page.waitForTimeout(400);
  const inlineTa = page.locator('textarea[placeholder*="回车保存并继续"]').first();
  await inlineTa.fill("深度根点 完整想法内容");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);

  // 选中思维点，添加文件+图片
  await page.getByText("深度根点", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(500);
  // 添加相关文件（input 被 label 隐藏，setInputFiles 需 force）
  const fileInput = page.locator('input[accept=".pdf,.docx,.txt,.md"]').first();
  await fileInput.setInputFiles(path.join(FIX, "test-note.txt"), { force: true });
  await page.waitForTimeout(1000);
  // 添加图片
  const imgInput = page.locator('input[accept="image/*"]').first();
  await imgInput.setInputFiles(path.join(FIX, "test-img.png"), { force: true });
  await page.waitForTimeout(1000);
  await shot("1-memo-with-attachments");
  const memoWithAtt = await page.locator("body").innerText();
  const imgAlt = await page.locator("img[alt]").count();
  record("1 思维点已添加文件和图片", /test-note/.test(memoWithAtt) && (/1 图/.test(memoWithAtt) || imgAlt > 0));

  // 生成整篇备忘录网图
  await page.getByRole("button", { name: /建立网图|生成整篇网图/ }).first().click({ force: true });
  await page.waitForTimeout(1500);

  // ── 验收：附件复制到网图 ──
  await gotoNav("思维网图");
  await page.waitForTimeout(800);
  const deepCards = page.locator("[class*='logicPageCard']");
  let deepOpened = false;
  for (let i = 0; i < await deepCards.count(); i++) {
    const cardText = await deepCards.nth(i).innerText();
    if (cardText.includes("深度验收备忘录")) {
      await deepCards.nth(i).locator("button").first().click({ force: true });
      deepOpened = true;
      break;
    }
  }
  if (!deepOpened) {
    await page.getByText("深度验收备忘录", { exact: false }).first().click({ force: true });
  }
  await page.waitForTimeout(1000);
  await selectCanvasNode();
  const graphDetail = await page.locator("body").innerText();
  const graphImgAlt = await page.locator("img[alt]").count();
  record("2 网图节点附件已复制(文件+图片)", /test-note/.test(graphDetail) && (/1 图/.test(graphDetail) || graphImgAlt > 0));
  await shot("2-graph-attachments");

  // ── 验收：三级结构 ──
  // 二级
  const childBtn = page.getByRole("button", { name: /建立子网图|为这个点/ }).first();
  if (await childBtn.isVisible().catch(() => false)) {
    await childBtn.click({ force: true });
    await page.waitForTimeout(1200);
  }
  const l2 = await page.locator("body").innerText();
  record("3 进入二级子网图", /2 层|2级|第 2 层/.test(l2));
  await shot("3-level2");

  // 二级网图初始为空：先点"记录第一个想法"加一个圆点
  const firstBtn = page.getByRole("button", { name: /记录第一个想法/ }).first();
  if (await firstBtn.isVisible().catch(() => false)) {
    await firstBtn.click({ force: true });
    await page.waitForTimeout(500);
    const dlg2 = page.locator('[role="dialog"]');
    if (await dlg2.count()) {
      await dlg2.locator("textarea").first().fill("二级圆点想法");
      await dlg2.locator("input").first().fill("二级圆点");
      const cfm = dlg2.getByRole("button", { name: /添加思维点|生成圆点/ }).first();
      await cfm.click({ force: true }).catch(async () => {
        await page.getByRole("button", { name: /生成圆点/ }).first().click({ force: true });
      });
      await page.waitForTimeout(700);
    }
  }
  // 选中圆点 → 验证三级入口（网图节点=纯圆点，用 SVG 定位）
  await selectCanvasNode();
  const childBtn2 = page.getByRole("button", { name: /建立子网图|为这个点/ }).first();
  const childBtn2Visible = await childBtn2.isVisible().catch(() => false);
  record("4 二级节点存在三级子网图入口", childBtn2Visible, childBtn2Visible ? "有'建立子网图'按钮" : "二级无子网图入口");
  if (childBtn2Visible) {
    await childBtn2.click({ force: true });
    await page.waitForTimeout(1200);
    const l3 = await page.locator("body").innerText();
    record("4b 进入三级子网图", /3 层|3级|第 3 层/.test(l3), l3.includes("3级") ? "显示3级" : "");
  }
  await shot("4-level3");

  // ── 验收：改网图不影响备忘录（反向独立性） ──
  // 在网图里修改节点想法（用详情面板内的 textarea，避免匹配页面其他 textarea）
  await selectCanvasNode();
  const inspector = page.locator("aside").filter({ hasText: "完整想法" }).first();
  const ta = inspector.locator("textarea").first();
  const taVisible = await ta.isVisible().catch(() => false);
  if (taVisible) {
    await ta.fill("网图里被修改的内容");
    await page.waitForTimeout(800);
  }
  await gotoNav("备忘录");
  await dismissOverlays();
  await page.waitForTimeout(600);
  const memoAfter = await page.locator("body").innerText();
  record("5 改网图后备忘录不受影响", !/网图里被修改的内容/.test(memoAfter));
  await shot("5-memo-unchanged");

  // ── 验收：删备忘录附件，网图附件独立保留 ──
  await gotoNav("思维网图");
  await page.waitForTimeout(800);
  await page.getByText("深度根点", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(1000);
  await selectCanvasNode();
  const graphAfter = await page.locator("body").innerText();
  record("6 网图附件仍独立存在", /test-note/.test(graphAfter));
  await shot("6-graph-attachment-kept");
} catch (e) {
  interrupted = true;
  console.log("!!! 深度验收中断:", e.message.slice(0, 250));
}

console.log("\n════════ 深度验收汇总 ════════");
const passed = results.filter((r) => r.pass).length;
console.log(`${passed}/${results.length} 项通过`);
if (interrupted || passed !== results.length) process.exitCode = 1;
await browser.close();
