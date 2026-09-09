import dayjs from "dayjs";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  FunnelSimple,
} from "@phosphor-icons/react";
import { useMemo, useState, type CSSProperties } from "react";
import {
  buildGanttRange,
  ganttBarPosition,
  groupGanttItems,
  moveGanttAnchor,
  splitGanttItems,
  type GanttRange,
  type GanttView,
} from "../features/dashboard/gantt";
import type { DashboardItem } from "../features/dashboard/types";

interface GanttChartProps {
  items: DashboardItem[];
  onDetails: (item: DashboardItem) => void;
}

function TimelineGrid({ range }: { range: GanttRange }) {
  return (
    <div className="gantt-day-grid" aria-hidden="true">
      {range.days.map((day) => (
        <span
          className={`${day.isWeekend ? "weekend" : ""} ${day.isToday ? "today" : ""}`}
          key={day.key}
        />
      ))}
    </div>
  );
}

function barDateLabel(item: DashboardItem) {
  const start = dayjs(item.plannedStartTime);
  const end = dayjs(item.plannedEndTime);
  return `${start.month() + 1}/${start.date()} – ${end.month() + 1}/${end.date()}`;
}

function statusClass(item: DashboardItem) {
  return item.isOverdue ? "overdue" : item.statusKind;
}

function WorkitemInfo({ item, onDetails }: { item: DashboardItem; onDetails: () => void }) {
  return (
    <button
      type="button"
      className="gantt-workitem-info"
      aria-label={`${item.displayNo} ${item.subject}，ID ${item.id}，查看详情`}
      title={`${item.displayNo} · ID ${item.id} · ${item.subject}`}
      onClick={onDetails}
    >
      <span className="gantt-item-number">
        <span>{item.displayNo}</span>
        <em className="work-internal-id">ID {item.id}</em>
      </span>
      <strong>{item.subject}</strong>
      <em className={`gantt-status-label ${statusClass(item)}`}>{item.statusLabel}</em>
      <span className="gantt-assignee">{item.assigneeName}</span>
    </button>
  );
}

export function GanttChart({ items, onDetails }: GanttChartProps) {
  const [view, setView] = useState<GanttView>("month");
  const [anchor, setAnchor] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const range = useMemo(() => buildGanttRange(anchor, view), [anchor, view]);
  const { scheduled, unscheduled } = useMemo(() => splitGanttItems(items), [items]);
  const projects = useMemo(() => groupGanttItems(scheduled, range), [range, scheduled]);
  const matrixStyle = {
    "--gantt-days": range.days.length,
    "--gantt-day-width": view === "month" ? "32px" : "112px",
  } as CSSProperties;

  function toggleGroup(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="gantt-page" id="gantt" aria-label="甘特图">
      <div className="gantt-toolbar">
        <div className="gantt-toolbar-leading">
          <div className="gantt-range-copy">
            <strong>{dayjs(range.start).format("YYYY年M月D日")}</strong>
            <span>至</span>
            <strong>{dayjs(range.end).format("YYYY年M月D日")}</strong>
          </div>
          <div className="gantt-view-switch" role="group" aria-label="甘特图视图">
            <button type="button" className={view === "week" ? "active" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>周</button>
            <button type="button" className={view === "month" ? "active" : ""} aria-pressed={view === "month"} onClick={() => setView("month")}>月</button>
          </div>
        </div>
        <div className="gantt-toolbar-actions">
          <button type="button" className="gantt-today-button" onClick={() => setAnchor(dayjs().format("YYYY-MM-DD"))}>今天</button>
          <div className="gantt-page-controls">
            <button type="button" aria-label="上一时间范围" onClick={() => setAnchor(moveGanttAnchor(anchor, view, -1))}><CaretLeft size={16} /></button>
            <button type="button" aria-label="下一时间范围" onClick={() => setAnchor(moveGanttAnchor(anchor, view, 1))}><CaretRight size={16} /></button>
          </div>
        </div>
      </div>

      <div className="gantt-panel">
        <div className="gantt-scroll-area">
          <div className="gantt-matrix" style={matrixStyle}>
            <div className="gantt-header-row">
              <div className="gantt-info-cell gantt-column-headings">
                <span>工作项 <FunnelSimple size={13} /></span>
                <span>状态</span>
                <span>负责人</span>
              </div>
              <div className="gantt-timeline-header">
                <div className="gantt-week-bands">
                  {range.weeks.map((week) => <span style={{ gridColumn: `span ${week.span}` }} key={week.key}>{week.label}</span>)}
                </div>
                <div className="gantt-day-headings">
                  {range.days.map((day) => (
                    <span className={`${day.isWeekend ? "weekend" : ""} ${day.isToday ? "today" : ""}`} key={day.key}>
                      <em>{day.weekday}</em>
                      <strong>{day.dayOfMonth}</strong>
                      {day.isToday && <small>今天</small>}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {projects.length ? projects.map((project) => {
              const projectCollapsed = collapsed.has(project.key);
              const projectCount = project.iterations.reduce((sum, iteration) => sum + iteration.items.length, 0);
              return (
                <div className="gantt-project-block" key={project.key}>
                  <div className="gantt-group-row project-row">
                    <div className="gantt-info-cell">
                      <button type="button" className="gantt-group-toggle" aria-expanded={!projectCollapsed} onClick={() => toggleGroup(project.key)}>
                        <CaretDown size={14} className={projectCollapsed ? "collapsed-caret" : ""} />
                        <strong>{project.name}</strong>
                        <span>{projectCount}</span>
                      </button>
                    </div>
                    <div className="gantt-timeline-row"><TimelineGrid range={range} /></div>
                  </div>

                  {!projectCollapsed && project.iterations.map((iteration) => {
                    const iterationCollapsed = collapsed.has(iteration.key);
                    return (
                      <div className="gantt-iteration-block" key={iteration.key}>
                        <div className="gantt-group-row iteration-row">
                          <div className="gantt-info-cell">
                            <button type="button" className="gantt-group-toggle" aria-expanded={!iterationCollapsed} onClick={() => toggleGroup(iteration.key)}>
                              <CaretDown size={14} className={iterationCollapsed ? "collapsed-caret" : ""} />
                              <strong>{iteration.name}</strong>
                              <span>{iteration.items.length}</span>
                            </button>
                          </div>
                          <div className="gantt-timeline-row"><TimelineGrid range={range} /></div>
                        </div>

                        {!iterationCollapsed && iteration.items.map((item) => {
                          const position = ganttBarPosition(item, range);
                          if (!position) return null;
                          const barStyle = {
                            "--gantt-start": position.startIndex,
                            "--gantt-span": position.span,
                          } as CSSProperties;
                          return (
                            <div className="gantt-workitem-row" key={item.id}>
                              <div className="gantt-info-cell"><WorkitemInfo item={item} onDetails={() => onDetails(item)} /></div>
                              <div className="gantt-timeline-row">
                                <TimelineGrid range={range} />
                                <button
                                  type="button"
                                  className={`gantt-bar ${statusClass(item)} ${position.clippedStart ? "clipped-start" : ""} ${position.clippedEnd ? "clipped-end" : ""}`}
                                  style={barStyle}
                                  aria-label={`${item.displayNo} ${item.subject}，ID ${item.id}，查看详情`}
                                  title={`${item.displayNo} · ID ${item.id} · ${item.subject} · ${barDateLabel(item)}`}
                                  onClick={() => onDetails(item)}
                                >
                                  <span>{item.subject}</span>
                                  <small>{barDateLabel(item)}</small>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            }) : (
              <div className="gantt-empty-row">
                <div className="gantt-info-cell"><strong>当前范围没有已排期工单</strong><span>可切换时间范围查看其他计划。</span></div>
                <div className="gantt-timeline-row"><TimelineGrid range={range} /></div>
              </div>
            )}

            <div className="gantt-unscheduled-heading">
              <div className="gantt-info-cell">
                <strong>未排期</strong><span>{unscheduled.length}</span>
              </div>
              <div className="gantt-timeline-row"><TimelineGrid range={range} /></div>
            </div>
            {unscheduled.length ? unscheduled.map((item) => (
              <div className="gantt-workitem-row unscheduled" key={item.id}>
                <div className="gantt-info-cell"><WorkitemInfo item={item} onDetails={() => onDetails(item)} /></div>
                <div className="gantt-timeline-row">
                  <TimelineGrid range={range} />
                  <span className="gantt-unscheduled-placeholder">未排期</span>
                </div>
              </div>
            )) : (
              <div className="gantt-no-unscheduled">
                <div className="gantt-info-cell">所有工单均已设置计划日期</div>
                <div className="gantt-timeline-row"><TimelineGrid range={range} /></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
