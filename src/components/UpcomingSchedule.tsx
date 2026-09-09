import dayjs, { type Dayjs } from "dayjs";
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { compareItemsBySchedule } from "../features/dashboard/dashboardMapper";
import type { DashboardItem } from "../features/dashboard/types";
import {
  buildDailyWorkloads,
  completedItemsOnDay,
  scheduledItemsOnDay,
  type DailyWorkload,
} from "../features/dashboard/workload";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const mondayFirstWeekdays = ["一", "二", "三", "四", "五", "六", "日"];

function calendarStart(month: Dayjs) {
  const firstDay = month.startOf("month");
  const mondayOffset = (firstDay.day() + 6) % 7;
  return firstDay.subtract(mondayOffset, "day");
}

function scheduleText(item: DashboardItem) {
  const start = item.plannedStartTime && dayjs(item.plannedStartTime).isValid()
    ? dayjs(item.plannedStartTime).format("M/D HH:mm")
    : "未设置";
  const end = item.plannedEndTime && dayjs(item.plannedEndTime).isValid()
    ? dayjs(item.plannedEndTime).format("M/D HH:mm")
    : "未设置";
  return `${start} → ${end}`;
}

function completedText(item: DashboardItem) {
  return item.completedAt && dayjs(item.completedAt).isValid()
    ? dayjs(item.completedAt).format("HH:mm 完成")
    : "完成时间未记录";
}

function DayItemList({
  kind,
  items,
  onDetails,
}: {
  kind: "scheduled" | "completed";
  items: DashboardItem[];
  onDetails: (item: DashboardItem) => void;
}) {
  const isCompleted = kind === "completed";
  return (
    <section className={`calendar-detail-group ${kind}`} aria-label={isCompleted ? "当日完成工单" : "当日排期工单"}>
      <div className="calendar-detail-group-heading">
        {isCompleted ? <CheckCircle size={17} weight="fill" /> : <CalendarBlank size={17} weight="fill" />}
        <strong>{isCompleted ? "当日完成" : "当日排期"}</strong>
        <span>{items.length}</span>
      </div>
      <div className="calendar-detail-list">
        {items.length ? items.map((item) => (
          <button type="button" onClick={() => onDetails(item)} key={`${kind}-${item.id}`}>
            <span className="calendar-detail-number">
              <strong>{item.displayNo}</strong>
              <em>ID {item.id}</em>
            </span>
            <span className="calendar-detail-copy">
              <strong>{item.subject}</strong>
              <small>{isCompleted ? completedText(item) : scheduleText(item)}</small>
            </span>
          </button>
        )) : (
          <div className="calendar-detail-empty">{isCompleted ? "当天没有完成工单" : "当天没有排期工单"}</div>
        )}
      </div>
    </section>
  );
}

function CalendarDayModal({
  day,
  items,
  workload,
  onClose,
  onDetails,
}: {
  day: Dayjs;
  items: DashboardItem[];
  workload: DailyWorkload;
  onClose: () => void;
  onDetails: (item: DashboardItem) => void;
}) {
  const scheduledItems = useMemo(
    () => scheduledItemsOnDay(items, day).sort(compareItemsBySchedule),
    [day, items],
  );
  const completedItems = useMemo(
    () => completedItemsOnDay(items, day).sort((first, second) => (
      dayjs(second.completedAt).valueOf() - dayjs(first.completedAt).valueOf()
    )),
    [day, items],
  );
  const title = `${day.format("M月D日")} 周${weekdayLabels[day.day()]}`;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const openDetails = (item: DashboardItem) => {
    onClose();
    onDetails(item);
  };

  return (
    <div className="modal-backdrop calendar-detail-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="calendar-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label="关闭日期详情" onClick={onClose}><X size={18} /></button>
        <div className="calendar-detail-heading">
          <div className="modal-icon"><CalendarBlank size={25} weight="duotone" /></div>
          <div>
            <span>工作日历</span>
            <h2 id="calendar-detail-title">{title}</h2>
          </div>
        </div>
        <div className="calendar-detail-summary">
          <span className="scheduled"><CalendarBlank size={14} weight="fill" />排期 {scheduledItems.length}</span>
          <span className="completed"><CheckCircle size={14} weight="fill" />完成 {completedItems.length}</span>
          {workload.scheduledCount > 0 && (
            <span className={workload.isOverCapacity ? "capacity warning" : "capacity"}>
              <Clock size={14} weight="fill" />{workload.estimatedHours} / {workload.capacityHours} 小时{workload.isOverCapacity ? " · 超负荷" : ""}
            </span>
          )}
          {workload.conflictItemCount > 0 && <span className="warning"><WarningCircle size={14} weight="fill" />{workload.conflictItemCount} 条冲突</span>}
          {workload.unestimatedCount > 0 && <span>{workload.unestimatedCount} 条未估时</span>}
        </div>
        <div className="calendar-detail-groups">
          <DayItemList kind="completed" items={completedItems} onDetails={openDetails} />
          <DayItemList kind="scheduled" items={scheduledItems} onDetails={openDetails} />
        </div>
      </section>
    </div>
  );
}

export function UpcomingSchedule({ items, onDetails }: { items: DashboardItem[]; onDetails: (item: DashboardItem) => void }) {
  const now = dayjs();
  const [month, setMonth] = useState(() => now.startOf("month"));
  const [selectedDate, setSelectedDate] = useState<string>();
  const start = useMemo(() => calendarStart(month), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => start.add(index, "day")), [start]);
  const workloads = useMemo(() => buildDailyWorkloads(items, start, days.length), [days.length, items, start]);
  const workloadByDate = useMemo(
    () => new Map(workloads.map((workload) => [workload.date, workload])),
    [workloads],
  );
  const attentionDays = days.filter((day) => {
    if (!day.isSame(month, "month")) return false;
    const workload = workloadByDate.get(day.format("YYYY-MM-DD"));
    return workload && (
      workload.isOverCapacity || workload.conflictItemCount > 0 || workload.unestimatedCount > 0
    );
  }).length;
  const selectedDay = selectedDate ? dayjs(selectedDate) : null;
  const selectedWorkload = selectedDate ? workloadByDate.get(selectedDate) : undefined;

  const changeMonth = (offset: number) => {
    setMonth((current) => current.add(offset, "month").startOf("month"));
    setSelectedDate(undefined);
  };

  const showToday = () => {
    setMonth(now.startOf("month"));
    setSelectedDate(undefined);
  };

  return (
    <aside className="schedule-panel" id="schedule" aria-labelledby="schedule-title">
      <div className="schedule-header">
        <h2 id="schedule-title">工作日历</h2>
        {attentionDays > 0 && <span className="schedule-attention"><WarningCircle size={13} weight="fill" />{attentionDays} 天需关注</span>}
      </div>

      <div className="calendar-toolbar">
        <strong>{month.format("YYYY年M月")}</strong>
        <div>
          <button type="button" aria-label="上个月" onClick={() => changeMonth(-1)}><CaretLeft size={15} /></button>
          <button type="button" className="calendar-today-button" onClick={showToday}>今天</button>
          <button type="button" aria-label="下个月" onClick={() => changeMonth(1)}><CaretRight size={15} /></button>
        </div>
      </div>

      <div className="calendar-legend" aria-label="日历图例">
        <span className="scheduled"><CalendarBlank size={12} weight="fill" />排期</span>
        <span className="completed"><CheckCircle size={12} weight="fill" />完成</span>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {mondayFirstWeekdays.map((weekday) => <span key={weekday}>周{weekday}</span>)}
      </div>

      <div className="work-calendar" role="grid" aria-label={`${month.format("YYYY年M月")}工作日历`}>
        {days.map((day) => {
          const date = day.format("YYYY-MM-DD");
          const workload = workloadByDate.get(date)!;
          const isToday = day.isSame(now, "day");
          const isOutsideMonth = !day.isSame(month, "month");
          const needsAttention = workload.isOverCapacity || workload.conflictItemCount > 0 || workload.unestimatedCount > 0;
          const classes = [
            "calendar-day",
            isToday ? "today" : "",
            isOutsideMonth ? "outside-month" : "",
            needsAttention ? "needs-attention" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              type="button"
              className={classes}
              role="gridcell"
              aria-label={`${day.format("M月D日")}，排期 ${workload.scheduledCount} 个，完成 ${workload.completedCount} 个${needsAttention ? "，需要关注" : ""}`}
              onClick={() => setSelectedDate(date)}
              key={date}
            >
              <span className="calendar-day-number">{day.date()}</span>
              {needsAttention && <WarningCircle className="calendar-day-warning" size={10} weight="fill" aria-hidden="true" />}
              <span className="calendar-day-counts">
                {workload.scheduledCount > 0 && <em className="scheduled"><CalendarBlank size={10} weight="fill" />{workload.scheduledCount}</em>}
                {workload.completedCount > 0 && <em className="completed"><CheckCircle size={10} weight="fill" />{workload.completedCount}</em>}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDay?.isValid() && selectedWorkload && (
        <CalendarDayModal
          day={selectedDay}
          items={items}
          workload={selectedWorkload}
          onClose={() => setSelectedDate(undefined)}
          onDetails={onDetails}
        />
      )}
    </aside>
  );
}
