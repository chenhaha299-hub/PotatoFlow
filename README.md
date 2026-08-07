# PotatoFlow

PotatoFlow 是一个面向单人使用、可自行部署的**个人执行系统**：由 Codex Skill 把讨论和文档整理成项目结构、任务与日程，再通过本地优先的响应式网页执行、记录与复盘。数据默认只保存在当前浏览器，登录同一 ChatGPT 账号后可跨设备同步。

## 新手从这里开始

- [零基础下载与使用教程](docs/BEGINNER_GUIDE.zh-CN.md)
- 最新版本发布在 GitHub [Releases](https://github.com/chenhaha299-hub/PotatoFlow/releases)

## 当前能力

### 执行视图（底部导航六个模块）
- **今天**：按日期查看今日任务，优先级、暂停、步骤勾选与自动进度
- **日历**：月历总览、日期选择、当日任务列表
- **项目**：项目总览、编辑、撤销、任务管理、源文件索引与统一标签
- **问题**：执行问题记录、阻碍标记、已尝试方法与解决状态
- **思维网图**：把想法组织成可视化网络——节点（圆点）可拖拽、连线、缩放，节点支持状态与子层级，可生成独立网图
- **备忘录工作室**：多层级备忘录（1–3 级），想法条目支持四种状态（重点/推进中/已验证/普通）、完整想法、图片备注（0–9）、相关文件，双击查看思维点详情，可一键把整篇备忘录生成思维网图

### 建档与导入
- 校验并导入 Codex Skill 生成的项目 JSON（含修订号冲突检查、稳定 ID 合并、删除保护、导入前快照）
- 导入变更预览：新增/修改/不变/保留/删除统计，导入前不写入数据，完全相同内容幂等跳过
- 三步首次使用引导（复制建档提示词 → 回答确认规划 → 粘贴 JSON 开始执行）
- 源文件关联：全部任务共用 / 每个任务不同 / 无源文件三种方式

### 任务执行
- 阶段负责分组，子任务是唯一可勾选的执行单位；执行步骤可勾选并添加独立备注
- 任务调整保留最近 10 个定义版本；导入前自动保存最多 3 个恢复快照
- 自定义一次性、每天、工作日、周末及日期范围任务

### 同步与数据
- 登录同一 ChatGPT 账号后，通过 Cloudflare D1 同步项目、任务、进度、备注和问题记录
- 首次同步与版本冲突均由用户明确选择本机或云端数据，不自动覆盖
- 云端每次更新前保留最近 10 个历史版本；本机保留恢复快照与离线缓存
- 三种导出范围（当前任务 / 当前项目 / 全量备份）与全量备份恢复

### 质量与安全
- 桌面与移动端响应式布局
- 27 项 E2E 验收脚本（`apps/web/e2e/`），覆盖冒烟、边界、状态与兼容
- 当前文件与完整 Git 历史均运行高置信度密钥扫描（`tests/test_secrets.py`）

## 安全

提交代码前请阅读 [安全说明](SECURITY.md)，并运行：

```bash
python -m unittest tests.test_secrets -v
```

## 快速验证

需要 Python 3.10 或更高版本，不需要安装第三方运行库。

```powershell
python skills/potatoflow/scripts/potatoflow.py validate-plan --input examples/sample-plan.example.json
python skills/potatoflow/scripts/potatoflow.py import-plan --input examples/sample-plan.example.json --data .potatoflow/data.json
python skills/potatoflow/scripts/potatoflow.py today --date 2026-07-28 --data .potatoflow/data.json
```

运行测试：

```powershell
python -m unittest discover -s tests -v
```

运行网页（需要 Node.js 22.13+）：

```powershell
cd apps/web
npm install
npm run dev
```

网页首次打开时没有任何项目和任务。只有用户主动导入自己的项目 JSON 后，数据才会出现在当前浏览器中。

## 安装 Skill

把 `skills/potatoflow` 复制到个人 Codex 的 skills 目录（或让 Codex 从本仓库安装）。Skill 负责建档提问、生成项目 JSON 与执行复盘，网页负责可视化执行。
