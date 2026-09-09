import dayjs, { type Dayjs } from "dayjs";
import type { DashboardItem } from "./types";

export type GanttView = "week" | "month";

export interface GanttDay {
  key: string;
  dayOfMonth: number;
  weekday: string;
  isToday: boolean;
  isWeekend: boolean;
}

export interface GanttWeek {
  key: string;
  label: string;
  span: number;
}

export interface GanttRange {
  start: string;
  end: string;
  days: GanttDay[];
  weeks: GanttWeek[];
}

export interface GanttIterationGroup {
  key: string;
  name: string;
  items: DashboardItem[];
}

export interface GanttProjectGroup {
  key: string;
  name: string;
  iterations: GanttIterationGroup[];
}

export interface GanttBarPosition {
  startIndex: number;
  span: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function mondayOf(value: Dayjs) {
  const date = value.startOf("day");
  return date.subtract((date.day() + 6) % 7, "day");
}

function validSchedule(item: DashboardItem) {
  if (!item.plannedStartTime || !item.plannedEndTime) return false;
  const start = dayjs(item.plannedStartTime);
  const end = dayjs(item.plannedEndTime);
  return start.isValid() && end.isValid() && !end.isBefore(start);
}

export function buildGanttRange(
  anchor: string | Date | Dayjs,
  view: GanttView,
  today: string | Date | Dayjs = dayjs(),
): GanttRange {
  const start = mondayOf(dayjs(anchor));
  const dayCount = view === "month" ? 28 : 7;
  const currentDay = dayjs(today);
  const days = Array.from({ length: dayCount }, (_, index): GanttDay => {
    const date = start.add(index, "day");
    return {
      key: date.format("YYYY-MM-DD"),
      dayOfMonth: date.date(),
      weekday: weekdayLabels[date.day()],
      isToday: date.isSame(currentDay, "day"),
      isWeekend: date.day() === 0 || date.day() === 6,
    };
  });
  const weeks = Array.from({ length: dayCount / 7 }, (_, index): GanttWeek => {
    const weekStart = start.add(index * 7, "day");
    const weekEnd = weekStart.add(6, "day");
    const crossesMonth = weekStart.month() !== weekEnd.month();
    return {
      key: weekStart.format("YYYY-MM-DD"),
      label: crossesMonth
        ? `${weekStart.month() + 1}月${weekStart.date()}日 – ${weekEnd.month() + 1}月${weekEnd.date()}日`
        : `${weekStart.month() + 1}月${weekStart.date()}日 – ${weekEnd.date()}日`,
      span: 7,
    };
  });

  return {
    start: start.format("YYYY-MM-DD"),
    end: start.add(dayCount - 1, "day").format("YYYY-MM-DD"),
    days,
    weeks,
  };
}

export function moveGanttAnchor(anchor: string | Date | Dayjs, view: GanttView, direction: -1 | 1) {
  return dayjs(anchor)
    .add(direction * (view === "month" ? 28 : 7), "day")
    .format("YYYY-MM-DD");
}

export function splitGanttItems(items: DashboardItem[]) {
  const scheduled: DashboardItem[] = [];
  const unscheduled: DashboardItem[] = [];
  for (const item of items) {
    (validSchedule(item) ? scheduled : unscheduled).push(item);
  }
  return { scheduled, unscheduled };
}

export function ganttBarPosition(item: DashboardItem, range: GanttRange): GanttBarPosition | null {
  if (!validSchedule(item)) return null;
  const rangeStart = dayjs(range.start).startOf("day");
  const rangeEnd = dayjs(range.end).endOf("day");
  const itemStart = dayjs(item.plannedStartTime).startOf("day");
  const itemEnd = dayjs(item.plannedEndTime).endOf("day");
  if (itemEnd.isBefore(rangeStart) || itemStart.isAfter(rangeEnd)) return null;

  const visibleStart = itemStart.isBefore(rangeStart) ? rangeStart : itemStart;
  const visibleEnd = itemEnd.isAfter(rangeEnd) ? rangeEnd : itemEnd;
  return {
    startIndex: visibleStart.diff(rangeStart, "day"),
    span: visibleEnd.startOf("day").diff(visibleStart.startOf("day"), "day") + 1,
    clippedStart: itemStart.isBefore(rangeStart),
    clippedEnd: itemEnd.isAfter(rangeEnd),
  };
}

export function groupGanttItems(items: DashboardItem[], range: GanttRange): GanttProjectGroup[] {
  const projects = new Map<string, Map<string, DashboardItem[]>>();
  for (const item of items) {
    if (!ganttBarPosition(item, range)) continue;
    const project = projects.get(item.productName) || new Map<string, DashboardItem[]>();
    const iterationName = item.sprintName || "未归属迭代";
    const iterationItems = project.get(iterationName) || [];
    iterationItems.push(item);
    project.set(iterationName, iterationItems);
    projects.set(item.productName, project);
  }

  return [...projects.entries()]
    .map(([projectName, iterations]) => ({
      key: `project:${projectName}`,
      name: projectName,
      iterations: [...iterations.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "zh-CN", { numeric: true }))
        .map(([iterationName, iterationItems]) => ({
          key: `project:${projectName}:iteration:${iterationName}`,
          name: iterationName,
          items: [...iterationItems].sort((a, b) => {
            const startDifference = dayjs(a.plannedStartTime).valueOf() - dayjs(b.plannedStartTime).valueOf();
            return startDifference || a.displayNo.localeCompare(b.displayNo);
          }),
        })),
    }));
}
