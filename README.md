<p align="center">
  <img src="https://img.shields.io/badge/PotatoFlow-v0.7%2B-brightgreen?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/local--first-privacy-blue?style=for-the-badge" alt="Local-first">
  <img src="https://img.shields.io/badge/Codex-Skill-orange?style=for-the-badge" alt="Codex Skill">
  <img src="https://img.shields.io/badge/mobile-ready-8A2BE2?style=for-the-badge" alt="Mobile">
</p>

<h1 align="center">🥔 PotatoFlow</h1>
<h3 align="center">把想法变成执行 · 个人项目执行系统</h3>

<p align="center">
  <strong>AI 聊完就忘？项目规划完就散？PotatoFlow 把 Codex 的讨论变成可执行的任务、日程和记录，</strong><br>
  本地优先、可选云同步，手机电脑随时接着干。
</p>

---

## 💡 为什么需要 PotatoFlow？

和 AI 讨论项目时，输出常常停在聊天记录里：计划很完整，但**没人执行、没人跟踪、没人复盘**。

**PotatoFlow 改变了这个流程。** 它让 AI 的产出真正落地：

- **Codex Skill 建档**：Skill 分轮提问（目标、成功标准、时间、资源、周期任务、源文件），整理成结构化项目 JSON——不需要你自己编写 JSON
- **网页可视化执行**：导入 JSON 后，今天/日历/项目/问题/思维网图/备忘录六个模块各司其职，勾选、记录、复盘一气呵成
- **本地优先**：数据默认只保存在当前浏览器，"上传数据仅本人可见"；登录同一 ChatGPT 账号后按你的选择跨设备同步
- **过程全保留**：任务保留最近 10 个版本、导入前自动快照、修订号冲突检查——删错、改错都能找回

---

## 🎯 使用场景

**适合谁**：单人使用、习惯和 AI 一起规划、但需要真正把计划执行下去的人。

| 场景 | 怎么用 PotatoFlow |
|------|-------------------|
| **长期项目执行**（装修、考证、健身、副业） | Codex 建档拆成阶段任务 → 今天视图每天勾选 → 问题视图记录阻碍 → 复盘 |
| **一人公司 / 内容创作** | 项目制管理选题、发布、复盘；思维网图整理内容结构；备忘录沉淀灵感 |
| **学习路线** | Skill 按里程碑生成任务 → 周期任务（每天/工作日）自动重复 → 进度自动计算 |
| **和 AI 规划完却执行不下去** | 聊天记录 → 项目 JSON → 网页执行闭环；每次调整导出再交给 Codex，不重复建档 |
| **手机电脑换着用** | 登录同一 ChatGPT 账号，选择同步方向后跨设备接着干；首次同步方向由你决定，不自动覆盖 |
| **想法碎片太多** | 备忘录工作室按层级整理（1–3 级），想法标状态、挂图片和文件，一键生成思维网图 |
| **担心数据隐私** | 不登录就完全不联网，数据只在当前浏览器；登录后也只有结构化任务数据上云，文件仍在本地 |

**不适合**：需要多人协作、复杂权限管理的团队项目（PotatoFlow 定位是单人的个人执行系统）。


---

## 🔄 核心工作流

```
🗣 在 Codex 说清目标 → 📋 Skill 分轮提问建档 → 📄 生成项目 JSON
→ 🌐 粘贴导入网页 → ✅ 每天执行勾选记录 → 🔁 导出项目再交给 Codex 更新
```

### 六大模块

| 模块 | 干什么 |
|------|--------|
| **今天** | 今日任务分组、优先级、暂停、步骤勾选、自动进度 |
| **日历** | 月历总览、日期选择、当日任务 |
| **项目** | 项目总览编辑、任务管理、源文件索引、统一标签 |
| **问题** | 执行问题记录、阻碍标记、已尝试方法、解决状态 |
| **思维网图** | 想法可视化网络：节点拖拽/连线/缩放/子层级，一键生成独立网图 |
| **备忘录工作室** | 多层级备忘录（1–3 级），想法四状态（重点/推进中/已验证/普通）、图片备注、相关文件、双击详情 |

### 导入即安全

- 导入前**变更预览**（新增/修改/不变/保留/删除统计），确认前不写入数据
- 完全相同内容幂等跳过；只有 `deleted_task_ids` 明确列出的任务才删除
- 云端每次更新前保留最近 10 个历史版本；本机保留恢复快照与离线缓存

---

## 🚀 快速开始

### 网页（Node.js 22.13+）

```bash
cd apps/web
npm install
npm run dev
```

打开浏览器，点「导入项目」→「复制建档提示词」，把提示词发给装了 Skill 的 Codex，再把它生成的 JSON 粘贴回来，点「检查变更」→「确认导入」。

### Skill（建档与复盘用）

把 `skills/potatoflow` 复制到 `~/.codex/skills/`，或让 Codex 从本仓库安装。验证：

```text
使用 $potatoflow 简单介绍你能帮我做什么，现在不要创建项目。
```

### 命令行快速验证（Python 3.10+，无第三方依赖）

```powershell
python skills/potatoflow/scripts/potatoflow.py validate-plan --input examples/sample-plan.example.json
python skills/potatoflow/scripts/potatoflow.py today --date 2026-07-28 --data .potatoflow/data.json
python -m unittest discover -s tests -v
```

---

## 🔒 隐私与安全

- 数据默认只在本机浏览器（localStorage / IndexedDB）；不登录就不上传任何内容
- 登录同步后，接口只使用服务端提供的稳定用户标识，不接收客户端自报的用户 ID
- 源码与完整 Git 历史均运行密钥扫描（`tests/test_secrets.py`），提交前请阅读 [SECURITY.md](SECURITY.md)

---

## 📚 更多

- [零基础下载与使用教程](docs/BEGINNER_GUIDE.zh-CN.md)
- [架构说明](docs/architecture.md)
- [最新发布](https://github.com/chenhaha299-hub/PotatoFlow/releases)
- 27 项 E2E 验收脚本见 `apps/web/e2e/`（冒烟/边界/状态/兼容）
