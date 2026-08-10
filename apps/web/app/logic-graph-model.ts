export type IdeaStatus = "red" | "orange" | "green" | "black";

export type IdeaChecklist = {
  id: string;
  title: string;
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
