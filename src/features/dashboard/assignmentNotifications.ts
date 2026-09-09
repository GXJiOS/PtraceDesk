import type { PtracePayload, PtraceWorkitem } from "./types";

export interface NewAssignment {
  item: PtraceWorkitem;
  creatorName: string;
  projectName: string;
}

function assignedToIdOf(item: PtraceWorkitem) {
  return item.ptraceAssignedToId || item.assignedToId || null;
}

function creatorOf(item: PtraceWorkitem) {
  return {
    id: item.ptraceCreatorId || item.creatorId || null,
    name: item.ptraceCreatorName || item.creatorName || "同事",
  };
}

function isAssignedByAnotherPerson(item: PtraceWorkitem, identityId: string) {
  const creator = creatorOf(item);
  return assignedToIdOf(item) === identityId
    && Boolean(creator.id)
    && creator.id !== identityId;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function findNewAssignments(
  previous: PtracePayload | null,
  next: PtracePayload,
  identityId: string,
  hiddenProjectIds: readonly string[] = [],
): NewAssignment[] {
  if (!previous) return [];

  const hiddenIds = new Set(hiddenProjectIds);
  const previousAssignmentIds = new Set(
    previous.workitems
      .filter((item) => isAssignedByAnotherPerson(item, identityId))
      .map((item) => item.id),
  );
  const projectNames = new Map(next.products.map((project) => [project.id, project.name]));

  return next.workitems.flatMap((item) => {
    if (
      hiddenIds.has(item.productId)
      || previousAssignmentIds.has(item.id)
      || !isAssignedByAnotherPerson(item, identityId)
    ) {
      return [];
    }

    return [{
      item,
      creatorName: creatorOf(item).name,
      projectName: projectNames.get(item.productId) || "ptrace",
    }];
  });
}

let permissionCheckInFlight: Promise<boolean> | null = null;

export function ensureAssignmentNotificationPermission(): Promise<boolean> {
  if (!isTauriRuntime()) return Promise.resolve(false);
  if (permissionCheckInFlight) return permissionCheckInFlight;

  permissionCheckInFlight = import("@tauri-apps/plugin-notification")
    .then(async ({ isPermissionGranted, requestPermission }) => {
      if (await isPermissionGranted()) return true;
      return await requestPermission() === "granted";
    })
    .catch(() => false)
    .finally(() => {
      permissionCheckInFlight = null;
    });

  return permissionCheckInFlight;
}

export async function sendAssignmentNotifications(
  assignments: readonly NewAssignment[],
  isCurrentSession: () => boolean = () => true,
) {
  if (assignments.length === 0 || !isCurrentSession()
    || !await ensureAssignmentNotificationPermission() || !isCurrentSession()) return 0;

  try {
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    if (!isCurrentSession()) return 0;
    assignments.forEach(({ item, creatorName, projectName }) => {
      const displayNo = item.workitemNo?.trim() || `ID ${item.id}`;
      sendNotification({
        title: `${creatorName} 给你指派了工单`,
        body: `${projectName} · ${displayNo} ${item.subject}`,
      });
    });
    return assignments.length;
  } catch {
    return 0;
  }
}

export async function notifyNewAssignments(
  previous: PtracePayload | null,
  next: PtracePayload,
  identityId: string,
  hiddenProjectIds: readonly string[] = [],
  isCurrentSession: () => boolean = () => true,
) {
  const assignments = findNewAssignments(previous, next, identityId, hiddenProjectIds);
  return sendAssignmentNotifications(assignments, isCurrentSession);
}
