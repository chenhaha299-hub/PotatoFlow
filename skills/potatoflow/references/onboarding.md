# New-user onboarding

Use this only for a blank installation or a genuinely new project. The user should never need to
write JSON manually.

## Entry prompts

Start this flow when the user says something equivalent to:

- “帮我创建一个 PotatoFlow 项目”
- “把这份文档整理成 PotatoFlow 任务”
- “先问我问题，再生成可以导入的 JSON”

If the current surface cannot load or recognize `$potatoflow`, stop before interviewing the user.
Explain that PotatoFlow Skill must be installed first and that Codex may need to be restarted or a
new task opened after installation. Do not silently imitate the workflow as an ordinary response.
This check is part of the copyable onboarding prompt in the web app; do not remove it when adapting
the prompt for a new user.

After confirming that the Skill is available, ask the user to choose one onboarding mode before
starting the interview:

```text
欢迎使用 PotatoFlow。在创建项目之前，请先选择建档方式：

A｜对话构思
适合只有初步想法、仍在思考方向的用户。AI 会逐步提问，帮助明确目标、分析可行性、整理项目结构并制定任务。

B｜直接整理
适合已经有明确想法、现成文字或项目文档的用户。AI 会读取已有信息，只询问关键缺失内容，再整理成任务。

C｜帮忙判断
AI 会先简单了解用户目前掌握的信息，再推荐更适合的建档方式，最终由用户确认。

请回复：A、B 或 C。
```

- For A, guide the user through a short conversation and help shape the project.
- For B, extract the supplied text or documents first and ask only for material gaps.
- For C, ask briefly what information already exists, recommend A or B, and let the user confirm.

Never describe the options in first person as if the prompt author were the user. Describe the
user and the AI in neutral third-person language.

## Guided interview

Ask in short rounds, but do not turn every missing field into a separate round. Reuse all facts the
user already supplied. Group related questions into one concise message, infer obvious structure,
and ask only when the missing answer materially affects the project or schedule.

For publishing or other time-sensitive work, ask for the whole schedule at once:

```text
请说明任务计划在什么时候发布；如有多项任务，请分别填写各项任务的预计发布时间。
若暂时无法确定，可标记为“以后再安排”。
```

Do not ask the release date separately for every item. When one item is clearly more time-sensitive,
state the recommendation in the same scheduling question instead of adding another confirmation round.

### Round 1 — Define the outcome

Ask:

1. What project do you want to complete?
2. What observable result would make you consider it successful?
3. Is there a deadline or important milestone?

### Round 2 — Understand the starting point

Ask:

1. What already exists: documents, assets, inventory, commitments, prior work, or tools?
2. Does the project have Word, PDF, Markdown, or text source files that should stay available while
   tasks are being executed?
3. If source files exist, should every task share the same file set, or should individual tasks
   point to different files? For per-task files, record which file purpose belongs to which task.
4. What important constraints apply: time, budget, confidentiality, dependencies, or unavailable
   resources?
5. Is anything explicitly out of scope?

### Round 3 — Build a realistic schedule

Ask:

1. Which days and roughly how much time can you spend?
2. What timezone should dates follow?
3. Are any tasks recurring: every day, weekdays, weekends, or a defined date range?
4. Which categories should be used: daily, work, fun, or other?

Skip a question when its answer is already clear. If the user does not know an optional answer,
leave it blank or label it as a proposed assumption.

### Round 4 — Confirm task notes

Before confirming notes, organize the plan as milestones containing checkable tasks. A milestone is
a non-checkable stage heading. A task is the only completion unit. Put the implementation process
inside `steps` as implementation guidance; do not turn every operation into another task. The app
lets the user check those steps and attach optional notes during execution.

After the first task list is drafted, go through every proposed task and ask whether it needs a
note. A note is optional task-specific context such as a reminder, caution, handoff detail, or
condition that should remain visible during execution. Present all tasks in one concise list so
the user can answer efficiently, for example:

```text
1. 任务名称 — 备注：无 / 请补充
2. 任务名称 — 备注：无 / 请补充
```

Record only what the user supplies. “不需要” means the task's `note` stays blank; never invent a
note merely to fill the field.

## Generate the project brief

Before generating JSON, show a compact confirmation brief:

```text
项目名称：
最终目标：
成功标准：
现有资源：
限制条件：
不包含内容：
截止日期：
可用时间：
任务类别：
周期任务：
源文件：无 / 全部任务共用 / 每个任务分别关联
源文件用途与任务对应：
待确认假设：

建议阶段：
1. 阶段标题
   - 可完成子任务
   - 可完成子任务
2. 阶段标题
   - 可完成子任务

首批准备生成的任务：
1. [阶段] [日期/周期] [预计时长] [任务结果]｜备注：无 / 用户提供内容
   执行步骤：可逐项勾选，可按需添加步骤备注
2. [阶段] [日期/周期] [预计时长] [任务结果]｜备注：无 / 用户提供内容
   执行步骤：可逐项勾选，可按需添加步骤备注
```

Ask the user to correct the brief, or reply “确认生成”. Do not expose schema details at this stage.

## Generate the import payload

After confirmation:

1. Convert the confirmed brief into the contract in `data-contract.md`.
2. Detail the near-term tasks; keep distant tasks at milestone level unless the user requests a
   complete schedule.
3. Validate the payload with `scripts/potatoflow.py validate-plan`.
4. When there are source files, include `project.source_file_mode`,
   `project.source_file_requirements`, and each task's `source_file_refs`. JSON records only file
   roles and relationships, never local file bytes or private absolute paths.
5. Include each confirmed task note in `task.note`; omit it or use an empty string when the user
   said no note is needed.
6. Return one copyable JSON code block.
7. State the task count, date range, assumptions, source-file mode, and recommended import mode.
8. Tell the user to choose “新建项目” for a new plan or “合并更新已有项目” for a revision. The web
   app will ask the user to choose the actual local files after it checks the JSON.

## Privacy and generalization rules

- Do not copy values from examples or from the Skill author.
- Do not assume a business type, product, creator identity, inventory count, platform, account,
  file path, or location.
- Do not include passwords, tokens, private contacts, customer-confidential data, or unrelated
  projects.
- Use neutral temporary labels only in the confirmation brief; replace them before producing JSON.
- If the user only wants a rough plan, keep dates tentative.
- Before generating many tasks or changing many dates, show the proposed milestones and workload.
