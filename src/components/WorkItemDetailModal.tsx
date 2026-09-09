import { CalendarBlank, ClockCounterClockwise, ImageSquare, Info, UserCircle, X } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { statusKindOf } from "../features/dashboard/dashboardMapper";
import type { DashboardItem, PtraceWorkitem, PtraceWorkitemDetail, PtraceWorkitemComment, PtraceWorkitemActivity, PtraceWorkitemActivityFeed } from "../features/dashboard/types";
import { WorkItemLink, WorkItemRichText, ptraceImageUrl, richTextImages, type WorkItemImageInfo } from "./WorkItemRichText";

interface WorkItemDetailModalProps {
  item: DashboardItem;
  onClose: () => void;
}

function dateTime(value?: string | null) {
  if (!value) return "未设置";
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY年M月D日 HH:mm") : "未设置";
}

function hours(value?: number | null) {
  return value != null ? `${value} 小时` : "未设置";
}

function priority(value?: number | null) {
  if (value == null) return "未设置";
  return value === 1 ? "P1（最高）" : `P${value}`;
}

function workitemImages(item: PtraceWorkitem): WorkItemImageInfo[] {
  const images = new Map<string, WorkItemImageInfo>();
  for (const attachment of item.attachments || []) {
    const url = ptraceImageUrl(attachment.url);
    if (!url || attachment.isDeleted) continue;
    if (!attachment.mimeType?.toLowerCase().startsWith("image/")
      && !/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(attachment.filename || new URL(url).pathname)) continue;
    images.set(url, { url, name: attachment.filename || `图片 ${images.size + 1}` });
  }
  for (const image of richTextImages(item.description)) {
    if (!images.has(image.url)) images.set(image.url, image);
  }
  return [...images.values()];
}

function AttachmentImage({ image, onOpen, onRetry }: {
  image: WorkItemImageInfo;
  onOpen?: (trigger: HTMLButtonElement) => void;
  onRetry?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const picture = (
    <img
      key={attempt}
      src={image.url}
      alt={image.name}
      loading={onOpen ? "lazy" : "eager"}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => setState("ready")}
      onError={() => setState("error")}
    />
  );
  return (
    <div className="attachment-media" aria-busy={state === "loading"}>
      {state === "error" ? (
        <div className="attachment-image-error" role="status">
          <span>图片加载失败</span>
          <button type="button" aria-label={`重试图片 ${image.name}`} onClick={() => {
            onRetry?.();
            setState("loading");
            setAttempt((current) => current + 1);
          }}>重试</button>
        </div>
      ) : (
        <>
          {onOpen ? (
            <button type="button" className="attachment-open" aria-label={`放大图片 ${image.name}`} disabled={state !== "ready"} onClick={(event) => onOpen(event.currentTarget)}>
              {picture}
            </button>
          ) : picture}
          {state === "loading" && <span className="attachment-loading" role="status">图片加载中…</span>}
        </>
      )}
    </div>
  );
}

function AttachmentPreview({ image, onClose }: { image: WorkItemImageInfo; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="modal-backdrop attachment-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="attachment-preview"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attachment-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [])];
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header>
          <h2 id="attachment-preview-title" title={image.name}>{image.name}</h2>
          <button type="button" ref={closeButtonRef} className="modal-close" aria-label="关闭图片预览" autoFocus onClick={onClose}><X size={20} /></button>
        </header>
        <AttachmentImage image={image} onRetry={() => closeButtonRef.current?.focus()} />
      </section>
    </div>
  );
}

type DetailTab = "details" | "comments" | "activities";
type Resource<T> = { status: "idle" | "loading" | "ready" | "error"; data?: T; retry: () => void };

function useDetailResource<T>(enabled: boolean, read: () => Promise<T>): Resource<T> {
  const [result, setResult] = useState<Omit<Resource<T>, "retry">>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    setResult((current) => ({ ...current, status: "loading" }));
    void read().then((data) => {
      if (!disposed) setResult({ status: "ready", data });
    }).catch(() => {
      if (!disposed) setResult((current) => ({ ...current, status: "error" }));
    });
    return () => { disposed = true; };
  }, [enabled, read, attempt]);
  return { ...result, retry: () => setAttempt((current) => current + 1) };
}

function LoadNotice({ resource, label, unavailable = false }: { resource: Resource<unknown>; label: string; unavailable?: boolean }) {
  if (resource.status === "loading") return <p className="detail-load-notice" role="status">正在加载{label}…</p>;
  if (resource.status === "error") return <div className="detail-load-notice" role="status"><span>{label}加载失败，已加载内容仍可查看。</span><button type="button" onClick={resource.retry}>重试加载{label}</button></div>;
  if (resource.status === "idle" && unavailable) return <p className="detail-muted">在桌面 App 连接 ptrace 后可查看{label}。</p>;
  return null;
}

const fieldLabels: Record<string, string> = {
  id: "内部 ID", workitemId: "所属工单 ID", workitemNo: "工单编号", productId: "项目 ID", subject: "标题",
  workitemTypeName: "来源类型名称", workitemCategory: "工单分类", ptraceAssignedToName: "ptrace 处理人", ptraceCreatorName: "ptrace 建立人",
  productName: "所属项目", productOwnerName: "项目负责人", parentId: "父级 ID", typeId: "工单类型 ID",
  statusId: "状态 ID", ptraceStatusId: "ptrace 状态 ID", ptraceStatusName: "ptrace 状态", ptraceStatusColor: "状态颜色",
  assignedToId: "处理人 ID", assignedToName: "处理人", creatorId: "建立人 ID", creatorName: "建立人",
  ptraceAssignedToId: "ptrace 处理人 ID", ptraceCreatorId: "ptrace 建立人 ID", authorId: "作者 ID", authorName: "作者",
  createBy: "创建者", createTime: "创建时间", updateBy: "更新者", updateTime: "更新时间", isDeleted: "删除标记",
  sprintId: "迭代 ID", sprintParentId: "父迭代 ID", priority: "优先级", plannedStartTime: "计划开始", plannedEndTime: "计划结束",
  estimatedHours: "预计工时", actualHours: "实际工时", startedAt: "实际开始", completedAt: "完成时间", labels: "标签",
  yunxiaoWorkitemId: "云效工单 ID", yunxiaoSerialNumber: "云效工单编号", yunxiaoSpaceId: "云效空间 ID",
  yunxiaoGmtCreate: "云效创建时间", yunxiaoGmtModified: "云效更新时间", workitemTypeId: "云效类型 ID",
  yunxiaoCommentId: "云效评论 ID", yunxiaoParentId: "云效父评论 ID", yunxiaoFileId: "云效附件 ID", yunxiaoStatusId: "云效状态 ID",
  origin: "来源标记", localOnly: "仅存于 ptrace", payloadJson: "来源数据", fieldMeta: "字段来源",
  syncState: "同步状态标记", syncAttempts: "同步尝试次数", lastSyncError: "最近同步错误", nextSyncRetryAt: "下次同步时间",
  dispatchStartedAt: "同步开始时间", lastSyncedAt: "最近同步时间", attachments: "附件完整信息",
  filename: "文件名", url: "地址", fileSize: "文件大小（字节）", mimeType: "文件类型",
};

function fieldValue(value: unknown): string {
  if (value == null || value === "") return "未设置";
  if (typeof value === "boolean") return value ? "是" : "否";
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

function ExtraFields({ fields, omit = [], title = "来源与扩展字段" }: { fields?: Record<string, unknown>; omit?: string[]; title?: string }) {
  const entries = Object.entries(fields || {}).filter(([key]) => !omit.includes(key) && key !== "rawFields");
  if (!entries.length) return null;
  return <details className="detail-extra-fields"><summary>{title}<span>{entries.length}</span></summary><dl>
    {entries.map(([key, value]) => <div key={key}><dt title={key}>{fieldLabels[key] || key}</dt><dd>{typeof value === "object" && value != null ? <pre>{fieldValue(value)}</pre> : fieldValue(value)}</dd></div>)}
  </dl></details>;
}

function ImageGallery({ images, onPreview }: { images: WorkItemImageInfo[]; onPreview: (image: WorkItemImageInfo, trigger: HTMLButtonElement) => void }) {
  if (!images.length) return null;
  return <div className="attachment-gallery">{images.map((image) => <figure className="attachment-card" key={image.url}>
    <AttachmentImage image={image} onOpen={(trigger) => onPreview(image, trigger)} />
    <figcaption title={image.name}>{image.name}</figcaption>
  </figure>)}</div>;
}

function commentCount(comments: PtraceWorkitemComment[]): number {
  return comments.reduce((total, comment) => total + (comment.isDeleted ? 0 : 1) + commentCount(comment.children), 0);
}

function CommentTree({ comments, onPreview }: { comments: PtraceWorkitemComment[]; onPreview: (image: WorkItemImageInfo, trigger: HTMLButtonElement) => void }) {
  const sorted = [...comments].sort((a, b) => (Date.parse(a.createTime || "") || 0) - (Date.parse(b.createTime || "") || 0));
  return <ol className="workitem-comments">{sorted.map((comment) => <li key={comment.id}>
    <article className="workitem-comment" aria-label={`评论 ${comment.id}`}>
      <header><strong>{comment.authorName || (comment.authorId ? `用户 ${comment.authorId}` : "未知用户")}</strong><time>{dateTime(comment.createTime)}</time>
        {comment.updateTime && comment.updateTime !== comment.createTime && <span title={dateTime(comment.updateTime)}>已编辑</span>}
      </header>
      {comment.isDeleted ? <p className="detail-muted">该评论已删除</p> : <>
        <WorkItemRichText value={comment.content} emptyText="空评论" />
        <ImageGallery images={richTextImages(comment.content)} onPreview={onPreview} />
      </>}
      <ExtraFields fields={comment.rawFields} omit={["content", "children", "authorName", "createTime", "updateTime"]} title="评论来源信息" />
    </article>
    {comment.children.length > 0 && <div className="workitem-replies"><CommentTree comments={comment.children} onPreview={onPreview} /></div>}
  </li>)}</ol>;
}

const eventNames: Record<string, string> = {
  status_changed: "状态变更", assignee_changed: "处理人变更", type_changed: "类型变更", workitem_no_assigned: "分配工单编号",
};

function ActivityTimeline({ feed, item, onPreview }: { feed: PtraceWorkitemActivityFeed; item: PtraceWorkitem; onPreview: (image: WorkItemImageInfo, trigger: HTMLButtonElement) => void }) {
  const statuses = new Map(feed.statuses.map((status) => [status.id, status.name]));
  const people = new Map(feed.items.filter((activity) => activity.actorUserId && activity.actorName).map((activity) => [activity.actorUserId!, activity.actorName!]));
  if (item.ptraceAssignedToId && item.ptraceAssignedToName) people.set(item.ptraceAssignedToId, item.ptraceAssignedToName);
  function changeValue(value: unknown): string {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fieldValue(value);
    return Object.entries(value).map(([key, entry]) => {
      const name = key === "statusId" ? statuses.get(String(entry)) : key === "assignedToId" ? people.get(String(entry)) : undefined;
      return `${fieldLabels[key] || key}：${name ? `${name}（ID ${entry}）` : fieldValue(entry)}`;
    }).join("\n");
  }
  const activities = [...feed.items].sort((a, b) => (Date.parse(b.actedAt || "") || 0) - (Date.parse(a.actedAt || "") || 0));
  return <ol className="workitem-activities">{activities.map((activity: PtraceWorkitemActivity) => <li key={activity.id}>
    <header><strong>{eventNames[activity.eventType] || activity.eventType}</strong><time>{dateTime(activity.actedAt)}</time></header>
    <p className="detail-muted">{activity.actorName || (activity.actorUserId ? `用户 ${activity.actorUserId}` : "未知操作者")}</p>
    {(activity.fromValue !== undefined || activity.toValue !== undefined) && <div className="activity-change"><div><span>变更前</span><pre>{changeValue(activity.fromValue)}</pre></div><div><span>变更后</span><pre>{changeValue(activity.toValue)}</pre></div></div>}
    {activity.reason && <><WorkItemRichText value={activity.reason} /><ImageGallery images={richTextImages(activity.reason)} onPreview={onPreview} /></>}
    <ExtraFields fields={activity.rawFields} omit={["eventType", "actorName", "actedAt", "fromValue", "toValue", "reason"]} title="记录来源信息" />
  </li>)}</ol>;
}

function asDashboardItem(value: PtraceWorkitem, fallback: DashboardItem): DashboardItem {
  return {
    ...value, productName: (value as PtraceWorkitemDetail).productName || fallback.productName,
    displayNo: value.workitemNo || value.id,
    assigneeId: value.ptraceAssignedToId || value.assignedToId || null,
    assigneeName: value.ptraceAssignedToName || value.assignedToName || "未分配",
    typeLabel: (value.workitemTypeName || value.workitemCategory || "工单").replace(/^task$/i, "任务"),
    statusLabel: value.ptraceStatusName || value.statusName || "未设置",
    statusKind: statusKindOf(value), isOverdue: false, dueLabel: "",
  };
}

export function WorkItemDetailModal({ item, onClose }: WorkItemDetailModalProps) {
  return <WorkItemDetailSession key={item.id} item={item} onClose={onClose} />;
}

function WorkItemDetailSession({ item, onClose }: WorkItemDetailModalProps) {
  const [history, setHistory] = useState<DashboardItem[]>([item]);
  const current = history.length === 1 ? item : history[history.length - 1];
  return <WorkItemDetailContent key={current.id} item={current} onClose={onClose}
    onBack={history.length > 1 ? () => setHistory((items) => items.slice(0, -1)) : undefined}
    onNavigate={(related) => setHistory((items) => [...items, asDashboardItem(related, current)])} />;
}

const detailOmittedFields = ["subject", "description", "productName", "productOwnerName", "ptraceCreatorDeptName", "ptraceAssignedToDeptName", "sprintName", "sprintParentName", "priority", "plannedStartTime", "plannedEndTime", "estimatedHours", "actualHours", "startedAt", "completedAt", "cycleBusinessSeconds", "labels", "createTime", "updateTime"];

function WorkItemDetailContent({ item, onClose, onNavigate, onBack }: WorkItemDetailModalProps & { onNavigate: (item: PtraceWorkitem) => void; onBack?: () => void }) {
  const [tab, setTab] = useState<DetailTab>("details");
  const [preview, setPreview] = useState<WorkItemImageInfo | null>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const native = "__TAURI_INTERNALS__" in window && /^\d+$/.test(item.id);
  const detail = useDetailResource(native, useCallback(async () => {
    const { loadPtraceWorkitem } = await import("../mcp/ptraceApi");
    return loadPtraceWorkitem(item.id);
  }, [item.id]));
  const content = detail.data || item;
  const current = detail.data ? asDashboardItem(detail.data, item) : item;
  const comments = useDetailResource(native && tab === "comments", useCallback(async () => {
    const { loadPtraceWorkitemComments } = await import("../mcp/ptraceApi");
    return loadPtraceWorkitemComments(item.id);
  }, [item.id]));
  const activities = useDetailResource(native && tab === "activities", useCallback(async () => {
    const { loadPtraceWorkitemActivities } = await import("../mcp/ptraceApi");
    return loadPtraceWorkitemActivities(item.id, content.typeId);
  }, [item.id, content.typeId]));
  const parentId = detail.data?.parentId;
  const relations = useDetailResource(native && detail.status === "ready", useCallback(async () => {
    const { loadPtraceWorkitemRelations } = await import("../mcp/ptraceApi");
    return loadPtraceWorkitemRelations(item.id, content.productId, parentId);
  }, [item.id, content.productId, parentId]));
  const images = useMemo(() => workitemImages(content), [content]);
  const attachments = content.attachments?.filter((attachment) => !attachment.isDeleted) || [];
  function showPreview(image: WorkItemImageInfo, trigger: HTMLButtonElement) {
    previewTrigger.current = trigger;
    setPreview(image);
  }

  useEffect(() => { if (!preview) previewTrigger.current?.focus(); }, [preview]);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (preview) setPreview(null);
      else onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, preview]);

  return <>
    <div className="modal-backdrop workitem-detail-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="workitem-detail-modal" role="dialog" aria-modal="true" aria-labelledby="workitem-detail-title" inert={Boolean(preview)} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="关闭详情" onClick={onClose}><X size={18} /></button>
        {onBack && <button type="button" className="detail-back-button" onClick={onBack}>返回上一张工单</button>}
        <div className="workitem-detail-heading">
          <div className="modal-icon"><Info size={27} weight="duotone" /></div>
          <div>
            <div className="workitem-detail-eyebrow">
              <span className="workitem-detail-number"><span>{current.displayNo}</span><em className="work-internal-id">ID {content.id}</em></span>
              {detail.status === "loading" && <span className="detail-header-loading" role="status" aria-live="polite">
                <span className="detail-loading-spinner" aria-hidden="true" />
                正在加载工单详情…
              </span>}
              <em className={`detail-status status-${current.statusKind}`}>{current.statusLabel}</em>
            </div>
            <h2 id="workitem-detail-title">{content.subject}</h2>
          </div>
        </div>
        <div className="workitem-detail-tabs" role="tablist" aria-label="工单详情内容">
          {([['details', '详情'], ['comments', '评论'], ['activities', '操作记录']] as const).map(([id, label]) => <button type="button" role="tab" id={`detail-tab-${id}`} aria-controls={`detail-panel-${id}`} aria-selected={tab === id} key={id} onClick={() => setTab(id)}>{label}{id === "comments" && comments.data && <span>{commentCount(comments.data)}</span>}{id === "activities" && activities.data && <span>{activities.data.items.length}</span>}</button>)}
        </div>
        <div className="workitem-detail-body" role="tabpanel" id={`detail-panel-${tab}`} aria-labelledby={`detail-tab-${tab}`} key={tab}>
          {tab === "details" && <>
            {detail.status === "error" && <LoadNotice resource={detail} label="工单详情" />}
            <section className="detail-section detail-basic-section" aria-labelledby="detail-basic-title"><h3 id="detail-basic-title"><UserCircle size={17} />基础信息</h3><dl className="detail-grid">
              <div className="detail-grid-wide"><dt>所属项目</dt><dd>{current.productName}</dd></div>
              <div><dt>项目负责人</dt><dd>{detail.data?.productOwnerName || "未设置"}</dd></div>
              <div><dt>工单类型</dt><dd>{current.typeLabel}</dd></div><div><dt>优先级</dt><dd>{priority(content.priority)}</dd></div>
              <div><dt>处理人</dt><dd>{current.assigneeName}</dd></div>
              <div><dt>建立人</dt><dd>{content.ptraceCreatorName || content.creatorName || "未设置"}</dd></div><div><dt>建立人部门</dt><dd>{detail.data?.ptraceCreatorDeptName || "未设置"}</dd></div>
              <div><dt>迭代归属</dt><dd className="detail-iteration-stack"><span><small>父迭代</small><strong>{content.sprintParentName || "未设置"}</strong></span><span><small>子迭代</small><strong>{content.sprintName || "未设置"}</strong></span></dd></div>
            </dl><div className="detail-labels"><span>标签</span><div>{content.labels?.length ? content.labels.map((label) => <em key={label}>{label}</em>) : <span className="detail-muted">未设置</span>}</div></div></section>
            <section className="detail-section" aria-labelledby="detail-schedule-title"><h3 id="detail-schedule-title"><CalendarBlank size={17} />排期与工时</h3><dl className="detail-grid detail-time-grid">
              <div><dt>计划开始</dt><dd>{dateTime(content.plannedStartTime)}</dd></div><div><dt>计划结束</dt><dd>{dateTime(content.plannedEndTime)}</dd></div><div><dt>预计工时</dt><dd>{hours(content.estimatedHours)}</dd></div>
              <div><dt>实际开始</dt><dd>{dateTime(content.startedAt)}</dd></div><div><dt>实际结束</dt><dd>{dateTime(content.completedAt)}</dd></div><div><dt>实际工时</dt><dd>{hours(content.actualHours)}</dd></div>
              <div><dt>业务工作时段耗时</dt><dd>{detail.data?.cycleBusinessSeconds != null ? `${detail.data.cycleBusinessSeconds} 秒` : "未设置"}</dd></div>
            </dl></section>
            <section className="detail-section" aria-labelledby="detail-description-title"><h3 id="detail-description-title"><Info size={17} />工单描述</h3><div className="detail-description"><WorkItemRichText value={content.description} emptyText="暂无描述" /></div></section>
            <section className="detail-section" aria-labelledby="detail-attachments-title"><h3 id="detail-attachments-title"><ImageSquare size={17} />附件图片{images.length > 0 && <span className="attachment-count">{images.length}</span>}</h3>
              <ImageGallery images={images} onPreview={showPreview} />
              {!images.length && <p className="detail-muted">{detail.status === "ready" ? "暂无图片附件" : "当前已加载内容中没有图片"}</p>}
              {attachments.length > 0 && <div className="detail-file-list" aria-label="全部附件">{attachments.map((attachment) => <div key={attachment.id}><div><WorkItemLink url={attachment.url}>{attachment.filename}</WorkItemLink><small>{attachment.mimeType || "文件"}{attachment.fileSize != null ? ` · ${attachment.fileSize.toLocaleString()} 字节` : ""}</small></div><span>打开附件</span></div>)}</div>}
            </section>
            <section className="detail-section" aria-labelledby="detail-relations-title"><h3 id="detail-relations-title">父子工单</h3><LoadNotice resource={relations} label="关联工单" unavailable={!native} />
              {relations.data && <>
                <h4>父工单</h4>{relations.data.parentError ? <div className="detail-load-notice">父工单加载失败<button type="button" onClick={relations.retry}>重试加载父工单</button></div> : relations.data.parent ? <button type="button" className="detail-related-item" onClick={() => onNavigate(relations.data!.parent!)}>{relations.data.parent.workitemNo || relations.data.parent.id}<strong>{relations.data.parent.subject}</strong></button> : <p className="detail-muted">未关联父工单</p>}
                <h4>子工单{!relations.data.childrenError && ` · ${relations.data.children.length}`}</h4>{relations.data.childrenError ? <div className="detail-load-notice">子工单加载失败<button type="button" onClick={relations.retry}>重试加载子工单</button></div> : relations.data.children.length ? relations.data.children.map((child) => <button type="button" className="detail-related-item" key={child.id} onClick={() => onNavigate(child)}><span>{child.workitemNo || child.id}<small>ID {child.id}</small></span><strong>{child.subject}</strong><span>{child.ptraceStatusName || child.statusName || "未设置"}</span></button>) : <p className="detail-muted">暂无子工单</p>}
              </>}
            </section>
            <ExtraFields fields={detail.data?.rawFields} omit={detailOmittedFields} />
          </>}
          {tab === "comments" && <><LoadNotice resource={comments} label="评论" unavailable={!native} />{comments.data && (comments.data.length ? <CommentTree comments={comments.data} onPreview={showPreview} /> : <p className="detail-empty">暂无评论</p>)}</>}
          {tab === "activities" && <><LoadNotice resource={activities} label="操作记录" unavailable={!native} />{activities.data && (activities.data.items.length ? <ActivityTimeline feed={activities.data} item={content} onPreview={showPreview} /> : <p className="detail-empty">暂无操作记录</p>)}</>}
        </div>
        <footer className="workitem-detail-footer">
          <div className="detail-timestamps">
            <span><ClockCounterClockwise size={15} />创建于 {dateTime(content.createTime)}</span>
            <span>更新于 {dateTime(content.updateTime)}</span>
          </div>
        </footer>
      </section>
    </div>
    {preview && <AttachmentPreview image={preview} onClose={() => setPreview(null)} />}
  </>;
}
