"use client";

import {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./potatoflow.module.css";

export type IdeaStatus = "red" | "orange" | "green" | "black";

export type IdeaChecklist = {
  id: string;
  title: string;
};

export type IdeaNode = {
  id: string;
  label: string;
  content: string;
  x: number;
  y: number;
  childPageId?: string;
  memoChildPageId?: string;
  sourceFiles?: IdeaSourceFile[];
  imageNotes?: IdeaImageNote[];
  supplementaryPoints?: IdeaSupplementaryPoint[];
  status?: IdeaStatus;
  checklistId?: string;
  generatedGraphPageId?: string;
  calendarTaskId?: string;
  fresh?: boolean;
};

export type IdeaSupplementaryPoint = {
  id: string;
  text: string;
};

export type IdeaSourceFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
};

export type IdeaImageNote = IdeaSourceFile;

export type IdeaEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  directed?: boolean;
  fresh?: boolean;
};

export type GraphPage = {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  parentPageId?: string;
  parentNodeId?: string;
  nodes: IdeaNode[];
  edges: IdeaEdge[];
  checklists?: IdeaChecklist[];
  workspace?: "memo" | "graph";
  sourceMemoPageId?: string;
  sourceMemoNodeId?: string;
  memoGraphPageId?: string;
  sourceRootNodeId?: string;
  updatedLabel: string;
};

type Viewport = { x: number; y: number; scale: number };

export const INITIAL_LOGIC_GRAPH_PAGES: GraphPage[] = [
  {
    id: "inbox",
    title: "灵感收集",
    level: 1,
    workspace: "graph",
    nodes: [],
    edges: [],
    checklists: [{ id: "inbox-default", title: "灵感清单" }],
    updatedLabel: "等待第一个想法",
  },
  {
    id: "memo-inbox",
    title: "灵感收集",
    level: 1,
    workspace: "memo",
    nodes: [],
    edges: [],
    checklists: [{ id: "memo-inbox-default", title: "灵感清单" }],
    updatedLabel: "等待第一个想法",
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

const GRAPH_FILE_DB_NAME = "potatoflow-files";
const GRAPH_FILE_STORE_NAME = "source-files";

function openGraphFileDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(GRAPH_FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GRAPH_FILE_STORE_NAME)) {
        request.result.createObjectStore(GRAPH_FILE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveGraphFile(id: string, file: File) {
  const database = await openGraphFileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(GRAPH_FILE_STORE_NAME, "readwrite");
    transaction.objectStore(GRAPH_FILE_STORE_NAME).put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function readGraphFile(id: string) {
  const database = await openGraphFileDatabase();
  const file = await new Promise<Blob | undefined>((resolve, reject) => {
    const transaction = database.transaction(GRAPH_FILE_STORE_NAME, "readonly");
    const request = transaction.objectStore(GRAPH_FILE_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return file;
}

async function removeGraphFile(id: string) {
  const database = await openGraphFileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(GRAPH_FILE_STORE_NAME, "readwrite");
    transaction.objectStore(GRAPH_FILE_STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function uploadGraphFileToCloud(id: string, file: File) {
  const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "文件暂时无法上传到云端。");
  }
}

async function readGraphFileFromCloud(id: string) {
  const response = await fetch(`/api/files/${encodeURIComponent(id)}`, { cache: "no-store" });
  return response.ok ? response.blob() : undefined;
}

async function removeGraphFileFromCloud(id: string) {
  await fetch(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" });
}

type LogicGraphProps = {
  pages: GraphPage[];
  onPagesChange: (updater: (current: GraphPage[]) => GraphPage[]) => void;
  syncEnabled: boolean;
  mode?: "graph" | "memo";
  openPageId?: string | null;
  onOpenGraphPage?: (pageId: string) => void;
  calendarTasks?: Array<{
    id: string;
    title: string;
    scheduledDate: string | null;
  }>;
  onCreateCalendarTask?: (input: {
    sourcePageId: string;
    sourceNodeId: string;
    title: string;
    objective: string;
    scheduledDate: string | null;
    estimatedMinutes: number;
  }) => string;
  onOpenCalendarTask?: (taskId: string, scheduledDate: string | null) => void;
};

export default function LogicGraphPrototype({
  pages,
  onPagesChange,
  syncEnabled,
  mode = "graph",
  openPageId = null,
  onOpenGraphPage,
  calendarTasks = [],
  onCreateCalendarTask,
  onOpenCalendarTask,
}: LogicGraphProps) {
  const setPages = onPagesChange;
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 40, y: 25, scale: 0.82 });
  const [composerOpen, setComposerOpen] = useState(false);
  const [inlineIdeaOpen, setInlineIdeaOpen] = useState(false);
  const [ideaContent, setIdeaContent] = useState("");
  const [ideaLabel, setIdeaLabel] = useState("");
  const [labelEdited, setLabelEdited] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [editPageId, setEditPageId] = useState<string | null>(null);
  const [editPageTitle, setEditPageTitle] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [contentView, setContentView] = useState<"checklist" | "graph">(mode === "memo" ? "checklist" : "graph");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [checklistComposerOpen, setChecklistComposerOpen] = useState(false);
  const [ideaChecklistId, setIdeaChecklistId] = useState("");
  const [deletePageId, setDeletePageId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [transitionState, setTransitionState] = useState<"deeper" | "back" | "arrive" | null>(null);
  const [pageViewports, setPageViewports] = useState<Record<string, Viewport>>({});
  const [calendarTaskDraft, setCalendarTaskDraft] = useState<{
    nodeId: string;
    scheduleType: "once" | "backlog";
    scheduledDate: string;
    estimatedMinutes: string;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef(pages);
  const pageViewportsRef = useRef(pageViewports);
  pagesRef.current = pages;
  pageViewportsRef.current = pageViewports;
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

  useEffect(() => {
    if (!selectedNodeId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selectedNodeId]);
  const selectedEdge = activePage?.edges.find((edge) => edge.id === selectedEdgeId) || null;
  const selectedChildPage = selectedNode?.childPageId
    ? pages.find((page) => page.id === selectedNode.childPageId) || null
    : null;
  const activeChecklists = useMemo(() => {
    if (!activePage) return [];
    return activePage.checklists?.length
      ? activePage.checklists
      : [{ id: `${activePage.id}-default`, title: activePage.level === 1 ? "未分组清单" : "想法延伸" }];
  }, [activePage]);
  const selectedImageNotes = useMemo(() => selectedNode?.imageNotes || [], [selectedNode?.imageNotes]);

  useEffect(() => {
    let disposed = false;
    const objectUrls: string[] = [];
    const images = selectedImageNotes;

    async function loadImagePreviews() {
      if (!images.length) {
        setImagePreviews({});
        return;
      }
      const entries = await Promise.all(
        images.map(async (image) => {
          let blob = await readGraphFile(image.id);
          if (!blob && syncEnabled) {
            blob = await readGraphFileFromCloud(image.id);
            if (blob) {
              await saveGraphFile(image.id, new File([blob], image.name, { type: blob.type }));
            }
          }
          if (!blob) return null;
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          return [image.id, url] as const;
        }),
      );
      if (!disposed) {
        setImagePreviews(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
      }
    }

    void loadImagePreviews();
    return () => {
      disposed = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedImageNotes, syncEnabled]);

  const topLevelPages = useMemo(
    () => pages.filter((page) => {
      if (page.level !== 1) return false;
      if (mode === "memo") return page.workspace === "memo";
      return page.workspace === "graph" || !page.workspace;
    }),
    [mode, pages],
  );
  const requestedGraphPageAvailable = useMemo(
    () => Boolean(openPageId && pages.some((page) => page.id === openPageId && page.level === 1)),
    [openPageId, pages],
  );

  useEffect(() => {
    setPages((current) => {
      let changed = false;
      const next = current.map((page) => {
        if (page.workspace || page.level !== 1) return page;
        changed = true;
        return { ...page, workspace: "graph" as const };
      });
      // 不再自动补建初始页：用户删除后就删光，不强制保留"灵感收集"
      return changed ? next : current;
    });
    // Run once per workspace mount; the updater itself is supplied inline by the app shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "memo" || activePageId || !topLevelPages.length) return;
    setActivePageId(topLevelPages[0].id);
    setContentView("checklist");
  }, [activePageId, mode, topLevelPages]);

  useEffect(() => {
    if (mode !== "graph" || !openPageId || !requestedGraphPageAvailable) return;
    const page = pagesRef.current.find(
      (item) => item.id === openPageId && item.level === 1,
    );
    if (!page) return;
    setActivePageId(page.id);
    setSelectedNodeId(page.sourceRootNodeId || null);
    setSelectedEdgeId(null);
    setConnectSourceId(null);
    setContentView("graph");
    setViewport(pageViewportsRef.current[page.id] || { x: 40, y: 25, scale: 0.82 });
  }, [mode, openPageId, requestedGraphPageAvailable]);

  const memoChildPages = useMemo(
    () => {
      if (!activePage || activePage.level === 1) return [];
      return pages
        .filter((page) => page.parentPageId === activePage.id)
        .map((page) => ({
          ...page,
          stat: `${page.nodes.length} 个想法`,
        }));
    },
    [pages, activePage],
  );

  const pageStats = useMemo(
    () =>
      topLevelPages.map((page) => ({
        ...page,
        stat: mode === "memo"
          ? page.nodes.length === 0
            ? `${page.checklists?.length || 1} 份清单 · 暂无思维点`
            : `${page.checklists?.length || 1} 份清单 · ${page.nodes.length} 个思维点`
          : page.nodes.length === 0
            ? "空白网图"
            : `${page.nodes.length} 个思维点 · ${page.edges.length} 条连接`,
      })),
    [mode, topLevelPages],
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
    () => {
      const visiblePageIds = new Set<string>();
      const visit = (page: GraphPage) => {
        if (visiblePageIds.has(page.id)) return;
        visiblePageIds.add(page.id);
        pages.filter((candidate) => candidate.parentPageId === page.id).forEach(visit);
      };
      topLevelPages.forEach(visit);
      const visiblePages = pages.filter((page) => visiblePageIds.has(page.id));
      return {
        pages: visiblePages.length,
        nodes: visiblePages.reduce((total, page) => total + page.nodes.length, 0),
        edges: visiblePages.reduce((total, page) => total + page.edges.length, 0),
        deepGraphs: visiblePages.filter((page) => page.level > 1).length,
      };
    },
    [pages, topLevelPages],
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
    const page = pages.find((item) => item.id === pageId);
    setContentView(mode === "memo" && page?.level === 1 ? "checklist" : "graph");
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
      {
        id,
        title,
        level: 1,
        workspace: mode,
        nodes: [],
        edges: [],
        checklists: [{ id: `${id}-default`, title: "灵感清单" }],
        updatedLabel: "刚刚创建",
      },
    ]);
    setNewPageTitle("");
    setNewPageOpen(false);
    openPage(id);
  }

  function requestDeletePage(pageId: string) {
    setDeletePageId(pageId);
    setDeleteConfirmText("");
  }

  function beginRenamePage(pageId: string) {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;
    setEditPageId(pageId);
    setEditPageTitle(page.title);
  }

  function savePageTitle() {
    const title = editPageTitle.trim();
    if (!editPageId || !title) return;
    setPages((current) =>
      current.map((page) =>
        page.id === editPageId ? { ...page, title, updatedLabel: "刚刚更新" } : page,
      ),
    );
    setEditPageId(null);
    setEditPageTitle("");
  }

  async function confirmDeletePage() {
    if (!deletePageId || deleteConfirmText.trim() !== "确认") return;
    const deletingIds = descendantPageIds(deletePageId);
    const generatedRoots = pages.filter(
      (page) => deletingIds.has(page.id) && page.sourceMemoPageId && page.sourceMemoNodeId,
    );
    const fileIds = pages
      .filter((page) => deletingIds.has(page.id))
      .flatMap((page) => page.nodes)
      .flatMap((node) => [...(node.sourceFiles || []), ...(node.imageNotes || [])])
      .map((file) => file.id);
    setPages((current) => current
      .filter((page) => !deletingIds.has(page.id))
      .map((page) => {
        const linkedRoots = generatedRoots.filter((root) => root.sourceMemoPageId === page.id);
        if (!linkedRoots.length) return page;
        const linkedNodeIds = new Set(linkedRoots.map((root) => root.sourceMemoNodeId));
        return {
          ...page,
          nodes: page.nodes.map((node) => linkedNodeIds.has(node.id)
            ? { ...node, generatedGraphPageId: undefined }
            : node),
          updatedLabel: "刚刚更新",
        };
      }));
    setDeletePageId(null);
    setDeleteConfirmText("");
    // 如果删除的是当前打开的页，自动切到第一个剩余的一级页（或回到目录）
    if (activePageId === deletePageId) {
      const remainingTop = topLevelPages.filter((page) => !deletingIds.has(page.id));
      if (remainingTop.length) {
        setActivePageId(remainingTop[0].id);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      } else {
        setActivePageId(null);
        setContentView(mode === "memo" ? "checklist" : "graph");
      }
    }
    await Promise.allSettled(
      fileIds.flatMap((id) => [
        removeGraphFile(id),
        ...(syncEnabled ? [removeGraphFileFromCloud(id)] : []),
      ]),
    );
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
      checklists: [{ id: `${pageId}-default`, title: "想法延伸" }],
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

  async function createOrOpenMemoGraph() {
    if (mode !== "memo" || !activePage || activePage.level !== 1) return;
    if (activePage.memoGraphPageId) {
      onOpenGraphPage?.(activePage.memoGraphPageId);
      return;
    }

    const cloneAttachments = async (files: IdeaSourceFile[] | undefined, prefix: string) => {
      const copies = await Promise.all((files || []).map(async (metadata) => {
        let blob = await readGraphFile(metadata.id);
        if (!blob && syncEnabled) blob = await readGraphFileFromCloud(metadata.id);
        if (!blob) return null;
        const id = uid(prefix);
        const file = new File([blob], metadata.name, { type: blob.type || metadata.type });
        await saveGraphFile(id, file);
        if (syncEnabled) await uploadGraphFileToCloud(id, file);
        return { ...metadata, id, uploadedAt: new Date().toISOString() };
      }));
      return copies.filter((file): file is IdeaSourceFile => Boolean(file));
    };

    // 递归：把备忘录层级树（memoPage + 其 nodes + memoChildPageId 子页）克隆成网图层级树
    const buildGraphTree = async (memoPage: GraphPage, targetLevel: 1 | 2 | 3, parentNodeRef?: { pageId: string; nodeId: string }) => {
      const newPageId = uid("memo-graph");
      const clonedNodes: IdeaNode[] = [];
      const subPages: GraphPage[] = [];

      for (const node of memoPage.nodes) {
        const [copiedFiles, copiedImages] = await Promise.all([
          cloneAttachments(node.sourceFiles, "graph-file"),
          cloneAttachments(node.imageNotes, "graph-image"),
        ]);
        const newNodeId = uid("memo-root");
        // 螺旋排布：半径随数量增大，避免节点重叠
        const angle = clonedNodes.length * 2.39996; // 黄金角
        const radius = 90 + Math.floor(clonedNodes.length / 7) * 90;
        const clonedNode: IdeaNode = {
          ...node,
          id: newNodeId,
          x: 520 + Math.cos(angle) * radius,
          y: 340 + Math.sin(angle) * radius,
          childPageId: undefined,
          memoChildPageId: undefined,
          generatedGraphPageId: undefined,
          checklistId: undefined,
          sourceFiles: copiedFiles,
          imageNotes: copiedImages,
          fresh: true,
        };
        clonedNodes.push(clonedNode);

        // 有子层级的想法：递归生成下级网图页
        if (node.memoChildPageId && targetLevel < 3) {
          const childMemoPage = pages.find((page) => page.id === node.memoChildPageId);
          if (childMemoPage) {
            const child = await buildGraphTree(childMemoPage, (targetLevel + 1) as 2 | 3, { pageId: newPageId, nodeId: newNodeId });
            clonedNode.childPageId = child.rootId;
            subPages.push(...child.allPages);
          }
        }
      }

      const rootPage: GraphPage = {
        id: newPageId,
        title: memoPage.title,
        level: targetLevel,
        workspace: "graph",
        sourceMemoPageId: memoPage.id,
        sourceRootNodeId: parentNodeRef?.nodeId,
        parentPageId: parentNodeRef?.pageId,
        parentNodeId: parentNodeRef?.nodeId,
        nodes: clonedNodes,
        edges: [],
        checklists: [{ id: `${newPageId}-default`, title: "想法延伸" }],
        updatedLabel: "刚从备忘录生成",
      };
      return { rootId: newPageId, allPages: [rootPage, ...subPages] };
    };

    const { rootId, allPages } = await buildGraphTree(activePage, 1);

    setPages((current) => current
      .map((page) => page.id === activePage.id
        ? { ...page, memoGraphPageId: rootId, updatedLabel: "刚刚更新" }
        : page)
      .concat(allPages));
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
    setIdeaChecklistId(activeChecklists[0]?.id || "");
    setComposerOpen(true);
  }

  function createChecklist() {
    if (!activePage || activePage.level !== 1 || !newChecklistTitle.trim()) return;
    const checklist = { id: uid("checklist"), title: newChecklistTitle.trim() };
    updateActivePage((page) => ({
      ...page,
      checklists: [
        ...(page.checklists?.length
          ? page.checklists
          : [{ id: `${page.id}-default`, title: "未分组清单" }]),
        checklist,
      ],
      updatedLabel: "刚刚更新",
    }));
    setNewChecklistTitle("");
    setChecklistComposerOpen(false);
  }

  function createIdea(continueCreating: boolean) {
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
      supplementaryPoints: [{ id: uid("supplement"), text: "" }],
      status: "black",
      checklistId: ideaChecklistId || activeChecklists[0]?.id,
      fresh: true,
    };
    updateActivePage((page) => ({
      ...page,
      nodes: [...page.nodes, node],
      updatedLabel: "刚刚更新",
    }));
    if (!continueCreating) {
      setComposerOpen(false);
      setInlineIdeaOpen(false);
    }
    setIdeaContent("");
    setIdeaLabel("");
    setLabelEdited(false);
    window.setTimeout(() => {
      updateActivePage((page) => ({
        ...page,
        nodes: page.nodes.map((item) =>
          item.id === node.id ? { ...item, fresh: false } : item,
        ),
      }));
    }, 360);
  }

  function openCalendarTaskComposer(node: IdeaNode) {
    const now = new Date();
    const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    setCalendarTaskDraft({
      nodeId: node.id,
      scheduleType: "once",
      scheduledDate: localToday,
      estimatedMinutes: "30",
    });
  }

  function createCalendarTaskFromSelectedNode() {
    if (!activePage || !selectedNode || !calendarTaskDraft || !onCreateCalendarTask) return;
    const minutes = Number(calendarTaskDraft.estimatedMinutes);
    const taskId = onCreateCalendarTask({
      sourcePageId: activePage.id,
      sourceNodeId: selectedNode.id,
      title: selectedNode.label.trim() || compactLabel(selectedNode.content),
      objective: selectedNode.content.trim() || selectedNode.label.trim(),
      scheduledDate:
        calendarTaskDraft.scheduleType === "backlog"
          ? null
          : calendarTaskDraft.scheduledDate,
      estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 30,
    });
    updateSelectedNode({ calendarTaskId: taskId });
    setCalendarTaskDraft(null);
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
      // Finishing a connection should return the user to the canvas. On a phone,
      // keeping the target inspector open covers most of the graph and makes the
      // next node impossible to tap without an extra close action.
      setSelectedNodeId(null);
      return;
    }
    setSelectedEdgeId(null);
    setSelectedNodeId(nodeId);
  }

  function updateSelectedNode(
    fields: Partial<Pick<IdeaNode, "label" | "content" | "supplementaryPoints" | "status" | "checklistId" | "sourceFiles" | "imageNotes">>,
  ) {
    if (!selectedNodeId || !activePageId) return;
    setPages((current) =>
      current.map((page) => {
        if (page.id !== activePageId) return page;
        return {
          ...page,
          nodes: page.nodes.map((node) => {
            if (node.id !== selectedNodeId) return node;
            return { ...node, ...fields };
          }),
          updatedLabel: "刚刚更新",
        };
      }),
    );
  }

  function currentSupplementaryPoints() {
    if (!selectedNode) return [];
    return selectedNode.supplementaryPoints?.length
      ? selectedNode.supplementaryPoints
      : [{ id: `supplement-${selectedNode.id}-initial`, text: "" }];
  }

  function updateSupplementaryPoint(id: string, text: string) {
    updateSelectedNode({
      supplementaryPoints: currentSupplementaryPoints().map((item) =>
        item.id === id ? { ...item, text } : item,
      ),
    });
  }

  function addSupplementaryPoint() {
    updateSelectedNode({
      supplementaryPoints: [
        ...currentSupplementaryPoints(),
        { id: uid("supplement"), text: "" },
      ],
    });
  }

  function removeSupplementaryPoint(id: string) {
    const remaining = currentSupplementaryPoints().filter((item) => item.id !== id);
    updateSelectedNode({
      supplementaryPoints: remaining.length
        ? remaining
        : [{ id: uid("supplement"), text: "" }],
    });
  }

  async function deleteSelectedNode() {
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
    const fileIds = [selectedNode, ...pages.filter((page) => childIds.has(page.id)).flatMap((page) => page.nodes)]
      .filter((node): node is IdeaNode => Boolean(node))
      .flatMap((node) => [...(node.sourceFiles || []), ...(node.imageNotes || [])])
      .map((file) => file.id);
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
    await Promise.allSettled(
      fileIds.flatMap((id) => [
        removeGraphFile(id),
        ...(syncEnabled ? [removeGraphFileFromCloud(id)] : []),
      ]),
    );
  }

  async function attachFilesToSelectedNode(fileList: FileList | null) {
    if (!selectedNodeId || !fileList?.length) return;
    setFileError("");
    const accepted = Array.from(fileList).filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      return ["pdf", "docx", "txt", "md"].includes(extension || "");
    });
    if (!accepted.length) {
      setFileError("当前支持 PDF、DOCX、TXT 和 Markdown 文件。");
      return;
    }
    const oversized = accepted.find((file) => file.size > 20 * 1024 * 1024);
    if (oversized) {
      setFileError(`“${oversized.name}”超过 20MB，无法添加。`);
      return;
    }
    const existing = selectedNode?.sourceFiles || [];
    const uniqueFiles = accepted.filter(
      (file) => !existing.some((item) => item.name === file.name && item.size === file.size),
    );
    if (!uniqueFiles.length) return;
    try {
      setFileBusy(true);
      const additions: IdeaSourceFile[] = [];
      for (const file of uniqueFiles) {
        const metadata: IdeaSourceFile = {
          id: `source-${crypto.randomUUID()}`,
          name: file.name,
          type: file.name.split(".").pop()?.toUpperCase() || "FILE",
          size: file.size,
          uploadedAt: new Date().toISOString(),
        };
        await saveGraphFile(metadata.id, file);
        if (syncEnabled) await uploadGraphFileToCloud(metadata.id, file);
        additions.push(metadata);
      }
      updateSelectedNode({ sourceFiles: [...(selectedNode?.sourceFiles || []), ...additions] });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "文件保存失败，请重试。");
    } finally {
      setFileBusy(false);
    }
  }

  async function openSourceFile(file: IdeaSourceFile) {
    setFileError("");
    try {
      setFileBusy(true);
      let blob = await readGraphFile(file.id);
      if (!blob && syncEnabled) {
        blob = await readGraphFileFromCloud(file.id);
        if (blob) {
          await saveGraphFile(file.id, new File([blob], file.name, { type: blob.type }));
        }
      }
      if (!blob) throw new Error("没有找到文件内容，可能尚未同步到当前设备。");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "暂时无法打开文件。");
    } finally {
      setFileBusy(false);
    }
  }

  async function removeSourceFile(fileId: string) {
    if (!selectedNodeId) return;
    updateSelectedNode({
      sourceFiles: (selectedNode?.sourceFiles || []).filter((file) => file.id !== fileId),
    });
    await Promise.allSettled([
      removeGraphFile(fileId),
      ...(syncEnabled ? [removeGraphFileFromCloud(fileId)] : []),
    ]);
  }

  async function attachImagesToSelectedNode(fileList: FileList | null) {
    if (!selectedNodeId || !fileList?.length) return;
    setImageError("");
    const existing = selectedNode?.imageNotes || [];
    const remaining = 9 - existing.length;
    if (remaining <= 0) {
      setImageError("每个圆点最多添加 9 张图片备注。");
      return;
    }
    const accepted = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (!accepted.length) {
      setImageError("请选择 JPG、PNG、WebP、GIF 等图片文件。");
      return;
    }
    const oversized = accepted.find((file) => file.size > 20 * 1024 * 1024);
    if (oversized) {
      setImageError(`“${oversized.name}”超过 20MB，无法添加。`);
      return;
    }
    const uniqueFiles = accepted.filter(
      (file) => !existing.some((item) => item.name === file.name && item.size === file.size),
    );
    const selectedFiles = uniqueFiles.slice(0, remaining);
    if (!selectedFiles.length) return;
    if (uniqueFiles.length > remaining) {
      setImageError(`每个圆点最多 9 张，本次已添加前 ${remaining} 张。`);
    }
    try {
      setImageBusy(true);
      const additions: IdeaImageNote[] = [];
      for (const file of selectedFiles) {
        const metadata: IdeaImageNote = {
          id: `image-${crypto.randomUUID()}`,
          name: file.name,
          type: file.type || "image/*",
          size: file.size,
          uploadedAt: new Date().toISOString(),
        };
        await saveGraphFile(metadata.id, file);
        if (syncEnabled) await uploadGraphFileToCloud(metadata.id, file);
        additions.push(metadata);
      }
      updateSelectedNode({ imageNotes: [...(selectedNode?.imageNotes || []), ...additions] });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "图片备注保存失败，请重试。");
    } finally {
      setImageBusy(false);
    }
  }

  async function removeImageNote(imageId: string) {
    if (!selectedNodeId) return;
    updateSelectedNode({
      imageNotes: (selectedNode?.imageNotes || []).filter((image) => image.id !== imageId),
    });
    await Promise.allSettled([
      removeGraphFile(imageId),
      ...(syncEnabled ? [removeGraphFileFromCloud(imageId)] : []),
    ]);
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

  if (mode === "memo" && activePage) {
    const memoLevelClass = activePage.level === 1
      ? styles.memoStudioLevel1
      : activePage.level === 2
        ? styles.memoStudioLevel2
        : styles.memoStudioLevel3;
    return (
      <section className={`${styles.memoStudio} ${memoLevelClass}`}>
        <header className={styles.memoStudioHeader}>
          {activePage.level > 1 && <h2>{`第 ${activePage.level} 层 · ${activePage.title}`}</h2>}
          {activePage.level === 1 && (
            <button className={styles.primaryButton} onClick={() => setNewPageOpen(true)}>＋ 新建备忘录</button>
          )}
        </header>

        <div className={styles.memoStudioGrid}>
          <aside className={styles.memoStudioDirectory}>
            <strong>{activePage.level === 1 ? "备忘录目录" : "子备忘录目录"}</strong>
            <div className={styles.memoStudioSearch}>⌕　搜索</div>
            <div className={styles.memoStudioPages}>
              {(activePage.level === 1 ? pageStats : memoChildPages).map((page, index) => (
                <div
                  key={page.id}
                  className={`${styles.memoStudioPageRow} ${page.id === activePage.id ? styles.memoStudioPageActive : ""}`}
                >
                  <button className={styles.memoStudioPageMain} onClick={() => openPage(page.id)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><b>{page.title}</b><small>{page.stat}</small></div>
                  </button>
                  <button
                    className={styles.memoStudioPageDelete}
                    onClick={() => requestDeletePage(page.id)}
                    aria-label={`删除${activePage.level === 1 ? "备忘录" : "子备忘录"}${page.title}`}
                    title={`删除${activePage.level === 1 ? "备忘录" : "子备忘录"}`}
                  >×</button>
                </div>
              ))}
            </div>
          </aside>

          <main className={styles.memoStudioEditor}>
            <header>
              <div>
                <small>{activePage.level === 1 ? "当前备忘录" : `第 ${activePage.level} 层想法`}</small>
                <h3>{activePage.title}</h3>
              </div>
              <div className={styles.memoStudioEditorActions}>
                {activePage.level > 1 && (
                  <button className={styles.quietButton} onClick={goBackOneLevel}>← 返回上级</button>
                )}
                <button className={styles.quietButton} onClick={() => beginRenamePage(activePage.id)}>修改标题</button>
                {activePage.level === 1 && (
                  <button
                    className={styles.memoStudioChildAction}
                    disabled={activePage.nodes.length === 0}
                    onClick={createOrOpenMemoGraph}
                    title={activePage.nodes.length ? undefined : "请先添加至少一个思维点"}
                  >
                    {activePage.memoGraphPageId
                      ? "进入整篇网图"
                      : "建立网图"}
                  </button>
                )}
                <button
                  className={styles.primaryButton}
                  onClick={() => {
                    setIdeaChecklistId(activeChecklists[0]?.id || "");
                    setIdeaContent("");
                    setIdeaLabel("");
                    setLabelEdited(false);
                    setInlineIdeaOpen(true);
                  }}
                >＋ 添加想法</button>
              </div>
            </header>

            <div className={styles.memoStudioThoughts}>
              {inlineIdeaOpen && (
                <div className={styles.memoInlineIdea}>
                  <textarea
                    value={ideaContent}
                    onChange={(event) => {
                      const value = event.target.value;
                      setIdeaContent(value);
                      if (!labelEdited) setIdeaLabel(compactLabel(value));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        createIdea(true);
                      } else if (event.key === "Escape") {
                        setInlineIdeaOpen(false);
                      }
                    }}
                    placeholder="输入想法，回车保存并继续下一条（Shift+回车换行）"
                    autoFocus
                  />
                  <div className={styles.memoInlineIdeaActions}>
                    <span>回车保存并继续 · Esc 结束</span>
                    <button className={styles.quietButton} onClick={() => setInlineIdeaOpen(false)}>取消</button>
                    <button className={styles.primaryButton} onClick={() => createIdea(true)} disabled={!ideaContent.trim()}>添加并继续</button>
                  </div>
                </div>
              )}
              {activePage.nodes.map((node) => (
                <button
                  key={node.id}
                  className={node.id === selectedNodeId ? styles.memoStudioThoughtActive : ""}
                  onDoubleClick={() => setSelectedNodeId(node.id)}
                  title={activePage.level < 3 ? "双击查看思维点详情" : undefined}
                >
                  <i className={styles[`logicStatus${(node.status || "black")[0].toUpperCase()}${(node.status || "black").slice(1)}`]} />
                  <span><strong>{node.label}</strong><small>{node.content}</small></span>
                  <em>{(node.imageNotes || []).length} 图 · {(node.sourceFiles || []).length} 文件</em>
                </button>
              ))}
              {!activePage.nodes.length && <p className={styles.memoStudioEmpty}>这份备忘录还没有想法。</p>}
            </div>
          </main>

          <aside className={`${styles.memoStudioInspector}${selectedNode ? "" : " " + styles.memoStudioInspectorIdle}`}>
            {selectedNode ? (
              <>
                <header>
                  <div><small>思维点详情</small><h3>{selectedNode.label}</h3></div>
                  <button aria-label="关闭思维点详情" onClick={() => setSelectedNodeId(null)}>×</button>
                </header>
                <section className={styles.memoStudioStatus}>
                  <strong>状态</strong>
                  <div>
                    {([['red', '重点'], ['orange', '推进中'], ['green', '已验证'], ['black', '普通']] as Array<[IdeaStatus, string]>).map(([status, label]) => (
                      <button key={status} className={(selectedNode.status || 'black') === status ? styles.memoStudioStatusActive : ''} onClick={() => updateSelectedNode({ status })}>
                        <i className={styles[`logicStatus${status[0].toUpperCase()}${status.slice(1)}`]} />{label}
                      </button>
                    ))}
                  </div>
                </section>
                <label className={styles.memoStudioField}>
                  <span>思维点标题</span>
                  <input value={selectedNode.label} onChange={(event) => updateSelectedNode({ label: Array.from(event.target.value).slice(0, 30).join('') })} />
                </label>
                <label className={styles.memoStudioField}>
                  <span>完整想法</span>
                  <textarea value={selectedNode.content} onChange={(event) => updateSelectedNode({ content: event.target.value })} />
                </label>
                {(() => {
                  const linkedTask = selectedNode.calendarTaskId
                    ? calendarTasks.find((task) => task.id === selectedNode.calendarTaskId)
                    : undefined;
                  const draftOpen = calendarTaskDraft?.nodeId === selectedNode.id;
                  return (
                    <section className={styles.memoStudioCalendarTask}>
                      <div className={styles.memoStudioCalendarTaskHeading}>
                        <span aria-hidden="true">日</span>
                        <div>
                          <strong>安排到日历</strong>
                          <small>把这个想法变成一个可以执行的待办任务</small>
                        </div>
                      </div>
                      {linkedTask ? (
                        <div className={styles.memoStudioCalendarTaskLinked}>
                          <div>
                            <strong>已添加到任务</strong>
                            <small>{linkedTask.scheduledDate || "暂未安排日期"} · {linkedTask.title}</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenCalendarTask?.(linkedTask.id, linkedTask.scheduledDate)}
                          >查看任务 →</button>
                        </div>
                      ) : draftOpen ? (
                        <div className={styles.memoStudioCalendarTaskForm}>
                          {selectedNode.calendarTaskId && (
                            <p>原关联任务已不存在，可以重新添加。</p>
                          )}
                          <label>
                            <span>安排方式</span>
                            <select
                              value={calendarTaskDraft.scheduleType}
                              onChange={(event) => setCalendarTaskDraft((current) => current ? {
                                ...current,
                                scheduleType: event.target.value as "once" | "backlog",
                              } : current)}
                            >
                              <option value="once">安排到指定日期</option>
                              <option value="backlog">暂不安排日期</option>
                            </select>
                          </label>
                          {calendarTaskDraft.scheduleType === "once" && (
                            <label>
                              <span>日期</span>
                              <input
                                type="date"
                                value={calendarTaskDraft.scheduledDate}
                                onChange={(event) => setCalendarTaskDraft((current) => current ? {
                                  ...current,
                                  scheduledDate: event.target.value,
                                } : current)}
                              />
                            </label>
                          )}
                          <label>
                            <span>预计用时</span>
                            <select
                              value={calendarTaskDraft.estimatedMinutes}
                              onChange={(event) => setCalendarTaskDraft((current) => current ? {
                                ...current,
                                estimatedMinutes: event.target.value,
                              } : current)}
                            >
                              <option value="15">15 分钟</option>
                              <option value="30">30 分钟</option>
                              <option value="60">1 小时</option>
                              <option value="90">1.5 小时</option>
                              <option value="120">2 小时</option>
                            </select>
                          </label>
                          <div className={styles.memoStudioCalendarTaskActions}>
                            <button type="button" onClick={() => setCalendarTaskDraft(null)}>取消</button>
                            <button
                              type="button"
                              disabled={calendarTaskDraft.scheduleType === "once" && !calendarTaskDraft.scheduledDate}
                              onClick={createCalendarTaskFromSelectedNode}
                            >确认添加</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className={styles.memoStudioCalendarTaskAdd}
                          type="button"
                          disabled={!onCreateCalendarTask}
                          onClick={() => openCalendarTaskComposer(selectedNode)}
                        >＋ 添加到日历</button>
                      )}
                    </section>
                  );
                })()}
                <section className={styles.memoStudioAttachments}>
                  <div><strong>图片备注</strong><small>{(selectedNode.imageNotes || []).length}/9</small></div>
                  <label>＋ 添加图片<input type="file" accept="image/*" multiple disabled={imageBusy || (selectedNode.imageNotes || []).length >= 9} onChange={(event) => { attachImagesToSelectedNode(event.target.files); event.target.value = ''; }} /></label>
                  {!!selectedNode.imageNotes?.length && <div className={styles.memoStudioImageGrid}>{selectedNode.imageNotes.map((image, index) => (
                    <span className={styles.memoStudioImageCell} key={image.id}>
                      <button onClick={() => imagePreviews[image.id] && window.open(imagePreviews[image.id], '_blank', 'noopener,noreferrer')}>{imagePreviews[image.id] ? <img src={imagePreviews[image.id]} alt={image.name} /> : '图片'}</button>
                      <button aria-label={`删除图片备注${index + 1}`} className={styles.memoStudioImageRemove} onClick={() => removeImageNote(image.id)}>×</button>
                    </span>
                  ))}</div>}
                </section>
                <section className={styles.memoStudioAttachments}>
                  <div><strong>相关文件</strong><small>{(selectedNode.sourceFiles || []).length} 个</small></div>
                  <label>＋ 添加文件<input type="file" accept=".pdf,.docx,.txt,.md" multiple onChange={(event) => { attachFilesToSelectedNode(event.target.files); event.target.value = ''; }} /></label>
                  {selectedNode.sourceFiles?.map((file) => (
                    <span className={styles.memoStudioFileRow} key={file.id}>
                      <button className={styles.memoStudioFile} onClick={() => openSourceFile(file)}>{file.name}</button>
                      <button
                        aria-label={`移除${file.name}`}
                        className={styles.memoStudioFileRemove}
                        onClick={() => removeSourceFile(file.id)}
                      >×</button>
                    </span>
                  ))}
                </section>
                <button className={styles.memoStudioDeleteThought} onClick={deleteSelectedNode}>删除这个思维点</button>
              </>
            ) : (
              <div className={styles.memoStudioInspectorEmpty}><span>○</span><h3>选择一个思维点</h3><p>在右侧记录完整想法、状态、图片和文件；需要继续推演时，可在顶部把整篇备忘录生成网图。</p></div>
            )}
          </aside>
        </div>

        {composerOpen && (
          <div className={styles.logicOverlay} role="presentation" onMouseDown={() => setComposerOpen(false)}>
            <section className={styles.logicDialog} role="dialog" aria-modal="true" aria-labelledby="memo-new-idea" onMouseDown={(event) => event.stopPropagation()}>
              <p className={styles.eyebrow}>NEW THOUGHT</p><h3 id="memo-new-idea">记录一个思维点</h3>
              <label><span>完整想法</span><textarea value={ideaContent} onChange={(event) => { const value = event.target.value; setIdeaContent(value); if (!labelEdited) setIdeaLabel(compactLabel(value)); }} autoFocus /></label>
              <label><span>思维点标题（自动提取6字，手动最多30字符）</span><input value={ideaLabel} onChange={(event) => { setLabelEdited(true); setIdeaLabel(event.nativeEvent.isComposing ? event.target.value : Array.from(event.target.value).slice(0, 30).join('')); }} /></label>
              <div className={styles.logicDialogActions}><button className={styles.quietButton} onClick={() => setComposerOpen(false)}>取消</button><button className={styles.primaryButton} onClick={() => createIdea(false)} disabled={!ideaContent.trim()}>添加思维点</button></div>
            </section>
          </div>
        )}
        {newPageOpen && (
          <div className={styles.logicOverlay} role="presentation" onMouseDown={() => setNewPageOpen(false)}>
            <section className={styles.logicDialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <p className={styles.eyebrow}>NEW MEMO</p><h3>新建备忘录</h3>
              <label><span>备忘录名称</span><input value={newPageTitle} onChange={(event) => setNewPageTitle(event.target.value)} maxLength={30} autoFocus /></label>
              <div className={styles.logicDialogActions}><button className={styles.quietButton} onClick={() => setNewPageOpen(false)}>取消</button><button className={styles.primaryButton} onClick={createPage} disabled={!newPageTitle.trim()}>创建备忘录</button></div>
            </section>
          </div>
        )}
        {editPageId && (
          <div className={styles.logicOverlay} role="presentation" onMouseDown={() => setEditPageId(null)}>
            <section className={styles.logicDialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <p className={styles.eyebrow}>RENAME MEMO</p><h3>修改备忘录标题</h3>
              <label><span>标题名称</span><input value={editPageTitle} onChange={(event) => setEditPageTitle(event.target.value)} maxLength={30} autoFocus /></label>
              <div className={styles.logicDialogActions}><button className={styles.quietButton} onClick={() => setEditPageId(null)}>取消</button><button className={styles.primaryButton} onClick={savePageTitle} disabled={!editPageTitle.trim()}>保存标题</button></div>
            </section>
          </div>
        )}
        {deletePageId && (
          <div className={styles.logicOverlay} role="presentation" onMouseDown={() => setDeletePageId(null)}>
            <section className={styles.logicDialog} role="dialog" aria-modal="true" aria-labelledby="delete-memo-page" onMouseDown={(event) => event.stopPropagation()}>
              <p className={styles.eyebrow}>危险操作</p>
              <h3 id="delete-memo-page">删除“{pages.find((page) => page.id === deletePageId)?.title}”吗？</h3>
              <p className={styles.logicDeleteWarning}>删除后，这篇备忘录的全部想法、图片和文件都无法恢复。</p>
              <label>
                <span>请输入“确认”</span>
                <input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} placeholder="确认" autoFocus />
              </label>
              <div className={styles.logicDialogActions}>
                <button className={styles.quietButton} onClick={() => setDeletePageId(null)}>取消</button>
                <button className={styles.dangerButton} onClick={confirmDeletePage} disabled={deleteConfirmText.trim() !== "确认"}>永久删除</button>
              </div>
            </section>
          </div>
        )}
      </section>
    );
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
        <header className={styles.logicNotebookHeader}>
          <div className={styles.logicNotebookActions}>
            <button className={styles.quietButton} onClick={() => setSummaryOpen(true)}>数据总结</button>
            <button className={styles.primaryButton} onClick={() => setNewPageOpen(true)}>＋ {mode === "memo" ? "新建备忘录" : "新建网图"}</button>
          </div>
        </header>

        <div className={styles.logicPageGrid}>
          {pageStats.map((page, index) => (
            <article className={styles.logicPageCard} key={page.id}>
              <button className={styles.logicPageOpen} onClick={() => openPage(page.id)}>
                <span className={styles.logicPageIndex}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>{mode === "memo"
                    ? (page.id === "inbox" ? "快速捕捉备忘录" : "独立备忘录")
                    : (page.sourceMemoPageId ? "由备忘录思维点生成" : page.id === "inbox" ? "默认网图" : "独立网图")}</small>
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
              <button
                className={styles.logicPageRename}
                onClick={() => beginRenamePage(page.id)}
                aria-label={`修改${page.title}的标题`}
              >
                修改标题
              </button>
              <button
                className={styles.logicPageDelete}
                onClick={() => requestDeletePage(page.id)}
                aria-label={`删除${page.title}`}
              >
                删除
              </button>
            </article>
          ))}
        </div>

        {newPageOpen && (
          <div className={styles.logicOverlay} role="presentation" onMouseDown={() => setNewPageOpen(false)}>
            <section className={styles.logicDialog} role="dialog" aria-modal="true" aria-labelledby="new-graph-page" onMouseDown={(event) => event.stopPropagation()}>
              <p className={styles.eyebrow}>NEW PAGE</p>
              <h3 id="new-graph-page">新建{mode === "memo" ? "备忘录" : "网图"}</h3>
              <label>
                <span>{mode === "memo" ? "备忘录" : "网图"}名称</span>
                <input value={newPageTitle} onChange={(event) => setNewPageTitle(event.target.value)} maxLength={18} placeholder="例如：内容方向" autoFocus />
              </label>
              <div className={styles.logicDialogActions}>
                <button className={styles.quietButton} onClick={() => setNewPageOpen(false)}>取消</button>
                <button className={styles.primaryButton} onClick={createPage} disabled={!newPageTitle.trim()}>创建{mode === "memo" ? "备忘录" : "网图"}</button>
              </div>
            </section>
          </div>
        )}

        {editPageId && (
          <div className={styles.logicOverlay} role="presentation" onMouseDown={() => setEditPageId(null)}>
            <section className={styles.logicDialog} role="dialog" aria-modal="true" aria-labelledby="rename-graph-page" onMouseDown={(event) => event.stopPropagation()}>
              <p className={styles.eyebrow}>RENAME PAGE</p>
              <h3 id="rename-graph-page">修改网图标题</h3>
              <label>
                <span>标题名称</span>
                <input
                  aria-label="标题名称"
                  value={editPageTitle}
                  onChange={(event) => setEditPageTitle(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && savePageTitle()}
                  maxLength={30}
                  autoFocus
                />
              </label>
              <div className={styles.logicDialogActions}>
                <button className={styles.quietButton} onClick={() => setEditPageId(null)}>取消</button>
                <button className={styles.primaryButton} onClick={savePageTitle} disabled={!editPageTitle.trim()}>保存标题</button>
              </div>
            </section>
          </div>
        )}

        {deletePageId && (
          <div className={styles.logicOverlay} role="presentation" onMouseDown={() => setDeletePageId(null)}>
            <section className={styles.logicDialog} role="dialog" aria-modal="true" aria-labelledby="delete-graph-page" onMouseDown={(event) => event.stopPropagation()}>
              <p className={styles.eyebrow}>危险操作</p>
              <h3 id="delete-graph-page">删除“{pages.find((page) => page.id === deletePageId)?.title}”吗？</h3>
              <p className={styles.logicDeleteWarning}>{mode === "memo"
                ? "删除后，这篇备忘录的全部想法、图片和文件都无法恢复。"
                : "删除后，这张网图的圆点、连线、源文件关联以及全部二、三级子网图都无法恢复。"}</p>
              <label>
                <span>请输入“确认”</span>
                <input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} placeholder="确认" autoFocus />
              </label>
              <div className={styles.logicDialogActions}>
                <button className={styles.quietButton} onClick={() => setDeletePageId(null)}>取消</button>
                <button className={styles.dangerButton} onClick={confirmDeletePage} disabled={deleteConfirmText.trim() !== "确认"}>永久删除</button>
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
        <div className={styles.logicGraphIdentity}>
          <button className={styles.logicBackButton} onClick={backToNotebook}>← 目录</button>
          <div className={styles.logicGraphTitle}>
            <small>第 {activePage.level} 层网图</small>
            <strong>{activePage.title}</strong>
          </div>
        </div>
        <div className={styles.logicGraphActions}>
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
          <button className={styles.logicAddButton} onClick={openComposer}>＋ 思维点</button>
        </div>
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

      {mode === "memo" && activePage.level === 1 && contentView === "checklist" ? (
        <div className={styles.logicChecklistWorkspace}>
          <header className={styles.logicChecklistWorkspaceHeader}>
            <div>
              <span>MEMO STRUCTURE</span>
              <h3>{activePage.title}</h3>
              <p>备忘录负责整理思维点；只有主动点击生成的思维点，才会在思维网图目录中建立独立网图。</p>
            </div>
            <button className={styles.primaryButton} onClick={() => setChecklistComposerOpen(true)}>＋ 新建清单</button>
          </header>

          <div className={styles.logicChecklistGrid}>
            {activeChecklists.map((checklist, checklistIndex) => {
              const checklistNodes = activePage.nodes.filter((node) =>
                node.checklistId ? node.checklistId === checklist.id : checklistIndex === 0,
              );
              return (
                <section className={styles.logicChecklistCard} key={checklist.id}>
                  <header>
                    <span>{String(checklistIndex + 1).padStart(2, "0")}</span>
                    <div><small>清单</small><h4>{checklist.title}</h4></div>
                    <b>{checklistNodes.length} 个思维点</b>
                  </header>
                  <div className={styles.logicChecklistItems}>
                    {checklistNodes.length ? checklistNodes.map((node) => (
                      <button
                        key={node.id}
                        onClick={() => {
                          setContentView("graph");
                          setSelectedNodeId(node.id);
                        }}
                      >
                        <i className={styles[`logicStatus${(node.status || "black")[0].toUpperCase()}${(node.status || "black").slice(1)}`]} />
                        <span><strong>{node.label}</strong><small>{node.content}</small></span>
                        <em>{(node.imageNotes || []).length} 图 · {(node.sourceFiles || []).length} 文件</em>
                        <b>查看 →</b>
                      </button>
                    )) : (
                      <div className={styles.logicChecklistEmpty}>这份清单还没有思维点。</div>
                    )}
                  </div>
                  <button
                    className={styles.logicChecklistAdd}
                    onClick={() => {
                      setIdeaChecklistId(checklist.id);
                      setIdeaContent("");
                      setIdeaLabel("");
                      setLabelEdited(false);
                      setComposerOpen(true);
                    }}
                  >＋ 添加想法</button>
                </section>
              );
            })}
          </div>

          {checklistComposerOpen && (
            <div className={styles.logicInlineComposer}>
              <input
                value={newChecklistTitle}
                onChange={(event) => setNewChecklistTitle(event.target.value)}
                maxLength={30}
                placeholder="输入清单名称"
                autoFocus
              />
              <button className={styles.quietButton} onClick={() => setChecklistComposerOpen(false)}>取消</button>
              <button className={styles.primaryButton} onClick={createChecklist} disabled={!newChecklistTitle.trim()}>创建清单</button>
            </div>
          )}
        </div>
      ) : (

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
                  className={`${styles.logicNode} ${selected ? styles.logicNodeSelected : ""} ${node.fresh ? styles.logicNodeFresh : ""} ${styles[`logicNodeStatus${(node.status || "black")[0].toUpperCase()}${(node.status || "black").slice(1)}`]}`}
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
                  <text x="0" y="43" textAnchor="middle">{node.label.length > 8 ? node.label.slice(0, 8) + "…" : node.label}</text>
                </g>
              );
            })}
          </g>
        </svg>

        {(selectedNode || selectedEdge) && (
          <aside className={styles.logicInspector} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            {selectedNode ? (
              <>
                <div className={styles.logicInspectorHeader}>
                  <span className={styles.logicInspectorDot} />
                  <div><small>第 {activePage.level} 层想法圆点</small><h3>{selectedNode.label}</h3></div>
                  <button aria-label="关闭想法详情" onClick={() => setSelectedNodeId(null)}>×</button>
                </div>
                <label>
                  <span>圆点关键词（手动输入最长30个字符）</span>
                  <input
                    value={selectedNode.label}
                    onChange={(event) => updateSelectedNode({
                      label: event.nativeEvent.isComposing
                        ? event.target.value
                        : Array.from(event.target.value).slice(0, 30).join(""),
                    })}
                    onCompositionEnd={(event) => updateSelectedNode({ label: Array.from(event.currentTarget.value).slice(0, 30).join("") })}
                  />
                </label>
                <label>
                  <span>完整想法</span>
                  <textarea value={selectedNode.content} onChange={(event) => updateSelectedNode({ content: event.target.value })} />
                </label>
                <section className={styles.logicThoughtMeta}>
                  <div>
                    <strong>思维点状态</strong>
                    <small>颜色只标记当前思维点，不代表整份清单。</small>
                  </div>
                  <div className={styles.logicStatusPicker}>
                    {([
                      ["red", "重点"],
                      ["orange", "推进中"],
                      ["green", "已验证"],
                      ["black", "普通"],
                    ] as Array<[IdeaStatus, string]>).map(([status, label]) => (
                      <button
                        key={status}
                        className={selectedNode.status === status || (!selectedNode.status && status === "black") ? styles.logicStatusSelected : ""}
                        onClick={() => updateSelectedNode({ status })}
                      >
                        <i className={styles[`logicStatus${status[0].toUpperCase()}${status.slice(1)}`]} />
                        {label}
                      </button>
                    ))}
                  </div>
                  {activePage.level === 1 && (
                    <label>
                      <span>所属清单</span>
                      <select
                        value={selectedNode.checklistId || activeChecklists[0]?.id || ""}
                        onChange={(event) => updateSelectedNode({ checklistId: event.target.value })}
                      >
                        {activeChecklists.map((checklist) => <option key={checklist.id} value={checklist.id}>{checklist.title}</option>)}
                      </select>
                    </label>
                  )}
                </section>
                <section className={styles.logicSupplementaryPoints}>
                  <div className={styles.logicSupplementaryHeader}>
                    <span>
                      <strong>想法补充</strong>
                      <small>逐条记录后来想到的补充点</small>
                    </span>
                    <button type="button" onClick={addSupplementaryPoint}>＋ 新增</button>
                  </div>
                  <div className={styles.logicSupplementaryList}>
                    {currentSupplementaryPoints().map((item, index) => (
                      <div key={item.id}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <textarea
                          aria-label={`想法补充 ${index + 1}`}
                          value={item.text}
                          placeholder="记录一个补充点……"
                          onChange={(event) =>
                            updateSupplementaryPoint(item.id, event.target.value)
                          }
                        />
                        <button
                          type="button"
                          aria-label={`删除想法补充 ${index + 1}`}
                          onClick={() => removeSupplementaryPoint(item.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                <section className={styles.logicImageNotes}>
                  <div className={styles.logicImageNotesHeader}>
                    <span>
                      <strong>图片备注</strong>
                      <small>可放截图，最多 9 张</small>
                    </span>
                    <label className={imageBusy || (selectedNode.imageNotes || []).length >= 9 ? styles.logicUploadDisabled : ""}>
                      ＋ 添加图片
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={imageBusy || (selectedNode.imageNotes || []).length >= 9}
                        onChange={(event) => {
                          attachImagesToSelectedNode(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {(selectedNode.imageNotes || []).length ? (
                    <div className={styles.logicImageGrid}>
                      {(selectedNode.imageNotes || []).map((image, index) => (
                        <article key={image.id}>
                          <button
                            className={styles.logicImagePreview}
                            onClick={() => imagePreviews[image.id] && window.open(imagePreviews[image.id], "_blank", "noopener,noreferrer")}
                            disabled={!imagePreviews[image.id]}
                            aria-label={`查看图片备注${index + 1}：${image.name}`}
                          >
                            {imagePreviews[image.id] ? <img src={imagePreviews[image.id]} alt={image.name} /> : <span>加载中</span>}
                          </button>
                          <div>
                            <small>{index + 1}/9</small>
                            <button aria-label={`删除图片备注${index + 1}`} onClick={() => removeImageNote(image.id)}>×</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>添加界面截图、灵感参考或过程记录，点击图片可放大查看。</p>
                  )}
                  {imageError && <p className={styles.logicFileError}>{imageError}</p>}
                </section>
                <section className={styles.logicNodeFiles}>
                  <div className={styles.logicNodeFilesHeader}>
                    <span><strong>相关源文件</strong><small>仅关联当前圆点</small></span>
                    <label>
                      ＋ 添加文件
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
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
                          <button className={styles.logicFileOpen} onClick={() => openSourceFile(file)} disabled={fileBusy} title={file.name}>
                            <strong>{file.name}</strong>
                            <small>{formatFileSize(file.size)}</small>
                          </button>
                          <button aria-label={`移除${file.name}`} onClick={() => removeSourceFile(file.id)}>×</button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>还没有关联资料，可添加 Word、PDF、TXT 或 Markdown。</p>
                  )}
                  {fileError && <p className={styles.logicFileError}>{fileError}</p>}
                </section>
                {mode === "memo" && activePage.level === 1 ? (
                  <button className={styles.logicChildButton} onClick={createOrOpenMemoGraph}>
                    <span>
                      <small>{activePage.memoGraphPageId ? "整篇备忘录已生成" : "继续推演整篇备忘录"}</small>
                      <strong>{activePage.memoGraphPageId ? "前往思维网图查看和扩展" : "生成整篇网图"}</strong>
                    </span>
                    <b>{activePage.memoGraphPageId ? "进入 →" : "＋"}</b>
                  </button>
                ) : activePage.level < 3 ? (
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
                  <button
                    className={styles.primaryButton}
                    onClick={() => {
                      setConnectSourceId(selectedNode.id);
                      setSelectedNodeId(null);
                    }}
                  >
                    连接其他点
                  </button>
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
      )}

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
              <span>圆点关键词（自动提取6字，手动输入最长30个字符）</span>
              <input
                value={ideaLabel}
                onChange={(event) => {
                  setLabelEdited(true);
                  setIdeaLabel(event.nativeEvent.isComposing ? event.target.value : Array.from(event.target.value).slice(0, 30).join(""));
                }}
                onCompositionEnd={(event) => setIdeaLabel(Array.from(event.currentTarget.value).slice(0, 30).join(""))}
                placeholder="系统会自动截取，可修改"
              />
            </label>
            {activePage.level === 1 && activeChecklists.length > 0 && (
              <label>
                <span>加入清单</span>
                <select value={ideaChecklistId || activeChecklists[0].id} onChange={(event) => setIdeaChecklistId(event.target.value)}>
                  {activeChecklists.map((checklist) => <option key={checklist.id} value={checklist.id}>{checklist.title}</option>)}
                </select>
              </label>
            )}
            <small>完整原文会保留在圆点详情中。</small>
            <div className={styles.logicDialogActions}>
              <button className={styles.quietButton} onClick={() => setComposerOpen(false)}>取消</button>
              <button className={styles.primaryButton} onClick={() => createIdea(false)} disabled={!ideaContent.trim()}>生成圆点</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
