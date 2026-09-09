// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DashboardSnapshot } from "../features/dashboard/types";
import { SprintProgress } from "./SprintProgress";

afterEach(cleanup);

const snapshot: DashboardSnapshot = {
  projects: [],
  assignees: [],
  items: [],
  assignedByOthersItems: [],
  createdForOthersItems: [],
  queue: [],
  overdueItems: [],
  nextSevenDays: [],
  totalOpen: 0,
  totalDone: 0,
  activeCount: 0,
  completion: 0,
  sprintProgress: {
    id: "parent",
    name: "1.0.0",
    done: 8,
    total: 20,
    progress: 40,
    children: [
      { id: "p0", name: "P0 地基", done: 6, total: 10, progress: 60 },
      { id: "p1", name: "P1 App消费端", done: 2, total: 10, progress: 20 },
      { id: "p2", name: "P2 UGC平台", done: 0, total: 0, progress: 0 },
    ],
  },
};

describe("SprintProgress", () => {
  it("renders the parent summary and every child sprint progress", () => {
    render(<SprintProgress snapshot={snapshot} />);

    expect(screen.getByText("父迭代")).toBeTruthy();
    expect(screen.getByText("1.0.0")).toBeTruthy();
    expect(screen.getByText("8 / 20 个工单已完成")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "1.0.0父迭代进度" }).getAttribute("aria-valuenow")).toBe("40");

    const children = screen.getByRole("list", { name: "子迭代进度" });
    expect(within(children).getAllByRole("listitem")).toHaveLength(3);
    expect(within(children).getByText("P0 地基")).toBeTruthy();
    expect(within(children).getByText("P1 App消费端")).toBeTruthy();
    expect(within(children).getByText("P2 UGC平台")).toBeTruthy();
    expect(within(children).getByText("暂无工单")).toBeTruthy();
    expect(within(children).getByText("尚未关联工单")).toBeTruthy();
  });

  it("shows a clear empty state when the project has no sprint", () => {
    render(<SprintProgress snapshot={{ ...snapshot, sprintProgress: null }} />);

    expect(screen.getByText("当前项目暂未设置迭代")).toBeTruthy();
  });
});
