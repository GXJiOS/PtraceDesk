import { describe, expect, it } from "vitest";
import type { DashboardItem } from "./types";
import {
  buildGanttRange,
  ganttBarPosition,
  groupGanttItems,
  moveGanttAnchor,
  splitGanttItems,
} from "./gantt";

function item(id: string, overrides: Partial<DashboardItem> = {}): DashboardItem {
  return {
    id,
    productId: "project",
    productName: "Aurora 官网改版",
    subject: `工单 ${id}`,
    displayNo: `PT-${id}`,
    assigneeId: "me",
    assigneeName: "向建",
    typeLabel: "任务",
    statusLabel: "待处理",
    statusKind: "todo",
    isOverdue: false,
    dueLabel: "未排期",
    ...overrides,
  };
}

describe("Gantt timeline model", () => {
  it("builds a Monday-first week and four-week month around the anchor", () => {
    const week = buildGanttRange("2026-08-11", "week", "2026-08-11");
    const month = buildGanttRange("2026-08-11", "month", "2026-08-11");

    expect(week.start).toBe("2026-08-10");
    expect(week.end).toBe("2026-08-16");
    expect(week.days).toHaveLength(7);
    expect(week.days.find((day) => day.isToday)?.key).toBe("2026-08-11");
    expect(month.end).toBe("2026-09-06");
    expect(month.days).toHaveLength(28);
    expect(month.weeks.map((entry) => entry.label)).toEqual([
      "8月10日 – 16日",
      "8月17日 – 23日",
      "8月24日 – 30日",
      "8月31日 – 9月6日",
    ]);
  });

  it("moves by one visible range", () => {
    expect(moveGanttAnchor("2026-08-11", "week", 1)).toBe("2026-08-18");
    expect(moveGanttAnchor("2026-08-11", "month", -1)).toBe("2026-07-14");
  });

  it("requires a valid start and end date", () => {
    const complete = item("1", {
      plannedStartTime: "2026-08-11T09:00:00+08:00",
      plannedEndTime: "2026-08-12T18:00:00+08:00",
    });
    const missingStart = item("2", { plannedEndTime: "2026-08-12T18:00:00+08:00" });
    const reversed = item("3", {
      plannedStartTime: "2026-08-13T09:00:00+08:00",
      plannedEndTime: "2026-08-12T18:00:00+08:00",
    });

    const result = splitGanttItems([complete, missingStart, reversed]);
    expect(result.scheduled.map((entry) => entry.id)).toEqual(["1"]);
    expect(result.unscheduled.map((entry) => entry.id)).toEqual(["2", "3"]);
  });

  it("clips bars to the visible date range", () => {
    const range = buildGanttRange("2026-08-11", "week", "2026-08-11");
    const startsBefore = item("1", {
      plannedStartTime: "2026-08-05T09:00:00+08:00",
      plannedEndTime: "2026-08-12T18:00:00+08:00",
    });
    const endsAfter = item("2", {
      plannedStartTime: "2026-08-15T09:00:00+08:00",
      plannedEndTime: "2026-08-20T18:00:00+08:00",
    });

    expect(ganttBarPosition(startsBefore, range)).toEqual({
      startIndex: 0,
      span: 3,
      clippedStart: true,
      clippedEnd: false,
    });
    expect(ganttBarPosition(endsAfter, range)).toEqual({
      startIndex: 5,
      span: 2,
      clippedStart: false,
      clippedEnd: true,
    });
  });

  it("groups visible workitems by project and iteration", () => {
    const range = buildGanttRange("2026-08-11", "week", "2026-08-11");
    const items = [
      item("2", { sprintName: "P2", plannedStartTime: "2026-08-12", plannedEndTime: "2026-08-13" }),
      item("1", { sprintName: "P1", plannedStartTime: "2026-08-10", plannedEndTime: "2026-08-11" }),
      item("3", { productName: "移动端", sprintName: null, plannedStartTime: "2026-08-14", plannedEndTime: "2026-08-15" }),
      item("4", { plannedStartTime: "2026-09-01", plannedEndTime: "2026-09-02" }),
    ];

    const groups = groupGanttItems(items, range);
    expect(groups.map((group) => group.name)).toEqual(["Aurora 官网改版", "移动端"]);
    expect(groups[0].iterations.map((iteration) => iteration.name)).toEqual(["P1", "P2"]);
    expect(groups[1].iterations[0].name).toBe("未归属迭代");
  });
});
