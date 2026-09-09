import dayjs, { type Dayjs } from "dayjs";
import type { DashboardItem } from "./types";

export const DAILY_CAPACITY_HOURS = 8;

export interface DailyWorkload {
  date: string;
  estimatedHours: number;
  capacityHours: number;
  scheduledCount: number;
  completedCount: number;
  unestimatedCount: number;
  conflictItemCount: number;
  isOverCapacity: boolean;
}

interface ScheduledRange {
  item: DashboardItem;
  start: Dayjs;
  end: Dayjs;
  dayCount: number;
}

function validDate(value?: string | null) {
  if (!value) return null;
  const date = dayjs(value);
  return date.isValid() ? date : null;
}

function scheduledRange(item: DashboardItem): ScheduledRange | null {
  const start = validDate(item.plannedStartTime);
  const end = validDate(item.plannedEndTime);
  if (!start && !end) return null;

  const rangeStart = start || end!;
  const rangeEnd = end || start!;
  if (rangeEnd.isBefore(rangeStart)) return null;

  return {
    item,
    start: rangeStart,
    end: rangeEnd,
    dayCount: rangeEnd.startOf("day").diff(rangeStart.startOf("day"), "day") + 1,
  };
}

function intersectsDay(range: ScheduledRange, day: Dayjs) {
  return !range.end.isBefore(day.startOf("day")) && !range.start.isAfter(day.endOf("day"));
}

export function scheduledItemsOnDay(items: DashboardItem[], day: Dayjs) {
  return items.filter((item) => {
    const range = scheduledRange(item);
    return range ? intersectsDay(range, day) : false;
  });
}

export function completedItemsOnDay(items: DashboardItem[], day: Dayjs) {
  return items.filter((item) => {
    if (item.statusKind !== "done" || !item.completedAt) return false;
    const completedAt = dayjs(item.completedAt);
    return completedAt.isValid() && completedAt.isSame(day, "day");
  });
}

function rangesOverlapOnDay(first: ScheduledRange, second: ScheduledRange, day: Dayjs) {
  if (!first.item.plannedStartTime || !first.item.plannedEndTime) return false;
  if (!second.item.plannedStartTime || !second.item.plannedEndTime) return false;

  const dayStart = day.startOf("day");
  const dayEnd = day.endOf("day");
  const firstStart = first.start.isAfter(dayStart) ? first.start : dayStart;
  const firstEnd = first.end.isBefore(dayEnd) ? first.end : dayEnd;
  const secondStart = second.start.isAfter(dayStart) ? second.start : dayStart;
  const secondEnd = second.end.isBefore(dayEnd) ? second.end : dayEnd;

  return firstStart.isBefore(secondEnd) && secondStart.isBefore(firstEnd);
}

function roundHours(hours: number) {
  return Math.round(hours * 10) / 10;
}

export function buildDailyWorkloads(
  items: DashboardItem[],
  start: Dayjs = dayjs(),
  dayCount = 7,
  capacityHours = DAILY_CAPACITY_HOURS,
): DailyWorkload[] {
  const ranges = items.map(scheduledRange).filter((range): range is ScheduledRange => Boolean(range));

  return Array.from({ length: dayCount }, (_, index) => {
    const day = start.add(index, "day");
    const scheduled = ranges.filter((range) => intersectsDay(range, day));
    const conflictIds = new Set<string>();

    for (let firstIndex = 0; firstIndex < scheduled.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < scheduled.length; secondIndex += 1) {
        const first = scheduled[firstIndex];
        const second = scheduled[secondIndex];
        if (!rangesOverlapOnDay(first, second, day)) continue;
        conflictIds.add(first.item.id);
        conflictIds.add(second.item.id);
      }
    }

    const estimatedHours = roundHours(scheduled.reduce((total, range) => {
      const estimate = range.item.estimatedHours;
      return typeof estimate === "number" && estimate > 0
        ? total + estimate / range.dayCount
        : total;
    }, 0));
    const unestimatedCount = scheduled.filter((range) => !range.item.estimatedHours || range.item.estimatedHours <= 0).length;

    return {
      date: day.format("YYYY-MM-DD"),
      estimatedHours,
      capacityHours,
      scheduledCount: scheduled.length,
      completedCount: completedItemsOnDay(items, day).length,
      unestimatedCount,
      conflictItemCount: conflictIds.size,
      isOverCapacity: estimatedHours > capacityHours,
    };
  });
}
