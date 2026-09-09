import { CalendarBlank, CaretDown, CaretRight, Play, WarningCircle } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useId, useState } from "react";
import { compareItemsBySchedule } from "../features/dashboard/dashboardMapper";
import type { DashboardItem } from "../features/dashboard/types";
import { WorkItemRow } from "./WorkItemRow";

export interface WorkbenchQueueGroups {
  today: DashboardItem[];
  overdue: DashboardItem[];
  later: DashboardItem[];
}

export function groupWorkbenchItems(items: readonly DashboardItem[], now?: string | Date): WorkbenchQueueGroups {
  const startOfDay = dayjs(now).startOf("day");
  const endOfDay = startOfDay.endOf("day");
  const groups: WorkbenchQueueGroups = { today: [], overdue: [], later: [] };
  for (const item of items) {
    if (item.statusKind === "done" || item.statusKind === "cancelled") continue;
    if (item.isOverdue) {
      groups.overdue.push(item);
      continue;
    }
    const start = item.plannedStartTime ? dayjs(item.plannedStartTime) : null;
    const end = item.plannedEndTime ? dayjs(item.plannedEndTime) : null;
    const startsToday = start?.isValid() && start.isSame(startOfDay, "day");
    const endsToday = end?.isValid() && end.isSame(startOfDay, "day");
    const spansToday = start?.isValid() && end?.isValid()
      && !start.isAfter(endOfDay) && !end.isBefore(startOfDay);
    if (item.statusKind === "active" || startsToday || endsToday || spansToday) groups.today.push(item);
    else groups.later.push(item);
  }
  groups.today.sort(compareItemsBySchedule);
  groups.overdue.sort(compareItemsBySchedule);
  groups.later.sort(compareItemsBySchedule);
  return groups;
}

interface TodayQueueProps {
  groups: WorkbenchQueueGroups;
  focusedItemId?: string;
  onFocus: (item: DashboardItem) => void;
  onDetails: (item: DashboardItem) => void;
}

export function TodayQueue({ groups, focusedItemId, onFocus, onDetails }: TodayQueueProps) {
  const [laterOpen, setLaterOpen] = useState(false);
  const laterId = useId();
  const renderItems = (items: DashboardItem[]) => items.map((item) => (
    <WorkItemRow item={item} variant="workbench" selected={item.id === focusedItemId} onFocus={() => onFocus(item)} onDetails={() => onDetails(item)} key={item.id} />
  ));
  return (
    <section className="today-panel" id="queue" aria-labelledby="today-title">
      <h2 id="today-title" className="sr-only">今日工单</h2>
      <div className="queue-content">
        <section className="queue-group" aria-labelledby="queue-today-heading">
          <h3 className="queue-heading today-heading" id="queue-today-heading"><Play size={15} weight="fill" />今日计划 <span>{groups.today.length}</span></h3>
          <div className="queue-items">
            {groups.today.length ? renderItems(groups.today) : <div className="queue-empty">当前范围暂无今日计划</div>}
          </div>
        </section>
        {groups.overdue.length > 0 && (
          <section className="queue-group" aria-labelledby="queue-overdue-heading">
            <h3 className="queue-heading risk-heading" id="queue-overdue-heading"><WarningCircle size={16} weight="fill" />已逾期 <span>{groups.overdue.length}</span></h3>
            <div className="queue-items">{renderItems(groups.overdue)}</div>
          </section>
        )}
        {groups.later.length > 0 && (
          <section className="queue-group" aria-labelledby="queue-later-heading">
            <h3 className="queue-later-heading" id="queue-later-heading">
              <button type="button" className="queue-heading queue-later-toggle" aria-expanded={laterOpen} aria-controls={laterId} onClick={() => setLaterOpen((open) => !open)}>
                <CalendarBlank size={16} />随后安排 <span>{groups.later.length}</span>
                <span className="queue-expand-label">{laterOpen ? "收起" : "展开全部"}{laterOpen ? <CaretDown size={13} /> : <CaretRight size={13} />}</span>
              </button>
            </h3>
            <div className="queue-items" id={laterId} hidden={!laterOpen}>{laterOpen && renderItems(groups.later)}</div>
          </section>
        )}
      </div>
    </section>
  );
}
