# PotatoFlow Web

PotatoFlow 的响应式执行界面。首版采用本地优先模式，项目、任务和问题保存在当前浏览器中，不调用 AI API，也不会预置任何用户项目。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

验证生产构建：

```bash
npm test
```

## 当前功能

- 空白初始化
- 导入 PotatoFlow Skill 生成的项目 JSON
- 今日任务与日期切换
- 月历任务视图
- 项目进度与任务详情
- 执行问题记录
- 本地 JSON 数据导出

浏览器数据保存在 `localStorage` 的 `potatoflow:v1` 键中。清除浏览器站点数据会删除本地记录；重要数据请先导出。

后续版本会增加可选的 Cloudflare Worker 与 D1 适配器。每位使用者部署自己的实例和数据库。
