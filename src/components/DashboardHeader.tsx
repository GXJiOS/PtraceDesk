import dayjs from "dayjs";
import {
  ArrowsClockwise,
  CaretDown,
  GearSix,
  PencilSimple,
  SignOut,
} from "@phosphor-icons/react";
import type { DashboardMode, LoadState, ProjectProgress } from "../features/dashboard/types";

interface DashboardHeaderProps {
  title?: string;
  projects: ProjectProgress[];
  projectId: string | null;
  identityName: string;
  mode: DashboardMode;
  state: LoadState;
  syncedAt: string;
  onProjectChange: (projectId: string | null) => void;
  onManageProjects: () => void;
  onSync: () => void;
  onSettings: () => void;
  onDisconnect: () => void;
}

export function DashboardHeader({
  title = "工作台",
  projects,
  projectId,
  identityName,
  mode,
  state,
  syncedAt,
  onProjectChange,
  onManageProjects,
  onSync,
  onSettings,
  onDisconnect,
}: DashboardHeaderProps) {
  const now = dayjs();
  const hasSingleProject = projects.length === 1;
  const sourceText = mode === "live"
    ? `同步于 ${dayjs(syncedAt).format("HH:mm")}`
    : mode === "cache" ? "本地缓存" : "预览数据";

  return (
    <header className={title ? "dashboard-header" : "dashboard-header header-without-title"}>
      <div className="title-block">
        {title && <h1>{title}</h1>}
        <div className="project-scope-control">
          <label className="project-select-wrap">
            <select aria-label="项目范围" value={hasSingleProject ? "all" : projectId || "all"} onChange={(event) => onProjectChange(event.target.value === "all" ? null : event.target.value)}>
              <option value="all">{hasSingleProject ? projects[0].name : "全部追踪项目"}</option>
              {!hasSingleProject && projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
            </select>
            <span>范围 · {projectId ? "单个项目" : `${projects.length} 个项目`}</span>
            <CaretDown size={16} />
          </label>
          <button type="button" className="project-manage-button" aria-label="管理追踪项目" title="管理追踪项目" onClick={onManageProjects}>
            <PencilSimple size={17} />
          </button>
        </div>
      </div>

      <div className="today-date">
        <strong>{now.format("YYYY-MM-DD")}</strong>
        <span>星期{["日", "一", "二", "三", "四", "五", "六"][now.day()]}</span>
        <em>（今天）</em>
      </div>

      <div className="header-actions">
        <button type="button" className={`sync-status ${mode}`} onClick={onSync} disabled={state === "connecting" || state === "syncing"}>
          <span className="status-dot" />
          <span>{state === "connecting" ? "正在连接" : state === "syncing" ? "正在同步" : sourceText}</span>
          <ArrowsClockwise size={18} className={state === "connecting" || state === "syncing" ? "spinning" : ""} />
        </button>
        <button type="button" className="profile-button" onClick={onSettings}>
          <span className="avatar">{identityName.slice(0, 1)}</span>
          <span>{identityName}</span>
          <CaretDown size={14} />
        </button>
        {mode === "live" && (
          <button type="button" className="icon-button danger-hover" aria-label="断开 ptrace" onClick={onDisconnect}>
            <SignOut size={19} />
          </button>
        )}
        <button type="button" className="icon-button mobile-settings" aria-label="设置" onClick={onSettings}><GearSix size={19} /></button>
      </div>
    </header>
  );
}
