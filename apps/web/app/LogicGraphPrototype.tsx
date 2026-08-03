"use client";

import {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./potatoflow.module.css";

type IdeaNode = {
  id: string;
  label: string;
  content: string;
  x: number;
  y: number;
  childPageId?: string;
  sourceFiles?: IdeaSourceFile[];
  fresh?: boolean;
};

type IdeaSourceFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
};

type IdeaEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  directed?: boolean;
  fresh?: boolean;
};

type GraphPage = {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  parentPageId?: string;
  parentNodeId?: string;
  nodes: IdeaNode[];
  edges: IdeaEdge[];
  updatedLabel: string;
};

type Viewport = { x: number; y: number; scale: number };

const DEMO_PAGES: GraphPage[] = [
  {
    id: "inbox",
    title: "灵感收集",
    level: 1,
    nodes: [],
    edges: [],
    updatedLabel: "等待第一个想法",
  },
  {
    id: "demo",
    title: "交互演示",
    level: 1,
    updatedLabel: "6 个圆点 · 4 条连接",
    nodes: [
      { id: "n1", label: "灵感捕捉", content: "随手记录突然出现的想法。", x: 180, y: 380 },
      { id: "n2", label: "内容方向", content: "从多个想法中逐渐发现共同方向。", x: 390, y: 300 },
      { id: "n3", label: "工具教程", content: "可以继续讨论的知识内容方向。", x: 620, y: 190 },
      { id: "n4", label: "表达方法", content: "尝试找到更准确的表达方式。", x: 650, y: 430, childPageId: "demo-expression" },
      { id: "n5", label: "案例分享", content: "用真实实践补充抽象想法。", x: 890, y: 330 },
      { id: "n6", label: "持续更新", content: "把成熟想法转为后续计划。", x: 1010, y: 170 },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", label: "延伸" },
      { id: "e3", source: "n2", target: "n4" },
      { id: "e4", source: "n4", target: "n5", label: "形成" },
    ],
  },
  {
    id: "demo-expression",
    title: "表达方法",
    level: 2,
    parentPageId: "demo",
    parentNodeId: "n4",
    updatedLabel: "4 个猜想 · 3 条连接",
    nodes: [
      { id: "c1", label: "动效术语", content: "收集常见的界面动效术语。", x: 250, y: 360 },
      { id: "c2", label: "描述困难", content: "不知道如何把脑中的动效准确说出来。", x: 500, y: 260, childPageId: "demo-description" },
      { id: "c3", label: "案例拆解", content: "从真实案例中拆解表达方式。", x: 750, y: 390 },
      { id: "c4", label: "提示结构", content: "整理可以复用的描述顺序。", x: 920, y: 220 },
    ],
    edges: [
      { id: "ce1", source: "c1", target: "c2" },
      { id: "ce2", source: "c2", target: "c3", label: "验证" },
      { id: "ce3", source: "c3", target: "c4", label: "提炼" },
    ],
  },
  {
    id: "demo-description",
    title: "描述困难",
    level: 3,
    parentPageId: "demo-expression",
    parentNodeId: "c2",
    updatedLabel: "3 个具体猜想 · 最深层级",
    nodes: [
      { id: "g1", label: "缓动曲线", content: "动效速度变化可能需要用缓动曲线描述。", x: 310, y: 330 },
      { id: "g2", label: "运动路径", content: "除了起点终点，还需要说明运动经过哪里。", x: 610, y: 230 },
      { id: "g3", label: "反馈节奏", content: "尝试记录点击、等待和反馈之间的节奏。", x: 820, y: 410 },
    ],
    edges: [
      { id: "ge1", source: "g1", target: "g2" },
      { id: "ge2", source: "g2", target: "g3" },
    ],
  },
];

function compactLabel(value: string) {
  const compact = value.replace(/[\s，。！？、；：,.!?;:]/g, "");
  return Array.from(compact).slice(0, 6).join("") || "新想法";
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function LogicGraphPrototype() {
  const [pages, setPages] = useState<GraphPage[]>(DEMO_PAGES);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 40, y: 25, scale: 0.82 });
  const [composerOpen, setComposerOpen] = useState(false);
  const [ideaContent, setIdeaContent] = useState("");
  const [ideaLabel, setIdeaLabel] = useState("");
  const [labelEdited, setLabelEdited] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [transitionState, setTransitionState] = useState<"deeper" | "back" | "arrive" | null>(null);
  const [pageViewports, setPageViewports] = useState<Record<string, Viewport>>({});

  const canvasRef = useRef<HTMLDivElement>(null);
  const pointerMap = useRef(new Map<number, { x: number; y: number }>());
  const panState = useRef<
    | { pointerId: number; startX: number; startY: number; origin: Viewport }
    | null
  >(null);
  const pinchState = useRef<
    | {
        distance: number;
        scale: number;
        graphX: number;
        graphY: number;
      }
    | null
  >(null);
  const dragState = useRef<
    | {
        pointerId: number;
        nodeId: string;
        startX: number;
        startY: number;
        originX: number;
        originY: number;
        moved: boolean;
      }
    | null
  >(null);

  const activePage = pages.find((page) => page.id === activePageId) || null;
  const selectedNode = activePage?.nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedEdge = activePage?.edges.find((edge) => edge.id === selectedEdgeId) || null;
  const selectedChildPage = selectedNode?.childPageId
    ? pages.find((page) => page.id === selectedNode.childPageId) || null
    : null;

  const topLevelPages = useMemo(() => pages.filter((page) => page.level === 1), [pages]);

  const pageStats = useMemo(
    () =>
      topLevelPages.map((page) => ({
        ...page,
        stat:
          page.nodes.length === 0
            ? "空白网图"
            : `${page.nodes.length} 个圆点 · ${page.edges.length} 条连接`,
      })),
    [topLevelPages],
  );

  const pagePath = (() => {
    if (!activePage) return [];
    const path: GraphPage[] = [];
    let cursor: GraphPage | undefined = activePage;
    while (cursor) {
      path.unshift(cursor);
      cursor = cursor.parentPageId
        ? pages.find((page) => page.id === cursor?.parentPageId)
        : undefined;
    }
    return path;
  })();

  const orderedPages = useMemo(() => {
    const result: Array<{ page: GraphPage; depth: number }> = [];
    const append = (page: GraphPage, depth: number) => {
      result.push({ page, depth });
      pages
        .filter((candidate) => candidate.parentPageId === page.id)
        .forEach((child) => append(child, depth + 1));
    };
    topLevelPages.forEach((page) => append(page, 0));
    return result;
  }, [pages, topLevelPages]);

  const summaryRows = useMemo(
    () =>
      topLevelPages.map((root) => {
        const related: GraphPage[] = [];
        const visit = (page: GraphPage) => {
          related.push(page);
          pages.filter((candidate) => candidate.parentPageId === page.id).forEach(visit);
        };
        visit(root);
        const nodes = related.flatMap((page) => page.nodes);
        return {
          root,
          pageCount: related.length,
          nodeCount: nodes.length,
          edgeCount: related.reduce((total, page) => total + page.edges.length, 0),
          maxLevel: Math.max(...related.map((page) => page.level)),
          keywords: nodes.slice(0, 8).map((node) => node.label),
        };
      }),
    [pages, topLevelPages],
  );

  const summaryTotals = useMemo(
    () => ({
      pages: pages.length,
      nodes: pages.reduce((total, page) => total + page.nodes.length, 0),
      edges: pages.reduce((total, page) => total + page.edges.length, 0),
      deepGraphs: pages.filter((page) => page.level > 1).length,
    }),
    [pages],
  );

  function updateActivePage(updater: (page: GraphPage) => GraphPage) {
    if (!activePageId) return;
    setPages((current) =>
      current.map((page) => (page.id === activePageId ? updater(page) : page)),
    );
  }

  function openPage(pageId: string) {
    if (activePageId) {
      setPageViewports((current) => ({ ...current, [activePageId]: viewport }));
    }
    setActivePageId(pageId);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectSourceId(null);
    setViewport(pageViewports[pageId] || { x: 40, y: 25, scale: 0.82 });
  }

  function openPageWithMotion(pageId: string, direction: "deeper" | "back") {
    setTransitionState(direction);
    window.setTimeout(() => {
      openPage(pageId);
      setTransitionState("arrive");
      window.setTimeout(() => setTransitionState(null), 260);
    }, 180);
  }

  function backToNotebook() {
    if (activePageId) {
      setPageViewports((current) => ({ ...current, [activePageId]: viewport }));
    }
    setActivePageId(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectSourceId(null);
  }

  function createPage() {
    const title = newPageTitle.trim();
    if (!title) return;
    const id = uid("page");
    setPages((current) => [
      ...current,
      { id, title, level: 1, nodes: [], edges: [], updatedLabel: "刚刚创建" },
    ]);
    setNewPageTitle("");
    setNewPageOpen(false);
    openPage(id);
  }

  function createOrOpenChildGraph() {
    if (!activePage || !selectedNode) return;
    if (selectedChildPage) {
      openPageWithMotion(selectedChildPage.id, "deeper");
      return;
    }
    if (activePage.level >= 3) return;
    const pageId = uid("subgraph");
    const childPage: GraphPage = {
      id: pageId,
      title: selectedNode.label,
      level: (activePage.level + 1) as 2 | 3,
      parentPageId: activePage.id,
      parentNodeId: selectedNode.id,
      nodes: [],
      edges: [],
      updatedLabel: "等待第一个猜想",
    };
    setPages((current) =>
      current
        .map((page) =>
          page.id === activePage.id
            ? {
                ...page,
                nodes: page.nodes.map((node) =>
                  node.id === selectedNode.id ? { ...node, childPageId: pageId } : node,
                ),
                updatedLabel: "刚刚更新",
              }
            : page,
        )
        .concat(childPage),
    );
    window.setTimeout(() => openPageWithMotion(pageId, "deeper"), 0);
  }

  function goBackOneLevel() {
    if (!activePage?.parentPageId) {
      backToNotebook();
      return;
    }
    openPageWithMotion(activePage.parentPageId, "back");
  }

  function descendantPageIds(rootId: string) {
    const ids = new Set<string>();
    const visit = (pageId: string) => {
      if (ids.has(pageId)) return;
      ids.add(pageId);
      pages.filter((page) => page.parentPageId === pageId).forEach((page) => visit(page.id));
    };
    visit(rootId);
    return ids;
  }

  function openComposer() {
    setIdeaContent("");
    setIdeaLabel("");
    setLabelEdited(false);
    setComposerOpen(true);
  }

  function createIdea() {
    if (!activePage || !ideaContent.trim()) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const centerX = rect ? (rect.width / 2 - viewport.x) / viewport.scale : 520;
    const centerY = rect ? (rect.height / 2 - viewport.y) / viewport.scale : 340;
    const offset = activePage.nodes.length % 5;
    const node: IdeaNode = {
      id: uid("node"),
      label: compactLabel(ideaLabel || ideaContent),
      content: ideaContent.trim(),
      x: centerX + offset * 28,
      y: centerY + offset * 22,
      fresh: true,
    };
    updateActivePage((page) => ({
      ...page,
      nodes: [...page.nodes, node],
      updatedLabel: "刚刚更新",
    }));
    setComposerOpen(false);
    setSelectedNodeId(node.id);
    window.setTimeout(() => {
      updateActivePage((page) => ({
        ...page,
        nodes: page.nodes.map((item) =>
          item.id === node.id ? { ...item, fresh: false } : item,
        ),
      }));
    }, 360);
  }

  function selectNode(nodeId: string) {
    if (!activePage) return;
    if (connectSourceId && connectSourceId !== nodeId) {
      const exists = activePage.edges.some(
        (edge) =>
          (edge.source === connectSourceId && edge.target === nodeId) ||
          (edge.source === nodeId && edge.target === connectSourceId),
      );
      if (!exists) {
        const edge: IdeaEdge = {
          id: uid("edge"),
          source: connectSourceId,
          target: nodeId,
          fresh: true,
        };
        updateActivePage((page) => ({
          ...page,
          edges: [...page.edges, edge],
          updatedLabel: "刚刚更新",
        }));
        window.setTimeout(() => {
          updateActivePage((page) => ({
            ...page,
            edges: page.edges.map((item) =>
              item.id === edge.id ? { ...item, fresh: false } : item,
            ),
          }));
        }, 420);
      }
      setConnectSourceId(null);
      setSelectedNodeId(nodeId);
      return;
    }
    setSelectedEdgeId(null);
    setSelectedNodeId(nodeId);
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    const childIds = selectedNode?.childPageId
      ? descendantPageIds(selectedNode.childPageId)
      : new Set<string>();
    if (
      childIds.size > 0 &&
      !window.confirm("这个圆点包含子网图。删除后，其下所有猜想页面也会一起删除。确认继续吗？")
    ) {
      return;
    }
    if (childIds.size > 0) {
      setPages((current) => current.filter((page) => !childIds.has(page.id)));
    }
    updateActivePage((page) => ({
      ...page,
      nodes: page.nodes.filter((node) => node.id !== selectedNodeId),
      edges: page.edges.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      ),
      updatedLabel: "刚刚更新",
    }));
    setSelectedNodeId(null);
    setConnectSourceId(null);
  }

  function attachFilesToSelectedNode(fileList: FileList | null) {
    if (!selectedNodeId || !fileList?.length) return;
    const accepted = Array.from(fileList).filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      return ["pdf", "doc", "docx"].includes(extension || "");
    });
    if (!accepted.length) {
      window.alert("当前原型支持 PDF、Word（.doc/.docx）文件。");
      return;
    }
    const oversized = accepted.find((file) => file.size > 20 * 1024 * 1024);
    if (oversized) {
      window.alert(`“${oversized.name}”超过 20MB，原型阶段暂不加入。`);
      return;
    }
    updateActivePage((page) => ({
      ...page,
      nodes: page.nodes.map((node) => {
        if (node.id !== selectedNodeId) return node;
        const existing = node.sourceFiles || [];
        const additions = accepted
          .filter((file) => !existing.some((item) => item.name === file.name && item.size === file.size))
          .map((file) => ({
            id: uid("source"),
            name: file.name,
            type: file.name.split(".").pop()?.toUpperCase() || "FILE",
            size: file.size,
            url: URL.createObjectURL(file),
          }));
        return { ...node, sourceFiles: [...existing, ...additions] };
      }),
      updatedLabel: "刚刚更新",
    }));
  }

  function removeSourceFile(fileId: string) {
    if (!selectedNodeId) return;
    updateActivePage((page) => ({
      ...page,
      nodes: page.nodes.map((node) =>
        node.id === selectedNodeId
          ? { ...node, sourceFiles: (node.sourceFiles || []).filter((file) => file.id !== fileId) }
          : node,
      ),
      updatedLabel: "刚刚更新",
    }));
  }

  function updateSelectedEdge(label: string, directed: boolean) {
    if (!selectedEdgeId) return;
    updateActivePage((page) => ({
      ...page,
      edges: page.edges.map((edge) =>
        edge.id === selectedEdgeId ? { ...edge, label, directed } : edge,
      ),
      updatedLabel: "刚刚更新",
    }));
  }

  function deleteSelectedEdge() {
    if (!selectedEdgeId) return;
    updateActivePage((page) => ({
      ...page,
      edges: page.edges.filter((edge) => edge.id !== selectedEdgeId),
      updatedLabel: "刚刚更新",
    }));
    setSelectedEdgeId(null);
  }

  function graphPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    };
  }

  function beginCanvasPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerMap.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerMap.current.size === 1) {
      panState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: viewport,
      };
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    } else if (pointerMap.current.size === 2) {
      const points = Array.from(pointerMap.current.values());
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const centerX = (points[0].x + points[1].x) / 2;
      const centerY = (points[0].y + points[1].y) / 2;
      const point = graphPoint(centerX, centerY);
      pinchState.current = { distance, scale: viewport.scale, graphX: point.x, graphY: point.y };
      panState.current = null;
    }
  }

  function moveCanvasPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointerMap.current.has(event.pointerId)) return;
    pointerMap.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerMap.current.size === 2 && pinchState.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const points = Array.from(pointerMap.current.values());
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const centerX = (points[0].x + points[1].x) / 2 - rect.left;
      const centerY = (points[0].y + points[1].y) / 2 - rect.top;
      const nextScale = Math.min(1.8, Math.max(0.42, pinchState.current.scale * (distance / pinchState.current.distance)));
      setViewport({
        scale: nextScale,
        x: centerX - pinchState.current.graphX * nextScale,
        y: centerY - pinchState.current.graphY * nextScale,
      });
      return;
    }
    const pan = panState.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setViewport({
      ...pan.origin,
      x: pan.origin.x + event.clientX - pan.startX,
      y: pan.origin.y + event.clientY - pan.startY,
    });
  }

  function endCanvasPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointerMap.current.delete(event.pointerId);
    if (pointerMap.current.size < 2) pinchState.current = null;
    if (panState.current?.pointerId === event.pointerId) panState.current = null;
  }

  function zoomCanvas(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const graphX = (cursorX - viewport.x) / viewport.scale;
    const graphY = (cursorY - viewport.y) / viewport.scale;
    const nextScale = Math.min(1.8, Math.max(0.42, viewport.scale * (event.deltaY > 0 ? 0.9 : 1.1)));
    setViewport({
      scale: nextScale,
      x: cursorX - graphX * nextScale,
      y: cursorY - graphY * nextScale,
    });
  }

  function beginNodeDrag(event: ReactPointerEvent<SVGGElement>, node: IdeaNode) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
      moved: false,
    };
  }

  function moveNode(event: ReactPointerEvent<SVGGElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) / viewport.scale;
    const dy = (event.clientY - drag.startY) / viewport.scale;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    updateActivePage((page) => ({
      ...page,
      nodes: page.nodes.map((node) =>
        node.id === drag.nodeId
          ? { ...node, x: drag.originX + dx, y: drag.originY + dy }
          : node,
      ),
    }));
  }

  function endNodeDrag(event: ReactPointerEvent<SVGGElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) selectNode(drag.nodeId);
    else updateActivePage((page) => ({ ...page, updatedLabel: "刚刚更新" }));
    dragState.current = null;
  }

  if (!activePage) {
    if (summaryOpen) {
      return (
        <section className={styles.logicNotebook}>
          <header className={styles.logicSummaryHeader}>
            <div>
              <p className={styles.eyebrow}>DATA SUMMARY</p>
              <h2>数据总结系统</h2>
              <p>先用列表看清每张网图里积累了什么，再决定以后需要哪些分析能力。</p>
            </div>
            <button className={styles.quietButton} onClick={() => setSummaryOpen(false)}>← 返回网图目录</button>
          </header>

          <div className={styles.logicSummaryStats}>
            <article><span>网图页面</span><strong>{summaryTotals.pages}</strong><small>包含各级子网图</small></article>
            <article><span>想法圆点</span><strong>{summaryTotals.nodes}</strong><small>所有关键词总数</small></article>
            <article><span>想法连接</span><strong>{summaryTotals.edges}</strong><small>圆点之间的关系</small></article>
            <article><span>深入展开</span><strong>{summaryTotals.deepGraphs}</strong><small>二、三级网图数量</small></article>
          </div>

          <div className={styles.logicSummaryList}>
            {summaryRows.map((row, index) => (
              <article className={styles.logicSummaryRow} key={row.root.id}>
                <span className={styles.logicPageIndex}>{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.logicSummaryMain}>
                  <small>主网图</small>
                  <h3>{row.root.title}</h3>
                  <div className={styles.logicKeywordList}>
                    {row.keywords.length ? row.keywords.map((keyword, keywordIndex) => <span key={`${keyword}-${keywordIndex}`}>{keyword}</span>) : <em>还没有记录想法</em>}
                  </div>
                </div>
                <dl>
                  <div><dt>层级</dt><dd>{row.maxLevel} 层</dd></div>
                  <div><dt>页面</dt><dd>{row.pageCount}</dd></div>
                  <div><dt>圆点</dt><dd>{row.nodeCount}</dd></div>
                  <div><dt>连接</dt><dd>{row.edgeCount}</dd></div>
                </dl>
                <button onClick={() => { setSummaryOpen(false); openPage(row.root.id); }}>查看网图 →</button>
              </article>
            ))}
          </div>

          <div className={styles.logicSummaryFuture}>
            <strong>后续可以扩展，但现在暂不加入</strong>
            <span>主题聚类、想法活跃趋势、孤立圆点提醒、成熟想法筛选、转为 PotatoFlow 项目。</span>
          </div>
        </section>
      );
    }
    return (
      <section className={styles.logicNotebook}>
        <div className={styles.prototypeNotice}>
          <span>交互原型</span>
          <div>
            <strong>先验证手感，再接入正式数据</strong>
            <p>这里的演示内容不会进入项目或云同步，刷新网页后会恢复初始状态。</p>
          </div>
        </div>

        <header className={styles.logicNotebookHeader}>
          <div>
            <p className={styles.eyebrow}>IDEA NOTEBOOK</p>
            <h2>想法笔记本</h2>
            <p>每个目录是一张独立网图，避免所有想法挤在同一张画布。</p>
          </div>
          <div className={styles.logicNotebookActions}>
            <button className={styles.quietButton} onClick={() => setSummaryOpen(true)}>数据总结</button>
            <button className={styles.primaryButton} onClick={() => setNewPageOpen(true)}>＋ 新建页面</button>
          </div>
        </header>

        <div className={styles.logicPageGrid}>
          {pageStats.map((page, index) => (
            <button className={styles.logicPageCard} key={page.id} onClick={() => openPage(page.id)}>
              <span className={styles.logicPageIndex}>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>{page.id === "inbox" ? "快速捕捉入口" : "独立网图页面"}</small>
                <h3>{page.title}</h3>
                <p>
                  {page.stat}
                  {pages.some((candidate) => candidate.parentPageId === page.id)
                    ? ` · 含 ${pages.filter((candidate) => candidate.parentPageId === page.id).length} 个子网图`
                    : ""}
                </p>
              </div>
              <span className={styles.logicPageArrow}>→</span>
            </button>
          ))}
        </div>

        {newPageOpen && (
          <div className={styles.logicOverlay} role="presentation" onMouseDown={() => setNewPageOpen(false)}>
            <section className={styles.logicDialog} role="dialog" aria-modal="true" aria-labelledby="new-graph-page" onMouseDown={(event) => event.stopPropagation()}>
              <p className={styles.eyebrow}>NEW PAGE</p>
              <h3 id="new-graph-page">新建网图页面</h3>
              <label>
                <span>页面名称</span>
                <input value={newPageTitle} onChange={(event) => setNewPageTitle(event.target.value)} maxLength={18} placeholder="例如：内容方向" autoFocus />
              </label>
              <div className={styles.logicDialogActions}>
                <button className={styles.quietButton} onClick={() => setNewPageOpen(false)}>取消</button>
                <button className={styles.primaryButton} onClick={createPage} disabled={!newPageTitle.trim()}>创建页面</button>
              </div>
            </section>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      className={`${styles.logicGraphPrototype} ${
        activePage.level === 1
          ? styles.logicGraphLevel1
          : activePage.level === 2
            ? styles.logicGraphLevel2
            : styles.logicGraphLevel3
      }`}
    >
      <div className={styles.logicGraphToolbar}>
        <button className={styles.logicBackButton} onClick={backToNotebook}>← 目录</button>
        <div>
          <small>第 {activePage.level} 层网图</small>
          <strong>{activePage.title}</strong>
        </div>
        <label className={styles.logicPageSwitcher}>
          <span>切换网图</span>
          <select
            aria-label="切换网图"
            value={activePage.id}
            onChange={(event) => openPage(event.target.value)}
          >
            {orderedPages.map(({ page, depth }) => (
              <option key={page.id} value={page.id}>
                {`${"　".repeat(depth)}${depth ? "↳ " : ""}${page.title} · ${page.level}级`}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.logicGraphTools}>
          <button aria-label="缩小网图" onClick={() => setViewport((current) => ({ ...current, scale: Math.max(0.42, current.scale - 0.12) }))}>−</button>
          <span>{Math.round(viewport.scale * 100)}%</span>
          <button aria-label="放大网图" onClick={() => setViewport((current) => ({ ...current, scale: Math.min(1.8, current.scale + 0.12) }))}>＋</button>
          <button onClick={() => setViewport({ x: 40, y: 25, scale: 0.82 })}>复位</button>
        </div>
        <button className={styles.logicAddButton} onClick={openComposer}>＋ 想法</button>
      </div>

      <nav className={styles.logicBreadcrumb} aria-label="网图层级路径">
        <button onClick={backToNotebook}>目录</button>
        {pagePath.map((page, index) => (
          <span key={page.id}>
            <b>›</b>
            <button
              className={page.id === activePage.id ? styles.logicBreadcrumbCurrent : ""}
              onClick={() =>
                page.id !== activePage.id &&
                openPageWithMotion(page.id, index < pagePath.length - 1 ? "back" : "deeper")
              }
              disabled={page.id === activePage.id}
            >
              {page.title}
            </button>
          </span>
        ))}
        {activePage.parentPageId && (
          <button className={styles.logicLevelBack} onClick={goBackOneLevel}>返回上层</button>
        )}
      </nav>

      {connectSourceId && (
        <div className={styles.logicConnectHint}>
          <span>连接模式</span>
          再点一个圆点完成连线
          <button onClick={() => setConnectSourceId(null)}>取消</button>
        </div>
      )}

      <div
        ref={canvasRef}
        className={`${styles.logicCanvas} ${
          transitionState === "deeper"
            ? styles.logicCanvasDive
            : transitionState === "back"
              ? styles.logicCanvasBack
              : transitionState === "arrive"
                ? styles.logicCanvasArrive
                : ""
        }`}
        onPointerDown={beginCanvasPointer}
        onPointerMove={moveCanvasPointer}
        onPointerUp={endCanvasPointer}
        onPointerCancel={endCanvasPointer}
        onWheel={zoomCanvas}
      >
        {activePage.nodes.length === 0 && (
          <div className={styles.logicCanvasEmpty}>
            <span>●</span>
            <h3>{activePage.level === 1 ? "从一个关键词开始" : `展开「${activePage.title}」`}</h3>
            <p>
              {activePage.level === 3
                ? "这里是最深一层，用具体猜想把这个点说明清楚。"
                : "围绕这个词记录新的猜想，之后还可以继续向下一层展开。"}
            </p>
            <button className={styles.primaryButton} onClick={(event) => { event.stopPropagation(); openComposer(); }}>记录第一个想法</button>
          </div>
        )}
        <svg className={styles.logicSvg} aria-label={`${activePage.title}网图`}>
          <defs>
            <marker id="logic-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            {activePage.edges.map((edge) => {
              const source = activePage.nodes.find((node) => node.id === edge.source);
              const target = activePage.nodes.find((node) => node.id === edge.target);
              if (!source || !target) return null;
              const midX = (source.x + target.x) / 2;
              const midY = (source.y + target.y) / 2;
              return (
                <g
                  className={`${styles.logicEdge} ${selectedEdgeId === edge.id ? styles.logicEdgeSelected : ""} ${edge.fresh ? styles.logicEdgeFresh : ""}`}
                  key={edge.id}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedNodeId(null);
                    setSelectedEdgeId(edge.id);
                  }}
                >
                  <line className={styles.logicEdgeHitbox} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
                  <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} markerEnd={edge.directed ? "url(#logic-arrow)" : undefined} />
                  {edge.label && (
                    <g className={styles.logicEdgeLabel} transform={`translate(${midX} ${midY})`}>
                      <rect x={-30} y={-14} width={60} height={28} rx={14} />
                      <text textAnchor="middle" dominantBaseline="central">{edge.label}</text>
                    </g>
                  )}
                </g>
              );
            })}
            {activePage.nodes.map((node) => {
              const selected = selectedNodeId === node.id || connectSourceId === node.id;
              const childPage = node.childPageId
                ? pages.find((page) => page.id === node.childPageId)
                : null;
              return (
                <g
                  className={`${styles.logicNode} ${selected ? styles.logicNodeSelected : ""} ${node.fresh ? styles.logicNodeFresh : ""}`}
                  key={node.id}
                  transform={`translate(${node.x} ${node.y})`}
                  onPointerDown={(event) => beginNodeDrag(event, node)}
                  onPointerMove={moveNode}
                  onPointerUp={endNodeDrag}
                  onPointerCancel={() => { dragState.current = null; }}
                >
                  <circle className={styles.logicNodeHitbox} r="34" />
                  {childPage && <circle className={styles.logicNodeChildRing} r="28" />}
                  <circle className={styles.logicNodeRing} r="24" />
                  <circle className={styles.logicNodeDot} r="13" />
                  {childPage && (
                    <g className={styles.logicNodeChildCount} transform="translate(20 -20)">
                      <circle r="11" />
                      <text textAnchor="middle" dominantBaseline="central">{childPage.nodes.length}</text>
                    </g>
                  )}
                  <text x="0" y="43" textAnchor="middle">{node.label}</text>
                </g>
              );
            })}
          </g>
        </svg>

        {(selectedNode || selectedEdge) && (
          <aside className={styles.logicInspector} onPointerDown={(event) => event.stopPropagation()}>
            {selectedNode ? (
              <>
                <div className={styles.logicInspectorHeader}>
                  <span className={styles.logicInspectorDot} />
                  <div><small>第 {activePage.level} 层想法圆点</small><h3>{selectedNode.label}</h3></div>
                  <button aria-label="关闭想法详情" onClick={() => setSelectedNodeId(null)}>×</button>
                </div>
                <p>{selectedNode.content}</p>
                <section className={styles.logicNodeFiles}>
                  <div className={styles.logicNodeFilesHeader}>
                    <span><strong>相关源文件</strong><small>仅关联当前圆点</small></span>
                    <label>
                      ＋ 添加文件
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        multiple
                        onChange={(event) => {
                          attachFilesToSelectedNode(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {(selectedNode.sourceFiles || []).length ? (
                    <div className={styles.logicNodeFileList}>
                      {(selectedNode.sourceFiles || []).map((file) => (
                        <article key={file.id}>
                          <span>{file.type}</span>
                          <a href={file.url} target="_blank" rel="noreferrer" title={file.name}>
                            <strong>{file.name}</strong>
                            <small>{formatFileSize(file.size)}</small>
                          </a>
                          <button aria-label={`移除${file.name}`} onClick={() => removeSourceFile(file.id)}>×</button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>还没有关联资料，可添加 Word 或 PDF。</p>
                  )}
                </section>
                {activePage.level < 3 ? (
                  <button className={styles.logicChildButton} onClick={createOrOpenChildGraph}>
                    <span>
                      <small>{selectedChildPage ? `第 ${selectedChildPage.level} 层网图` : "继续展开"}</small>
                      <strong>{selectedChildPage ? `${selectedChildPage.nodes.length} 个猜想` : "为这个点建立子网图"}</strong>
                    </span>
                    <b>{selectedChildPage ? "进入 →" : "＋"}</b>
                  </button>
                ) : (
                  <div className={styles.logicDepthNote}>
                    <strong>已到第 3 层</strong>
                    <span>为避免想法无限下钻，这里保留详情与普通连线，不再创建第 4 层。</span>
                  </div>
                )}
                <div className={styles.logicInspectorActions}>
                  <button className={styles.primaryButton} onClick={() => setConnectSourceId(selectedNode.id)}>连接其他点</button>
                  <button className={styles.quietButton} onClick={deleteSelectedNode}>删除</button>
                </div>
              </>
            ) : selectedEdge ? (
              <>
                <div className={styles.logicInspectorHeader}>
                  <span className={styles.logicInspectorLine} />
                  <div><small>连接关系</small><h3>{selectedEdge.label || "普通关联"}</h3></div>
                  <button aria-label="关闭关系详情" onClick={() => setSelectedEdgeId(null)}>×</button>
                </div>
                <label>
                  <span>关系说明（选填）</span>
                  <input value={selectedEdge.label || ""} maxLength={8} placeholder="例如：延伸、导致" onChange={(event) => updateSelectedEdge(event.target.value, Boolean(selectedEdge.directed))} />
                </label>
                <label className={styles.logicDirectionToggle}>
                  <input type="checkbox" checked={Boolean(selectedEdge.directed)} onChange={(event) => updateSelectedEdge(selectedEdge.label || "", event.target.checked)} />
                  <span>显示方向箭头</span>
                </label>
                <button className={styles.logicDeleteLink} onClick={deleteSelectedEdge}>删除这条连接</button>
              </>
            ) : null}
          </aside>
        )}
      </div>

      <div className={styles.logicPrototypeFooter}>
        <span>原型模式</span>
        圆点、位置和连接暂不写入 PotatoFlow 数据。
      </div>

      {composerOpen && (
        <div className={styles.logicOverlay} role="presentation" onMouseDown={() => setComposerOpen(false)}>
          <section className={styles.logicDialog} role="dialog" aria-modal="true" aria-labelledby="new-idea-title" onMouseDown={(event) => event.stopPropagation()}>
            <p className={styles.eyebrow}>CAPTURE A DOT</p>
            <h3 id="new-idea-title">记录一个想法</h3>
            <label>
              <span>完整想法</span>
              <textarea value={ideaContent} onChange={(event) => {
                const value = event.target.value;
                setIdeaContent(value);
                if (!labelEdited) setIdeaLabel(compactLabel(value));
              }} placeholder="可以输入一句完整的话，画布上只显示精简关键词。" autoFocus />
            </label>
            <label>
              <span>圆点关键词（最多6个字）</span>
              <input value={ideaLabel} onChange={(event) => { setLabelEdited(true); setIdeaLabel(Array.from(event.target.value).slice(0, 6).join("")); }} maxLength={6} placeholder="系统会自动截取，可修改" />
            </label>
            <small>完整原文会保留在圆点详情中。</small>
            <div className={styles.logicDialogActions}>
              <button className={styles.quietButton} onClick={() => setComposerOpen(false)}>取消</button>
              <button className={styles.primaryButton} onClick={createIdea} disabled={!ideaContent.trim()}>生成圆点</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
