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

Use a natural conversation, not a field-by-field form. Never ask the user to fill “总项目、任务名、
执行步骤、备注” one by one. Those are the AI's output structure, not the interview questions.
Reuse everything the user already said and let each follow-up respond to the previous answer.

The conversation should gradually understand four things:

1. What the user is trying to accomplish and why it matters now.
2. What ideas, preparation, materials, progress, or commitments already exist.
3. How the user hopes to approach the work, including preferred order, pace, or working style.
4. What reminders, constraints, concerns, deadlines, or uncertainties may affect execution.

Ask in short rounds. Do not read this list aloud as a questionnaire and do not ask every item when
the answer is already available. Ask another question only when the missing answer could materially
change the task split, execution sequence, or schedule. If the user's idea is still vague, help them
clarify the direction before proposing tasks.

For publishing or other time-sensitive work, understand the schedule in one natural follow-up rather
than asking for a date on every task. If the user cannot decide, keep dates tentative or use the app's
safe defaults.

Only ask about Word, PDF, Markdown, or text source files when the user mentions existing material or
when such material is clearly central to execution. Then confirm whether the material should be shared
by all tasks or linked to particular tasks. Do not make source files a mandatory onboarding question.

After enough context is available, the AI—not the user—maps the conversation into PotatoFlow:

- `project.title`: a concise umbrella title for the whole thing the user wants to complete.
- `task.title`: outcome-oriented sub-tasks that can be completed independently.
- `task.steps`: the practical sequence for carrying out each task.
- `task.note`: only reminders, preferences, constraints, concerns, or context supplied by the user.

Do not make every small operation a task; keep small operations inside `steps`. Infer milestones and
other schema-required fields from context or use safe defaults. Do not question the user merely to
fill priority, category, estimate, acceptance criteria, or another technical field. Unknown personal
facts must remain blank or be identified as assumptions; never invent them.

## Generate the project brief

Before generating JSON, show a compact confirmation brief centered on what the user will actually
see and execute:

```text
总项目：

任务 01：
任务名：
执行步骤：
1.
2.
3.
备注：

任务 02：
任务名：
执行步骤：
1.
2.
3.
备注：

拆分说明：
任务之间的先后关系：
待确认假设：无 / 简短列出
```

Invite the user to respond naturally, for example “第二项太复杂”“把这两个任务合并” or “第三项
先做”. The user should not need to edit field values manually. Ask them to correct the brief or reply
“确认生成”. Do not expose schema details at this stage.

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
