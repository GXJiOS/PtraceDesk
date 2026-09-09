import dayjs, { type Dayjs } from "dayjs";
import type {
  AssigneeOption,
  DashboardItem,
  DashboardSnapshot,
  IterationProgress,
  PtracePayload,
  PtraceSprint,
  PtraceWorkitem,
  PtraceWorkitemStatus,
  SprintHierarchyProgress,
  StatusKind,
} from "./types";

const donePattern = /完成|已完成|关闭|已关闭|验收通过|done|closed/i;
const cancelledPattern = /取消|已取消|废弃|作废|cancelled/i;
const activePattern = /进行|進行|处理中|處理中|开发|開發|修复中|修復中|验证中|驗證中|已开始|已開始|active|doing|in progress/i;
const todoCodes = new Set(["todo", "open"]);
const activeCodes = new Set(["in_progress", "fixing", "doing"]);
const doneCodes = new Set(["done", "fixed", "closed"]);
const cancelledCodes = new Set(["cancelled"]);

function normalizedStatusLabel(status: string) {
  return status
    .replaceAll("進行", "进行")
    .replaceAll("處理", "处理")
    .replaceAll("待辦", "待办")
    .replaceAll("修復", "修复")
    .replaceAll("關閉", "关闭");
}

function normalizedTypeLabel(type?: string | null) {
  const label = type?.trim();
  if (!label) return "工单";
  return label.toLocaleLowerCase() === "task" ? "任务" : label;
}

export function statusKindOf(item: PtraceWorkitem, definition?: PtraceWorkitemStatus): StatusKind {
  const code = definition?.code.toLowerCase();
  if (code && cancelledCodes.has(code)) return "cancelled";
  if (code && doneCodes.has(code)) return "done";
  if (code && activeCodes.has(code)) return "active";
  if (code && todoCodes.has(code)) return "todo";
  const status = item.ptraceStatusName || item.statusName || "";
  if (cancelledPattern.test(status)) return "cancelled";
  if (item.completedAt || donePattern.test(status)) return "done";
  if (item.startedAt || activePattern.test(status)) return "active";
  return "todo";
}

function assigneeOf(item: PtraceWorkitem) {
  return {
    id: item.ptraceAssignedToId || item.assignedToId || null,
    name: item.ptraceAssignedToName || item.assignedToName || "未分配",
  };
}

function creatorIdOf(item: PtraceWorkitem) {
  return item.ptraceCreatorId || item.creatorId || null;
}

function dueText(item: PtraceWorkitem, now: Dayjs) {
  if (!item.plannedEndTime) return "未排期";
  const due = dayjs(item.plannedEndTime);
  if (due.isSame(now, "day")) return "今天到期";
  if (due.isSame(now.add(1, "day"), "day")) return "明天到期";
  return `${due.month() + 1}月${due.date()}日到期`;
}

export function compareItemsBySchedule(a: DashboardItem, b: DashboardItem) {
  const terminalRank = (item: DashboardItem) => item.statusKind === "done" || item.statusKind === "cancelled" ? 1 : 0;
  const aTerminal = terminalRank(a);
  const bTerminal = terminalRank(b);
  if (aTerminal !== bTerminal) return aTerminal - bTerminal;

  const aDue = a.plannedEndTime ? dayjs(a.plannedEndTime).valueOf() : Number.MAX_SAFE_INTEGER;
  const bDue = b.plannedEndTime ? dayjs(b.plannedEndTime).valueOf() : Number.MAX_SAFE_INTEGER;
  if (aDue !== bDue) return aDue - bDue;

  const aStart = a.plannedStartTime ? dayjs(a.plannedStartTime).valueOf() : Number.MAX_SAFE_INTEGER;
  const bStart = b.plannedStartTime ? dayjs(b.plannedStartTime).valueOf() : Number.MAX_SAFE_INTEGER;
  if (aStart !== bStart) return aStart - bStart;

  if ((a.priority ?? 4) !== (b.priority ?? 4)) return (a.priority ?? 4) - (b.priority ?? 4);

  const statusRank: Record<StatusKind, number> = { active: 0, todo: 1, done: 2, cancelled: 3 };
  if (a.statusKind !== b.statusKind) return statusRank[a.statusKind] - statusRank[b.statusKind];
  return a.displayNo.localeCompare(b.displayNo);
}

export function assigneeOptions(items: PtraceWorkitem[]): AssigneeOption[] {
  const counts = new Map<string, AssigneeOption>();
  for (const item of items) {
    const assignee = assigneeOf(item);
    if (!assignee.id) continue;
    const current = counts.get(assignee.id);
    counts.set(assignee.id, {
      id: assignee.id,
      name: assignee.name,
      count: (current?.count || 0) + 1,
    });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

interface SprintNode {
  key: string;
  id: string;
  productId: string;
  name: string;
  status: string | null;
  parentKey: string | null;
  items: DashboardItem[];
}

function sprintKey(productId: string, id?: string | null, name?: string | null) {
  if (id) return `${productId}:id:${id}`;
  if (name) return `${productId}:name:${name}`;
  return null;
}

function completionOf(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}

function buildSprintGraph(sprints: PtraceSprint[], items: DashboardItem[]) {
  const nodes = new Map<string, SprintNode>();

  const ensureNode = ({
    productId,
    id,
    name,
    status,
    parentId,
    parentName,
  }: {
    productId: string;
    id?: string | null;
    name?: string | null;
    status?: string | null;
    parentId?: string | null;
    parentName?: string | null;
  }) => {
    const key = sprintKey(productId, id, name);
    if (!key) return null;
    const parentKey = sprintKey(productId, parentId, parentName);
    const current = nodes.get(key);
    if (current) {
      current.name = name || current.name;
      current.status = status || current.status;
      current.parentKey = parentKey || current.parentKey;
      return current;
    }
    const node: SprintNode = {
      key,
      id: id || key,
      productId,
      name: name || "未命名迭代",
      status: status || null,
      parentKey,
      items: [],
    };
    nodes.set(key, node);
    return node;
  };

  for (const sprint of sprints) {
    ensureNode(sprint);
    if (sprint.parentId || sprint.parentName) {
      ensureNode({
        productId: sprint.productId,
        id: sprint.parentId,
        name: sprint.parentName,
      });
    }
  }

  for (const item of items) {
    const node = ensureNode({
      productId: item.productId,
      id: item.sprintId,
      name: item.sprintName,
      parentId: item.sprintParentId,
      parentName: item.sprintParentName,
    });
    if (!node) continue;
    if (item.sprintParentId || item.sprintParentName) {
      ensureNode({
        productId: item.productId,
        id: item.sprintParentId,
        name: item.sprintParentName,
      });
    }
    if (item.statusKind !== "cancelled") node.items.push(item);
  }

  const childrenByParent = new Map<string, SprintNode[]>();
  for (const node of nodes.values()) {
    if (!node.parentKey || !nodes.has(node.parentKey)) continue;
    const children = childrenByParent.get(node.parentKey) || [];
    children.push(node);
    childrenByParent.set(node.parentKey, children);
  }

  const statsFor = (node: SprintNode) => {
    let done = 0;
    let total = 0;
    const visited = new Set<string>();
    const visit = (current: SprintNode) => {
      if (visited.has(current.key)) return;
      visited.add(current.key);
      total += current.items.length;
      done += current.items.filter((item) => item.statusKind === "done").length;
      for (const child of childrenByParent.get(current.key) || []) visit(child);
    };
    visit(node);
    return { done, total };
  };

  return { nodes, childrenByParent, statsFor };
}

function progressForSprint(node: SprintNode, graph: ReturnType<typeof buildSprintGraph>): SprintHierarchyProgress {
  const { done, total } = graph.statsFor(node);
  const children = (graph.childrenByParent.get(node.key) || []).map<IterationProgress>((child) => {
    const stats = graph.statsFor(child);
    return { id: child.id, name: child.name, ...stats, progress: completionOf(stats.done, stats.total) };
  }).sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
  return { id: node.id, name: node.name, done, total, progress: completionOf(done, total), children };
}

function buildSprintHierarchyProgress(sprints: PtraceSprint[], items: DashboardItem[]): SprintHierarchyProgress | null {
  const graph = buildSprintGraph(sprints, items);
  const { nodes, statsFor } = graph;
  const roots = [...nodes.values()].filter((node) => !node.parentKey || !nodes.has(node.parentKey));
  const candidates = roots.map((node) => {
    const stats = statsFor(node);
    return {
      node,
      ...stats,
      active: node.status?.toLowerCase() === "active",
      open: stats.total - stats.done,
    };
  }).sort((a, b) => (
    Number(b.active) - Number(a.active)
    || b.open - a.open
    || b.total - a.total
    || a.node.name.localeCompare(b.node.name, "zh-CN", { numeric: true })
  ));
  const selected = candidates[0];
  if (!selected) return null;

  return progressForSprint(selected.node, graph);
}

function isScheduledBetween(item: DashboardItem, start: Dayjs, end: Dayjs) {
  const plannedStart = item.plannedStartTime ? dayjs(item.plannedStartTime) : null;
  const plannedEnd = item.plannedEndTime ? dayjs(item.plannedEndTime) : null;

  if (plannedStart?.isValid() && plannedEnd?.isValid()) {
    return !plannedEnd.isBefore(start) && !plannedStart.isAfter(end);
  }

  return [plannedStart, plannedEnd].some((scheduledAt) => (
    scheduledAt?.isValid()
    && !scheduledAt.isBefore(start)
    && !scheduledAt.isAfter(end)
  ));
}

export function buildDashboardSnapshot(
  payload: PtracePayload,
  options: { identityId?: string | null; projectId?: string | null; now?: string | Date } = {},
): DashboardSnapshot {
  const now = dayjs(options.now);
  const productMap = new Map(payload.products.map((project) => [project.id, project]));
  const statusMap = new Map(
    (payload.workitemStatuses || []).map((status) => [`${status.typeId}:${status.id}`, status]),
  );
  const allItems = payload.workitems.map<DashboardItem>((item) => {
    const statusDefinition = item.typeId && item.ptraceStatusId
      ? statusMap.get(`${item.typeId}:${item.ptraceStatusId}`)
      : undefined;
    const kind = statusKindOf(item, statusDefinition);
    const assignee = assigneeOf(item);
    const end = item.plannedEndTime ? dayjs(item.plannedEndTime) : null;
    const isOverdue = Boolean(
      end?.isValid()
      && end.isBefore(now)
      && kind !== "done"
      && kind !== "cancelled",
    );
    return {
      ...item,
      productName: productMap.get(item.productId)?.name || "未知项目",
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      displayNo: item.workitemNo || item.id.slice(0, 8).toUpperCase(),
      typeLabel: normalizedTypeLabel(item.workitemTypeName || item.workitemCategory),
      statusLabel: normalizedStatusLabel(statusDefinition?.name || item.ptraceStatusName || item.statusName || "待处理"),
      statusKind: kind,
      isOverdue,
      dueLabel: dueText(item, now),
    };
  });

  const identityItems = options.identityId
    ? allItems.filter((item) => item.assigneeId === options.identityId)
    : allItems;
  const scopedItems = options.projectId
    ? identityItems.filter((item) => item.productId === options.projectId)
    : identityItems;
  const assignedByOthersItems = options.identityId
    ? scopedItems.filter((item) => {
      const creatorId = creatorIdOf(item);
      return Boolean(creatorId) && creatorId !== options.identityId;
    })
    : [];
  const createdForOthersItems = options.identityId
    ? allItems.filter((item) => (
      creatorIdOf(item) === options.identityId
      && Boolean(item.assigneeId)
      && item.assigneeId !== options.identityId
      && (!options.projectId || item.productId === options.projectId)
    ))
    : [];
  const iterationScopeItems = options.projectId
    ? allItems.filter((item) => item.productId === options.projectId)
    : allItems;
  const openItems = scopedItems.filter((item) => item.statusKind !== "done" && item.statusKind !== "cancelled");
  const doneItems = scopedItems.filter((item) => item.statusKind === "done");
  const overdueItems = openItems.filter((item) => item.isOverdue).sort(compareItemsBySchedule);
  const timelineStart = now.startOf("day");
  const queueEnd = now.add(2, "day").endOf("day");
  const queue = openItems
    .filter((item) => !item.isOverdue && isScheduledBetween(item, timelineStart, queueEnd))
    .sort(compareItemsBySchedule)
    .slice(0, 6);
  const timelineEnd = now.add(6, "day").endOf("day");
  const nextSevenDays = openItems
    .filter((item) => isScheduledBetween(item, timelineStart, timelineEnd))
    .sort(compareItemsBySchedule);

  const projects = payload.products.map((project) => {
    const projectItems = identityItems.filter((item) => item.productId === project.id);
    const done = projectItems.filter((item) => item.statusKind === "done").length;
    const open = projectItems.filter((item) => item.statusKind !== "done" && item.statusKind !== "cancelled").length;
    const denominator = done + open;
    return {
      id: project.id,
      name: project.name,
      completion: denominator ? Math.round((done / denominator) * 100) : 0,
      done,
      open,
      overdue: projectItems.filter((item) => item.isOverdue).length,
    };
  });

  const iterationScopeSprints = options.projectId
    ? (payload.sprints || []).filter((sprint) => sprint.productId === options.projectId)
    : (payload.sprints || []);
  const sprintProgress = buildSprintHierarchyProgress(iterationScopeSprints, iterationScopeItems);
  const completionBase = doneItems.length + openItems.length;

  return {
    projects,
    assignees: assigneeOptions(payload.workitems),
    items: scopedItems,
    assignedByOthersItems,
    createdForOthersItems,
    queue,
    overdueItems,
    nextSevenDays,
    totalOpen: openItems.length,
    totalDone: doneItems.length,
    activeCount: openItems.filter((item) => item.statusKind === "active").length,
    completion: completionBase ? Math.round((doneItems.length / completionBase) * 100) : 0,
    sprintProgress,
  };
}


export const UNSCHEDULED_WORKBENCH_ITERATION = "unscheduled";

export function buildWorkbenchSnapshot(
  payload: PtracePayload,
  options: {
    identityId?: string | null;
    projectId?: string | null;
    hiddenProjectIds?: string[];
    iterationKey?: string | null;
    now?: string | Date;
  } = {},
): { snapshot: DashboardSnapshot; iterations: Array<{ key: string; label: string }>; iterationKey: string } {
  const hiddenIds = new Set(options.hiddenProjectIds || []);
  const products = payload.products.filter((product) => !hiddenIds.has(product.id) && (!options.projectId || product.id === options.projectId));
  const productIds = new Set(products.map((product) => product.id));
  const scopedPayload: PtracePayload = {
    ...payload,
    products,
    workitems: payload.workitems.filter((item) => productIds.has(item.productId)),
    sprints: (payload.sprints || []).filter((sprint) => productIds.has(sprint.productId)),
  };
  const sprints = scopedPayload.sprints!;
  const sprintById = new Map(sprints.map((sprint) => [sprintKey(sprint.productId, sprint.id), sprint]));
  const sprintsByName = new Map<string, PtraceSprint[]>();
  for (const sprint of sprints) {
    const key = sprintKey(sprint.productId, null, sprint.name)!;
    sprintsByName.set(key, [...(sprintsByName.get(key) || []), sprint]);
  }
  function resolveSprint(productId: string, id?: string | null, name?: string | null) {
    if (id) return sprintById.get(sprintKey(productId, id));
    const matches = sprintsByName.get(sprintKey(productId, null, name) || "");
    return matches?.length === 1 ? matches[0] : undefined;
  }

  const allItems = buildDashboardSnapshot(scopedPayload, { now: options.now }).items;
  const graphItems = allItems.map((item) => {
    const sprint = resolveSprint(item.productId, item.sprintId, item.sprintName);
    const useMetadataParent = sprint && ("parentId" in sprint || "parentName" in sprint);
    const parentId = useMetadataParent ? sprint.parentId : item.sprintParentId;
    const parentName = useMetadataParent ? sprint.parentName : item.sprintParentName;
    const parent = resolveSprint(item.productId, parentId, parentName);
    if (!item.sprintId && !item.sprintName) return {
      ...item, sprintId: parent?.id || parentId, sprintName: parent?.name || parentName,
      sprintParentId: null, sprintParentName: null,
    };
    return {
      ...item,
      sprintId: sprint?.id || item.sprintId,
      sprintName: sprint?.name || item.sprintName,
      sprintParentId: parent?.id || parentId,
      sprintParentName: parent?.name || parentName,
    };
  });
  const graphSprints = sprints.map((sprint) => {
    const parent = resolveSprint(sprint.productId, sprint.parentId, sprint.parentName);
    return { ...sprint, parentId: parent?.id || sprint.parentId, parentName: parent?.name || sprint.parentName };
  });
  const graph = buildSprintGraph(graphSprints, graphItems);
  const roots = [...graph.nodes.values()].filter((node) => !node.parentKey || !graph.nodes.has(node.parentKey));
  const rootRank = (node: SprintNode) => node.status?.toLowerCase() === "active" ? 2 : node.status?.toLowerCase() === "closed" ? 0 : 1;
  roots.sort((a, b) => {
    const aStats = graph.statsFor(a);
    const bStats = graph.statsFor(b);
    return rootRank(b) - rootRank(a)
      || (bStats.total - bStats.done) - (aStats.total - aStats.done)
      || bStats.total - aStats.total
      || a.name.localeCompare(b.name, "zh-CN", { numeric: true })
      || a.key.localeCompare(b.key);
  });
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  const iterations = roots.map((node) => {
    let label = products.length > 1 ? `${node.name} · ${productNames.get(node.productId)}` : node.name;
    if (roots.some((other) => other.key !== node.key && other.productId === node.productId && other.name === node.name)) {
      label += node.id === node.key ? "（名称记录）" : `（ID ${node.id}）`;
    }
    return { key: node.key, label };
  });
  iterations.push({ key: UNSCHEDULED_WORKBENCH_ITERATION, label: "未设置迭代" });
  const iterationKey = iterations.some((iteration) => iteration.key === options.iterationKey)
    ? options.iterationKey! : roots[0]?.key || UNSCHEDULED_WORKBENCH_ITERATION;

  function rootKeyOf(item: DashboardItem) {
    let node = graph.nodes.get(sprintKey(item.productId, item.sprintId, item.sprintName) || "");
    const visited = new Set<string>();
    while (node?.parentKey && graph.nodes.has(node.parentKey)) {
      if (visited.has(node.key)) return null;
      visited.add(node.key);
      node = graph.nodes.get(node.parentKey);
    }
    return node?.key || null;
  }
  const itemKeys = new Set(graphItems.filter((item) => (rootKeyOf(item) || UNSCHEDULED_WORKBENCH_ITERATION) === iterationKey)
    .map((item) => JSON.stringify([item.productId, item.id])));
  const selectedPayload: PtracePayload = {
    ...scopedPayload,
    workitems: scopedPayload.workitems.filter((item) => itemKeys.has(JSON.stringify([item.productId, item.id]))),
    sprints: [],
  };
  const snapshot = buildDashboardSnapshot(selectedPayload, { identityId: options.identityId, now: options.now });
  const selectedRoot = graph.nodes.get(iterationKey);
  snapshot.sprintProgress = selectedRoot ? progressForSprint(selectedRoot, graph) : null;
  return { snapshot, iterations, iterationKey };
}
