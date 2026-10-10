// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { UpcomingSchedule } from "./components/UpcomingSchedule";
import { WorkItemDetailModal } from "./components/WorkItemDetailModal";
import { WorkItemRow } from "./components/WorkItemRow";
import { groupWorkbenchItems, TodayQueue } from "./components/TodayQueue";
import { MyWorkitems } from "./components/MyWorkitems";
import { WorkItemRichText, richTextImages } from "./components/WorkItemRichText";
import { buildDashboardSnapshot } from "./features/dashboard/dashboardMapper";
import { isAutoSyncTime, millisecondsUntilNextAutoSync, useDashboard } from "./features/dashboard/useDashboard";
import type { DashboardItem, PtracePayload, PtraceWorkitem, PtraceWorkitemComment, PtraceWorkitemActivityFeed, PtraceWorkitemRelations } from "./features/dashboard/types";

const {
  testClock,
  loadPtracePayloadMock,
  loadPtraceWorkitemMock,
  loadCommentsMock,
  loadActivitiesMock,
  loadRelationsMock,
  isPermissionGrantedMock,
  requestPermissionMock,
  sendNotificationMock,
  hasStoredSessionMock,
  clearStoredSessionMock,
} = vi.hoisted(() => ({
  testClock: { now: "2026-08-11T10:00:00+08:00" },
  loadPtracePayloadMock: vi.fn<(onAuthorizationStarted?: () => void) => Promise<PtracePayload>>(async () => ({
    products: [],
    workitems: [],
    syncedAt: "2026-08-10T12:00:00+08:00",
  })),
  loadPtraceWorkitemMock: vi.fn<() => Promise<PtraceWorkitem>>(),
  loadCommentsMock: vi.fn<() => Promise<PtraceWorkitemComment[]>>(),
  loadActivitiesMock: vi.fn<() => Promise<PtraceWorkitemActivityFeed>>(),
  loadRelationsMock: vi.fn<() => Promise<PtraceWorkitemRelations>>(),
  isPermissionGrantedMock: vi.fn(async () => true),
  requestPermissionMock: vi.fn(async () => "granted" as NotificationPermission),
  sendNotificationMock: vi.fn(),
  hasStoredSessionMock: vi.fn(async () => false),
  clearStoredSessionMock: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: requestPermissionMock,
  sendNotification: sendNotificationMock,
}));

vi.mock("./mcp/oauthProvider", () => ({
  hasStoredPtraceSession: hasStoredSessionMock,
  clearStoredPtraceSession: clearStoredSessionMock,
}));

vi.mock("./mcp/ptraceApi", () => ({
  loadPtracePayload: loadPtracePayloadMock,
  loadPtraceWorkitem: loadPtraceWorkitemMock,
  loadPtraceWorkitemComments: loadCommentsMock,
  loadPtraceWorkitemActivities: loadActivitiesMock,
  loadPtraceWorkitemRelations: loadRelationsMock,
}));

vi.mock("dayjs", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import("dayjs") }>();
  const mockedDayjs = ((value?: Parameters<typeof actual.default>[0]) => (
    actual.default(value ?? testClock.now)
  )) as typeof actual.default;
  Object.assign(mockedDayjs, actual.default);
  return { ...actual, default: mockedDayjs };
});

beforeEach(() => {
  testClock.now = "2026-08-11T10:00:00+08:00";
  isPermissionGrantedMock.mockReset().mockResolvedValue(true);
  requestPermissionMock.mockReset().mockResolvedValue("granted");
  sendNotificationMock.mockReset();
  hasStoredSessionMock.mockReset().mockResolvedValue(false);
  clearStoredSessionMock.mockReset().mockResolvedValue(undefined);
  loadPtraceWorkitemMock.mockReset();
  loadCommentsMock.mockReset().mockResolvedValue([]);
  loadActivitiesMock.mockReset().mockResolvedValue({ items: [], statuses: [] });
  loadRelationsMock.mockReset().mockResolvedValue({ parent: null, children: [], parentError: false, childrenError: false });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  loadPtracePayloadMock.mockClear();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

const imageOne = "https://ptrace-prod-uploads.ptrace.cfd/test/first.jpeg";
const imageTwo = "https://ptrace-prod-uploads.ptrace.cfd/test/second.png";
const attachmentItem: DashboardItem = {
  id: "5059", productId: "201", productName: "附件验证项目", subject: "图片附件测试", displayNo: "PT-5031",
  assigneeId: "me", assigneeName: "我", typeLabel: "缺陷", statusLabel: "待处理", statusKind: "todo",
  isOverdue: false, dueLabel: "未排期", description: `<p>截图说明</p><img src="${imageOne}">`,
  attachments: [{ id: "169", filename: "iOS 截图.jpeg", url: imageOne, mimeType: "image/jpeg" }],
};

describe("workitem image attachments", () => {
  it("deduplicates description images and attachments, and keeps unsupported sources out of the gallery", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WorkItemDetailModal item={{ ...attachmentItem,
      description: `${attachmentItem.description}<img src="${imageTwo}" alt="Android 截图"><img src="javascript:alert(1)"><img src="https://example.com/image.png"><img src="https://ptrace-prod-uploads.ptrace.cfd.evil.test/image.png"><img src="https://user:password@ptrace-prod-uploads.ptrace.cfd/test/image.jpeg"><script>alert(1)</script>`,
      attachments: [...attachmentItem.attachments!,
        { id: "pdf", filename: "spec.pdf", url: "https://ptrace-prod-uploads.ptrace.cfd/test/spec.pdf", mimeType: "application/pdf" },
        { id: "deleted", filename: "deleted.png", url: "https://ptrace-prod-uploads.ptrace.cfd/test/deleted.png", mimeType: "image/png", isDeleted: 1 },
      ],
    }} onClose={onClose} />);
    const gallery = screen.getByRole("region", { name: /附件图片/ });
    expect(within(gallery).getAllByRole("img")).toHaveLength(2);
    expect(within(gallery).getByRole("img", { name: "iOS 截图.jpeg" }).getAttribute("src")).toBe(imageOne);
    expect(document.querySelector(".detail-description script")).toBeNull();
    expect(loadPtraceWorkitemMock).not.toHaveBeenCalled();
    fireEvent.load(screen.getByRole("img", { name: "iOS 截图.jpeg" }));
    const thumbnail = screen.getByRole("button", { name: "放大图片 iOS 截图.jpeg" });
    await user.click(thumbnail);
    expect(screen.getByRole("dialog", { name: "iOS 截图.jpeg" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "关闭图片预览" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "关闭图片预览" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "iOS 截图.jpeg" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "图片附件测试" })).toBeTruthy();
    expect(document.activeElement).toBe(thumbnail);
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("retries failed thumbnail and enlarged-image loads", async () => {
    const user = userEvent.setup();
    render(<WorkItemDetailModal item={attachmentItem} onClose={vi.fn()} />);
    const failedImage = screen.getByRole("img", { name: "iOS 截图.jpeg" });
    fireEvent.error(failedImage);
    expect(screen.getByText("图片加载失败")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "重试图片 iOS 截图.jpeg" }));
    const retriedImage = screen.getByRole("img", { name: "iOS 截图.jpeg" });
    expect(retriedImage).not.toBe(failedImage);
    fireEvent.load(retriedImage);
    await user.click(screen.getByRole("button", { name: "放大图片 iOS 截图.jpeg" }));
    const preview = screen.getByRole("dialog", { name: "iOS 截图.jpeg" });
    fireEvent.error(within(preview).getByRole("img"));
    await user.click(within(preview).getByRole("button", { name: "重试图片 iOS 截图.jpeg" }));
    expect(document.activeElement).toBe(within(preview).getByRole("button", { name: "关闭图片预览" }));
    fireEvent.load(within(preview).getByRole("img"));
    expect(within(preview).queryByText("图片加载失败")).toBeNull();
    await user.click(within(preview).getByRole("button", { name: "关闭图片预览" }));
    expect(screen.getByRole("dialog", { name: "图片附件测试" })).toBeTruthy();
  });

  it("loads native details on demand and retries while retaining cached description images", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    loadPtraceWorkitemMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      ...attachmentItem,
      attachments: [...attachmentItem.attachments!, { id: "170", filename: "Android 截图.png", url: imageTwo, mimeType: "image/png" }],
    });
    render(<WorkItemDetailModal item={{ ...attachmentItem, attachments: undefined }} onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "重试加载工单详情" });
    expect(screen.getByRole("img", { name: "描述图片 1" })).toBeTruthy();
    expect(loadPtraceWorkitemMock).toHaveBeenCalledExactlyOnceWith("5059");
    await user.click(screen.getByRole("button", { name: "重试加载工单详情" }));
    await screen.findByRole("img", { name: "Android 截图.png" });
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "重试加载工单详情" })).toBeNull();
  });

  it("discards a late attachment response after switching workitems", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    let finishFirst!: (item: PtraceWorkitem) => void;
    loadPtraceWorkitemMock.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ ...attachmentItem, id: "5060", subject: "下一张工单", description: null, attachments: [] });
    const { rerender } = render(<WorkItemDetailModal item={attachmentItem} onClose={vi.fn()} />);
    await waitFor(() => expect(loadPtraceWorkitemMock).toHaveBeenCalledWith("5059"));
    rerender(<WorkItemDetailModal item={{ ...attachmentItem, id: "5060", subject: "下一张工单" }} onClose={vi.fn()} />);
    await screen.findByText("暂无图片附件");
    await act(async () => { finishFirst(attachmentItem); });
    expect(screen.getByRole("dialog", { name: "下一张工单" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("暂无描述")).toBeTruthy();
  });
});

const commentFixture: PtraceWorkitemComment = {
  id: "comment-1", workitemId: "5059", authorId: "other", authorName: "评论作者",
  content: "**验收说明**\n\n- 第一项\n- 第二项\n\n[参考文档](https://admin.ptrace.cfd/)",
  createTime: "2026-09-08 09:00:00", rawFields: { origin: 0 },
  children: [{ id: "reply-1", workitemId: "5059", authorName: "回复作者", parentId: "comment-1",
    content: `<p>回复内容</p><img src="${imageTwo}" alt="评论截图">`, createTime: "2026-09-08 10:00:00", rawFields: {}, children: [],
  }],
};

describe("complete workitem details", () => {
  it("renders Markdown and HTML structure while stripping executable markup and unsafe links", () => {
    const value = `# 测试标题\n\n**重点**\n\n| 项目 | 内容 |\n| --- | --- |\n| 一 | 二 |\n\n- [x] 已验证\n\n\`\`\`js\nconst count = 1;\n\`\`\`\n\n<a href="javascript:alert(1)" onclick="alert(1)">危险链接</a><iframe src="https://example.com"></iframe><script>evil()</script><svg onload="evil()"></svg><img src="${imageOne}" onerror="evil()">`;
    const { container } = render(<WorkItemRichText value={value} />);
    expect(screen.getByRole("heading", { name: "测试标题" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("重点");
    expect(container.querySelector("pre code")?.textContent).toContain("const count = 1;");
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector("script, iframe, svg, [onclick], [onerror]")).toBeNull();
    expect(screen.queryByRole("link", { name: "危险链接" })).toBeNull();
    expect(richTextImages(value)).toEqual([{ url: imageOne, name: "描述图片 1" }]);
    expect(richTextImages("![x](javascript:evil) ![x](https://other.example/x.png)")).toEqual([]);
  });

  it("shows fresh fields, non-image attachments and source fields from the detail response", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const fresh = { ...attachmentItem, subject: "最新工单标题", ptraceStatusName: "已完成", completedAt: "2026-09-08 12:00:00",
      ptraceAssignedToName: "最新处理人", productName: "最新项目", productOwnerName: "负责人",
      ptraceAssignedToDeptName: "研发部", cycleBusinessSeconds: 0, actualHours: 0,
      attachments: [{ id: "pdf", filename: "验收说明.pdf", mimeType: "application/pdf", url: "https://ptrace-prod-uploads.ptrace.cfd/test/spec.pdf", fileSize: 1024 }],
      rawFields: { localOnly: true, customField: { result: "扩展字段值" }, lastSyncError: "来源同步信息" },
    };
    loadPtraceWorkitemMock.mockResolvedValue(fresh);
    const user = userEvent.setup();
    render(<WorkItemDetailModal item={attachmentItem} onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "最新工单标题" });
    expect(screen.getByText("最新处理人")).toBeTruthy();
    expect(screen.getByText("最新项目")).toBeTruthy();
    expect(screen.getByText("0 秒")).toBeTruthy();
    expect(screen.getByText("0 小时")).toBeTruthy();
    expect(screen.getByRole("link", { name: "验收说明.pdf" }).getAttribute("href")).toBe(fresh.attachments[0].url);
    expect(screen.getByText("application/pdf · 1,024 字节")).toBeTruthy();
    await user.click(screen.getByText("来源与扩展字段"));
    expect(screen.getByText(/扩展字段值/)).toBeTruthy();
    expect(screen.getByText("来源同步信息")).toBeTruthy();
    expect(loadCommentsMock).not.toHaveBeenCalled();
    expect(loadActivitiesMock).not.toHaveBeenCalled();
  });

  it("loads threaded comments only when selected, retries independently, and previews reply images", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    loadPtraceWorkitemMock.mockResolvedValue(attachmentItem);
    loadCommentsMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([commentFixture]);
    const user = userEvent.setup();
    render(<WorkItemDetailModal item={attachmentItem} onClose={vi.fn()} />);
    await screen.findByText("未关联父工单");
    expect(loadCommentsMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "评论" }));
    await screen.findByRole("button", { name: "重试加载评论" });
    expect(screen.getByRole("heading", { name: "图片附件测试" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "重试加载评论" }));
    await screen.findByText("评论作者");
    expect(screen.getByText("回复作者")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /评论2/ })).toBeTruthy();
    expect(screen.getByText("验收说明").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "参考文档" })).toBeTruthy();
    fireEvent.load(screen.getByRole("img", { name: "评论截图" }));
    await user.click(screen.getByRole("button", { name: "放大图片 评论截图" }));
    expect(screen.getByRole("dialog", { name: "评论截图" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("tab", { name: /评论2/ }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("tab", { name: "操作记录" }));
    await screen.findByText("暂无操作记录");
    expect(loadPtraceWorkitemMock).toHaveBeenCalledTimes(1);
  });

  it("shows recorded activity values with verified status names and an honest fallback for unknown events", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    loadPtraceWorkitemMock.mockResolvedValue({ ...attachmentItem, typeId: "2" });
    loadActivitiesMock.mockResolvedValue({
      statuses: [{ id: "7", typeId: "2", name: "修复中", code: "fixing" }, { id: "9", typeId: "2", name: "已修复", code: "fixed" }],
      items: [{ id: "change", eventType: "status_changed", actorName: "向建", actedAt: "2026-09-08 10:00:00", fromValue: { statusId: "7" }, toValue: { statusId: "9" }, reason: "验证通过", rawFields: {} },
        { id: "future", eventType: "custom_future_event", actedAt: "2026-09-08 11:00:00", toValue: { hours: 0, enabled: false }, rawFields: { metadata: { ticket: "保留信息" } } }],
    });
    const user = userEvent.setup();
    render(<WorkItemDetailModal item={attachmentItem} onClose={vi.fn()} />);
    await screen.findByText("未关联父工单");
    await user.click(screen.getByRole("tab", { name: "操作记录" }));
    await screen.findByText("状态变更");
    expect(screen.getByText("状态 ID：修复中（ID 7）")).toBeTruthy();
    expect(screen.getByText("状态 ID：已修复（ID 9）")).toBeTruthy();
    expect(screen.getByText("custom_future_event")).toBeTruthy();
    expect(screen.getByText(/hours：0/)).toBeTruthy();
    expect(screen.getByText("验证通过")).toBeTruthy();
    expect(loadActivitiesMock).toHaveBeenCalledWith("5059", "2");
  });

  it("opens related workitems and returns without changing the outer project scope", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const child = { ...attachmentItem, id: "6000", workitemNo: "PT-6000", subject: "关联子工单" };
    loadPtraceWorkitemMock.mockResolvedValueOnce(attachmentItem).mockResolvedValueOnce(child).mockResolvedValue(attachmentItem);
    loadRelationsMock.mockResolvedValue({ parent: null, children: [child], parentError: false, childrenError: false });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<WorkItemDetailModal item={attachmentItem} onClose={onClose} />);
    await user.click(await screen.findByRole("button", { name: /PT-6000.*关联子工单/ }));
    await screen.findByRole("heading", { name: "关联子工单" });
    await waitFor(() => expect(loadPtraceWorkitemMock).toHaveBeenCalledWith("6000"));
    await user.click(screen.getByRole("button", { name: "返回上一张工单" }));
    await screen.findByRole("heading", { name: "图片附件测试" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("discards late comments after navigating to another workitem", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    let finish!: (comments: PtraceWorkitemComment[]) => void;
    loadPtraceWorkitemMock.mockResolvedValueOnce(attachmentItem).mockResolvedValue({ ...attachmentItem, id: "6001", subject: "另一张工单" });
    loadCommentsMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue([]);
    const user = userEvent.setup();
    const { rerender } = render(<WorkItemDetailModal item={attachmentItem} onClose={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "评论" }));
    await waitFor(() => expect(loadCommentsMock).toHaveBeenCalledTimes(1));
    rerender(<WorkItemDetailModal item={{ ...attachmentItem, id: "6001", subject: "另一张工单" }} onClose={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "评论" }));
    await screen.findByText("暂无评论");
    await act(async () => { finish([commentFixture]); });
    expect(screen.queryByText("评论作者")).toBeNull();
    expect(screen.getByRole("heading", { name: "另一张工单" })).toBeTruthy();
  });
});

function installQuotaStorage(limit: number, failingKeys: string[] = []) {
  const previous = window.localStorage;
  const values = new Map<string, string>();
  for (let index = 0; index < previous.length; index += 1) {
    const key = previous.key(index);
    if (key) values.set(key, previous.getItem(key)!);
  }
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => {
      const bytes = [...values].reduce((total, [storedKey, storedValue]) => total + (storedKey === key ? 0 : (storedKey.length + storedValue.length) * 2), (key.length + value.length) * 2);
      if (bytes > limit || failingKeys.includes(key)) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      values.set(key, value);
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  return () => Object.defineProperty(window, "localStorage", { configurable: true, value: previous });
}

const workbenchFixture: PtracePayload = {
  products: [{ id: "wb-a", name: "工作台项目 A" }, { id: "wb-b", name: "工作台项目 B" }],
  sprints: [
    { id: "old", productId: "wb-a", name: "1.0.0", status: "active" },
    { id: "old-app", productId: "wb-a", name: "旧版 App", parentId: "old" },
    { id: "new", productId: "wb-a", name: "1.1.0", status: "planning" },
    { id: "new-app", productId: "wb-a", name: "新版 App", parentId: "new" },
    { id: "new-empty", productId: "wb-a", name: "新版后端", parentId: "new" },
    { id: "b-root", productId: "wb-b", name: "1.0.0", status: "active" },
  ],
  workitems: [
    { id: "old-active", productId: "wb-a", subject: "旧版逾期工单", assignedToId: "me", statusName: "进行中", sprintId: "old-app", plannedEndTime: "2026-08-10T18:00:00+08:00" },
    { id: "old-done", productId: "wb-a", subject: "旧版已完成工单", assignedToId: "me", statusName: "已完成", sprintId: "old-app" },
    { id: "new-todo", productId: "wb-a", subject: "新版待推进工单", assignedToId: "me", statusName: "待处理", sprintId: "new-app", plannedStartTime: "2026-08-12T09:00:00+08:00", plannedEndTime: "2026-08-12T18:00:00+08:00" },
    { id: "new-done-1", productId: "wb-a", subject: "新版已完成一", assignedToId: "me", statusName: "已完成", sprintId: "new-app" },
    { id: "new-done-2", productId: "wb-a", subject: "新版直属已完成", assignedToId: "me", statusName: "已完成", sprintId: "new" },
    { id: "new-team", productId: "wb-a", subject: "新版同事已完成", assignedToId: "other", statusName: "已完成", sprintId: "new-app" },
    { id: "unset", productId: "wb-a", subject: "未关联迭代工单", assignedToId: "me", plannedEndTime: "2026-08-12T18:00:00+08:00" },
    { id: "b-item", productId: "wb-b", subject: "B 项目待推进", assignedToId: "me", sprintId: "b-root", plannedEndTime: "2026-08-12T18:00:00+08:00" },
  ], syncedAt: "2026-08-11T10:00:00+08:00",
};

describe("workbench iteration selector", () => {
  it("updates only the primary workbench region and preserves the calendar and workitem pages", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("ptracedesk-identity-v1", "me");
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify(workbenchFixture));
    render(<App />);
    await user.selectOptions(screen.getByLabelText("项目范围"), "wb-a");
    const selector = screen.getByRole("combobox", { name: "工作台父迭代" });
    let queue = screen.getByRole("region", { name: "今日工单" });
    const health = screen.getByRole("region", { name: "项目健康度" });
    expect((selector as HTMLSelectElement).selectedOptions[0].text).toBe("1.0.0");
    expect(within(queue).getByText("旧版逾期工单")).toBeTruthy();
    expect(within(queue).queryByText("新版待推进工单")).toBeNull();
    expect(within(health).getByText("50%")).toBeTruthy();
    const calendarBefore = screen.getAllByRole("gridcell").map((cell) => cell.getAttribute("aria-label"));
    await user.selectOptions(selector, within(selector).getByRole("option", { name: "1.1.0" }));
    queue = screen.getByRole("region", { name: "今日工单" });
    expect(within(queue).queryByText("旧版逾期工单")).toBeNull();
    expect(within(queue).getByRole("button", { name: /随后安排/ }).getAttribute("aria-expanded")).toBe("false");
    await user.click(within(queue).getByRole("button", { name: /随后安排/ }));
    expect(within(queue).getByText("新版待推进工单")).toBeTruthy();
    expect(within(health).getByText("67%")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "1.1.0父迭代进度" }).getAttribute("aria-valuenow")).toBe("75");
    expect(within(screen.getByRole("list", { name: "子迭代进度" })).getByText("新版后端")).toBeTruthy();
    expect(screen.getAllByRole("gridcell").map((cell) => cell.getAttribute("aria-label"))).toEqual(calendarBefore);
    expect((screen.getByLabelText("项目范围") as HTMLSelectElement).value).toBe("wb-a");
    await user.click(within(queue).getByText("新版待推进工单"));
    expect(screen.getByRole("dialog", { name: "新版待推进工单" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "我的工单" }));
    expect(within(screen.getByRole("tabpanel")).getByText("旧版逾期工单")).toBeTruthy();
    expect(within(screen.getByRole("tabpanel")).getByText("新版待推进工单")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "工作台" }));
    expect((screen.getByRole("combobox", { name: "工作台父迭代" }) as HTMLSelectElement).selectedOptions[0].text).toBe("1.1.0");
    await user.selectOptions(screen.getByLabelText("项目范围"), "wb-b");
    await user.click(within(screen.getByRole("region", { name: "今日工单" })).getByRole("button", { name: /随后安排/ }));
    expect(within(screen.getByRole("region", { name: "今日工单" })).getByText("B 项目待推进")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "工作台父迭代" }) as HTMLSelectElement).selectedOptions[0].text).toBe("1.0.0");
  });

  it("excludes disabled project iterations and provides the unset-iteration view", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("ptracedesk-identity-v1", "me");
    window.localStorage.setItem("ptracedesk-hidden-projects-v1", JSON.stringify(["wb-b"]));
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify(workbenchFixture));
    render(<App />);
    const selector = screen.getByRole("combobox", { name: "工作台父迭代" });
    expect(within(selector).getAllByRole("option").map((option) => option.textContent)).toEqual(["1.0.0", "1.1.0", "未设置迭代"]);
    await user.selectOptions(selector, within(selector).getByRole("option", { name: "未设置迭代" }));
    const queue = screen.getByRole("region", { name: "今日工单" });
    await user.click(within(queue).getByRole("button", { name: /随后安排/ }));
    expect(within(queue).getByText("未关联迭代工单")).toBeTruthy();
    expect(within(queue).queryByText("新版待推进工单")).toBeNull();
    expect(screen.getByText("当前显示未设置迭代的工单")).toBeTruthy();
  });
});

function queueFixtureItem(id: string, fields: Partial<DashboardItem> = {}): DashboardItem {
  return { ...attachmentItem, id, displayNo: `PT-${id}`, subject: id, description: null, attachments: [], ...fields };
}

describe("workbench daily queue", () => {
  it("groups every open item once by today's work, overdue work, and later work", () => {
    const items = [
      queueFixtureItem("active", { statusKind: "active", plannedEndTime: "2026-10-01T18:00:00+08:00" }),
      queueFixtureItem("starts-today", { plannedStartTime: "2026-09-09T09:30:00+08:00", plannedEndTime: "2026-09-10T18:00:00+08:00" }),
      queueFixtureItem("ends-today", { plannedEndTime: "2026-09-09T18:00:00+08:00" }),
      queueFixtureItem("spans-today", { plannedStartTime: "2026-09-08T09:00:00+08:00", plannedEndTime: "2026-09-10T18:00:00+08:00" }),
      queueFixtureItem("one-valid-date", { plannedStartTime: "invalid", plannedEndTime: "2026-09-09T18:00:00+08:00" }),
      queueFixtureItem("future", { plannedStartTime: "2026-09-10T09:00:00+08:00", plannedEndTime: "2026-09-11T18:00:00+08:00" }),
      queueFixtureItem("unscheduled"),
      queueFixtureItem("invalid", { plannedStartTime: "invalid", plannedEndTime: "invalid" }),
      ...Array.from({ length: 6 }, (_, index) => queueFixtureItem(`overdue-${index}`, { isOverdue: true, statusKind: "active", plannedEndTime: "2026-08-21T18:00:00+08:00" })),
      queueFixtureItem("done", { statusKind: "done", isOverdue: true }),
      queueFixtureItem("cancelled", { statusKind: "cancelled", isOverdue: true }),
    ];
    const before = JSON.stringify(items);
    const groups = groupWorkbenchItems(items, "2026-09-09T09:25:00+08:00");
    expect(groups.today.map((item) => item.id).sort()).toEqual(["active", "ends-today", "one-valid-date", "spans-today", "starts-today"]);
    expect(groups.overdue).toHaveLength(6);
    expect(groups.later.map((item) => item.id).sort()).toEqual(["future", "invalid", "unscheduled"]);
    const ids = [...groups.today, ...groups.overdue, ...groups.later].map((item) => item.id);
    expect(new Set(ids).size).toBe(14);
    expect(ids).not.toContain("done");
    expect(ids).not.toContain("cancelled");
    expect(JSON.stringify(items)).toBe(before);
  });

  it("keeps today's full list even when the dashboard preview queue is capped", () => {
    const now = "2026-09-09T09:25:00+08:00";
    const snapshot = buildDashboardSnapshot({
      products: [{ id: "test", name: "测试项目" }],
      workitems: Array.from({ length: 9 }, (_, index) => ({ id: `today-${index}`, productId: "test", subject: `今日任务 ${index}`, plannedStartTime: "2026-09-09T09:30:00+08:00", plannedEndTime: "2026-09-09T18:00:00+08:00" })),
      syncedAt: now,
    }, { now });
    expect(snapshot.queue).toHaveLength(6);
    expect(groupWorkbenchItems(snapshot.items, now).today).toHaveLength(9);
  });

  it("shows the full overdue group after today's plan and expands every later item", async () => {
    const user = userEvent.setup();
    const groups = {
      today: [queueFixtureItem("today")],
      overdue: Array.from({ length: 6 }, (_, index) => queueFixtureItem(`overdue-${index}`, { isOverdue: true })),
      later: [queueFixtureItem("later-1"), queueFixtureItem("later-2")],
    };
    render(<TodayQueue groups={groups} onFocus={vi.fn()} onDetails={vi.fn()} />);
    const panel = screen.getByRole("region", { name: "今日工单" });
    expect(within(panel).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["今日计划 1", "已逾期 6", "随后安排 2展开全部"]);
    expect(panel.querySelectorAll("article.work-row")).toHaveLength(7);
    expect(within(screen.getByRole("region", { name: /已逾期 6/ })).getAllByRole("article")).toHaveLength(6);
    const toggle = within(panel).getByRole("button", { name: /随后安排/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("later-1")).toBeNull();
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.querySelectorAll("article.work-row")).toHaveLength(9);
    expect(screen.getByText("later-2")).toBeTruthy();
    await user.click(toggle);
    expect(panel.querySelectorAll("article.work-row")).toHaveLength(7);
  });

  it("shows relative workbench times and compact priority while preserving copying and default rows", async () => {
    testClock.now = "2026-09-09T09:25:00+08:00";
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const onDetails = vi.fn();
    const item = queueFixtureItem("5284", { displayNo: "PT-5256", subject: "App 强制更新完整标题", priority: 1, estimatedHours: 3, plannedStartTime: "2026-09-09T09:30:00+08:00", plannedEndTime: "2026-09-10T18:00:00+08:00" });
    const { container, rerender } = render(<WorkItemRow item={item} variant="workbench" selected={false} onFocus={vi.fn()} onDetails={onDetails} />);
    expect(screen.getByText("今天 09:30")).toBeTruthy();
    expect(screen.getByText("明天 18:00")).toBeTruthy();
    expect(screen.getByText("P1").closest(".work-copy")).toBeTruthy();
    expect(screen.getByTitle(item.subject)).toBeTruthy();
    expect(container.querySelector(".risk-tag")).toBeNull();
    await user.click(screen.getByTitle("复制工单编号"));
    expect(writeText).toHaveBeenCalledWith("PT-5256(内部ID 5284)");
    expect(screen.getByText("已复制")).toBeTruthy();
    expect(onDetails).not.toHaveBeenCalled();
    await user.click(screen.getByText(item.subject));
    expect(onDetails).toHaveBeenCalledTimes(1);
    rerender(<WorkItemRow item={item} selected={false} onFocus={vi.fn()} onDetails={onDetails} />);
    expect(screen.queryByText("今天 09:30")).toBeNull();
    expect(screen.getByText("9月9日 09:30")).toBeTruthy();
    expect(screen.getByText("高优先级")).toBeTruthy();
    expect(container.querySelector(".work-row-workbench")).toBeNull();
    writeText.mockRestore();
  });

  it("keeps the heading count aligned with today's rows and handles the no-plan state", async () => {
    testClock.now = "2026-09-09T09:25:00+08:00";
    window.localStorage.setItem("ptracedesk-identity-v1", "me");
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify({
      products: [{ id: "daily", name: "今日计划测试" }],
      sprints: [{ id: "root", productId: "daily", name: "1.0.0", status: "active" }],
      workitems: [
        { id: "today", productId: "daily", subject: "今天开始的任务", assignedToId: "me", sprintId: "root", plannedStartTime: "2026-09-09T09:30:00+08:00", plannedEndTime: "2026-09-10T18:00:00+08:00" },
        { id: "old", productId: "daily", subject: "历史逾期任务", assignedToId: "me", sprintId: "root", plannedEndTime: "2026-08-21T18:00:00+08:00" },
      ], syncedAt: "2026-09-09T09:15:00+08:00",
    }));
    const { unmount } = render(<App />);
    expect(screen.getByText("1 个今日计划")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /今日计划 1/ })).getAllByRole("article")).toHaveLength(1);
    unmount();
    render(<TodayQueue groups={{ today: [], overdue: [], later: [] }} onFocus={vi.fn()} onDetails={vi.fn()} />);
    expect(screen.getByText("当前范围暂无今日计划")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByRole("button", { name: /随后安排/ })).toBeNull();
  });
});

describe("PtraceDesk core interactions", () => {
  it("schedules automatic sync on weekday quarter-hours between 09:00 and 18:00", () => {
    expect(isAutoSyncTime(new Date(2026, 7, 18, 9, 0))).toBe(true);
    expect(isAutoSyncTime(new Date(2026, 7, 18, 17, 45))).toBe(true);
    expect(isAutoSyncTime(new Date(2026, 7, 18, 18, 0))).toBe(true);
    expect(isAutoSyncTime(new Date(2026, 7, 18, 18, 15))).toBe(false);
    expect(isAutoSyncTime(new Date(2026, 7, 22, 9, 0))).toBe(false);

    const beforeWork = new Date(2026, 7, 18, 8, 52);
    expect(millisecondsUntilNextAutoSync(beforeWork)).toBe(8 * 60 * 1000);

    const fridayEvening = new Date(2026, 7, 21, 18, 1);
    const nextSync = new Date(fridayEvening.getTime() + millisecondsUntilNextAutoSync(fridayEvening));
    expect(nextSync.getDay()).toBe(1);
    expect(nextSync.getHours()).toBe(9);
    expect(nextSync.getMinutes()).toBe(0);
  });

  it("filters the dashboard by project", async () => {
    const user = userEvent.setup();
    render(<App />);
    const projectSelect = screen.getByLabelText("项目范围");
    await user.selectOptions(projectSelect, "project-data");
    await user.click(screen.getByRole("button", { name: "甘特图" }));
    expect(screen.getAllByText("报表导出超时优化").length).toBeGreaterThan(0);
    expect(screen.queryByText("支付服务幂等优化")).toBeNull();
  });

  it("locally disables obsolete projects and restores them later", async () => {
    const user = userEvent.setup();
    const firstRender = render(<App />);

    await user.click(screen.getByRole("button", { name: "管理追踪项目" }));
    const manager = screen.getByRole("dialog", { name: "管理追踪项目" });
    await user.click(within(manager).getByRole("button", { name: /Aurora 官网改版/ }));
    await user.click(within(manager).getByRole("button", { name: /移动端功能迭代/ }));

    expect(screen.getByText("范围 · 1 个项目")).toBeTruthy();
    const singleProjectSelect = screen.getByLabelText("项目范围") as HTMLSelectElement;
    expect(singleProjectSelect.selectedOptions[0]?.text).toBe("数据导出优化");
    expect(singleProjectSelect.options).toHaveLength(1);
    expect((within(manager).getByRole("button", { name: /数据导出优化/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(window.localStorage.getItem("ptracedesk-hidden-projects-v1")).toContain("project-aurora");
    expect(window.localStorage.getItem("ptracedesk-hidden-projects-v1")).toContain("project-mobile");

    await user.click(within(manager).getByRole("button", { name: "关闭项目管理" }));
    await user.click(screen.getByRole("button", { name: "我的工单" }));
    const workitemList = screen.getByRole("tabpanel");
    expect(within(workitemList).getByText("报表导出超时优化")).toBeTruthy();
    expect(within(workitemList).queryByText("支付服务幂等优化")).toBeNull();
    expect(within(workitemList).queryByText("用户导入接口性能优化")).toBeNull();

    firstRender.unmount();
    render(<App />);
    expect(screen.getByText("范围 · 1 个项目")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "管理追踪项目" }));
    const reopenedManager = screen.getByRole("dialog", { name: "管理追踪项目" });
    await user.click(within(reopenedManager).getByRole("button", { name: /Aurora 官网改版/ }));
    expect(screen.getByText("范围 · 2 个项目")).toBeTruthy();
  });

  it("focuses a workitem and opens details by clicking the row", async () => {
    const user = userEvent.setup();
    render(<App />);
    const row = screen
      .getAllByText("消息队列堆积告警完善")
      .map((node) => node.closest("article.work-row"))
      .find(Boolean) as HTMLElement | undefined;
    expect(row).toBeTruthy();
    expect(within(row!).getAllByRole("button")).toHaveLength(1);
    const workNumber = row!.querySelector(".work-number");
    expect(workNumber?.children[0]?.textContent).toBe("PJR-3291");
    expect(workNumber?.children[1]?.textContent).toBe("ID wi-3291");
    await user.click(within(row!).getByRole("button", { name: /PJR-3291 消息队列堆积告警完善，ID wi-3291，查看详情/ }));
    expect(row!.className).toContain("selected");
    expect(screen.getByRole("dialog", { name: "消息队列堆积告警完善" })).toBeTruthy();
    expect(within(row!).getByText("计划内").className).toBe("urgency-badge urgency-normal");
  });

  it("copies the workitem number and internal ID without opening details", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<App />);
    const row = screen
      .getAllByText("消息队列堆积告警完善")
      .map((node) => node.closest("article.work-row"))
      .find(Boolean) as HTMLElement | undefined;

    expect(row).toBeTruthy();
    await user.click(within(row!).getByTitle("复制工单编号"));
    expect(writeText).toHaveBeenCalledWith("PJR-3291(内部ID wi-3291)");
    expect(await within(row!).findByText("已复制")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "消息队列堆积告警完善" })).toBeNull();

    await user.click(within(row!).getByText("消息队列堆积告警完善"));
    expect(screen.getByRole("dialog", { name: "消息队列堆积告警完善" })).toBeTruthy();
    writeText.mockRestore();
  });

  it("labels workitem urgency from its planned end time", () => {
    render(<App />);

    expect(document.querySelector(".urgency-overdue")?.textContent).toBe("已逾期");
    expect(document.querySelectorAll(".urgency-normal").length).toBeGreaterThan(0);
  });

  it("shows a breathing light only before active workitems", () => {
    const activeItem: DashboardItem = {
      id: "active-item",
      productId: "189",
      productName: "Latent",
      subject: "正在处理的工单",
      displayNo: "PT-2088",
      assigneeId: "1",
      assigneeName: "向建",
      typeLabel: "任务",
      statusLabel: "进行中",
      statusKind: "active",
      isOverdue: false,
      dueLabel: "今天到期",
    };
    const { rerender } = render(
      <WorkItemRow item={activeItem} selected={false} onFocus={() => undefined} onDetails={() => undefined} />,
    );

    expect(document.querySelector(".work-breathing-light")).toBeTruthy();

    rerender(
      <WorkItemRow
        item={{ ...activeItem, id: "todo-item", statusLabel: "待处理", statusKind: "todo" }}
        selected={false}
        onFocus={() => undefined}
        onDetails={() => undefined}
      />,
    );

    expect(document.querySelector(".work-breathing-light")).toBeNull();
  });

  it("does not label completed workitems as overdue", () => {
    render(
      <WorkItemRow
        item={{
          id: "completed-overdue",
          productId: "189",
          productName: "Latent",
          subject: "已完成但计划时间在过去",
          displayNo: "PT-2070",
          assigneeId: "1",
          assigneeName: "向建",
          typeLabel: "任务",
          statusLabel: "已完成",
          statusKind: "done",
          isOverdue: false,
          dueLabel: "7月24日到期",
          plannedStartTime: "2026-07-24T09:00:00+08:00",
          plannedEndTime: "2026-07-24T18:00:00+08:00",
        }}
        selected={false}
        onFocus={() => undefined}
        onDetails={() => undefined}
      />,
    );

    expect(screen.queryByText("已逾期")).toBeNull();
    expect(screen.getByText("已完成")).toBeTruthy();
  });

  it("marks an open workitem overdue after its exact planned end time", () => {
    testClock.now = "2026-08-06T10:05:00+08:00";
    const snapshot = buildDashboardSnapshot({
      products: [{ id: "189", name: "Latent" }],
      workitems: [{
        id: "2086",
        productId: "189",
        workitemNo: "PT-2086",
        subject: "auth · 页面与 Mock",
        statusName: "进行中",
        plannedStartTime: "2026-08-05T13:00:00+08:00",
        plannedEndTime: "2026-08-06T10:00:00+08:00",
      }],
      syncedAt: "2026-08-06T10:05:00+08:00",
    } as PtracePayload, { now: "2026-08-06T10:05:00+08:00" });
    const item = snapshot.items[0];

    expect(item.isOverdue).toBe(true);
    render(<WorkItemRow item={item} selected={false} onFocus={() => undefined} onDetails={() => undefined} />);
    expect(screen.getByText("已逾期")).toBeTruthy();
  });

  it("shows each workitem planned start and end date", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "我的工单" }));

    expect(screen.getAllByLabelText("开始 未设置，结束 8月20日 18:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("未设置").length).toBeGreaterThan(0);
  });

  it("shows parent and child sprint names in workitem details", () => {
    render(
      <WorkItemDetailModal
        item={{
          id: "2687",
          productId: "189",
          productName: "Latent",
          subject: "迭代层级测试",
          displayNo: "PT-2687",
          assigneeId: "11",
          assigneeName: "向建",
          typeLabel: "任务",
          statusLabel: "进行中",
          statusKind: "active",
          isOverdue: false,
          dueLabel: "今天到期",
          sprintId: "248",
          sprintName: "P2 UGC平台",
          sprintParentId: "78",
          sprintParentName: "1.0.0",
        }}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "迭代层级测试" });
    expect(within(dialog).getByText("父迭代")).toBeTruthy();
    expect(within(dialog).getByText("1.0.0")).toBeTruthy();
    expect(within(dialog).getByText("子迭代")).toBeTruthy();
    expect(within(dialog).getByText("P2 UGC平台")).toBeTruthy();
  });

  it("shows scheduled and completed counts in the work calendar and opens daily details", async () => {
    const user = userEvent.setup();
    const onDetails = vi.fn();
    const common = {
      productId: "project",
      productName: "项目",
      assigneeId: "me",
      assigneeName: "我",
      typeLabel: "任务",
      statusLabel: "待办",
      statusKind: "todo" as const,
      isOverdue: false,
      dueLabel: "今天到期",
    };
    const items = [
      {
        ...common,
        id: "first",
        displayNo: "PT-1",
        subject: "上午任务",
        plannedStartTime: "2026-08-11T09:00:00+08:00",
        plannedEndTime: "2026-08-11T13:00:00+08:00",
        estimatedHours: 4,
      },
      {
        ...common,
        id: "second",
        displayNo: "PT-2",
        subject: "重叠任务",
        plannedStartTime: "2026-08-11T11:00:00+08:00",
        plannedEndTime: "2026-08-11T18:00:00+08:00",
        estimatedHours: 5,
      },
      {
        ...common,
        id: "completed",
        displayNo: "PT-3",
        subject: "当天完成任务",
        statusLabel: "已完成",
        statusKind: "done" as const,
        completedAt: "2026-08-11T17:20:00+08:00",
      },
    ] as DashboardItem[];

    render(<UpcomingSchedule items={items} onDetails={onDetails} />);

    expect(screen.getByRole("heading", { name: "工作日历" })).toBeTruthy();
    expect(screen.getByText("1 天需关注")).toBeTruthy();
    await user.click(screen.getByRole("gridcell", { name: "8月11日，排期 2 个，完成 1 个，需要关注" }));

    const dialog = screen.getByRole("dialog", { name: "8月11日 周二" });
    expect(within(dialog).getByText("9 / 8 小时 · 超负荷")).toBeTruthy();
    expect(within(dialog).getByText("2 条冲突")).toBeTruthy();
    expect(within(dialog).getByText("当天完成任务")).toBeTruthy();
    expect(within(dialog).getByText("ID completed")).toBeTruthy();
    expect(within(dialog).getByText("上午任务")).toBeTruthy();
    expect(within(dialog).getByText("ID first")).toBeTruthy();

    await user.click(within(dialog).getByText("上午任务"));
    expect(onDetails).toHaveBeenCalledWith(items[0]);
    expect(screen.queryByRole("dialog", { name: "8月11日 周二" })).toBeNull();
  });

  it("opens workitem details from the full row and keeps it focused", async () => {
    const user = userEvent.setup();
    render(<App />);
    const row = screen
      .getAllByText("消息队列堆积告警完善")
      .map((node) => node.closest("article.work-row"))
      .find(Boolean) as HTMLElement | undefined;
    expect(row).toBeTruthy();

    await user.click(within(row!).getByRole("button", { name: /PJR-3291 消息队列堆积告警完善，ID wi-3291，查看详情/ }));
    const dialog = screen.getByRole("dialog", { name: "消息队列堆积告警完善" });
    expect(within(dialog).getByText("PJR-3291")).toBeTruthy();
    expect(within(dialog).getByText("ID wi-3291")).toBeTruthy();
    expect(within(dialog).getByText("P2")).toBeTruthy();
    expect(within(dialog).getByText("2026年8月20日 18:00")).toBeTruthy();
    expect(within(dialog).getByText("暂无描述")).toBeTruthy();
    expect(row!.className).toContain("selected");

    await user.click(within(dialog).getByRole("button", { name: "关闭详情" }));
    expect(screen.queryByRole("dialog", { name: "消息队列堆积告警完善" })).toBeNull();

    await user.click(within(row!).getByRole("button", { name: /PJR-3291 消息队列堆积告警完善，ID wi-3291，查看详情/ }));
    const reopenedDialog = screen.getByRole("dialog", { name: "消息队列堆积告警完善" });
    await user.click(reopenedDialog.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog", { name: "消息队列堆积告警完善" })).toBeNull();
  });

  it("shows all assigned workitems with status and type filters", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    render(<App />);

    await user.click(screen.getByRole("button", { name: "我的工单" }));
    expect(screen.getByRole("heading", { name: "我的工单", level: 2 })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "我的工单", level: 1 })).toBeNull();
    expect(screen.getByRole("tab", { name: /全部\s*20/ })).toBeTruthy();
    const workitemList = screen.getByRole("tabpanel");

    await user.click(screen.getByRole("tab", { name: /已完成\s*13/ }));
    expect(within(workitemList).getAllByText("登录态刷新策略").length).toBeGreaterThan(0);
    expect(within(workitemList).queryByText("支付服务幂等优化")).toBeNull();

    await user.click(screen.getByRole("tab", { name: /全部\s*20/ }));
    await user.selectOptions(screen.getByLabelText("工单类型"), "缺陷");
    expect(within(workitemList).getByText("修复订单推送异常问题")).toBeTruthy();
    expect(within(workitemList).getByText("报表导出超时优化")).toBeTruthy();
    expect(within(workitemList).queryByText("支付服务幂等优化")).toBeNull();

    await user.click(screen.getByRole("button", { name: "工作台" }));
    expect(screen.getByText("今天要推进什么")).toBeTruthy();
  });

  it.each(["我的工单", "别人指派的", "我指派的"])("filters %s by parent and child sprint together with status, type, and search", async (destination) => {
    const user = userEvent.setup();
    const outgoing = destination === "我指派的";
    const base = {
      productId: "project-a",
      assignedToId: outgoing ? "user-other" : "user-me",
      creatorId: outgoing ? "user-me" : "user-other",
      sprintParentId: "parent-a",
      sprintParentName: "1.0.0",
      statusName: "待处理",
      workitemCategory: "任务",
    };
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify({
      products: [{ id: "project-a", name: "项目 A" }, { id: "project-b", name: "项目 B" }],
      workitems: [
        { ...base, id: "child-one", subject: "第一子迭代任务", sprintId: "child-1", sprintName: "P0" },
        { ...base, id: "child-two", subject: "第二子迭代缺陷", sprintId: "child-2", sprintName: "P1", workitemCategory: "缺陷" },
        { ...base, id: "done", subject: "已完成任务", statusName: "已完成" },
        { ...base, id: "other-parent", subject: "其他父迭代任务", sprintParentId: "parent-b", sprintParentName: "2.0.0" },
        { ...base, id: "other-project", productId: "project-b", subject: "其他项目同名迭代任务" },
        { ...base, id: "unset", subject: "未设置父迭代任务", sprintParentId: null, sprintParentName: null },
        { ...base, id: "name-only", subject: "仅有父迭代名称任务", sprintParentId: null, sprintParentName: "名称迭代" },
        { ...base, id: "id-only", subject: "仅有父迭代 ID 任务", sprintParentId: "parent-id", sprintParentName: null },
      ],
      syncedAt: "2026-09-07T10:00:00+08:00",
    }));
    render(<App />);
    await user.click(screen.getByRole("button", { name: destination }));
    const parentFilter = screen.getByRole("combobox", { name: "父迭代" });
    const childFilter = screen.getByRole("combobox", { name: "子迭代" });
    const workitemList = screen.getByRole("tabpanel");
    const expectStatusCounts = (counts: number[]) => {
      expect(screen.getAllByRole("tab").map((tab) => Number(tab.querySelector("span")?.textContent))).toEqual(counts);
    };

    expectStatusCounts([8, 7, 0, 1, 0]);
    await user.selectOptions(parentFilter, within(parentFilter).getByRole("option", { name: "项目 A · 1.0.0" }));
    expectStatusCounts([3, 2, 0, 1, 0]);
    expect(workitemList.querySelectorAll("article.work-row")).toHaveLength(3);
    expect(within(workitemList).getByText("第一子迭代任务")).toBeTruthy();
    expect(within(workitemList).getByText("第二子迭代缺陷")).toBeTruthy();
    expect(within(workitemList).queryByText("其他父迭代任务")).toBeNull();
    expect(within(workitemList).queryByText("其他项目同名迭代任务")).toBeNull();

    await user.selectOptions(childFilter, within(childFilter).getByRole("option", { name: "P0" }));
    expectStatusCounts([1, 1, 0, 0, 0]);
    expect(within(workitemList).getByText("第一子迭代任务")).toBeTruthy();
    expect(within(workitemList).queryByText("第二子迭代缺陷")).toBeNull();
    await user.selectOptions(parentFilter, within(parentFilter).getByRole("option", { name: "2.0.0" }));
    expect((childFilter as HTMLSelectElement).value).toBe("all");
    expect(within(childFilter).queryByRole("option", { name: "P0" })).toBeNull();
    await user.selectOptions(parentFilter, within(parentFilter).getByRole("option", { name: "项目 A · 1.0.0" }));
    await user.selectOptions(childFilter, "none");
    expectStatusCounts([1, 0, 0, 1, 0]);
    expect(within(workitemList).getByText("已完成任务")).toBeTruthy();
    await user.selectOptions(childFilter, "all");
    expectStatusCounts([3, 2, 0, 1, 0]);

    await user.click(screen.getByRole("tab", { name: /待处理/ }));
    expectStatusCounts([3, 2, 0, 1, 0]);
    await user.selectOptions(screen.getByRole("combobox", { name: "工单类型" }), "任务");
    expectStatusCounts([2, 1, 0, 1, 0]);
    await user.type(screen.getByRole("searchbox", { name: "搜索工单" }), "第一子迭代");
    expectStatusCounts([1, 1, 0, 0, 0]);
    expect(workitemList.querySelectorAll("article.work-row")).toHaveLength(1);
    await user.click(within(workitemList).getByText("第一子迭代任务"));
    expect(screen.getByRole("dialog", { name: "第一子迭代任务" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "清空搜索" }));
    expectStatusCounts([2, 1, 0, 1, 0]);
    await user.click(screen.getByRole("tab", { name: /已完成/ }));
    expectStatusCounts([2, 1, 0, 1, 0]);
    expect(within(workitemList).getByText("已完成任务")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /待处理/ }));
    await user.type(screen.getByRole("searchbox", { name: "搜索工单" }), "不存在的关键词");
    expectStatusCounts([0, 0, 0, 0, 0]);
    await user.click(screen.getByRole("button", { name: "清空搜索" }));
    await user.selectOptions(parentFilter, "all");
    expect((childFilter as HTMLSelectElement).value).toBe("all");
    expectStatusCounts([7, 6, 0, 1, 0]);
    expect(within(workitemList).getByText("其他父迭代任务")).toBeTruthy();

    for (const [option, subject] of [
      ["未设置父迭代", "未设置父迭代任务"],
      ["名称迭代", "仅有父迭代名称任务"],
      ["迭代 parent-id", "仅有父迭代 ID 任务"],
      ["项目 B · 1.0.0", "其他项目同名迭代任务"],
    ]) {
      await user.selectOptions(parentFilter, within(parentFilter).getByRole("option", { name: option }));
      expect(within(childFilter).queryByRole("option", { name: "P0" })).toBeNull();
      expectStatusCounts([1, 1, 0, 0, 0]);
      expect(workitemList.querySelectorAll("article.work-row")).toHaveLength(1);
      expect(within(workitemList).getByText(subject)).toBeTruthy();
    }

    await user.selectOptions(screen.getByLabelText("项目范围"), "project-a");
    expect((parentFilter as HTMLSelectElement).value).toBe("all");
    expect((childFilter as HTMLSelectElement).value).toBe("all");
    expectStatusCounts([6, 5, 0, 1, 0]);
    expect(within(parentFilter).queryByRole("option", { name: "项目 B · 1.0.0" })).toBeNull();
    expect(within(workitemList).getByText("第一子迭代任务")).toBeTruthy();
    await user.selectOptions(childFilter, within(childFilter).getByRole("option", { name: "P0" }));
    await user.selectOptions(screen.getByLabelText("项目范围"), "project-b");
    expect((childFilter as HTMLSelectElement).value).toBe("all");
    expect(within(childFilter).queryByRole("option", { name: "P0" })).toBeNull();
  });

  it("shows every filtered workitem, resets scrolling on filter changes, and clears a parent missing after refresh", async () => {
    const user = userEvent.setup();
    const items = buildDashboardSnapshot({
      products: [{ id: "project-a", name: "项目 A" }],
      workitems: Array.from({ length: 42 }, (_, index) => ({
        id: `item-${index}`,
        productId: "project-a",
        subject: `任务 ${index}`,
        sprintParentId: index < 21 ? "parent-a" : "parent-b",
        sprintParentName: index < 21 ? "1.0.0" : "2.0.0",
        sprintId: index < 10 ? "child-a" : index < 21 ? "child-b" : "child-c",
        sprintName: index < 10 ? "P0" : index < 21 ? "P1" : "P2",
      })),
      syncedAt: "2026-09-07T10:00:00+08:00",
    }).items;
    const callbacks = { onFocus: vi.fn(), onDetails: vi.fn() };
    const { rerender } = render(<MyWorkitems items={items} {...callbacks} />);
    const parentFilter = screen.getByRole("combobox", { name: "父迭代" });
    const childFilter = screen.getByRole("combobox", { name: "子迭代" });
    const list = screen.getByRole("tabpanel");
    expect(list.querySelectorAll("article.work-row")).toHaveLength(42);
    expect(within(list).getByText("任务 41")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "下一页" })).toBeNull();
    expect(screen.queryByRole("button", { name: "上一页" })).toBeNull();
    list.scrollTop = 300;
    await user.selectOptions(parentFilter, within(parentFilter).getByRole("option", { name: "1.0.0" }));
    expect(list.scrollTop).toBe(0);
    expect(screen.getByRole("tab", { name: /全部\s*21/ })).toBeTruthy();
    expect(list.querySelectorAll("article.work-row")).toHaveLength(21);
    list.scrollTop = 240;
    await user.selectOptions(childFilter, within(childFilter).getByRole("option", { name: "P0" }));
    expect(list.scrollTop).toBe(0);
    expect(list.querySelectorAll("article.work-row")).toHaveLength(10);
    list.scrollTop = 150;
    await user.selectOptions(parentFilter, "none");
    expect((childFilter as HTMLSelectElement).value).toBe("all");
    expect(list.scrollTop).toBe(0);
    expect(list.querySelectorAll("article.work-row")).toHaveLength(0);
    await user.selectOptions(parentFilter, within(parentFilter).getByRole("option", { name: "1.0.0" }));
    rerender(<MyWorkitems items={items.filter((item) => item.sprintParentId === "parent-b")} {...callbacks} />);
    expect((parentFilter as HTMLSelectElement).value).toBe("all");
    expect(list.querySelectorAll("article.work-row")).toHaveLength(21);
    expect(within(parentFilter).queryByRole("option", { name: "1.0.0" })).toBeNull();
  });

  it("keeps name-only child iterations distinct across projects and parents", async () => {
    const user = userEvent.setup();
    const items = buildDashboardSnapshot({
      products: [{ id: "project-a", name: "项目 A" }, { id: "project-b", name: "项目 B" }],
      workitems: [
        { id: "a-p0", productId: "project-a", subject: "A 的 P0", sprintParentId: "parent-a", sprintParentName: "1.0.0", sprintName: "P0" },
        { id: "a-other-p0", productId: "project-a", subject: "A 另一父迭代的 P0", sprintParentId: "parent-b", sprintParentName: "2.0.0", sprintName: "P0" },
        { id: "b-p0", productId: "project-b", subject: "B 的 P0", sprintParentId: "parent-a", sprintParentName: "1.0.0", sprintName: "P0" },
        { id: "parent-direct", productId: "project-a", subject: "父迭代直属工单", sprintId: "parent-a", sprintName: "1.0.0", sprintParentId: "parent-a", sprintParentName: "1.0.0" },
      ],
      syncedAt: "2026-09-07T10:00:00+08:00",
    }).items;
    render(<MyWorkitems items={items} onFocus={vi.fn()} onDetails={vi.fn()} />);
    const childFilter = screen.getByRole("combobox", { name: "子迭代" });
    const list = screen.getByRole("tabpanel");

    await user.selectOptions(childFilter, within(childFilter).getByRole("option", { name: "项目 A · 1.0.0 · P0" }));
    expect(list.querySelectorAll("article.work-row")).toHaveLength(1);
    expect(within(list).getByText("A 的 P0")).toBeTruthy();
    await user.selectOptions(childFilter, "none");
    expect(within(list).getByText("父迭代直属工单")).toBeTruthy();
    expect(list.querySelectorAll("article.work-row")).toHaveLength(1);
  });

  it.each(["我的工单", "别人指派的", "我指派的"])("sorts %s by numeric internal ID descending", async (destination) => {
    const user = userEvent.setup();
    const outgoing = destination === "我指派的";
    const identity = {
      assignedToId: outgoing ? "user-other" : "user-me",
      creatorId: outgoing ? "user-me" : "user-other",
    };
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify({
      products: [{ id: "project-a", name: "项目 A" }],
      workitems: [
        { id: "7408", workitemNo: "PT-7380", createTime: "2026-09-01T09:00:00+08:00" },
        { id: "7369", workitemNo: "PT-7341", createTime: "2026-09-03T18:00:00+08:00" },
        { id: "7370", workitemNo: "PT-7342", createTime: "2026-09-03T18:00:00+08:00" },
        { id: "7366", workitemNo: "PT-7338", createTime: "invalid" },
        { id: "7367", workitemNo: "PT-7339" },
        { id: "7368", workitemNo: "PT-7340" },
        { id: "7364", workitemNo: "PT-7336" },
        { id: "7365", workitemNo: "PT-7337" },
        { id: "9", workitemNo: "PT-9000" },
        { id: "10", workitemNo: "PT-1" },
        { id: "9007199254740992" },
        { id: "9007199254740993" },
        { id: "invalid-id" },
      ].map((item) => ({
        ...item,
        productId: "project-a",
        subject: `内部 ID ${item.id}`,
        ...identity,
      })),
      syncedAt: "2026-09-04T10:00:00+08:00",
    }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: destination }));

    const rows = [...screen.getByRole("tabpanel").querySelectorAll("article.work-row")];
    expect(rows.map((row) => row.querySelector(".work-copy strong")?.textContent)).toEqual([
      "内部 ID 9007199254740993",
      "内部 ID 9007199254740992",
      "内部 ID 7408",
      "内部 ID 7370",
      "内部 ID 7369",
      "内部 ID 7368",
      "内部 ID 7367",
      "内部 ID 7366",
      "内部 ID 7365",
      "内部 ID 7364",
      "内部 ID 10",
      "内部 ID 9",
      "内部 ID invalid-id",
    ]);
  });

  it("searches workitems by partial display number, partial ID, and title", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify({
      products: [{ id: "project-a", name: "项目 A" }],
      workitems: [
        {
          id: "47",
          productId: "project-a",
          workitemNo: "PT-4762",
          subject: "修复搜索匹配",
          assignedToId: "user-me",
        },
        {
          id: "88",
          productId: "project-a",
          workitemNo: "PT-8801",
          subject: "无关工单",
          assignedToId: "user-me",
        },
      ],
      syncedAt: "2026-09-07T10:00:00+08:00",
    }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "我的工单" }));
    const workitemList = screen.getByRole("tabpanel");
    const search = screen.getByRole("searchbox", { name: "搜索工单" });

    await user.type(search, "476");
    expect(within(workitemList).getByText("修复搜索匹配")).toBeTruthy();
    expect(within(workitemList).queryByText("无关工单")).toBeNull();

    await user.clear(search);
    await user.type(search, "pt-4762");
    expect(within(workitemList).getByText("修复搜索匹配")).toBeTruthy();

    await user.clear(search);
    await user.type(search, "4");
    expect(within(workitemList).getByText("修复搜索匹配")).toBeTruthy();

    await user.clear(search);
    await user.type(search, "搜索匹配");
    expect(within(workitemList).getByText("修复搜索匹配")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "清空搜索" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(within(workitemList).getByText("无关工单")).toBeTruthy();
  });

  it("shows workitems created by the current identity and assigned to other people", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    render(<App />);

    await user.click(screen.getByRole("button", { name: "我的工单" }));
    await user.type(screen.getByRole("searchbox", { name: "搜索工单" }), "队列堆积");

    await user.click(screen.getByRole("button", { name: "我指派的" }));
    expect(screen.getByRole("heading", { name: "我指派的工单", level: 2 })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "我指派的工单", level: 1 })).toBeNull();
    expect(screen.getByText("查看当前项目范围内由你创建并指派给其他人的工单。")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /全部\s*1/ })).toBeTruthy();

    const search = screen.getByRole("searchbox", { name: "搜索工单" }) as HTMLInputElement;
    expect(search.value).toBe("");
    const workitemList = screen.getByRole("tabpanel");
    expect(within(workitemList).getByText("登录链路回归测试跟进")).toBeTruthy();
    expect(within(workitemList).queryByText("支付服务幂等优化")).toBeNull();

    await user.selectOptions(screen.getByLabelText("工单类型"), "任务");
    await user.type(search, "回归测试");
    expect(within(workitemList).getByText("登录链路回归测试跟进")).toBeTruthy();

    await user.clear(search);
    await user.click(within(workitemList).getByRole("button", { name: /PJR-3315 登录链路回归测试跟进，ID wi-delegated-1，查看详情/ }));
    const dialog = screen.getByRole("dialog", { name: "登录链路回归测试跟进" });
    expect(within(dialog).getByText("林然")).toBeTruthy();
  });

  it("shows workitems assigned by other creators without including self-created workitems", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify({
      products: [{ id: "project-a", name: "项目 A" }],
      workitems: [
        {
          id: "incoming",
          productId: "project-a",
          workitemNo: "PJR-4001",
          subject: "他人指派的联调任务",
          workitemCategory: "任务",
          ptraceCreatorId: "user-other",
          ptraceCreatorName: "林然",
          ptraceAssignedToId: "user-me",
          ptraceAssignedToName: "向建",
        },
        {
          id: "self-created",
          productId: "project-a",
          workitemNo: "PJR-4002",
          subject: "自己创建的任务",
          workitemCategory: "任务",
          ptraceCreatorId: "user-me",
          ptraceCreatorName: "向建",
          ptraceAssignedToId: "user-me",
          ptraceAssignedToName: "向建",
        },
      ],
      syncedAt: "2026-08-27T10:00:00+08:00",
    }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "别人指派的" }));
    expect(screen.getByRole("heading", { name: "别人指派给我的工单", level: 2 })).toBeTruthy();
    expect(screen.getByText("查看当前项目范围内由其他人创建并指派给你的工单。")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /全部\s*1/ })).toBeTruthy();

    const workitemList = screen.getByRole("tabpanel");
    expect(within(workitemList).getByText("他人指派的联调任务")).toBeTruthy();
    expect(within(workitemList).queryByText("自己创建的任务")).toBeNull();
  });

  it("keeps only distinct destinations in the sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("button", { name: "工作台" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "我的工单" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "别人指派的" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "我指派的" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "甘特图" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "项目进度" })).toBeNull();
    expect(screen.queryByRole("button", { name: "排期" })).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "设置" })[0]);
    expect(screen.getByRole("dialog", { name: "设置" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "关闭" }));
  });

  it("opens the read-only Gantt view, switches scale, and reuses workitem details", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "甘特图" }));
    expect(screen.getByRole("region", { name: "甘特图" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "月", pressed: true })).toBeTruthy();
    expect(screen.getAllByText("未排期").length).toBeGreaterThan(0);
    expect(screen.getAllByText("前端表单组件可访问性改进").length).toBeGreaterThan(0);
    const ganttInternalId = screen.getAllByText("ID wi-3291")
      .find((node) => node.closest(".gantt-item-number"));
    expect(ganttInternalId).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "周", pressed: false }));
    expect(screen.getByRole("button", { name: "周", pressed: true })).toBeTruthy();
    expect(screen.getByText("8月10日 – 16日")).toBeTruthy();

    const detailButtons = screen.getAllByRole("button", { name: /PJR-3291 消息队列堆积告警完善，ID wi-3291，查看详情/ });
    await user.click(detailButtons[detailButtons.length - 1]);
    expect(screen.getByRole("dialog", { name: "消息队列堆积告警完善" })).toBeTruthy();
  });

  it("moves appearance into settings, persists the theme, and removes redundant schedule actions", async () => {
    const user = userEvent.setup();
    const firstRender = render(<App />);

    expect(screen.queryByRole("button", { name: "外观" })).toBeNull();
    expect(screen.queryByRole("button", { name: "查看排期" })).toBeNull();
    expect(screen.queryByRole("button", { name: "查看当前排期" })).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "设置" })[0]);
    const settings = screen.getByRole("dialog", { name: "设置" });
    expect(within(settings).getByRole("group", { name: "外观主题" })).toBeTruthy();
    await user.click(within(settings).getByRole("button", { name: "深色模式" }));

    expect(document.querySelector(".app-shell")?.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("ptracedesk-theme-v1")).toBe("dark");

    firstRender.unmount();
    render(<App />);
    expect(document.querySelector(".app-shell")?.getAttribute("data-theme")).toBe("dark");
  });

  it("removes the current focus card and toggles the sidebar width", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText("当前聚焦")).toBeNull();
    const sidebar = screen.getByRole("navigation", { name: "工作台导航" }).closest("aside") as HTMLElement;
    const collapse = screen.getByRole("button", { name: "收起侧栏" });

    await user.click(collapse);
    expect(sidebar.className).toContain("collapsed");
    expect(screen.getByRole("button", { name: "展开侧栏" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "展开侧栏" }));
    expect(sidebar.className).not.toContain("collapsed");
  });

  it("keeps browser preview read-only and explains how to connect live data", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /预览数据/ }));
    expect(screen.getByText("浏览器预览使用演示数据；请在 Tauri 桌面 App 中连接 ptrace。")).toBeTruthy();
  });

  it("keeps settings and manual refresh available in the main window", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    const payload: PtracePayload = {
      products: [{ id: "project-a", name: "主窗口验证项目" }],
      workitems: [{ id: "mine", productId: "project-a", subject: "我的任务", assignedToId: "user-me", creatorId: "user-me" }],
      syncedAt: "2026-09-09T09:00:00+08:00",
    };
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify(payload));
    loadPtracePayloadMock.mockResolvedValueOnce({ ...payload, syncedAt: "2026-09-09T09:15:00+08:00" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "工作台导航" })).getByRole("button", { name: "设置" }));
    const settings = screen.getByRole("dialog", { name: "设置" });
    await user.click(within(settings).getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("button", { name: /本地缓存/ }));
    await waitFor(() => expect(loadPtracePayloadMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: /同步于/ })).toBeTruthy();
  });

  it("keeps scheduled sync and assignment notifications active without a tray", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 9, 9, 14, 0));
    testClock.now = "2026-09-09T09:14:00+08:00";
    const callbacks: Array<() => Promise<void>> = [];
    const originalSetTimeout = window.setTimeout.bind(window);
    const timer = vi.spyOn(window, "setTimeout").mockImplementation((handler, delay, ...args) => {
      if (typeof handler === "function" && typeof delay === "number" && delay >= 60_000) {
        callbacks.push(handler as () => Promise<void>);
        return -callbacks.length as unknown as ReturnType<typeof window.setTimeout>;
      }
      return originalSetTimeout(handler, delay, ...args) as unknown as ReturnType<typeof window.setTimeout>;
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: { invoke: vi.fn(async () => "session-fixture") } });
    hasStoredSessionMock.mockResolvedValue(true);
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    const baseline: PtracePayload = {
      products: [{ id: "project-a", name: "通知验证项目" }], workitems: [], syncedAt: "2026-09-09T09:00:00+08:00",
    };
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify(baseline));
    loadPtracePayloadMock.mockResolvedValueOnce(baseline).mockResolvedValueOnce({
      ...baseline,
      workitems: [{ id: "incoming", productId: "project-a", workitemNo: "PT-6001", subject: "新指派任务", assignedToId: "user-me", creatorId: "other", creatorName: "同事" }],
      syncedAt: "2026-09-09T09:15:00+08:00",
    });
    const { result, unmount } = renderHook(() => useDashboard());
    try {
      await waitFor(() => expect(result.current.mode).toBe("live"));
      expect(loadPtracePayloadMock).toHaveBeenCalledTimes(1);
      expect(sendNotificationMock).not.toHaveBeenCalled();
      expect(callbacks.length).toBeGreaterThan(0);
      vi.setSystemTime(new Date(2026, 8, 9, 9, 15, 0));
      await act(async () => { await callbacks[callbacks.length - 1](); });
      expect(loadPtracePayloadMock).toHaveBeenCalledTimes(2);
      expect(sendNotificationMock).toHaveBeenCalledExactlyOnceWith({ title: "同事 给你指派了工单", body: "通知验证项目 · PT-6001 新指派任务" });
      expect(result.current.state).toBe("ready");
    } finally {
      unmount();
      timer.mockRestore();
      vi.useRealTimers();
    }
  });

  it("notifies when a sync adds a workitem assigned by another creator", async () => {
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify({
      products: [{ id: "project-a", name: "项目 A" }],
      workitems: [],
      syncedAt: "2026-09-07T09:45:00+08:00",
    }));
    loadPtracePayloadMock.mockResolvedValueOnce({
      products: [{ id: "project-a", name: "项目 A" }],
      workitems: [{
        id: "incoming-4001",
        productId: "project-a",
        workitemNo: "PJR-4001",
        subject: "他人指派的联调任务",
        ptraceCreatorId: "user-other",
        ptraceCreatorName: "林然",
        ptraceAssignedToId: "user-me",
        ptraceAssignedToName: "向建",
      }],
      syncedAt: "2026-09-07T10:00:00+08:00",
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /本地缓存/ }));

    await waitFor(() => expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "林然 给你指派了工单",
      body: "项目 A · PJR-4001 他人指派的联调任务",
    }));
  });

  it("persists a compact cache when full descriptions exceed a bounded storage quota", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    const payload: PtracePayload = {
      products: [{ id: "project-a", name: "缓存验证项目" }],
      workitems: [{
        id: "cache-quota", productId: "project-a", workitemNo: "PT-6000", subject: "大体积工单",
        assignedToId: "user-me", statusName: "进行中", sprintParentId: "parent-a", sprintParentName: "1.0.0",
        createTime: "2026-09-08T10:00:00+08:00", plannedEndTime: "2026-09-09T18:00:00+08:00",
        description: "正文".repeat(2_500_000), attachments: [{ id: "image", filename: "截图.jpg", url: imageOne }],
      }],
      syncedAt: "2026-09-08T10:30:00+08:00",
    };
    const restoreStorage = installQuotaStorage(5 * 1024 * 1024);
    try {
    expect(() => window.localStorage.setItem("quota-probe", JSON.stringify(payload))).toThrow();
    loadPtracePayloadMock.mockResolvedValueOnce(payload);
    const { result, unmount } = renderHook(() => useDashboard());
    await act(async () => { await result.current.sync(); });
    expect(result.current.state).toBe("ready");
    expect(result.current.mode).toBe("live");
    expect(result.current.error).toBe("");
    expect(result.current.payload.workitems[0].description).toBe(payload.workitems[0].description);
    const stored = window.localStorage.getItem("ptracedesk-data-cache-v1")!;
    expect(stored.length).toBeLessThan(2_000);
    const cached = JSON.parse(stored) as PtracePayload;
    expect(cached.workitems[0].description).toBeUndefined();
    expect(cached.workitems[0].attachments).toBeUndefined();
    expect(cached.workitems[0].sprintParentId).toBe("parent-a");
    expect(cached.workitems[0].plannedEndTime).toBe(payload.workitems[0].plannedEndTime);
    expect(cached.syncedAt).toBe(payload.syncedAt);
    unmount();
    const reopened = renderHook(() => useDashboard());
    expect(reopened.result.current.mode).toBe("cache");
    expect(reopened.result.current.snapshot.items[0].subject).toBe("大体积工单");
    } finally { restoreStorage(); }
  });

  it("keeps a completed sync and notification baseline when cache persistence is unavailable", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    const previous: PtracePayload = { products: [{ id: "project-a", name: "缓存验证项目" }], workitems: [], syncedAt: "2026-09-08T10:00:00+08:00" };
    window.localStorage.setItem("ptracedesk-data-cache-v1", JSON.stringify(previous));
    const latest: PtracePayload = { ...previous, workitems: [{ id: "new-assignment", productId: "project-a", subject: "新指派任务", assignedToId: "user-me", creatorId: "other", creatorName: "同事" }], syncedAt: "2026-09-08T10:30:00+08:00" };
    loadPtracePayloadMock.mockResolvedValueOnce(latest).mockResolvedValueOnce(latest);
    const restoreStorage = installQuotaStorage(Infinity, ["ptracedesk-data-cache-v1"]);
    try {
      const { result } = renderHook(() => useDashboard());
      await act(async () => { await result.current.sync(); });
      expect(result.current.mode).toBe("live");
      expect(result.current.state).toBe("ready");
      expect(result.current.error).toBe("最新工单已同步，但本地缓存保存失败；重新打开时将使用上次缓存。");
      expect(result.current.snapshot.items[0].subject).toBe("新指派任务");
      expect(window.localStorage.getItem("ptracedesk-data-cache-v1")).toBe(JSON.stringify(previous));
      expect(sendNotificationMock).toHaveBeenCalledTimes(1);
      await act(async () => { await result.current.sync(); });
      expect(sendNotificationMock).toHaveBeenCalledTimes(1);
      expect(result.current.mode).toBe("live");
    } finally { restoreStorage(); }
  });

  it("renders the main workbench without producing a quick-panel cache", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    render(<App />);
    expect(screen.getByText("今天要推进什么")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Ptrace 快捷面板" })).toBeNull();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("项目范围"), "project-aurora");
    expect(window.localStorage.getItem("ptracedesk-quick-panel-v1")).toBeNull();
  });
});

describe("dashboard disconnection", () => {
  const cacheKey = "ptracedesk-data-cache-v1";
  const baseline: PtracePayload = {
    products: [{ id: "session-project", name: "会话测试项目" }],
    workitems: [],
    syncedAt: "2026-09-09T09:00:00+08:00",
  };
  const live: PtracePayload = {
    ...baseline,
    workitems: [{ id: "session-item", productId: "session-project", subject: "旧会话工单", assignedToId: "user-me", creatorId: "other" }],
  };

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
  }

  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    window.localStorage.setItem("ptracedesk-identity-v1", "user-me");
    window.localStorage.setItem(cacheKey, JSON.stringify(baseline));
  });

  it.each(["success", "failure"])("ignores a late sync %s and authorization callback after disconnect", async (outcome) => {
    const pending = deferred<PtracePayload>();
    let onAuthorizationStarted: (() => void) | undefined;
    loadPtracePayloadMock.mockImplementationOnce((callback) => {
      onAuthorizationStarted = callback;
      return pending.promise;
    });
    const { result } = renderHook(() => useDashboard());
    let inFlight!: Promise<void>;
    act(() => { inFlight = result.current.sync(); });
    await waitFor(() => expect(loadPtracePayloadMock).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.disconnect(); });
    await act(async () => {
      onAuthorizationStarted?.();
      if (outcome === "success") pending.resolve(live);
      else pending.reject(new Error("旧同步错误"));
      await inFlight;
    });
    expect(result.current.mode).toBe("demo");
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBe("");
    expect(result.current.authorizationOpen).toBe(false);
    expect(result.current.identityOpen).toBe(false);
    expect(result.current.snapshot.items.some((item) => item.id === "session-item")).toBe(false);
    expect(window.localStorage.getItem(cacheKey)).toBeNull();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("keeps the new sync locked when an old request finishes after reconnecting", async () => {
    const oldRequest = deferred<PtracePayload>();
    const newRequest = deferred<PtracePayload>();
    loadPtracePayloadMock.mockImplementationOnce(() => oldRequest.promise).mockImplementationOnce(() => newRequest.promise);
    const { result } = renderHook(() => useDashboard());
    let oldSync!: Promise<void>;
    act(() => { oldSync = result.current.sync(); });
    await waitFor(() => expect(loadPtracePayloadMock).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.disconnect(); });
    let newSync!: Promise<void>;
    act(() => { newSync = result.current.sync(); });
    await waitFor(() => expect(loadPtracePayloadMock).toHaveBeenCalledTimes(2));
    await act(async () => { oldRequest.resolve(live); await oldSync; });
    expect(result.current.mode).toBe("demo");
    expect(result.current.state).toBe("connecting");
    await act(async () => { await result.current.sync(); });
    expect(loadPtracePayloadMock).toHaveBeenCalledTimes(2);
    await act(async () => { newRequest.resolve(live); await newSync; });
    expect(result.current.mode).toBe("live");
    expect(result.current.state).toBe("ready");
    expect(JSON.parse(window.localStorage.getItem(cacheKey)!).workitems[0].id).toBe("session-item");
  });

  it("isolates old requests and blocks new syncs while credentials are being cleared", async () => {
    const pending = deferred<PtracePayload>();
    const clearing = deferred<undefined>();
    clearStoredSessionMock.mockImplementationOnce(() => clearing.promise);
    loadPtracePayloadMock.mockImplementationOnce(() => pending.promise).mockResolvedValue(live);
    const { result } = renderHook(() => useDashboard());
    let syncing!: Promise<void>;
    act(() => { syncing = result.current.sync(); });
    await waitFor(() => expect(loadPtracePayloadMock).toHaveBeenCalledTimes(1));
    let disconnecting!: Promise<void>;
    act(() => { disconnecting = result.current.disconnect(); });
    await waitFor(() => expect(clearStoredSessionMock).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(cacheKey)).toBeNull();
    await act(async () => { pending.resolve(live); await syncing; await result.current.sync(); });
    expect(loadPtracePayloadMock).toHaveBeenCalledTimes(1);
    expect(result.current.mode).toBe("demo");
    await act(async () => { clearing.resolve(undefined); await disconnecting; });
    await act(async () => { await result.current.sync(); });
    expect(loadPtracePayloadMock).toHaveBeenCalledTimes(2);
    expect(result.current.mode).toBe("live");
  });

  it("reports credential-clear failure and allows disconnection to be retried", async () => {
    clearStoredSessionMock.mockRejectedValueOnce(new Error("钥匙串不可用"));
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(hasStoredSessionMock).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.disconnect(); });
    expect(result.current.mode).toBe("demo");
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("断开连接失败：钥匙串不可用");
    expect(window.localStorage.getItem(cacheKey)).toBeNull();
    await act(async () => { await result.current.disconnect(); });
    expect(clearStoredSessionMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBe("");
  });

  it("ignores a launch session check that finishes after disconnect", async () => {
    const sessionCheck = deferred<boolean>();
    hasStoredSessionMock.mockImplementationOnce(() => sessionCheck.promise);
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(hasStoredSessionMock).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.disconnect(); });
    await act(async () => { sessionCheck.resolve(true); await sessionCheck.promise; });
    expect(loadPtracePayloadMock).not.toHaveBeenCalled();
    expect(result.current.mode).toBe("demo");
    expect(window.localStorage.getItem(cacheKey)).toBeNull();
  });

  it("ignores delayed scheduled session checks and keeps automatic sync off after disconnect", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 9, 9, 15, 0));
    const callbacks: Array<() => Promise<void>> = [];
    const originalSetTimeout = window.setTimeout.bind(window);
    const timer = vi.spyOn(window, "setTimeout").mockImplementation((handler, delay, ...args) => {
      if (typeof handler === "function" && typeof delay === "number" && delay >= 60_000) {
        callbacks.push(handler as () => Promise<void>);
        return -callbacks.length as unknown as ReturnType<typeof window.setTimeout>;
      }
      return originalSetTimeout(handler, delay, ...args) as unknown as ReturnType<typeof window.setTimeout>;
    });
    const sessionCheck = deferred<boolean>();
    hasStoredSessionMock.mockResolvedValueOnce(false).mockImplementationOnce(() => sessionCheck.promise).mockResolvedValue(true);
    const { result, unmount } = renderHook(() => useDashboard());
    try {
      await waitFor(() => expect(hasStoredSessionMock).toHaveBeenCalledTimes(1));
      let scheduled!: Promise<void>;
      act(() => { scheduled = callbacks[callbacks.length - 1](); });
      await waitFor(() => expect(hasStoredSessionMock).toHaveBeenCalledTimes(2));
      await act(async () => { await result.current.disconnect(); });
      await act(async () => { sessionCheck.resolve(true); await scheduled; });
      await act(async () => { await callbacks[callbacks.length - 1](); });
      expect(hasStoredSessionMock).toHaveBeenCalledTimes(2);
      expect(loadPtracePayloadMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(cacheKey)).toBeNull();
    } finally {
      unmount();
      timer.mockRestore();
      vi.useRealTimers();
    }
  });

  it("drops pending assignment notifications when permission completes after disconnect", async () => {
    const permission = deferred<NotificationPermission>();
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockImplementationOnce(() => permission.promise);
    loadPtracePayloadMock.mockResolvedValue(live);
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(requestPermissionMock).toHaveBeenCalledTimes(1));
    let syncing!: Promise<void>;
    act(() => { syncing = result.current.sync(); });
    await waitFor(() => expect(result.current.mode).toBe("live"));
    await act(async () => { await result.current.disconnect(); });
    await act(async () => { permission.resolve("granted"); await syncing; });
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(result.current.mode).toBe("demo");
    expect(window.localStorage.getItem(cacheKey)).toBeNull();
  });
});
