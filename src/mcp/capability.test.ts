import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardErrorMessage } from "../features/dashboard/useDashboard";
import { loadPtraceWorkitem, parsePtraceWorkitem, parsePtraceWorkitemDetail, loadPtraceWorkitemComments, loadPtraceWorkitemActivities, loadPtraceWorkitemRelations } from "./ptraceApi";

const { callToolMock, closeMock, connectMock, hasSessionMock } = vi.hoisted(() => {
  const callToolMock = vi.fn();
  const closeMock = vi.fn(async () => undefined);
  return {
    callToolMock,
    closeMock,
    connectMock: vi.fn(async () => ({ client: { callTool: callToolMock, close: closeMock } })),
    hasSessionMock: vi.fn(async () => true),
  };
});

vi.mock("./client", () => ({ connectPtraceMcp: connectMock }));
vi.mock("./oauthProvider", () => ({
  hasStoredPtraceSession: hasSessionMock,
  clearStoredPtraceSession: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  callToolMock.mockReset();
  hasSessionMock.mockResolvedValue(true);
});

describe("ptrace desktop integration guardrails", () => {
  it("preserves complete detail source fields while keeping list parsing compact", () => {
    const raw = { id: "1", productId: "201", subject: "完整详情", productName: "项目", parentId: "10", cycleBusinessSeconds: 0, customFields: { version: "V4" }, payloadJson: { large: "x".repeat(10000) } };
    const detail = parsePtraceWorkitemDetail(raw);
    expect(detail.parentId).toBe("10");
    expect(detail.cycleBusinessSeconds).toBe(0);
    expect(detail.rawFields).toEqual(raw);
    expect(parsePtraceWorkitem(raw)).not.toHaveProperty("rawFields");
    expect(JSON.stringify(parsePtraceWorkitem(raw)).length).toBeLessThan(200);
  });

  it("loads nested comments with complete metadata and validates their workitem identity", async () => {
    const raw = [{ id: "c1", workitemId: "1", content: "根评论", origin: 0, children: [{ id: "c2", workitemId: "1", content: "回复", parentId: "c1" }] }];
    callToolMock.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(raw) }] });
    const comments = await loadPtraceWorkitemComments("1");
    expect(comments[0].children[0].children).toEqual([]);
    expect(comments[0].rawFields.origin).toBe(0);
    expect(callToolMock).toHaveBeenCalledExactlyOnceWith({ name: "ptrace_workitem_comments", arguments: { id: "1" } });
    expect(closeMock).toHaveBeenCalledTimes(1);
    callToolMock.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify([{ ...raw[0], workitemId: "other" }]) }] });
    await expect(loadPtraceWorkitemComments("1")).rejects.toThrow("评论与当前工单不一致");
    expect(closeMock).toHaveBeenCalledTimes(2);
  });

  it("keeps activities available when reference status lookup fails", async () => {
    callToolMock.mockImplementation(async ({ name }) => {
      if (name === "ptrace_workitem_statuses") throw new Error("statuses unavailable");
      return { content: [{ type: "text", text: JSON.stringify([{ id: "a", eventType: "status_changed", toValue: { statusId: "9" }, metadata: { note: "source" } }]) }] };
    });
    const feed = await loadPtraceWorkitemActivities("1", "2");
    expect(feed.items[0].toValue).toEqual({ statusId: "9" });
    expect(feed.items[0].rawFields.metadata).toEqual({ note: "source" });
    expect(feed.statuses).toEqual([]);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("loads every child page and retains children when the parent is inaccessible", async () => {
    callToolMock.mockImplementation(async ({ name, arguments: args }) => {
      if (name === "ptrace_workitem_get") throw new Error("parent outside scope");
      return { content: [{ type: "text", text: JSON.stringify({ total: 2, list: [{ id: String(args.pageNum), productId: "201", subject: `子工单 ${args.pageNum}` }] }) }] };
    });
    const relations = await loadPtraceWorkitemRelations("5059", "201", "10");
    expect(relations.parentError).toBe(true);
    expect(relations.childrenError).toBe(false);
    expect(relations.children.map((child) => child.id)).toEqual(["1", "2"]);
    expect(callToolMock).toHaveBeenCalledWith({ name: "ptrace_workitem_list", arguments: { productId: "201", parentId: "5059", view: "summary", pageNum: 2, pageSize: 100 } });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
  it("allows the ptrace MCP origin in the Tauri HTTP capability", () => {
    const capabilityUrl = new URL("../../src-tauri/capabilities/default.json", import.meta.url);
    const capability = JSON.parse(readFileSync(capabilityUrl, "utf8")) as {
      permissions: Array<string | { identifier: string; allow?: Array<{ url: string }> }>;
    };
    const httpPermission = capability.permissions.find(
      (permission) => typeof permission !== "string" && permission.identifier === "http:default",
    );

    expect(httpPermission).toEqual({
      identifier: "http:default",
      allow: [{ url: "https://mcp-prod.ptrace.cfd/**" }],
    });
  });

  it("keeps useful Tauri promise rejection messages", () => {
    expect(dashboardErrorMessage("url not allowed on the configured scope")).toBe(
      "url not allowed on the configured scope",
    );
  });

  it("permits the verified upload origin for images while keeping the HTTP capability scoped to MCP", () => {
    const config = JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
    const images = config.app.security.csp.split(";").map((directive: string) => directive.trim())
      .find((directive: string) => directive.startsWith("img-src "));
    expect(images.split(/\s+/)).toEqual(["img-src", "'self'", "asset:", "data:", "https://ptrace-prod-uploads.ptrace.cfd"]);
  });

  it("preserves attachment metadata and normalizes string file sizes", () => {
    const item = parsePtraceWorkitem({
      id: "5059", productId: "201", subject: "附件解析测试",
      attachments: [{
        id: "169", filename: "screenshot.jpeg",
        url: "https://ptrace-prod-uploads.ptrace.cfd/test/screenshot.jpeg",
        mimeType: "image/jpeg", fileSize: "65518", isDeleted: 0, syncAttempts: 8,
      }],
    });
    expect(item.attachments?.[0]).toEqual({
      id: "169", filename: "screenshot.jpeg",
      url: "https://ptrace-prod-uploads.ptrace.cfd/test/screenshot.jpeg",
      mimeType: "image/jpeg", fileSize: 65518, isDeleted: 0,
    });
    expect(parsePtraceWorkitem({ id: "1", productId: "201", subject: "列表数据" }).attachments).toBeUndefined();
  });

  it("loads one workitem through the read-only detail tool and closes its session", async () => {
    callToolMock.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({
      id: "5059", productId: "201", subject: "工单详情", attachments: [],
    }) }] });
    expect((await loadPtraceWorkitem("5059")).attachments).toEqual([]);
    expect(callToolMock).toHaveBeenCalledExactlyOnceWith({ name: "ptrace_workitem_get", arguments: { id: "5059" } });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("closes the detail session on failure and rejects a mismatched workitem", async () => {
    callToolMock.mockRejectedValueOnce(new Error("offline"));
    await expect(loadPtraceWorkitem("5059")).rejects.toThrow("offline");
    expect(closeMock).toHaveBeenCalledTimes(1);
    callToolMock.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({
      id: "5060", productId: "201", subject: "其他工单",
    }) }] });
    await expect(loadPtraceWorkitem("5059")).rejects.toThrow("ptrace 返回的工单与当前工单不一致");
    expect(closeMock).toHaveBeenCalledTimes(2);
  });

  it("requires an existing session before requesting attachment details", async () => {
    hasSessionMock.mockResolvedValueOnce(false);
    await expect(loadPtraceWorkitem("5059")).rejects.toThrow("请先连接 ptrace");
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("normalizes decimal effort values returned by ptrace", () => {
    expect(parsePtraceWorkitem({
      id: "2333",
      productId: "189",
      subject: "测试工单",
      estimatedHours: "1.50",
    }).estimatedHours).toBe(1.5);
  });

  it("keeps parent and child sprint fields returned by ptrace", () => {
    const item = parsePtraceWorkitem({
      id: "2687",
      productId: "189",
      subject: "迭代层级测试",
      sprintId: "248",
      sprintName: "P2 UGC平台",
      sprintParentId: "78",
      sprintParentName: "1.0.0",
    });

    expect(item.sprintParentId).toBe("78");
    expect(item.sprintParentName).toBe("1.0.0");
    expect(item.sprintId).toBe("248");
    expect(item.sprintName).toBe("P2 UGC平台");
  });

  it("strips unmodeled ptrace fields before workitems enter the local cache", () => {
    const item = parsePtraceWorkitem({
      id: "2688",
      productId: "189",
      subject: "缓存边界测试",
      description: "详情页仍需保留的内容",
      payloadJson: "x".repeat(100_000),
      fieldMeta: { duplicated: true },
    });

    expect(item.description).toBe("详情页仍需保留的内容");
    expect(item).not.toHaveProperty("payloadJson");
    expect(item).not.toHaveProperty("fieldMeta");
    expect(JSON.stringify(item).length).toBeLessThan(1_000);
  });
});
