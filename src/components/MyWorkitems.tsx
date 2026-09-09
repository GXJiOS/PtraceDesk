import { CheckCircle, ClipboardText, FunnelSimple, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardItem, StatusKind } from "../features/dashboard/types";
import { compareItemsBySchedule } from "../features/dashboard/dashboardMapper";
import { WorkItemRow } from "./WorkItemRow";

type StatusFilter = "all" | StatusKind;

const NO_PARENT_SPRINT = "none";
const statusTabs: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "todo", label: "待处理" },
  { id: "active", label: "进行中" },
  { id: "done", label: "已完成" },
  { id: "cancelled", label: "已取消" },
];

interface MyWorkitemsProps {
  items: DashboardItem[];
  heading?: string;
  description?: string;
  sortBy?: "schedule" | "created-desc";
  focusedItemId?: string;
  onFocus: (item: DashboardItem) => void;
  onDetails: (item: DashboardItem) => void;
}

function parentSprintKey(item: DashboardItem) {
  if (item.sprintParentId) return JSON.stringify([item.productId, "id", item.sprintParentId]);
  if (item.sprintParentName) return JSON.stringify([item.productId, "name", item.sprintParentName]);
  return NO_PARENT_SPRINT;
}

function compareItemsByCreationTimeDesc(a: DashboardItem, b: DashboardItem) {
  const aCreatedAt = a.createTime ? Date.parse(a.createTime) : Number.NaN;
  const bCreatedAt = b.createTime ? Date.parse(b.createTime) : Number.NaN;
  const aHasCreationTime = Number.isFinite(aCreatedAt);
  const bHasCreationTime = Number.isFinite(bCreatedAt);

  if (aHasCreationTime !== bHasCreationTime) return aHasCreationTime ? -1 : 1;
  if (!aHasCreationTime) return 0;
  return bCreatedAt - aCreatedAt;
}

export function MyWorkitems({
  items,
  heading = "我的工单",
  description = "查看当前项目范围内分配给你的全部工单。",
  sortBy = "schedule",
  focusedItemId,
  onFocus,
  onDetails,
}: MyWorkitemsProps) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState("all");
  const [parentSprint, setParentSprint] = useState("all");
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const typeOptions = useMemo(
    () => [...new Set(items.map((item) => item.typeLabel))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const parentSprintOptions = useMemo(() => {
    const options = new Map<string, { value: string; name: string; productName: string; id?: string | null }>();
    for (const item of items) {
      const value = parentSprintKey(item);
      if (value === NO_PARENT_SPRINT) continue;
      if (!options.has(value) || item.sprintParentName) {
        options.set(value, {
          value,
          name: item.sprintParentName || `迭代 ${item.sprintParentId}`,
          productName: item.productName,
          id: item.sprintParentId,
        });
      }
    }
    const values = [...options.values()];
    return values.map((option) => {
      const sameName = values.filter((candidate) => candidate.name === option.name);
      const sameProjectName = sameName.filter((candidate) => candidate.productName === option.productName);
      const label = sameName.length > 1 ? `${option.productName} · ${option.name}` : option.name;
      return {
        value: option.value,
        label: sameProjectName.length > 1 && option.id ? `${label} (ID ${option.id})` : label,
      };
    }).sort((a, b) => a.label.localeCompare(b.label, "zh-CN", { numeric: true }));
  }, [items]);

  useEffect(() => {
    if (type !== "all" && !typeOptions.includes(type)) setType("all");
    if (parentSprint !== "all" && parentSprint !== NO_PARENT_SPRINT
      && !parentSprintOptions.some((option) => option.value === parentSprint)) setParentSprint("all");
  }, [items, type, typeOptions, parentSprint, parentSprintOptions]);

  const matchingItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return items
      .filter((item) => type === "all" || item.typeLabel === type)
      .filter((item) => parentSprint === "all" || parentSprintKey(item) === parentSprint)
      .filter((item) => !normalizedSearch
        || item.displayNo.toLocaleLowerCase().includes(normalizedSearch)
        || item.id.toLocaleLowerCase().includes(normalizedSearch)
        || item.subject.toLocaleLowerCase().includes(normalizedSearch));
  }, [items, search, type, parentSprint]);

  const counts = useMemo(() => ({
    all: matchingItems.length,
    todo: matchingItems.filter((item) => item.statusKind === "todo").length,
    active: matchingItems.filter((item) => item.statusKind === "active").length,
    done: matchingItems.filter((item) => item.statusKind === "done").length,
    cancelled: matchingItems.filter((item) => item.statusKind === "cancelled").length,
  }), [matchingItems]);

  const filteredItems = useMemo(() => matchingItems
    .filter((item) => status === "all" || item.statusKind === status)
    .sort(sortBy === "created-desc" ? compareItemsByCreationTimeDesc : compareItemsBySchedule),
  [matchingItems, sortBy, status]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [items, status, type, parentSprint, search, sortBy]);

  function chooseStatus(nextStatus: StatusFilter) {
    setStatus(nextStatus);
  }

  function chooseType(nextType: string) {
    setType(nextType);
  }

  function searchWorkitems(query: string) {
    setSearch(query);
  }

  function chooseParentSprint(nextParentSprint: string) {
    setParentSprint(nextParentSprint);
  }

  return (
    <section className="my-workitems-page" aria-labelledby="workitems-page-title">
      <div className="workitems-page-heading">
        <div>
          <h2 id="workitems-page-title">{heading}</h2>
          <p>{description}</p>
        </div>
        <div className="workitems-total"><ClipboardText size={19} weight="duotone" /><strong>{items.length}</strong><span>个工单</span></div>
      </div>

      <div className="workitems-panel">
        <div className="status-tabs" role="tablist" aria-label="工单状态">
          {statusTabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={status === tab.id}
              className={status === tab.id ? "status-tab active" : "status-tab"}
              onClick={() => chooseStatus(tab.id)}
              key={tab.id}
            >
              {tab.label}<span>{counts[tab.id]}</span>
            </button>
          ))}
        </div>

        <div className="workitems-toolbar" style={{ flexWrap: "wrap" }}>
          <div className="workitems-result"><strong>{filteredItems.length}</strong> 个符合条件的工单</div>
          <div className="workitems-toolbar-filters" style={{ flexWrap: "wrap" }}>
            <label className="workitems-search">
              <MagnifyingGlass size={16} />
              <span className="sr-only">搜索工单</span>
              <input
                type="search"
                aria-label="搜索工单"
                placeholder="输入完整 ID 或标题关键词"
                value={search}
                onChange={(event) => searchWorkitems(event.target.value)}
              />
              {search && (
                <button type="button" aria-label="清空搜索" onClick={() => searchWorkitems("")}>
                  <X size={14} />
                </button>
              )}
            </label>
            <label className="type-filter">
              <FunnelSimple size={16} />
              <span>类型</span>
              <select aria-label="工单类型" value={type} onChange={(event) => chooseType(event.target.value)}>
                <option value="all">全部类型</option>
                {typeOptions.map((option) => <option value={option} key={option}>{option}</option>)}
              </select>
            </label>
            <label className="type-filter" style={{ width: 230 }}>
              <FunnelSimple size={16} />
              <span style={{ whiteSpace: "nowrap" }}>父迭代</span>
              <select
                aria-label="父迭代"
                value={parentSprint}
                title={parentSprintOptions.find((option) => option.value === parentSprint)?.label}
                onChange={(event) => chooseParentSprint(event.target.value)}
              >
                <option value="all">全部父迭代</option>
                <option value={NO_PARENT_SPRINT}>未设置父迭代</option>
                {parentSprintOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="workitems-list" role="tabpanel" ref={listRef}>
          {filteredItems.length ? filteredItems.map((item) => (
            <WorkItemRow item={item} selected={item.id === focusedItemId} onFocus={() => onFocus(item)} onDetails={() => onDetails(item)} key={item.id} />
          )) : (
            <div className="workitems-empty">
              <CheckCircle size={30} weight="duotone" />
              <strong>{search.trim() ? "未找到匹配的工单" : `当前没有${statusTabs.find((tab) => tab.id === status)?.label}工单`}</strong>
              <span>{search.trim() ? "可输入 PT 单号、内部 ID 或标题关键词。" : "可以切换状态、工单类型或父迭代查看其他内容。"}</span>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
