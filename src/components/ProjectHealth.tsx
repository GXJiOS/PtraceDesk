import { CheckCircle, Clock, WarningCircle } from "@phosphor-icons/react";
import dayjs from "dayjs";
import type { DashboardItem, DashboardSnapshot } from "../features/dashboard/types";

type ScheduleFields = Pick<
  DashboardItem,
  "plannedStartTime" | "plannedEndTime" | "estimatedHours" | "sprintId" | "sprintName"
>;

export function hasCompleteSchedule(item: ScheduleFields) {
  const hasValidStart = Boolean(item.plannedStartTime && dayjs(item.plannedStartTime).isValid());
  const hasValidEnd = Boolean(item.plannedEndTime && dayjs(item.plannedEndTime).isValid());
  const hasEstimate = typeof item.estimatedHours === "number"
    && Number.isFinite(item.estimatedHours)
    && item.estimatedHours > 0;
  const hasSprint = Boolean(item.sprintId || item.sprintName);
  return hasValidStart && hasValidEnd && hasEstimate && hasSprint;
}

export function scheduleCoverageOf(items: ScheduleFields[]) {
  if (!items.length) return 0;
  const scheduled = items.filter(hasCompleteSchedule).length;
  return Math.round((scheduled / items.length) * 100);
}

export function ProjectHealth({ snapshot }: { snapshot: DashboardSnapshot }) {
  const scheduleCoverage = scheduleCoverageOf(snapshot.items);
  return (
    <section className="health-panel" id="progress" aria-label="项目健康度">
      <div className="health-metrics">
        <div className="health-metric primary">
          <span>我的工单进度</span>
          <strong>{snapshot.completion}%</strong>
          <div className="micro-progress"><span style={{ width: `${snapshot.completion}%` }} /></div>
        </div>
        <div className="health-metric">
          <span>进行中</span>
          <strong><Clock size={14} weight="fill" />{snapshot.activeCount}</strong>
          <em>正在推进</em>
        </div>
        <div className="health-metric good">
          <span>已完成</span>
          <strong><CheckCircle size={14} weight="fill" />{snapshot.totalDone}</strong>
          <em>当前范围</em>
        </div>
        <div className={snapshot.overdueItems.length ? "health-metric risk" : "health-metric good"}>
          <span>风险</span>
          <strong><WarningCircle size={14} weight="fill" />{snapshot.overdueItems.length}</strong>
          <em>{snapshot.overdueItems.length ? "逾期工单" : "暂无逾期"}</em>
        </div>
        <div className="health-metric">
          <span>排期</span>
          <strong>{scheduleCoverage}%</strong>
          <em>覆盖率</em>
        </div>
      </div>
    </section>
  );
}
