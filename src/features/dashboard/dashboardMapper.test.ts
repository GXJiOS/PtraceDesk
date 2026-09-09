import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { buildDashboardSnapshot, buildWorkbenchSnapshot, compareItemsBySchedule, statusKindOf, UNSCHEDULED_WORKBENCH_ITERATION } from "./dashboardMapper";
import { demoPayload } from "./demoData";
import type { DashboardItem, PtracePayload } from "./types";
import { scheduledItemsOnDay } from "./workload";

describe("dashboardMapper", () => {
  it("scopes workbench metrics and team progress to a root and all of its descendants", () => {
    const payload: PtracePayload = {
      products: [{ id: "a", name: "项目 A" }],
      sprints: [
        { id: "v1", productId: "a", name: "1.0.0", status: "active" },
        { id: "app", productId: "a", name: "App", parentId: "v1" },
        { id: "qa", productId: "a", name: "QA", parentId: "app" },
        { id: "empty", productId: "a", name: "空子迭代", parentId: "v1" },
        { id: "v2", productId: "a", name: "1.1.0", status: "planning" },
        { id: "v2-app", productId: "a", name: "App", parentId: "v2" },
      ],
      workitems: [
        { id: "root", productId: "a", subject: "父迭代直属", assignedToId: "me", sprintId: "v1", statusName: "进行中", plannedEndTime: "2026-08-10T18:00:00+08:00" },
        { id: "child", productId: "a", subject: "子迭代已完成", assignedToId: "me", sprintId: "app", statusName: "已完成" },
        { id: "grandchild", productId: "a", subject: "孙迭代待办", assignedToId: "me", sprintId: "qa", statusName: "待处理", plannedStartTime: "2026-08-12T09:00:00+08:00", plannedEndTime: "2026-08-12T18:00:00+08:00" },
        { id: "team", productId: "a", subject: "同事已完成", assignedToId: "other", sprintId: "app", statusName: "已完成" },
        { id: "cancelled", productId: "a", subject: "已取消", assignedToId: "other", sprintId: "app", statusName: "已取消" },
        { id: "next", productId: "a", subject: "新版工单", assignedToId: "me", sprintId: "v2-app", sprintParentId: "v1", statusName: "待处理" },
        { id: "unset", productId: "a", subject: "[1.0.0] 标题版本不用于归属", assignedToId: "me" },
      ], syncedAt: "2026-08-11T10:00:00+08:00",
    };
    const original = JSON.stringify(payload);
    const options = { identityId: "me", now: "2026-08-11T10:00:00+08:00" };
    const current = buildWorkbenchSnapshot(payload, options);
    expect(current.iterations.find((iteration) => iteration.key === current.iterationKey)?.label).toBe("1.0.0");
    expect(current.snapshot.items.map((item) => item.id)).toEqual(["root", "child", "grandchild"]);
    expect(current.snapshot).toMatchObject({ completion: 33, totalDone: 1, activeCount: 1 });
    expect(current.snapshot.overdueItems.map((item) => item.id)).toEqual(["root"]);
    expect(current.snapshot.queue.map((item) => item.id)).toEqual(["grandchild"]);
    expect(current.snapshot.sprintProgress).toMatchObject({ id: "v1", done: 2, total: 4, progress: 50 });
    expect(current.snapshot.sprintProgress?.children).toHaveLength(2);
    expect(current.snapshot.sprintProgress?.children).toEqual(expect.arrayContaining([
      { id: "app", name: "App", done: 2, total: 3, progress: 67 },
      { id: "empty", name: "空子迭代", done: 0, total: 0, progress: 0 },
    ]));
    const next = buildWorkbenchSnapshot(payload, { ...options, iterationKey: current.iterations.find((iteration) => iteration.label === "1.1.0")!.key });
    expect(next.snapshot.items.map((item) => item.id)).toEqual(["next"]);
    expect(next.snapshot.sprintProgress?.id).toBe("v2");
    const unset = buildWorkbenchSnapshot(payload, { ...options, iterationKey: UNSCHEDULED_WORKBENCH_ITERATION });
    expect(unset.snapshot.items.map((item) => item.id)).toEqual(["unset"]);
    expect(unset.snapshot.sprintProgress).toBeNull();
    expect(JSON.stringify(payload)).toBe(original);
  });

  it("separates matching sprint ids and names by project and excludes disabled projects", () => {
    const payload: PtracePayload = {
      products: [{ id: "a", name: "项目 A" }, { id: "b", name: "项目 B" }, { id: "hidden", name: "已停用项目" }],
      sprints: [
        { id: "root", productId: "a", name: "1.0.0", status: "active" },
        { id: "root", productId: "b", name: "1.0.0", status: "planning" },
        { id: "hidden-root", productId: "hidden", name: "已停用迭代", status: "active" },
      ],
      workitems: [
        { id: "a-item", productId: "a", subject: "A 工单", sprintId: "root" },
        { id: "b-item", productId: "b", subject: "B 工单", sprintId: "root" },
        { id: "hidden-item", productId: "hidden", subject: "已停用项目工单", sprintId: "hidden-root" },
      ], syncedAt: "2026-08-11T10:00:00+08:00",
    };
    const current = buildWorkbenchSnapshot(payload, { hiddenProjectIds: ["hidden"] });
    expect(current.iterations.map((iteration) => iteration.label)).toEqual(["1.0.0 · 项目 A", "1.0.0 · 项目 B", "未设置迭代"]);
    expect(current.snapshot.items.map((item) => item.id)).toEqual(["a-item"]);
    const projectB = buildWorkbenchSnapshot(payload, { projectId: "b", iterationKey: current.iterationKey });
    expect(projectB.iterationKey).not.toBe(current.iterationKey);
    expect(projectB.snapshot.items.map((item) => item.id)).toEqual(["b-item"]);
    const unavailable = buildWorkbenchSnapshot(payload, { projectId: "hidden", hiddenProjectIds: ["hidden"] });
    expect(unavailable.iterations).toEqual([{ key: UNSCHEDULED_WORKBENCH_ITERATION, label: "未设置迭代" }]);
    expect(unavailable.snapshot.items).toEqual([]);
  });

  it("resolves unique name-only references and parent-only workitems without merging named ids", () => {
    const payload: PtracePayload = {
      products: [{ id: "a", name: "项目 A" }],
      sprints: [
        { id: "root", productId: "a", name: "1.0.0", status: "active" },
        { id: "child", productId: "a", name: "App", parentName: "1.0.0" },
        { id: "same-1", productId: "a", name: "同名版本" },
        { id: "same-2", productId: "a", name: "同名版本" },
      ],
      workitems: [
        { id: "by-name", productId: "a", subject: "仅有子迭代名称", sprintName: "App" },
        { id: "parent-only", productId: "a", subject: "仅有父迭代", sprintParentId: "root" },
        { id: "same-1-item", productId: "a", subject: "同名第一版", sprintId: "same-1" },
        { id: "same-2-item", productId: "a", subject: "同名第二版", sprintId: "same-2" },
      ], syncedAt: "2026-08-11T10:00:00+08:00",
    };
    const current = buildWorkbenchSnapshot(payload);
    expect(current.snapshot.items.map((item) => item.id)).toEqual(["by-name", "parent-only"]);
    expect(current.snapshot.items[0].sprintId).toBeUndefined();
    expect(current.snapshot.sprintProgress).toMatchObject({ id: "root", total: 2 });
    expect(current.iterations).toHaveLength(4);
    const sameOne = current.iterations.find((iteration) => iteration.label === "同名版本（ID same-1）")!;
    expect(buildWorkbenchSnapshot(payload, { iterationKey: sameOne.key }).snapshot.items.map((item) => item.id)).toEqual(["same-1-item"]);
  });

  it("keeps empty iteration choices and falls back to unscheduled when no iterations exist", () => {
    const payload: PtracePayload = { products: [{ id: "a", name: "A" }], sprints: [{ id: "empty", productId: "a", name: "未来版本", status: "planning" }], workitems: [], syncedAt: "2026-08-11" };
    expect(buildWorkbenchSnapshot(payload).snapshot.sprintProgress).toMatchObject({ id: "empty", total: 0, children: [] });
    const noIterations = buildWorkbenchSnapshot({ ...payload, sprints: [], workitems: [{ id: "unset", productId: "a", subject: "待分配迭代" }] });
    expect(noIterations.iterationKey).toBe(UNSCHEDULED_WORKBENCH_ITERATION);
    expect(noIterations.snapshot.items[0].id).toBe("unset");
  });
  it("classifies completed and active workitems", () => {
    expect(statusKindOf({ id: "1", productId: "p", subject: "done", completedAt: "2026-08-01" })).toBe("done");
    expect(statusKindOf({ id: "2", productId: "p", subject: "doing", statusName: "进行中" })).toBe("active");
  });

  it("finds overdue and upcoming work without inventing missing dates", () => {
    const snapshot = buildDashboardSnapshot(demoPayload, {
      identityId: "user-me",
      now: "2026-08-11T10:00:00+08:00",
    });
    expect(snapshot.overdueItems.map((item) => item.id)).toContain("wi-3184");
    expect(snapshot.nextSevenDays.map((item) => item.id)).toContain("wi-3287");
    expect(snapshot.queue[0].id).toBe("wi-3287");
  });

  it("limits the queue to six non-overdue workitems scheduled for today through the day after tomorrow", () => {
    const payload = {
      products: [{ id: "p", name: "三日排期" }],
      workitems: [
        { id: "overdue", productId: "p", subject: "已逾期", statusName: "进行中", plannedEndTime: "2026-08-05T09:00:00+08:00" },
        { id: "today-start", productId: "p", subject: "今天开始", statusName: "待处理", plannedStartTime: "2026-08-05T11:00:00+08:00" },
        { id: "today-end", productId: "p", subject: "今天结束", statusName: "待处理", plannedEndTime: "2026-08-05T18:00:00+08:00" },
        { id: "tomorrow-1", productId: "p", subject: "明天一", statusName: "待处理", plannedEndTime: "2026-08-06T10:00:00+08:00" },
        { id: "tomorrow-2", productId: "p", subject: "明天二", statusName: "待处理", plannedEndTime: "2026-08-06T11:00:00+08:00" },
        { id: "after-tomorrow-1", productId: "p", subject: "后天一", statusName: "待处理", plannedEndTime: "2026-08-07T10:00:00+08:00" },
        { id: "after-tomorrow-2", productId: "p", subject: "后天二", statusName: "待处理", plannedEndTime: "2026-08-07T11:00:00+08:00" },
        { id: "extra-start", productId: "p", subject: "额外开始项", statusName: "待处理", plannedStartTime: "2026-08-07T12:00:00+08:00" },
        { id: "day-four", productId: "p", subject: "第四天", statusName: "待处理", plannedStartTime: "2026-08-08T09:00:00+08:00" },
      ],
      syncedAt: "2026-08-05T10:00:00+08:00",
    } as PtracePayload;

    const snapshot = buildDashboardSnapshot(payload, { now: "2026-08-05T10:00:00+08:00" });

    expect(snapshot.queue).toHaveLength(6);
    expect(snapshot.queue.map((item) => item.id)).not.toContain("overdue");
    expect(snapshot.queue.map((item) => item.id)).not.toContain("day-four");
    expect(snapshot.queue.map((item) => item.id)).not.toContain("extra-start");
    expect(snapshot.queue.map((item) => item.id)).toContain("today-start");
    expect(snapshot.overdueItems.map((item) => item.id)).toContain("overdue");
  });

  it("includes open workitems whose schedule spans the queue window", () => {
    const payload = {
      products: [{ id: "p", name: "跨日排期" }],
      workitems: [
        {
          id: "spans-window",
          productId: "p",
          subject: "覆盖当前窗口",
          statusName: "进行中",
          plannedStartTime: "2026-08-12T09:00:00+08:00",
          plannedEndTime: "2026-08-19T18:00:00+08:00",
        },
      ],
      syncedAt: "2026-08-13T10:52:00+08:00",
    } as PtracePayload;

    const snapshot = buildDashboardSnapshot(payload, { now: "2026-08-13T10:52:00+08:00" });

    expect(snapshot.queue.map((item) => item.id)).toContain("spans-window");
    expect(snapshot.nextSevenDays.map((item) => item.id)).toContain("spans-window");
  });

  it("includes workitems whose planned start or end falls on the seven-day timeline", () => {
    const payload = {
      products: [{ id: "p", name: "排期项目" }],
      workitems: [
        { id: "starts-today", productId: "p", subject: "今天开始", statusName: "待处理", plannedStartTime: "2026-08-05T09:00:00+08:00", plannedEndTime: "2026-08-20T18:00:00+08:00" },
        { id: "ends-today", productId: "p", subject: "今天结束", statusName: "进行中", plannedStartTime: "2026-08-01T09:00:00+08:00", plannedEndTime: "2026-08-05T18:00:00+08:00" },
        { id: "starts-only-today", productId: "p", subject: "仅设置今天开始", statusName: "待处理", plannedStartTime: "2026-08-05T13:00:00+08:00" },
        { id: "starts-after-timeline", productId: "p", subject: "时间线外开始", statusName: "待处理", plannedStartTime: "2026-08-12T09:00:00+08:00" },
      ],
      syncedAt: "2026-08-05T10:00:00+08:00",
    } as PtracePayload;

    const snapshot = buildDashboardSnapshot(payload, { now: "2026-08-05T10:00:00+08:00" });

    expect(snapshot.nextSevenDays.map((item) => item.id)).toEqual([
      "ends-today",
      "starts-today",
      "starts-only-today",
    ]);

    const startsToday = snapshot.nextSevenDays.find((item) => item.id === "starts-today") as DashboardItem;
    expect(scheduledItemsOnDay([startsToday], dayjs("2026-08-05T10:00:00+08:00"))).toEqual([startsToday]);
    expect(scheduledItemsOnDay([startsToday], dayjs("2026-08-20T10:00:00+08:00"))).toEqual([startsToday]);
    expect(scheduledItemsOnDay([startsToday], dayjs("2026-08-06T10:00:00+08:00"))).toEqual([startsToday]);
  });

  it("calculates completion for the selected identity", () => {
    const snapshot = buildDashboardSnapshot(demoPayload, {
      identityId: "user-me",
      now: "2026-08-05T10:00:00+08:00",
    });
    expect(snapshot.totalDone).toBe(13);
    expect(snapshot.totalOpen).toBe(7);
    expect(snapshot.completion).toBe(65);
  });

  it("selects workitems created by the current identity and assigned to other people", () => {
    const payload = {
      products: [
        { id: "project-a", name: "项目 A" },
        { id: "project-b", name: "项目 B" },
      ],
      workitems: [
        { id: "delegated", productId: "project-a", subject: "我指派给同事", creatorId: "me", assignedToId: "teammate" },
        { id: "self", productId: "project-a", subject: "我指派给自己", creatorId: "me", assignedToId: "me" },
        { id: "unassigned", productId: "project-a", subject: "我创建但未指派", creatorId: "me" },
        { id: "other", productId: "project-a", subject: "别人创建", creatorId: "other", assignedToId: "teammate" },
        { id: "other-project", productId: "project-b", subject: "其它项目", ptraceCreatorId: "me", ptraceAssignedToId: "teammate" },
      ],
      syncedAt: "2026-08-05T10:00:00+08:00",
    } as PtracePayload;

    const allProjects = buildDashboardSnapshot(payload, { identityId: "me" });
    expect(allProjects.createdForOthersItems.map((item) => item.id)).toEqual(["delegated", "other-project"]);

    const projectA = buildDashboardSnapshot(payload, { identityId: "me", projectId: "project-a" });
    expect(projectA.createdForOthersItems.map((item) => item.id)).toEqual(["delegated"]);
  });

  it("selects workitems assigned to the current identity by a known different creator", () => {
    const payload = {
      products: [
        { id: "project-a", name: "项目 A" },
        { id: "project-b", name: "项目 B" },
      ],
      workitems: [
        { id: "incoming", productId: "project-a", subject: "别人指派给我", creatorId: "other", assignedToId: "me" },
        { id: "self-created", productId: "project-a", subject: "我创建并指派给自己", creatorId: "me", assignedToId: "me" },
        { id: "unknown-creator", productId: "project-a", subject: "建立人缺失", assignedToId: "me" },
        { id: "assigned-elsewhere", productId: "project-a", subject: "指派给同事", creatorId: "other", assignedToId: "teammate" },
        { id: "incoming-other-project", productId: "project-b", subject: "其它项目", ptraceCreatorId: "other", ptraceAssignedToId: "me" },
      ],
      syncedAt: "2026-08-05T10:00:00+08:00",
    } as PtracePayload;

    const allProjects = buildDashboardSnapshot(payload, { identityId: "me" });
    expect(allProjects.assignedByOthersItems.map((item) => item.id)).toEqual(["incoming", "incoming-other-project"]);

    const projectA = buildDashboardSnapshot(payload, { identityId: "me", projectId: "project-a" });
    expect(projectA.assignedByOthersItems.map((item) => item.id)).toEqual(["incoming"]);
  });

  it("separates personal completion from the full project sprint progress by sprint id", () => {
    const payload = {
      products: [{ id: "project", name: "项目" }],
      workitems: [
        { id: "mine-done", productId: "project", subject: "我的已完成", assignedToId: "me", assignedToName: "我", statusName: "已完成", sprintId: "sprint-a", sprintName: "1.0.0" },
        { id: "mine-open", productId: "project", subject: "我的待办", assignedToId: "me", assignedToName: "我", statusName: "待处理", sprintId: "sprint-a", sprintName: "1.0.0" },
        { id: "team-done-1", productId: "project", subject: "团队已完成一", assignedToId: "team", assignedToName: "同事", statusName: "已完成", sprintId: "sprint-a", sprintName: "1.0.0" },
        { id: "team-done-2", productId: "project", subject: "团队已完成二", assignedToId: "team", assignedToName: "同事", statusName: "已完成", sprintId: "sprint-a", sprintName: "1.0.0" },
        { id: "team-open", productId: "project", subject: "团队待办", assignedToId: "team", assignedToName: "同事", statusName: "待处理", sprintId: "sprint-a", sprintName: "1.0.0" },
        { id: "team-cancelled", productId: "project", subject: "团队已取消", assignedToId: "team", assignedToName: "同事", statusName: "已取消", sprintId: "sprint-a", sprintName: "1.0.0" },
        { id: "other-done", productId: "project", subject: "同名其它迭代已完成", assignedToId: "team", assignedToName: "同事", statusName: "已完成", sprintId: "sprint-b", sprintName: "1.0.0" },
        { id: "other-open", productId: "project", subject: "同名其它迭代待办", assignedToId: "team", assignedToName: "同事", statusName: "待处理", sprintId: "sprint-b", sprintName: "1.0.0" },
      ],
      syncedAt: "2026-08-05T11:00:00+08:00",
    } as PtracePayload;

    const snapshot = buildDashboardSnapshot(payload, { identityId: "me", projectId: "project" });

    expect(snapshot.completion).toBe(50);
    expect(snapshot.sprintProgress).toMatchObject({
      name: "1.0.0",
      done: 3,
      total: 5,
      progress: 60,
      children: [],
    });
  });

  it("aggregates parent progress and keeps every child sprint, including empty ones", () => {
    const payload = {
      products: [{ id: "project", name: "项目" }],
      sprints: [
        { id: "parent", productId: "project", name: "1.0.0", status: "active" },
        { id: "p2", productId: "project", name: "P2 UGC平台", status: "planning", parentId: "parent", parentName: "1.0.0" },
        { id: "p0", productId: "project", name: "P0 地基", status: "planning", parentId: "parent", parentName: "1.0.0" },
        { id: "p1", productId: "project", name: "P1 App消费端", status: "planning", parentId: "parent", parentName: "1.0.0" },
      ],
      workitems: [
        { id: "parent-open", productId: "project", subject: "父迭代直属待办", statusName: "待处理", sprintId: "parent", sprintName: "1.0.0" },
        { id: "p0-done", productId: "project", subject: "P0 已完成", statusName: "已完成", sprintId: "p0", sprintName: "P0 地基", sprintParentId: "parent", sprintParentName: "1.0.0" },
        { id: "p0-open", productId: "project", subject: "P0 待办", statusName: "待处理", sprintId: "p0", sprintName: "P0 地基", sprintParentId: "parent", sprintParentName: "1.0.0" },
        { id: "p0-cancelled", productId: "project", subject: "P0 已取消", statusName: "已取消", sprintId: "p0", sprintName: "P0 地基", sprintParentId: "parent", sprintParentName: "1.0.0" },
        { id: "p1-done", productId: "project", subject: "P1 已完成", statusName: "已完成", sprintId: "p1", sprintName: "P1 App消费端", sprintParentId: "parent", sprintParentName: "1.0.0" },
        { id: "p1-open", productId: "project", subject: "P1 待办", statusName: "进行中", sprintId: "p1", sprintName: "P1 App消费端", sprintParentId: "parent", sprintParentName: "1.0.0" },
      ],
      syncedAt: "2026-08-05T11:00:00+08:00",
    } as PtracePayload;

    const snapshot = buildDashboardSnapshot(payload, { projectId: "project" });

    expect(snapshot.sprintProgress).toMatchObject({
      id: "parent",
      name: "1.0.0",
      done: 2,
      total: 5,
      progress: 40,
    });
    expect(snapshot.sprintProgress?.children.map((child) => child.name)).toEqual([
      "P0 地基",
      "P1 App消费端",
      "P2 UGC平台",
    ]);
    expect(snapshot.sprintProgress?.children[0]).toMatchObject({ done: 1, total: 2, progress: 50 });
    expect(snapshot.sprintProgress?.children[2]).toMatchObject({ done: 0, total: 0, progress: 0 });
  });

  it("classifies statuses by workitem type and ptrace status id", () => {
    const payload = {
      products: [{ id: "189", name: "Latent" }],
      workitems: [
        { id: "2109", productId: "189", typeId: "3", workitemNo: "PT-2081", subject: "case_gallery", workitemTypeName: "任务", ptraceStatusId: "12", ptraceStatusName: "進行中", statusName: "处理中" },
        { id: "2112", productId: "189", typeId: "3", workitemNo: "PT-2084", subject: "core/analytics", workitemTypeName: "任务", ptraceStatusId: "11", ptraceStatusName: "待辦", statusName: "待处理", startedAt: "2026-08-05 05:07:30" },
        { id: "req", productId: "189", typeId: "1", subject: "需求", workitemTypeName: "产品类需求", ptraceStatusId: "2", ptraceStatusName: "進行中" },
        { id: "bug", productId: "189", typeId: "2", subject: "缺陷", workitemTypeName: "缺陷", ptraceStatusId: "7", ptraceStatusName: "修復中" },
        { id: "done", productId: "189", typeId: "3", subject: "已完成任务", workitemTypeName: "任务", ptraceStatusId: "13", ptraceStatusName: "已完成" },
      ],
      workitemStatuses: [
        { id: "11", typeId: "3", code: "todo", name: "待辦" },
        { id: "2", typeId: "1", code: "in_progress", name: "進行中" },
        { id: "7", typeId: "2", code: "fixing", name: "修復中" },
        { id: "12", typeId: "3", code: "doing", name: "進行中" },
        { id: "13", typeId: "3", code: "done", name: "已完成" },
      ],
      syncedAt: "2026-08-05T11:00:00+08:00",
    } as unknown as PtracePayload;

    const snapshot = buildDashboardSnapshot(payload, { now: "2026-08-05T11:00:00+08:00" });
    expect(snapshot.activeCount).toBe(3);
    expect(snapshot.totalDone).toBe(1);
    expect(snapshot.items.find((item) => item.workitemNo === "PT-2081")?.statusLabel).toBe("进行中");
    expect(snapshot.items.find((item) => item.workitemNo === "PT-2084")?.statusKind).toBe("todo");
  });

  it("normalizes the English Task type label to 任务", () => {
    const snapshot = buildDashboardSnapshot({
      products: [{ id: "project", name: "项目" }],
      workitems: [
        { id: "english", productId: "project", subject: "英文任务", workitemTypeName: "Task" },
        { id: "chinese", productId: "project", subject: "中文任务", workitemTypeName: "任务" },
      ],
      syncedAt: "2026-08-19T10:00:00+08:00",
    }, { now: "2026-08-19T10:00:00+08:00" });

    expect(snapshot.items.map((item) => item.typeLabel)).toEqual(["任务", "任务"]);
  });

  it("sorts open workitems by end time, then start time, before status", () => {
    const payload = {
      products: [{ id: "p", name: "排期项目" }],
      workitems: [
        { id: "active-later", productId: "p", subject: "进行中但后到期", statusName: "进行中", plannedStartTime: "2026-08-05T09:00:00+08:00", plannedEndTime: "2026-08-07T18:00:00+08:00", priority: 1 },
        { id: "todo-today-late-start", productId: "p", subject: "今天到期晚开始", statusName: "待处理", plannedStartTime: "2026-08-05T13:00:00+08:00", plannedEndTime: "2026-08-05T18:00:00+08:00", priority: 1 },
        { id: "todo-today-early-start", productId: "p", subject: "今天到期早开始", statusName: "待处理", plannedStartTime: "2026-08-05T09:00:00+08:00", plannedEndTime: "2026-08-05T18:00:00+08:00", priority: 3 },
        { id: "unscheduled", productId: "p", subject: "未排期", statusName: "进行中", priority: 1 },
        { id: "done-old", productId: "p", subject: "已完成", statusName: "已完成", plannedEndTime: "2026-08-01T18:00:00+08:00", completedAt: "2026-08-01T17:00:00+08:00" },
      ],
      syncedAt: "2026-08-05T10:00:00+08:00",
    } as PtracePayload;

    const snapshot = buildDashboardSnapshot(payload, { now: "2026-08-05T10:00:00+08:00" });
    expect(snapshot.items.slice().sort(compareItemsBySchedule).map((item) => item.id)).toEqual([
      "todo-today-early-start",
      "todo-today-late-start",
      "active-later",
      "unscheduled",
      "done-old",
    ]);
  });
});
