// PotatoFlow 验收脚本 v4：getByRole 定位按钮
import { chromium } from "@playwright/test";

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
  // 只在确实有可见遮罩（弹窗）时点击关闭；绝不盲目按 Escape（会误关刚打开的弹窗）
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
  // 弹窗内/主界面按钮：不 dismiss（避免误关刚打开的弹窗）；只点可见的
  const btn = page.getByRole("button", { name: nameRe }).filter({ visible: true }).first();
  await btn.click({ force: true });
  await page.waitForTimeout(400);
}

async function shot(name) {
  const p = `G:\\AI\\Hermes\\work\\accept-${name}.png`;
  await page.screenshot({ path: p });
}

const stepInfo = [];
try {
  const navText = await page.locator("body").innerText();
  record("备忘录是左侧导航独立模块", /备忘录/.test(navText));

  await gotoNav("备忘录");
  await shot("01-memo-entry");

  // 新建备忘录
  await clickBtn(/新建备忘录/);
  await page.locator('[role="dialog"] input').first().fill("验收测试备忘录");
  await page.waitForTimeout(300);
  await clickBtn(/创建备忘录/);
  await page.waitForTimeout(1200);
  const body1 = await page.locator("body").innerText();
  record("新建备忘录成功", /验收测试备忘录/.test(body1));
  await shot("02-memo-created");

  // 无清单分组：直接创建思维点（添加想法按钮在 header 右上角）
  const body2 = await page.locator("body").innerText();
  record("备忘录无清单分组（直接平铺想法）", !/清单甲/.test(body2));

  async function addIdea(checklistTitle, content) {
    // 确保没有残留 dialog（上次失败可能留下）
    const prevDlg = page.locator('[role="dialog"]');
    if (await prevDlg.count() && await prevDlg.first().isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    // 新版：添加想法按钮在编辑器 header 右上角 → 内联输入框 → 回车提交
    const addIdeaBtn = page.getByRole("button", { name: /^＋ 添加想法$/ }).first();
    await addIdeaBtn.click({ force: true });
    await page.waitForTimeout(400);
    const inlineTa = page.locator('textarea[placeholder*="回车保存并继续"]').first();
    await inlineTa.fill(content);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    // 内联输入框自动提取标题，回车已提交
    await page.waitForTimeout(300);
  }
  const ideas = [
    ["清单甲", "思维点A1 关于咖啡豆烘焙的完整想法"],
    ["清单甲", "思维点A2 关于宠物友好座位的想法"],
    ["清单乙", "思维点B1 关于预约系统的想法"],
    ["清单乙", "思维点B2 关于会员卡的想法"],
  ];
  for (const [cl, content] of ideas) {
    try { await addIdea(cl, content); stepInfo.push("idea ok: " + content); }
    catch (e) { stepInfo.push("idea FAIL: " + content + " " + e.message.slice(0, 80)); }
  }
  const body3 = await page.locator("body").innerText();
  const ideasOk = ["思维点A1", "思维点A2", "思维点B1", "思维点B2"].every((t) => body3.includes(t));
  record("备忘录添加多个想法成功", ideasOk);
  await shot("03-memo-ideas");

  await gotoNav("思维网图");
  await shot("04-graph-clean");
  const g1 = await page.locator("body").innerText();
  const leak = ["思维点A1", "思维点A2", "思维点B1", "思维点B2", "验收测试备忘录"].filter((t) => g1.includes(t));
  record("未生成时网图不含备忘录内容", leak.length === 0, leak.length ? "泄漏:" + leak.join(",") : "干净");

  await gotoNav("备忘录");
  await dismissOverlays();
  // 切换到我们新建的备忘录（目录里可能有多个备忘录）
  const memoDirItem = page.getByText("验收测试备忘录", { exact: false }).first();
  if (await memoDirItem.isVisible().catch(() => false)) {
    await memoDirItem.click({ force: true });
    await page.waitForTimeout(600);
  }
  // 中间顶部：把本篇全部思维点生成一张网图
  const genBtn = page.getByRole("button", { name: /建立网图|生成整篇网图/ }).first();
  const genVisible = await genBtn.isVisible().catch(() => false);
  record("中间顶部出现整篇网图入口", genVisible);
  if (genVisible) {
    await genBtn.click({ force: true });
    await page.waitForTimeout(1500);
  }
  await shot("06-after-generate");

  await gotoNav("思维网图");
  await shot("07-graph-after");
  const g2 = await page.locator("body").innerText();
  record("网图目录出现整篇备忘录网图", /验收测试备忘录/.test(g2));
  const extra = ["思维点A1", "思维点A2", "思维点B1", "思维点B2"].filter((t) => g2.includes(t));
  record("网图目录不泄漏单个想法", extra.length === 0, extra.length ? "意外:" + extra.join(",") : "干净");
} catch (e) {
  console.log("!!! 脚本异常中断:", e.message.slice(0, 300));
}

console.log("\n════════ 验收汇总 ════════");
const passed = results.filter((r) => r.pass).length;
console.log(`${passed}/${results.length} 项通过`);
if (stepInfo.length) console.log("步骤日志:", stepInfo.join(" | "));
await browser.close();
