export type DashboardMode = "demo" | "live" | "cache";
export type LoadState = "idle" | "connecting" | "syncing" | "ready" | "error";
export type StatusKind = "todo" | "active" | "done" | "cancelled";

export interface WorkitemStats {
  open: number;
  done: number;
  cancelled: number;
  total: number;
}

export interface PtraceProduct {
  id: string;
  name: string;
  summary?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  lifecycleStage?: string | null;
  tracked?: number;
  workitemStats?: WorkitemStats;
}

export interface PtraceAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType?: string | null;
  fileSize?: number | null;
  isDeleted?: number;
}

export interface PtraceWorkitem {
  id: string;
  productId: string;
  typeId?: string | null;
  workitemNo?: string | null;
  subject: string;
  workitemTypeName?: string | null;
  workitemCategory?: string | null;
  statusId?: string | null;
  statusName?: string | null;
  description?: string | null;
  attachments?: PtraceAttachment[] | null;
  ptraceStatusName?: string | null;
  ptraceStatusId?: string | null;
  ptraceAssignedToId?: string | null;
  ptraceAssignedToName?: string | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  creatorId?: string | null;
  creatorName?: string | null;
  ptraceCreatorId?: string | null;
  ptraceCreatorName?: string | null;
  priority?: number | null;
  sprintId?: string | null;
  sprintName?: string | null;
  sprintParentId?: string | null;
  sprintParentName?: string | null;
  updateTime?: string | null;
  createTime?: string | null;
  plannedStartTime?: string | null;
  plannedEndTime?: string | null;
  completedAt?: string | null;
  startedAt?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  labels?: string[] | null;
}

export interface PtraceWorkitemStatus {
  id: string;
  typeId: string;
  code: string;
  name: string;
  color?: string | null;
}

export interface PtraceWorkitemDetail extends PtraceWorkitem {
  productName?: string | null;
  productOwnerName?: string | null;
  parentId?: string | null;
  ptraceCreatorDeptName?: string | null;
  ptraceAssignedToDeptName?: string | null;
  cycleBusinessSeconds?: number | null;
  rawFields: Record<string, unknown>;
}

export interface PtraceWorkitemComment {
  id: string;
  workitemId: string;
  authorId?: string | null;
  authorName?: string | null;
  content: string;
  createTime?: string | null;
  updateTime?: string | null;
  parentId?: string | null;
  isDeleted?: number;
  children: PtraceWorkitemComment[];
  rawFields: Record<string, unknown>;
}

export interface PtraceWorkitemActivity {
  id: string;
  eventType: string;
  fromValue?: unknown;
  toValue?: unknown;
  actorUserId?: string | null;
  actorName?: string | null;
  actedAt?: string | null;
  reason?: string | null;
  metadata?: unknown;
  rawFields: Record<string, unknown>;
}

export interface PtraceWorkitemActivityFeed {
  items: PtraceWorkitemActivity[];
  statuses: PtraceWorkitemStatus[];
}

export interface PtraceWorkitemRelations {
  parent: PtraceWorkitemDetail | null;
  children: PtraceWorkitem[];
  parentError: boolean;
  childrenError: boolean;
}

export interface PtraceSprint {
  id: string;
  productId: string;
  name: string;
  status?: string | null;
  parentId?: string | null;
  parentName?: string | null;
}

export interface PtracePayload {
  products: PtraceProduct[];
  workitems: PtraceWorkitem[];
  sprints?: PtraceSprint[];
  workitemStatuses?: PtraceWorkitemStatus[];
  syncedAt: string;
}

export interface AssigneeOption {
  id: string;
  name: string;
  count: number;
}

export interface DashboardItem extends PtraceWorkitem {
  productName: string;
  assigneeId: string | null;
  assigneeName: string;
  displayNo: string;
  typeLabel: string;
  statusLabel: string;
  statusKind: StatusKind;
  isOverdue: boolean;
  dueLabel: string;
}

export interface ProjectProgress {
  id: string;
  name: string;
  completion: number;
  done: number;
  open: number;
  overdue: number;
}

export interface IterationProgress {
  id: string;
  name: string;
  done: number;
  total: number;
  progress: number;
}

export interface SprintHierarchyProgress extends IterationProgress {
  children: IterationProgress[];
}

export interface DashboardSnapshot {
  projects: ProjectProgress[];
  assignees: AssigneeOption[];
  items: DashboardItem[];
  assignedByOthersItems: DashboardItem[];
  createdForOthersItems: DashboardItem[];
  queue: DashboardItem[];
  overdueItems: DashboardItem[];
  nextSevenDays: DashboardItem[];
  totalOpen: number;
  totalDone: number;
  activeCount: number;
  completion: number;
  sprintProgress: SprintHierarchyProgress | null;
}
