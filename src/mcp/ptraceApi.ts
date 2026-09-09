import { z } from "zod";
import type { Client } from "@modelcontextprotocol/client";
import type {
  PtracePayload,
  PtraceProduct,
  PtraceSprint,
  PtraceWorkitem,
  PtraceWorkitemStatus,
  PtraceWorkitemDetail,
  PtraceWorkitemComment,
  PtraceWorkitemActivity,
  PtraceWorkitemActivityFeed,
  PtraceWorkitemRelations,
} from "../features/dashboard/types";
import { connectPtraceMcp } from "./client";
import { hasStoredPtraceSession } from "./oauthProvider";

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  lifecycleStage: z.string().nullable().optional(),
  tracked: z.number().optional(),
  workitemStats: z.object({
    open: z.number(),
    done: z.number(),
    cancelled: z.number(),
    total: z.number(),
  }).optional(),
}).passthrough();

const nullableDecimalSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized ? Number(normalized) : null;
}, z.number().finite().nonnegative().nullable().optional());

const attachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  url: z.string(),
  mimeType: z.string().nullable().optional(),
  fileSize: nullableDecimalSchema,
  isDeleted: z.number().optional(),
});

const workitemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  typeId: z.string().nullable().optional(),
  subject: z.string(),
  workitemNo: z.string().nullable().optional(),
  workitemTypeName: z.string().nullable().optional(),
  workitemCategory: z.string().nullable().optional(),
  statusId: z.string().nullable().optional(),
  statusName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  attachments: z.array(attachmentSchema).nullable().optional(),
  ptraceStatusName: z.string().nullable().optional(),
  ptraceStatusId: z.string().nullable().optional(),
  ptraceAssignedToId: z.string().nullable().optional(),
  ptraceAssignedToName: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  assignedToName: z.string().nullable().optional(),
  creatorId: z.string().nullable().optional(),
  creatorName: z.string().nullable().optional(),
  ptraceCreatorId: z.string().nullable().optional(),
  ptraceCreatorName: z.string().nullable().optional(),
  priority: z.number().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  sprintName: z.string().nullable().optional(),
  sprintParentId: z.string().nullable().optional(),
  sprintParentName: z.string().nullable().optional(),
  updateTime: z.string().nullable().optional(),
  createTime: z.string().nullable().optional(),
  plannedStartTime: z.string().nullable().optional(),
  plannedEndTime: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  estimatedHours: nullableDecimalSchema,
  actualHours: nullableDecimalSchema,
  labels: z.array(z.string()).nullable().optional(),
});

const workitemStatusSchema = z.object({
  id: z.string(),
  typeId: z.string(),
  code: z.string(),
  name: z.string(),
  color: z.string().nullable().optional(),
}).passthrough();

const sprintSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  parentName: z.string().nullable().optional(),
}).passthrough();

export function parsePtraceWorkitem(value: unknown): PtraceWorkitem {
  return workitemSchema.parse(value) as PtraceWorkitem;
}

const detailSchema = workitemSchema.extend({
  productName: z.string().nullable().optional(),
  productOwnerName: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  ptraceCreatorDeptName: z.string().nullable().optional(),
  ptraceAssignedToDeptName: z.string().nullable().optional(),
  cycleBusinessSeconds: nullableDecimalSchema,
});

export function parsePtraceWorkitemDetail(value: unknown): PtraceWorkitemDetail {
  return { ...detailSchema.parse(value), rawFields: z.record(z.string(), z.unknown()).parse(value) };
}

const commentSchema: z.ZodType<PtraceWorkitemComment> = z.lazy(() => z.object({
  id: z.string(),
  workitemId: z.string(),
  authorId: z.string().nullable().optional(),
  authorName: z.string().nullable().optional(),
  content: z.string(),
  createTime: z.string().nullable().optional(),
  updateTime: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  isDeleted: z.number().optional(),
  children: z.array(commentSchema).nullish().transform((value) => value || []),
}).passthrough().transform((value) => ({ ...value, rawFields: value })));

export function parsePtraceWorkitemComments(value: unknown): PtraceWorkitemComment[] {
  return z.array(commentSchema).parse(value);
}

const activitySchema = z.object({
  id: z.string(),
  eventType: z.string(),
  fromValue: z.unknown().optional(),
  toValue: z.unknown().optional(),
  actorUserId: z.string().nullable().optional(),
  actorName: z.string().nullable().optional(),
  actedAt: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
}).passthrough().transform((value) => ({ ...value, rawFields: value }));

export function parsePtraceWorkitemActivities(value: unknown): PtraceWorkitemActivity[] {
  return z.array(activitySchema).parse(value);
}

const listResponseSchema = z.object({
  list: z.array(z.unknown()),
  total: z.number(),
});

async function callJson(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`ptrace MCP 调用失败：${name}`);
  const text = result.content.find((content) => content.type === "text");
  if (!text || text.type !== "text") throw new Error(`ptrace MCP 未返回可解析的数据：${name}`);
  return JSON.parse(text.text) as unknown;
}

async function allPages<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  parseItem: (value: unknown) => T,
) {
  const output: T[] = [];
  let pageNum = 1;
  while (true) {
    const raw = await callJson(client, name, { ...args, pageNum, pageSize: 100 });
    const page = listResponseSchema.parse(raw);
    output.push(...page.list.map(parseItem));
    if (output.length >= page.total || page.list.length === 0) break;
    pageNum += 1;
  }
  return output;
}

async function withDetailClient<T>(read: (client: Client) => Promise<T>): Promise<T> {
  if (!await hasStoredPtraceSession()) throw new Error("请先连接 ptrace 后重试。");
  const session = await connectPtraceMcp();
  try {
    return await read(session.client);
  } finally {
    await session.client.close().catch(() => undefined);
  }
}

async function readWorkitem(client: Client, id: string): Promise<PtraceWorkitemDetail> {
  const item = parsePtraceWorkitemDetail(await callJson(client, "ptrace_workitem_get", { id }));
  if (item.id !== id) throw new Error("ptrace 返回的工单与当前工单不一致。");
  return item;
}

export function loadPtraceWorkitem(id: string): Promise<PtraceWorkitemDetail> {
  return withDetailClient((client) => readWorkitem(client, id));
}

export function loadPtraceWorkitemComments(id: string): Promise<PtraceWorkitemComment[]> {
  return withDetailClient(async (client) => {
    const comments = parsePtraceWorkitemComments(await callJson(client, "ptrace_workitem_comments", { id }));
    const verifyWorkitem = (items: PtraceWorkitemComment[]) => {
      for (const comment of items) {
        if (comment.workitemId !== id) throw new Error("ptrace 返回的评论与当前工单不一致。");
        verifyWorkitem(comment.children);
      }
    };
    verifyWorkitem(comments);
    return comments;
  });
}

export function loadPtraceWorkitemActivities(id: string, typeId?: string | null): Promise<PtraceWorkitemActivityFeed> {
  return withDetailClient(async (client) => {
    const [items, statuses] = await Promise.all([
      callJson(client, "ptrace_workitem_activities", { id }).then(parsePtraceWorkitemActivities),
      typeId ? callJson(client, "ptrace_workitem_statuses", { typeId })
        .then((value) => z.array(workitemStatusSchema).parse(value)).catch(() => []) : Promise.resolve([]),
    ]);
    return { items, statuses };
  });
}

export function loadPtraceWorkitemRelations(id: string, productId: string, parentId?: string | null): Promise<PtraceWorkitemRelations> {
  return withDetailClient(async (client) => {
    const [parent, children] = await Promise.allSettled([
      parentId ? readWorkitem(client, parentId) : Promise.resolve(null),
      allPages(client, "ptrace_workitem_list", { productId, parentId: id, view: "summary" }, parsePtraceWorkitem),
    ]);
    return {
      parent: parent.status === "fulfilled" ? parent.value : null,
      children: children.status === "fulfilled" ? children.value : [],
      parentError: parent.status === "rejected",
      childrenError: children.status === "rejected",
    };
  });
}

export async function loadPtracePayload(onAuthorizationStarted?: () => void): Promise<PtracePayload> {
  const session = await connectPtraceMcp(onAuthorizationStarted);
  try {
    const products = await allPages<PtraceProduct>(
      session.client,
      "ptrace_product_list",
      { perspective: "mine", tracked: 1, withWorkitemStats: true },
      (value) => productSchema.parse(value) as PtraceProduct,
    );
    const [workitemsByProject, sprintsByProject] = await Promise.all([
      Promise.all(
        products.map((product) =>
          allPages<PtraceWorkitem>(
            session.client,
            "ptrace_workitem_list",
            { productId: product.id, view: "full" },
            parsePtraceWorkitem,
          ),
        ),
      ),
      Promise.all(
        products.map(async (product) => {
          try {
            const raw = await callJson(session.client, "ptrace_sprint_list", { productId: product.id });
            return z.array(sprintSchema).parse(raw).map<PtraceSprint>((sprint) => ({
              ...sprint,
              productId: product.id,
            }));
          } catch {
            return [];
          }
        }),
      ),
    ]);
    const workitems = workitemsByProject.flat();
    const sprints = sprintsByProject.flat();
    const typeIds = [...new Set(workitems.map((item) => item.typeId).filter((typeId): typeId is string => Boolean(typeId)))];
    const workitemStatuses = (await Promise.all(
      typeIds.map(async (typeId) => {
        const raw = await callJson(session.client, "ptrace_workitem_statuses", { typeId });
        return z.array(workitemStatusSchema).parse(raw) as PtraceWorkitemStatus[];
      }),
    )).flat();
    return {
      products,
      workitems,
      sprints,
      workitemStatuses,
      syncedAt: new Date().toISOString(),
    };
  } finally {
    await session.client.close().catch(() => undefined);
  }
}
