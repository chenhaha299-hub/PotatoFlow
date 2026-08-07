"use client";

import { useMemo, useState } from "react";
import styles from "./potatoflow.module.css";

type PointColor = "red" | "orange" | "green" | "black";

type PreviewPoint = {
  id: string;
  title: string;
  content: string;
  color: PointColor;
  imageCount: number;
  fileCount: number;
};

type PreviewList = {
  id: string;
  title: string;
  points: PreviewPoint[];
};

type PreviewMemo = {
  id: string;
  title: string;
  description: string;
  lists: PreviewList[];
};

const COLOR_LABELS: Record<PointColor, string> = {
  red: "红色状态",
  orange: "橙色状态",
  green: "绿色状态",
  black: "黑色状态",
};

const PREVIEW_MEMOS: PreviewMemo[] = [
  {
    id: "memo-content",
    title: "内容方向整理",
    description: "围绕一个主题收集想法，再把有关联的思维点连接起来。",
    lists: [
      {
        id: "list-topics",
        title: "选题猜想",
        points: [
          { id: "point-a", title: "入门教程", content: "把复杂工具拆成普通用户能跟着完成的步骤。", color: "orange", imageCount: 2, fileCount: 1 },
          { id: "point-b", title: "动效表达", content: "整理难以用语言描述的界面动效，并用画面快速举例。", color: "red", imageCount: 4, fileCount: 0 },
          { id: "point-c", title: "过程复盘", content: "记录一次真实制作过程中的判断、失败和调整。", color: "green", imageCount: 0, fileCount: 2 },
        ],
      },
      {
        id: "list-format",
        title: "表达形式",
        points: [
          { id: "point-d", title: "口播录屏", content: "用人物口播建立信任，同时用录屏承载操作细节。", color: "black", imageCount: 1, fileCount: 0 },
          { id: "point-e", title: "快切展示", content: "用短镜头、关键词和结果画面提高信息密度。", color: "orange", imageCount: 3, fileCount: 1 },
        ],
      },
    ],
  },
  {
    id: "memo-product",
    title: "产品灵感",
    description: "另一篇备忘录拥有自己的清单、思维点和独立网图。",
    lists: [
      {
        id: "list-experience",
        title: "使用体验",
        points: [
          { id: "point-f", title: "快速记录", content: "先捕捉关键词，详细说明可以之后再补充。", color: "green", imageCount: 1, fileCount: 1 },
          { id: "point-g", title: "层级展开", content: "从一个思维点继续进入二级和三级子网图。", color: "black", imageCount: 0, fileCount: 1 },
        ],
      },
    ],
  },
];

export default function IdeaNotebookArchitecturePreview({ onClose }: { onClose: () => void }) {
  const [activeMemoId, setActiveMemoId] = useState(PREVIEW_MEMOS[0].id);
  const [view, setView] = useState<"lists" | "graph">("lists");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const activeMemo = PREVIEW_MEMOS.find((memo) => memo.id === activeMemoId) || PREVIEW_MEMOS[0];
  const points = useMemo(() => activeMemo.lists.flatMap((list) => list.points), [activeMemo]);
  const selectedPoint = points.find((point) => point.id === selectedPointId) || null;
  const attachmentTotal = points.reduce((total, point) => total + point.imageCount + point.fileCount, 0);

  function chooseMemo(memoId: string) {
    setActiveMemoId(memoId);
    setSelectedPointId(null);
    setView("lists");
  }

  return (
    <section className={styles.ideaArchitecturePreview}>
      <header className={styles.ideaArchitectureHeader}>
        <div>
          <p className={styles.eyebrow}>STRUCTURE PREVIEW</p>
          <h2>备忘录与思维点</h2>
          <p>先确认信息层级和操作方式，再接入正式数据。</p>
        </div>
        <div className={styles.ideaArchitectureHeaderActions}>
          <span>交互原型 · 不保存</span>
          <button className={styles.quietButton} onClick={onClose}>返回原页面</button>
        </div>
      </header>

      <div className={styles.ideaArchitectureLayout}>
        <aside className={styles.ideaMemoDirectory}>
          <div className={styles.ideaMemoDirectoryTitle}>
            <span>想法笔记本</span>
            <strong>{PREVIEW_MEMOS.length} 篇备忘录</strong>
          </div>
          {PREVIEW_MEMOS.map((memo, index) => {
            const memoPoints = memo.lists.flatMap((list) => list.points);
            return (
              <button
                key={memo.id}
                className={memo.id === activeMemo.id ? styles.ideaMemoActive : ""}
                onClick={() => chooseMemo(memo.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{memo.title}</strong>
                  <small>{memo.lists.length} 条清单 · {memoPoints.length} 个思维点</small>
                </div>
              </button>
            );
          })}
          <p>每篇备忘录独立保存，也分别生成自己的网图。</p>
        </aside>

        <main className={styles.ideaMemoWorkspace}>
          <div className={styles.ideaMemoHero}>
            <div>
              <span>当前备忘录</span>
              <h3>{activeMemo.title}</h3>
              <p>{activeMemo.description}</p>
            </div>
            <button type="button" onClick={() => setView("graph")}>查看独立网图 →</button>
          </div>

          <div className={styles.ideaMemoStats}>
            <article><strong>{activeMemo.lists.length}</strong><span>清单</span></article>
            <article><strong>{points.length}</strong><span>思维点</span></article>
            <article><strong>{Math.max(0, points.length - 1)}</strong><span>连接</span></article>
            <article><strong>{attachmentTotal}</strong><span>点附件</span></article>
          </div>

          <div className={styles.ideaMemoViewTabs} role="tablist" aria-label="备忘录展示方式">
            <button className={view === "lists" ? styles.ideaMemoViewActive : ""} onClick={() => setView("lists")}>清单结构</button>
            <button className={view === "graph" ? styles.ideaMemoViewActive : ""} onClick={() => setView("graph")}>独立网图</button>
          </div>

          {view === "lists" ? (
            <div className={styles.ideaListPreview}>
              {activeMemo.lists.map((list, listIndex) => (
                <section key={list.id}>
                  <header>
                    <span>清单 {String(listIndex + 1).padStart(2, "0")}</span>
                    <h4>{list.title}</h4>
                    <small>{list.points.length} 个思维点</small>
                  </header>
                  <div>
                    {list.points.map((point) => (
                      <button key={point.id} onClick={() => setSelectedPointId(point.id)}>
                        <i className={styles[`ideaPoint${point.color[0].toUpperCase()}${point.color.slice(1)}`]} />
                        <span><strong>{point.title}</strong><small>{COLOR_LABELS[point.color]}</small></span>
                        <em>{point.imageCount ? `${point.imageCount} 图` : ""}{point.imageCount && point.fileCount ? " · " : ""}{point.fileCount ? `${point.fileCount} 文件` : ""}</em>
                        <b>查看 →</b>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={styles.ideaGraphPreview}>
              <div className={styles.ideaGraphPreviewNote}>一篇备忘录 = 一张独立网图</div>
              <span className={styles.ideaGraphLineOne} />
              <span className={styles.ideaGraphLineTwo} />
              <span className={styles.ideaGraphLineThree} />
              {points.slice(0, 5).map((point, index) => (
                <button
                  key={point.id}
                  className={`${styles.ideaGraphPoint} ${styles[`ideaGraphPoint${index + 1}`]}`}
                  onClick={() => setSelectedPointId(point.id)}
                >
                  <i className={styles[`ideaPoint${point.color[0].toUpperCase()}${point.color.slice(1)}`]} />
                  <span>{point.title}</span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>

      <footer className={styles.ideaArchitectureLegend}>
        <strong>思维点状态</strong>
        {(Object.keys(COLOR_LABELS) as PointColor[]).map((color) => (
          <span key={color}><i className={styles[`ideaPoint${color[0].toUpperCase()}${color.slice(1)}`]} />{COLOR_LABELS[color]}</span>
        ))}
        <small>颜色含义沿用你的既定规则；状态只属于思维点。</small>
      </footer>

      {selectedPoint && (
        <div className={styles.ideaPointOverlay} onMouseDown={() => setSelectedPointId(null)}>
          <aside className={styles.ideaPointPanel} role="dialog" aria-modal="true" aria-label="思维点详情" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><i className={styles[`ideaPoint${selectedPoint.color[0].toUpperCase()}${selectedPoint.color.slice(1)}`]} /><span>思维点</span></div>
              <button aria-label="关闭" onClick={() => setSelectedPointId(null)}>×</button>
            </header>
            <h3>{selectedPoint.title}</h3>
            <p>{selectedPoint.content}</p>
            <section>
              <span>点状态</span>
              <strong>{COLOR_LABELS[selectedPoint.color]}</strong>
            </section>
            <section>
              <span>图片备注</span>
              <strong>{selectedPoint.imageCount} 张</strong>
              <small>图片只关联当前思维点</small>
            </section>
            <section>
              <span>相关文件</span>
              <strong>{selectedPoint.fileCount} 个</strong>
              <small>文件只关联当前思维点</small>
            </section>
            <button className={styles.ideaPointChildButton}>为这个点进入子网图 <b>→</b></button>
          </aside>
        </div>
      )}
    </section>
  );
}
