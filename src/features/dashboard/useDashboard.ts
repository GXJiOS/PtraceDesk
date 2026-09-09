import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ensureAssignmentNotificationPermission,
  notifyNewAssignments,
} from "./assignmentNotifications";
import { buildDashboardSnapshot } from "./dashboardMapper";
import { demoPayload } from "./demoData";
import type { DashboardMode, LoadState, PtracePayload } from "./types";

const CACHE_KEY = "ptracedesk-data-cache-v1";
const IDENTITY_KEY = "ptracedesk-identity-v1";
const HIDDEN_PROJECTS_KEY = "ptracedesk-hidden-projects-v1";
const AUTO_SYNC_INTERVAL_MINUTES = 15;
const AUTO_SYNC_START_HOUR = 9;
const AUTO_SYNC_END_HOUR = 18;

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export function isAutoSyncTime(value: Date) {
  const weekday = value.getDay();
  const hour = value.getHours();
  const minute = value.getMinutes();
  const isWeekday = weekday >= 1 && weekday <= 5;
  const isQuarterHour = minute % AUTO_SYNC_INTERVAL_MINUTES === 0;
  const isDuringWorkday = hour >= AUTO_SYNC_START_HOUR
    && (hour < AUTO_SYNC_END_HOUR || (hour === AUTO_SYNC_END_HOUR && minute === 0));
  return isWeekday && isQuarterHour && isDuringWorkday;
}

export function millisecondsUntilNextAutoSync(now = new Date()) {
  const candidate = new Date(now.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(
    Math.floor(candidate.getMinutes() / AUTO_SYNC_INTERVAL_MINUTES) * AUTO_SYNC_INTERVAL_MINUTES
      + AUTO_SYNC_INTERVAL_MINUTES,
  );
  while (!isAutoSyncTime(candidate)) {
    candidate.setMinutes(candidate.getMinutes() + AUTO_SYNC_INTERVAL_MINUTES);
  }
  return candidate.getTime() - now.getTime();
}

export function dashboardErrorMessage(reason: unknown) {
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  if (typeof reason === "string" && reason.trim()) return reason;
  if (reason && typeof reason === "object" && "message" in reason) {
    const message = Reflect.get(reason, "message");
    if (typeof message === "string" && message.trim()) return message;
  }
  return "无法连接 ptrace，请稍后重试。";
}

function cachedPayload(): PtracePayload | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) as PtracePayload : null;
  } catch {
    return null;
  }
}

function savePayloadCache(payload: PtracePayload): boolean {
  const summary: PtracePayload = {
    ...payload,
    workitems: payload.workitems.map(({ description: _description, attachments: _attachments, ...item }) => item),
  };
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(summary));
    return true;
  } catch {
    return false;
  }
}

function storedHiddenProjectIds(): string[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_PROJECTS_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function useDashboard() {
  const existingCache = useMemo(cachedPayload, []);
  const [payload, setPayload] = useState<PtracePayload>(existingCache || demoPayload);
  const [mode, setMode] = useState<DashboardMode>(existingCache ? "cache" : "demo");
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [identityId, setIdentityId] = useState(() => window.localStorage.getItem(IDENTITY_KEY));
  const [projectId, setProjectId] = useState<string | null>(null);
  const [hiddenProjectIds, setHiddenProjectIds] = useState<string[]>(storedHiddenProjectIds);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const syncingRef = useRef(false);

  const visiblePayload = useMemo(() => {
    const hiddenIds = new Set(hiddenProjectIds);
    return {
      ...payload,
      products: payload.products.filter((product) => !hiddenIds.has(product.id)),
      workitems: payload.workitems.filter((item) => !hiddenIds.has(item.productId)),
    };
  }, [hiddenProjectIds, payload]);

  const snapshot = useMemo(
    () => buildDashboardSnapshot(visiblePayload, { identityId, projectId }),
    [identityId, projectId, visiblePayload],
  );

  useEffect(() => {
    if (projectId && hiddenProjectIds.includes(projectId)) setProjectId(null);
  }, [hiddenProjectIds, projectId]);

  useEffect(() => {
    if (!identityId || !isTauriRuntime()) return;
    void ensureAssignmentNotificationPermission();
  }, [identityId]);

  const sync = useCallback(async () => {
    if (!isTauriRuntime()) {
      setMode("demo");
      setError("浏览器预览使用演示数据；请在 Tauri 桌面 App 中连接 ptrace。");
      return;
    }
    if (syncingRef.current) return;
    syncingRef.current = true;
    setError("");
    setAuthorizationOpen(false);
    setState(mode === "live" ? "syncing" : "connecting");
    try {
      const previousPayload = mode === "cache" || mode === "live" ? payload : null;
      const { loadPtracePayload } = await import("../../mcp/ptraceApi");
      const livePayload = await loadPtracePayload(() => setAuthorizationOpen(true));
      setPayload(livePayload);
      const cacheSaved = savePayloadCache(livePayload);
      setMode("live");
      setState("ready");
      if (!cacheSaved) setError("最新工单已同步，但本地缓存保存失败；重新打开时将使用上次缓存。");
      const nextSnapshot = buildDashboardSnapshot(livePayload, { identityId });
      if (!identityId || !nextSnapshot.assignees.some((person) => person.id === identityId)) {
        setIdentityOpen(true);
      } else {
        await notifyNewAssignments(previousPayload, livePayload, identityId, hiddenProjectIds);
      }
    } catch (reason) {
      setState("error");
      setAuthorizationOpen(false);
      setError(dashboardErrorMessage(reason));
    } finally {
      syncingRef.current = false;
    }
  }, [hiddenProjectIds, identityId, mode, payload]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    import("../../mcp/oauthProvider")
      .then(({ hasStoredPtraceSession }) => hasStoredPtraceSession())
      .then((hasSession) => {
        if (hasSession) void sync();
      })
      .catch(() => undefined);
  }, []); // The initial session check intentionally runs once.

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let timer: number | undefined;

    const scheduleNext = () => {
      timer = window.setTimeout(async () => {
        const now = new Date();
        try {
          if (isAutoSyncTime(now)) {
            const { hasStoredPtraceSession } = await import("../../mcp/oauthProvider");
            if (await hasStoredPtraceSession()) await sync();
          }
        } catch {
          // Scheduled sync failures are surfaced by sync; session checks remain silent.
        } finally {
          if (!disposed) scheduleNext();
        }
      }, millisecondsUntilNextAutoSync());
    };

    scheduleNext();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [sync]);

  const chooseIdentity = useCallback((id: string) => {
    window.localStorage.setItem(IDENTITY_KEY, id);
    setIdentityId(id);
    setIdentityOpen(false);
  }, []);

  const setProjectEnabled = useCallback((id: string, enabled: boolean) => {
    setHiddenProjectIds((current) => {
      const hiddenIds = new Set(current);
      if (enabled) hiddenIds.delete(id);
      else {
        const activeCount = payload.products.filter((product) => !hiddenIds.has(product.id)).length;
        if (activeCount <= 1) return current;
        hiddenIds.add(id);
      }
      const next = [...hiddenIds];
      window.localStorage.setItem(HIDDEN_PROJECTS_KEY, JSON.stringify(next));
      return next;
    });
  }, [payload.products]);

  const disconnect = useCallback(async () => {
    if (isTauriRuntime()) {
      const { clearStoredPtraceSession } = await import("../../mcp/oauthProvider");
      await clearStoredPtraceSession();
    }
    window.localStorage.removeItem(CACHE_KEY);
    setPayload(demoPayload);
    setMode("demo");
    setState("idle");
    setError("");
  }, []);

  return {
    payload,
    snapshot,
    mode,
    state,
    error,
    identityId,
    identityOpen,
    authorizationOpen,
    projectId,
    hiddenProjectIds,
    setProjectId,
    setProjectEnabled,
    setIdentityOpen,
    chooseIdentity,
    sync,
    disconnect,
  };
}
