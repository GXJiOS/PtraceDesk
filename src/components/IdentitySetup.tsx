import { Check, Moon, Sun, UserCircle, X } from "@phosphor-icons/react";
import type { AssigneeOption } from "../features/dashboard/types";

export type AppearanceTheme = "light" | "dark";

interface IdentitySetupProps {
  open: boolean;
  assignees: AssigneeOption[];
  currentId: string | null;
  theme: AppearanceTheme;
  onThemeChange: (theme: AppearanceTheme) => void;
  onChoose: (id: string) => void;
  onClose: () => void;
}

export function IdentitySetup({ open, assignees, currentId, theme, onThemeChange, onChoose, onClose }: IdentitySetupProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="identity-modal" role="dialog" aria-modal="true" aria-labelledby="identity-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        <div className="settings-intro">
          <div className="modal-icon"><UserCircle size={28} weight="duotone" /></div>
          <div className="settings-intro-copy">
            <span className="section-kicker">个人工作台</span>
            <h2 id="identity-title">设置</h2>
            <p>调整工作台外观，并选择用于筛选 ptrace 工单的身份。</p>
          </div>
        </div>

        <section className="settings-section" aria-labelledby="appearance-settings-title">
          <div className="settings-section-heading">
            <h3 id="appearance-settings-title">外观</h3>
            <span>选择更适合当前环境的显示模式</span>
          </div>
          <div className="theme-options" role="group" aria-label="外观主题">
            <button type="button" className={theme === "light" ? "selected" : ""} aria-label="浅色模式" aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>
              <span className="theme-icon light"><Sun size={20} /></span>
              <span><strong>浅色</strong><small>明亮、清晰</small></span>
              {theme === "light" && <Check size={17} weight="bold" />}
            </button>
            <button type="button" className={theme === "dark" ? "selected" : ""} aria-label="深色模式" aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>
              <span className="theme-icon dark"><Moon size={20} weight="fill" /></span>
              <span><strong>深色</strong><small>柔和、专注</small></span>
              {theme === "dark" && <Check size={17} weight="bold" />}
            </button>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="identity-settings-title">
          <div className="settings-section-heading">
            <h3 id="identity-settings-title">ptrace 身份</h3>
            <span>工作台只展示分配给该身份的工单</span>
          </div>
          <div className="identity-list">
            {assignees.map((person) => (
              <button type="button" className={currentId === person.id ? "selected" : ""} onClick={() => onChoose(person.id)} key={person.id}>
                <span className="avatar">{person.name.slice(0, 1)}</span>
                <span><strong>{person.name}</strong><small>{person.count} 个工单</small></span>
                {currentId === person.id && <Check size={18} weight="bold" />}
              </button>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
