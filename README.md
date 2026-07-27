# PotatoFlow

PotatoFlow 是一个面向单人使用、可自行部署的项目执行系统。它通过 Codex Skill 把讨论和文档整理成项目结构、任务与日程，并持续记录执行问题和复盘。

当前版本实现了可运行的 Skill 核心和响应式网页。网页以空白状态启动，数据只保存在当前浏览器；Cloudflare Worker 和 D1 连接层将在后续版本加入。

## 当前能力

- 校验并导入结构化项目计划
- 按日期读取今日任务
- 读取任务的完整项目上下文
- 记录执行问题和已尝试方法
- 保存 Codex 的问题处理结果
- 更新任务状态和日期
- 汇总项目执行状态
- 通过网页导入项目 JSON
- 今日、日历、项目和问题四个执行视图
- 浏览器本地数据导出

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

运行网页：

```powershell
cd apps/web
npm install
npm run dev
```

网页首次打开时没有任何项目和任务。只有用户主动导入自己的项目 JSON 后，数据才会出现在当前浏览器中。

## 安装 Skill

把 `skills/potatoflow` 复制到个人 Codex Skills 目录，或从仓库路径安装。运行数据默认保存在当前工作目录的 `.potatoflow/data.json`，也可以通过 `--data` 或 `POTATOFLOW_DATA_FILE` 指定。

不要把运行数据、密钥、个人项目文档或客户资料提交到 GitHub。

## 项目状态

`v0.2.0`：本地优先的 Skill 核心、数据契约与响应式执行网页。

下一阶段：Cloudflare Worker API、D1 数据库和 Skill 远程适配器。

## License

[MIT](LICENSE)
