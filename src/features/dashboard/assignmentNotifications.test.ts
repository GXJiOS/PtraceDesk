// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findNewAssignments,
  sendAssignmentNotifications,
  type NewAssignment,
} from "./assignmentNotifications";
import type { PtracePayload, PtraceWorkitem } from "./types";

const { isPermissionGrantedMock, requestPermissionMock, sendNotificationMock } = vi.hoisted(() => ({
  isPermissionGrantedMock: vi.fn<() => Promise<boolean>>(),
  requestPermissionMock: vi.fn<() => Promise<NotificationPermission>>(),
  sendNotificationMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: requestPermissionMock,
  sendNotification: sendNotificationMock,
}));

function payload(workitems: PtraceWorkitem[]): PtracePayload {
  return {
    products: [
      { id: "project-a", name: "项目 A" },
      { id: "project-hidden", name: "停用项目" },
    ],
    workitems,
    syncedAt: "2026-09-07T10:00:00+08:00",
  };
}

function incoming(id: string, overrides: Partial<PtraceWorkitem> = {}): PtraceWorkitem {
  return {
    id,
    productId: "project-a",
    workitemNo: `PT-${id}`,
    subject: `工单 ${id}`,
    ptraceCreatorId: "other",
    ptraceCreatorName: "林然",
    ptraceAssignedToId: "me",
    ...overrides,
  };
}

beforeEach(() => {
  isPermissionGrantedMock.mockReset().mockResolvedValue(true);
  requestPermissionMock.mockReset().mockResolvedValue("granted");
  sendNotificationMock.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

describe("assignment notifications", () => {
  it("finds only newly assigned workitems from known other creators", () => {
    const existing = incoming("existing");
    const assignments = findNewAssignments(
      payload([existing]),
      payload([
        existing,
        incoming("new"),
        incoming("self-created", { ptraceCreatorId: "me" }),
        incoming("unknown-creator", { ptraceCreatorId: null, ptraceCreatorName: null }),
        incoming("assigned-elsewhere", { ptraceAssignedToId: "teammate" }),
        incoming("hidden", { productId: "project-hidden" }),
      ]),
      "me",
      ["project-hidden"],
    );

    expect(assignments.map(({ item }) => item.id)).toEqual(["new"]);
    expect(assignments[0]).toMatchObject({ creatorName: "林然", projectName: "项目 A" });
  });

  it("treats a changed assignee as a new assignment and skips the first live baseline", () => {
    const reassigned = incoming("reassigned");
    const previous = payload([
      incoming("reassigned", { ptraceAssignedToId: "teammate" }),
    ]);

    expect(findNewAssignments(previous, payload([reassigned]), "me").map(({ item }) => item.id))
      .toEqual(["reassigned"]);
    expect(findNewAssignments(null, payload([incoming("historical")]), "me")).toEqual([]);
  });

  it("requests permission and sends one native notification per assignment", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    isPermissionGrantedMock.mockResolvedValue(false);
    const assignment: NewAssignment = {
      item: incoming("4001", { workitemNo: "PJR-4001", subject: "联调任务" }),
      creatorName: "林然",
      projectName: "项目 A",
    };

    await expect(sendAssignmentNotifications([assignment])).resolves.toBe(1);
    expect(requestPermissionMock).toHaveBeenCalledOnce();
    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "林然 给你指派了工单",
      body: "项目 A · PJR-4001 联调任务",
    });
  });
});
