// PotatoFlow 最终补测：附件删除独立性 + 多思维点分别生成网图
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures");

const BASE = "http://127.0.0.1:3001";
const results = [];
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
  // SVG transform 坐标下 mouse.click 会错位，用 locator.click(force) 直接触发 onPointerDown
  let loc = page.locator("svg g[class*=logicNode]:has(circle[class*=logicNodeHitbox])").first();
  if (!(await loc.count())) loc = page.locator("svg g[class*=logicNode]").first();
  if (!(await loc.count())) loc = page.locator("svg g").filter({ has: page.locator("circle") }).first();
  await loc.click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
  return (await loc.count()) > 0;
}

try {
  // 准备：备忘录 + 清单 + 两个思维点（都带附件）
  await gotoNav("备忘录");
  await clickBtn(/新建备忘录/);
  await page.locator('[role="dialog"] input').first().fill("终验收备忘录");
  await page.waitForTimeout(300);
  await clickBtn(/创建备忘录/);
  await page.waitForTimeout(800);
  // 思维点1（内联输入框，回车提交）
  await clickBtn(/添加想法/);
  await page.waitForTimeout(400);
  await page.locator('textarea[placeholder*="回车直接添加"]').first().fill("终点一 想法内容一");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  // 思维点2
  await clickBtn(/添加想法/);
  await page.waitForTimeout(400);
  await page.locator('textarea[placeholder*="回车直接添加"]').first().fill("终点二 想法内容二");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);

  // 给思维点1 加附件
  await page.getByText("想法内容一", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.locator('input[accept=".pdf,.docx,.txt,.md"]').first().setInputFiles(path.join(FIX, "test-note.txt"), { force: true });
  await page.waitForTimeout(1000);
  await page.locator('input[accept="image/*"]').first().setInputFiles(path.join(FIX, "test-img.png"), { force: true });
  await page.waitForTimeout(1000);
  const hasAtt = await page.locator("body").innerText();
  record("1 终点一已带附件", /test-note/.test(hasAtt));

  // 生成整篇备忘录网图（中间顶部入口）
  await page.getByRole("button", { name: /生成独立网图|生成整篇网图/ }).first().click({ force: true });
  await page.waitForTimeout(1500);
  const bodyGen = await page.locator("body").innerText();
  record("2 生成按钮变'进入对应网图'", /进入对应网图/.test(bodyGen));

  // 网图目录出现 1 张整篇网图
  await gotoNav("思维网图");
  await page.waitForTimeout(800);
  const g1 = await page.locator("body").innerText();
  record("3 网图目录出现整篇网图", /终验收备忘录/.test(g1));
  await page.screenshot({ path: "G:\\AI\\Hermes\\work\\fin-1graph.png" });

  // 打开网图（遍历卡片找含备忘录名的）
  const cards = page.locator("[class*='logicPageCard']");
  let opened = false;
  for (let i = 0; i < await cards.count(); i++) {
    const cardText = await cards.nth(i).innerText();
    if (cardText.includes("终验收备忘录")) {
      await cards.nth(i).locator("button").first().click({ force: true });
      opened = true;
      break;
    }
  }
  if (!opened) {
    await page.getByText("终验收备忘录", { exact: false }).first().click({ force: true });
  }
  await page.waitForTimeout(1200);
  const gOpen = await page.locator("body").innerText();
  // 想法 label 自动截断为 6 字：断言截断后的 label（终点一 想法/终点二 想法）
  record("4 网图含两个想法", /想法一|想法内容|终点一/.test(gOpen) && /想法二|终点二/.test(gOpen));
  // 遍历选中节点直到详情出现附件（locator.click force 避免 SVG 坐标错位；重试多次）
  let foundFile = false;
  for (let attempt = 0; attempt < 3 && !foundFile; attempt++) {
    const realNodes = page.locator("svg g[class*=logicNode]:has(circle[class*=logicNodeHitbox])");
    const nodeCount = await realNodes.count();
    for (let ni = 0; ni < nodeCount && !foundFile; ni++) {
      await realNodes.nth(ni).click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
      const detailText = await page.locator("body").innerText();
      foundFile = /test-note/.test(detailText);
      if (foundFile) break;
    }
    if (!foundFile) await page.waitForTimeout(1200);
  }
  record("5 网图附件已复制", foundFile);

  // ── 验收11：删除备忘录附件 → 网图附件保留 ──
  await gotoNav("备忘录");
  await dismissOverlays();
  await page.getByText("终验收备忘录", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(600);
  await page.getByText("想法内容一", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(500);
  // 删除附件（点文件按钮旁的 × 移除按钮）
  const removeFileBtn = page.locator('button[aria-label^="移除"]').first();
  const rmVisible = await removeFileBtn.isVisible().catch(() => false);
  if (rmVisible) {
    await removeFileBtn.click({ force: true });
    await page.waitForTimeout(800);
  }
  const memoAfterDel = await page.locator("body").innerText();
  record("6 备忘录附件已删除", !/test-note/.test(memoAfterDel));

  // 回网图确认附件还在
  await gotoNav("思维网图");
  await page.waitForTimeout(800);
  await page.getByText("终点一", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(1000);
  await selectCanvasNode();
  const gAfter = await page.locator("body").innerText();
  record("7 删备忘录附件后网图附件保留", /test-note/.test(gAfter));
  await page.screenshot({ path: "G:\\AI\\Hermes\\work\\fin-attachment-kept.png" });
} catch (e) {
  console.log("!!! 终验收中断:", e.message.slice(0, 250));
}

console.log("\n════════ 终验收汇总 ════════");
const passed = results.filter((r) => r.pass).length;
console.log(`${passed}/${results.length} 项通过`);
await browser.close();
