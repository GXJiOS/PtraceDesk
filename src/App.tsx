import { useEffect, useMemo, useState } from "react";
import { Browser, FlagBanner, WarningCircle, X } from "@phosphor-icons/react";
import { AppSidebar } from "./components/AppSidebar";
import { DashboardHeader } from "./components/DashboardHeader";
import { GanttChart } from "./components/GanttChart";
import { IdentitySetup } from "./components/IdentitySetup";
import type { AppearanceTheme } from "./components/IdentitySetup";
import { MyWorkitems } from "./components/MyWorkitems";
import { ProjectHealth } from "./components/ProjectHealth";
import { ProjectManager } from "./components/ProjectManager";
import { SprintProgress } from "./components/SprintProgress";
import { groupWorkbenchItems, TodayQueue } from "./components/TodayQueue";
import { UpcomingSchedule } from "./components/UpcomingSchedule";
import { WorkItemDetailModal } from "./components/WorkItemDetailModal";
import { useDashboard } from "./features/dashboard/useDashboard";
import { buildWorkbenchSnapshot, UNSCHEDULED_WORKBENCH_ITERATION } from "./features/dashboard/dashboardMapper";
import type { DashboardItem } from "./features/dashboard/types";

const THEME_STORAGE_KEY = "ptracedesk-theme-v1";

function storedTheme(): AppearanceTheme {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function App() {
  const dashboard = useDashboard();
  const [theme, setTheme] = useState<AppearanceTheme>(storedTheme);
  const [activeSection, setActiveSection] = useState("workbench");
  const [workbenchIteration, setWorkbenchIteration] = useState<string | null>(null);
  const [focusedItem, setFocusedItem] = useState<DashboardItem>();
  const [detailItem, setDetailItem] = useState<DashboardItem>();
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [dismissedError, setDismissedError] = useState("");

  const workbench = useMemo(() => buildWorkbenchSnapshot(dashboard.payload, {
    identityId: dashboard.identityId,
    projectId: dashboard.projectId,
    hiddenProjectIds: dashboard.hiddenProjectIds,
    iterationKey: workbenchIteration,
  }), [dashboard.payload, dashboard.identityId, dashboard.projectId, dashboard.hiddenProjectIds, workbenchIteration]);
  const workbenchQueue = useMemo(() => groupWorkbenchItems(workbench.snapshot.items), [workbench.snapshot.items]);

  useEffect(() => {
    if (workbenchIteration && !workbench.iterations.some((iteration) => iteration.key === workbenchIteration)) setWorkbenchIteration(null);
  }, [workbench.iterations, workbenchIteration]);

  const identityName = useMemo(
    () => dashboard.snapshot.assignees.find((person) => person.id === dashboard.identityId)?.name || "我的工作台",
    [dashboard.identityId, dashboard.snapshot.assignees],
  );
  useEffect(() => {
    const visibleIds = new Set([
      ...dashboard.snapshot.items,
      ...dashboard.snapshot.assignedByOthersItems,
      ...dashboard.snapshot.createdForOthersItems,
    ].map((item) => item.id));
    if (detailItem && !visibleIds.has(detailItem.id)) setDetailItem(undefined);
    if (focusedItem && visibleIds.has(focusedItem.id)) return;
    setFocusedItem(dashboard.snapshot.queue.find((item) => !item.isOverdue) || dashboard.snapshot.queue[0]);
  }, [
    dashboard.snapshot.assignedByOthersItems,
    dashboard.snapshot.createdForOthersItems,
    dashboard.snapshot.items,
    dashboard.snapshot.queue,
    detailItem,
    focusedItem,
  ]);

  useEffect(() => {
    if (activeSection === "queue") return;
    document.getElementById(activeSection)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeSection]);

  function navigate(id: string) {
    setActiveSection(id);
  }

  function focusItem(item: DashboardItem) {
    setFocusedItem(item);
  }

  function chooseTheme(nextTheme: AppearanceTheme) {
    setTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  const visibleError = dashboard.error && dashboard.error !== dismissedError;
  return (
    <div className="app-shell" data-theme={theme}>
      <AppSidebar
        active={activeSection}
        focusedItem={focusedItem}
        mode={dashboard.mode}
        onNavigate={navigate}
        onSettings={() => dashboard.setIdentityOpen(true)}
      />
      <main className="workspace">
        <DashboardHeader
          title=""
          projects={dashboard.snapshot.projects}
          projectId={dashboard.projectId}
          identityName={identityName}
          mode={dashboard.mode}
          state={dashboard.state}
          syncedAt={dashboard.payload.syncedAt}
          onProjectChange={dashboard.setProjectId}
          onManageProjects={() => setProjectManagerOpen(true)}
          onSync={() => void dashboard.sync()}
          onSettings={() => dashboard.setIdentityOpen(true)}
          onDisconnect={() => void dashboard.disconnect()}
        />

        {dashboard.authorizationOpen && (
          <div className="notice authorization-notice">
            <Browser size={19} weight="duotone" />
            <span><strong>请在系统浏览器完成 ptrace 授权</strong>授权完成后会自动返回工作台。</span>
          </div>
        )}
        {visibleError && (
          <div className="notice error-notice">
            <WarningCircle size={19} weight="fill" />
            <span>{dashboard.error}</span>
            <button type="button" aria-label="关闭提示" onClick={() => setDismissedError(dashboard.error)}><X size={16} /></button>
          </div>
        )}

        {activeSection === "queue" ? (
          <MyWorkitems
            key="queue"
            items={dashboard.snapshot.items}
            sortBy="created-desc"
            focusedItemId={focusedItem?.id}
            onFocus={focusItem}
            onDetails={setDetailItem}
          />
        ) : activeSection === "assigned-by-others" ? (
          <MyWorkitems
            key="assigned-by-others"
            items={dashboard.snapshot.assignedByOthersItems}
            sortBy="created-desc"
            heading="别人指派给我的工单"
            description="查看当前项目范围内由其他人创建并指派给你的工单。"
            focusedItemId={focusedItem?.id}
            onFocus={focusItem}
            onDetails={setDetailItem}
          />
        ) : activeSection === "created" ? (
          <MyWorkitems
            key="created"
            items={dashboard.snapshot.createdForOthersItems}
            sortBy="created-desc"
            heading="我指派的工单"
            description="查看当前项目范围内由你创建并指派给其他人的工单。"
            focusedItemId={focusedItem?.id}
            onFocus={focusItem}
            onDetails={setDetailItem}
          />
        ) : activeSection === "gantt" ? (
          <GanttChart items={dashboard.snapshot.items} onDetails={setDetailItem} />
        ) : (
          <div className="dashboard-layout">
            <div className="dashboard-primary">
              <div className="hero-grid">
                <div className="today-hero-copy">
                  <div className="workbench-iteration-heading">
                    <h2>今天要推进什么</h2>
                    <label className="workbench-iteration-filter">
                      <FlagBanner size={16} />
                      <span>迭代</span>
                      <select
                        aria-label="工作台父迭代"
                        title={workbench.iterations.find((iteration) => iteration.key === workbench.iterationKey)?.label}
                        value={workbench.iterationKey}
                        onChange={(event) => setWorkbenchIteration(event.target.value)}
                      >
                        {workbench.iterations.map((iteration) => <option value={iteration.key} key={iteration.key}>{iteration.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="queue-summary">
                    <span className="violet-text">{workbenchQueue.today.length} 个今日计划</span>
                    <span className="red-text">{workbenchQueue.overdue.length} 个已逾期</span>
                    <span>{workbench.snapshot.nextSevenDays.length} 个 7 天内到期</span>
                  </div>
                </div>
                <ProjectHealth snapshot={workbench.snapshot} />
              </div>
              <TodayQueue key={`${dashboard.projectId || "all"}:${workbench.iterationKey}`} groups={workbenchQueue} focusedItemId={focusedItem?.id} onFocus={focusItem} onDetails={setDetailItem} />
              {workbench.iterationKey === UNSCHEDULED_WORKBENCH_ITERATION ? (
                <section className="sprint-panel sprint-panel-empty" aria-label="迭代进度">
                  <span className="sprint-icon"><FlagBanner size={19} weight="fill" aria-hidden="true" /></span>
                  <div><span>迭代进度</span><strong>当前显示未设置迭代的工单</strong></div>
                </section>
              ) : <SprintProgress snapshot={workbench.snapshot} />}
            </div>
            <UpcomingSchedule items={dashboard.snapshot.items} onDetails={setDetailItem} />
          </div>
        )}
      </main>

      {detailItem && <WorkItemDetailModal item={detailItem} onClose={() => setDetailItem(undefined)} />}

      <ProjectManager
        open={projectManagerOpen}
        projects={dashboard.payload.products}
        hiddenProjectIds={dashboard.hiddenProjectIds}
        onSetEnabled={dashboard.setProjectEnabled}
        onClose={() => setProjectManagerOpen(false)}
      />

      <IdentitySetup
        open={dashboard.identityOpen}
        assignees={dashboard.snapshot.assignees}
        currentId={dashboard.identityId}
        theme={theme}
        onThemeChange={chooseTheme}
        onChoose={dashboard.chooseIdentity}
        onClose={() => dashboard.setIdentityOpen(false)}
      />
    </div>
  );
}
