import { useState } from "react";
import {
  CaretDoubleLeft,
  ChartBarHorizontal,
  GearSix,
  ListChecks,
  Pulse,
  SquaresFour,
  UserFocus,
  UserSwitch,
} from "@phosphor-icons/react";
import type { DashboardItem, DashboardMode } from "../features/dashboard/types";

const navItems = [
  { id: "workbench", label: "工作台", icon: SquaresFour },
  { id: "queue", label: "我的工单", icon: ListChecks },
  { id: "assigned-by-others", label: "别人指派的", icon: UserFocus },
  { id: "created", label: "我指派的", icon: UserSwitch },
  { id: "gantt", label: "甘特图", icon: ChartBarHorizontal },
];

interface AppSidebarProps {
  active: string;
  focusedItem?: DashboardItem;
  mode: DashboardMode;
  onNavigate: (id: string) => void;
  onSettings: () => void;
}

export function AppSidebar({ active, onNavigate, onSettings }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="brand">
        <span className="brand-mark"><Pulse size={20} weight="bold" /></span>
        <span>ptrace</span>
      </div>

      <nav className="sidebar-nav" aria-label="工作台导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={active === id ? "nav-item active" : "nav-item"}
            onClick={() => onNavigate(id)}
          >
            <Icon size={20} weight={active === id ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        ))}
        <button type="button" className="nav-item settings-nav" onClick={onSettings}>
          <GearSix size={20} />
          <span>设置</span>
        </button>
      </nav>

      <button
        type="button"
        className="collapse-button"
        aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        onClick={() => setCollapsed((value) => !value)}
      >
        <CaretDoubleLeft size={18} className={collapsed ? "rotate-180" : undefined} />
        <span>{collapsed ? "展开侧栏" : "收起侧栏"}</span>
      </button>
    </aside>
  );
}
