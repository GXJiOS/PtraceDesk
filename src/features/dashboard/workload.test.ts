import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import type { DashboardItem } from "./types";
import { buildDailyWorkloads, completedItemsOnDay, scheduledItemsOnDay } from "./workload";

function item(id: string, input: Partial<DashboardItem>): DashboardItem {
  return {
    id,
    productId: "project",
    productName: "项目",
    subject: id,
    displayNo: id,
    assigneeId: "me",
    assigneeName: "我",
    typeLabel: "任务",
    statusLabel: "待办",
    statusKind: "todo",
    isOverdue: false,
    dueLabel: "计划内",
    ...input,
  };
}

describe("daily workload", () => {
  it("detects over-capacity days and overlapping workitems", () => {
    const workloads = buildDailyWorkloads([
      item("first", {
        plannedStartTime: "2026-08-06T09:00:00+08:00",
        plannedEndTime: "2026-08-06T13:00:00+08:00",
        estimatedHours: 4,
      }),
      item("second", {
        plannedStartTime: "2026-08-06T11:00:00+08:00",
        plannedEndTime: "2026-08-06T18:00:00+08:00",
        estimatedHours: 5,
      }),
    ], dayjs("2026-08-06T08:00:00+08:00"));

    expect(workloads[0]).toMatchObject({
      estimatedHours: 9,
      scheduledCount: 2,
      conflictItemCount: 2,
      isOverCapacity: true,
    });
  });

  it("distributes a cross-day estimate evenly across each calendar day", () => {
    const workloads = buildDailyWorkloads([
      item("cross-day", {
        plannedStartTime: "2026-08-07T16:00:00+08:00",
        plannedEndTime: "2026-08-10T14:00:00+08:00",
        estimatedHours: 6,
      }),
    ], dayjs("2026-08-07T08:00:00+08:00"), 4);

    expect(workloads.map((workload) => workload.estimatedHours)).toEqual([1.5, 1.5, 1.5, 1.5]);
    expect(workloads.map((workload) => workload.scheduledCount)).toEqual([1, 1, 1, 1]);
  });

  it("reports scheduled workitems without an estimate", () => {
    const [workload] = buildDailyWorkloads([
      item("missing-estimate", { plannedStartTime: "2026-08-06T10:00:00+08:00" }),
    ], dayjs("2026-08-06T08:00:00+08:00"));

    expect(workload).toMatchObject({
      estimatedHours: 0,
      scheduledCount: 1,
      unestimatedCount: 1,
      isOverCapacity: false,
    });
  });

  it("includes cross-day workitems in every intersecting calendar day", () => {
    const crossDay = item("cross-day", {
      plannedStartTime: "2026-08-06T16:00:00+08:00",
      plannedEndTime: "2026-08-08T11:00:00+08:00",
    });

    expect(scheduledItemsOnDay([crossDay], dayjs("2026-08-07T12:00:00+08:00"))).toEqual([crossDay]);
  });

  it("counts only genuinely completed workitems on their completion day", () => {
    const completed = item("completed", {
      statusKind: "done",
      statusLabel: "已完成",
      completedAt: "2026-08-06T17:30:00+08:00",
    });
    const doneWithoutTime = item("missing-time", { statusKind: "done", statusLabel: "已完成" });
    const openWithTime = item("still-open", { completedAt: "2026-08-06T18:00:00+08:00" });
    const day = dayjs("2026-08-06T08:00:00+08:00");

    expect(completedItemsOnDay([completed, doneWithoutTime, openWithTime], day)).toEqual([completed]);
    expect(buildDailyWorkloads([completed, doneWithoutTime, openWithTime], day)[0].completedCount).toBe(1);
  });
});
