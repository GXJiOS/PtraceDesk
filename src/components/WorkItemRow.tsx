import dayjs from "dayjs";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { DashboardItem } from "../features/dashboard/types";

interface WorkItemRowProps {
  item: DashboardItem;
  variant?: "default" | "workbench";
  selected: boolean;
  onFocus: () => void;
  onDetails: () => void;
}

function scheduleDate(value?: string | null) {
  if (!value) return "未设置";
  const date = dayjs(value);
  return date.isValid() ? date.format("M月D日 HH:mm") : "未设置";
}

function workbenchScheduleDate(value?: string | null) {
  if (!value) return "未设置";
  const date = dayjs(value);
  if (!date.isValid()) return "未设置";
  const today = dayjs().startOf("day");
  if (date.isSame(today, "day")) return `今天 ${date.format("HH:mm")}`;
  if (date.isSame(today.add(1, "day"), "day")) return `明天 ${date.format("HH:mm")}`;
  return date.format(date.year() === today.year() ? "M月D日 HH:mm" : "YYYY年M月D日 HH:mm");
}

function urgencyOf(item: DashboardItem) {
  if (item.statusKind === "done") return { label: "已完成", className: "urgency-done" };
  const value = item.plannedEndTime;
  if (!value) return { label: "未排期", className: "urgency-unscheduled" };
  const end = dayjs(value);
  if (!end.isValid()) return { label: "未排期", className: "urgency-unscheduled" };
  const now = dayjs();
  if (end.isBefore(now)) return { label: "已逾期", className: "urgency-overdue" };
  const today = now.startOf("day");
  const endDay = end.startOf("day");
  if (endDay.isSame(today)) return { label: "今日到期", className: "urgency-today" };
  if (endDay.isSame(today.add(1, "day"))) return { label: "明日到期", className: "urgency-tomorrow" };
  return { label: "计划内", className: "urgency-normal" };
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

export function WorkItemRow({ item, variant = "default", selected, onFocus, onDetails }: WorkItemRowProps) {
  const urgency = urgencyOf(item);
  const workbench = variant === "workbench";
  const formatSchedule = workbench ? workbenchScheduleDate : scheduleDate;
  const startsToday = workbench && Boolean(item.plannedStartTime && dayjs(item.plannedStartTime).isValid() && dayjs(item.plannedStartTime).isSame(dayjs(), "day"));
  const schedule = (
    <span className="schedule-range" aria-label={`开始 ${scheduleDate(item.plannedStartTime)}，结束 ${scheduleDate(item.plannedEndTime)}`}>
      <span className={startsToday ? "starts-today" : undefined}><em>开始</em>{formatSchedule(item.plannedStartTime)}</span>
      <span><em>{workbench ? "截止" : "结束"}</em>{formatSchedule(item.plannedEndTime)}</span>
    </span>
  );
  const urgencyBadge = <span className={`urgency-badge ${urgency.className}`}>{urgency.label}</span>;
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current);
  }, []);

  const openDetails = () => {
    onFocus();
    onDetails();
  };
  const copyIdentity = async () => {
    const succeeded = await copyText(`${item.displayNo}(内部ID ${item.id})`);
    if (!succeeded) return;
    setCopied(true);
    if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1400);
  };
  const handleRowClick = (event: MouseEvent<HTMLButtonElement>) => {
    if ((event.target as Element).closest("[data-copy-workitem]")) {
      void copyIdentity();
      return;
    }
    openDetails();
  };
  return (
    <article className={`work-row ${workbench ? "work-row-workbench" : ""} ${selected ? "selected" : ""} ${item.isOverdue ? "overdue" : ""}`}>
      <button
        type="button"
        className="row-main"
        aria-label={`${item.displayNo} ${item.subject}，ID ${item.id}，查看详情`}
        title="查看工单详情"
        onClick={handleRowClick}
      >
        <span className="work-number" data-copy-workitem title="复制工单编号">
          {item.statusKind === "active" && <i className="work-breathing-light" aria-hidden="true" />}
          <span>{item.displayNo}</span>
          <em className="work-internal-id" aria-live="polite">{copied ? "已复制" : `ID ${item.id}`}</em>
        </span>
        <span className="work-copy">
          <strong title={workbench ? item.subject : undefined}>{item.subject}</strong>
          <small>
            <span>{item.typeLabel} · {item.statusLabel}{item.estimatedHours != null ? ` · 预计 ${item.estimatedHours} 小时` : ""}</span>
            {workbench && item.priority === 1 && <span className="workbench-priority" title="高优先级" aria-label="高优先级 P1">P1</span>}
          </small>
        </span>
        {!workbench && item.priority === 1 && <span className="risk-tag">高优先级</span>}
        {workbench ? <span className="workbench-timing">{schedule}{urgencyBadge}</span> : <>{schedule}{urgencyBadge}</>}
      </button>
    </article>
  );
}
