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
- 导入前变更预览、稳定 ID 合并、修订号冲突检查和显式删除保护
- 完全相同内容幂等跳过、旧任务默认保留、任务定义历史和导入前快照
- 今日、日历、项目和问题四个执行视图
- 浏览器本地数据导出
- 建档时确认源文件关联方式，导入时支持全部任务共用或按任务分别选择本地文件
- 项目原文件索引与任务相关文件快捷查看
- 项目内上传文件时可选择全部任务共用或指定任务，已上传文件也能重新关联

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

`v0.6.1`：修复当天任务切换时详情抽屉保留旧滚动位置、导致源文件区域看起来消失的问题；打开当天任务会回到顶部，并直接显示关联源文件数量。

`v0.6.0`：新增任务级备注。建档问答会逐项确认是否需要备注，JSON 可导入、合并更新和导出备注；任务详情、项目编辑与自定义任务均可后续手动维护。

`v0.5.1`：补全项目内文件上传后的任务关联与重新关联；保留源文件建档、导入关联、项目文件索引与任务级资料查看。

下一阶段：Cloudflare Worker API、D1 数据库和 Skill 远程适配器。

## License

[MIT](LICENSE)
