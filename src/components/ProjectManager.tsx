import { CheckCircle, FolderOpen, MinusCircle, X } from "@phosphor-icons/react";
import type { PtraceProduct } from "../features/dashboard/types";

interface ProjectManagerProps {
  open: boolean;
  projects: PtraceProduct[];
  hiddenProjectIds: string[];
  onSetEnabled: (id: string, enabled: boolean) => void;
  onClose: () => void;
}

export function ProjectManager({ open, projects, hiddenProjectIds, onSetEnabled, onClose }: ProjectManagerProps) {
  if (!open) return null;

  const hiddenIds = new Set(hiddenProjectIds);
  const activeCount = projects.filter((project) => !hiddenIds.has(project.id)).length;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="identity-modal project-manager-modal" role="dialog" aria-modal="true" aria-labelledby="project-manager-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-icon"><FolderOpen size={28} weight="duotone" /></div>
        <button type="button" className="modal-close" aria-label="关闭项目管理" onClick={onClose}><X size={18} /></button>
        <span className="section-kicker">工作台范围</span>
        <h2 id="project-manager-title">管理追踪项目</h2>
        <p>停用废弃项目后，它的工单、排期和进度会从本机工作台隐藏；ptrace 上的数据不会改变。</p>

        <div className="project-manager-summary">
          <strong>{activeCount}</strong>
          <span>个启用项目</span>
          <em>{projects.length - activeCount} 个已停用</em>
        </div>

        <div className="project-manager-list">
          {projects.map((project) => {
            const active = !hiddenIds.has(project.id);
            const isLastActive = active && activeCount === 1;
            const workitemCount = project.workitemStats?.total;
            return (
              <button
                type="button"
                className={active ? "active" : "inactive"}
                aria-pressed={active}
                disabled={isLastActive}
                title={isLastActive ? "工作台至少需要保留一个启用项目" : active ? "停用此项目" : "重新启用此项目"}
                onClick={() => onSetEnabled(project.id, !active)}
                key={project.id}
              >
                <span className="project-manager-state" aria-hidden="true">
                  {active ? <CheckCircle size={22} weight="fill" /> : <MinusCircle size={22} weight="fill" />}
                </span>
                <span className="project-manager-copy">
                  <strong>{project.name}</strong>
                  <small>{typeof workitemCount === "number" ? `${workitemCount} 个工单 · ` : ""}{active ? "显示在工作台" : "已从工作台隐藏"}</small>
                </span>
                <span className="project-toggle" aria-hidden="true"><i /></span>
              </button>
            );
          })}
        </div>

        <p className="project-manager-note">设置仅保存在当前设备。最后一个启用项目不能被停用。</p>
      </section>
    </div>
  );
}
