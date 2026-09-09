import { FlagBanner } from "@phosphor-icons/react";
import type { DashboardSnapshot } from "../features/dashboard/types";

export function SprintProgress({ snapshot }: { snapshot: DashboardSnapshot }) {
  const sprint = snapshot.sprintProgress;

  if (!sprint) {
    return (
      <section className="sprint-panel sprint-panel-empty" aria-label="迭代进度">
        <span className="sprint-icon"><FlagBanner size={19} weight="fill" aria-hidden="true" /></span>
        <div>
          <span>迭代进度</span>
          <strong>当前项目暂未设置迭代</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="sprint-panel" aria-labelledby="sprint-parent-name">
      <div className="sprint-parent">
        <span className="sprint-icon"><FlagBanner size={19} weight="fill" aria-hidden="true" /></span>
        <div className="sprint-parent-copy">
          <span>父迭代</span>
          <strong id="sprint-parent-name" title={sprint.name}>{sprint.name}</strong>
          <small>{sprint.done} / {sprint.total} 个工单已完成</small>
        </div>
        <div className="sprint-parent-progress">
          <div className="sprint-progress-heading">
            <span>父迭代完成度</span>
            <strong>{sprint.total ? `${sprint.progress}%` : "暂无工单"}</strong>
          </div>
          <div
            className="sprint-track"
            role="progressbar"
            aria-label={`${sprint.name}父迭代进度`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={sprint.progress}
          >
            <i style={{ width: `${sprint.progress}%` }} />
          </div>
        </div>
      </div>

      {sprint.children.length > 0 && (
        <div className="sprint-children" role="list" aria-label="子迭代进度">
          {sprint.children.map((child) => (
            <article className="sprint-child" role="listitem" key={child.id}>
              <div className="sprint-child-heading">
                <strong title={child.name}>{child.name}</strong>
                <span>{child.total ? `${child.progress}%` : "暂无工单"}</span>
              </div>
              <small>{child.total ? `${child.done} / ${child.total} 已完成` : "尚未关联工单"}</small>
              <div
                className="sprint-track sprint-track-small"
                role="progressbar"
                aria-label={`${child.name}子迭代进度`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={child.progress}
              >
                <i style={{ width: `${child.progress}%` }} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
