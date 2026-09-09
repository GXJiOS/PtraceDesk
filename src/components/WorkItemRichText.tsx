import DOMPurify from "dompurify";
import { marked } from "marked";
import { createElement, useMemo, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface WorkItemImageInfo {
  url: string;
  name: string;
}

export function ptraceImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== "https://ptrace-prod-uploads.ptrace.cfd" || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function linkUrl(value: string) {
  try {
    const url = new URL(value, "https://admin.ptrace.cfd/");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function WorkItemLink({ url, children, className }: { url: string; children: ReactNode; className?: string }) {
  const [failed, setFailed] = useState(false);
  const href = linkUrl(url);
  if (!href) return <span>{children}（链接不可用）</span>;
  return <>
    <a href={href} className={className} target="_blank" rel="noopener noreferrer" onClick={(event) => {
      if (!("__TAURI_INTERNALS__" in window)) return;
      event.preventDefault();
      setFailed(false);
      void openUrl(href).catch(() => setFailed(true));
    }}>{children}</a>
    {failed && <span role="alert" className="detail-link-error">打开失败，请重试。</span>}
  </>;
}

function richTextFragment(value: string) {
  const html = marked.parse(value, { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "div", "span", "br", "strong", "b", "em", "i", "u", "s", "del", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code", "hr", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "a", "img", "input", "sup", "sub"],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "colspan", "rowspan", "start", "type", "checked"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
}

export function richTextImages(value?: string | null): WorkItemImageInfo[] {
  if (!value?.trim()) return [];
  const images = new Map<string, WorkItemImageInfo>();
  for (const image of richTextFragment(value).querySelectorAll("img[src]")) {
    const url = ptraceImageUrl(image.getAttribute("src") || "");
    if (url && !images.has(url)) images.set(url, { url, name: image.getAttribute("alt")?.trim() || `描述图片 ${images.size + 1}` });
  }
  return [...images.values()];
}

function renderNode(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;
  const tag = node.tagName.toLowerCase();
  if (tag === "img") return null;
  if (tag === "input") return node.getAttribute("type") === "checkbox"
    ? <input key={key} type="checkbox" checked={node.hasAttribute("checked")} disabled aria-label={node.hasAttribute("checked") ? "已勾选" : "未勾选"} /> : null;
  const children = [...node.childNodes].map((child, index) => renderNode(child, `${key}-${index}`));
  if (tag === "a") {
    const href = node.getAttribute("href");
    return href ? <WorkItemLink key={key} url={href}>{children}</WorkItemLink> : <span key={key}>{children}</span>;
  }
  const props: Record<string, unknown> = { key };
  if (tag === "td" || tag === "th") {
    for (const [attribute, property] of [["colspan", "colSpan"], ["rowspan", "rowSpan"]]) {
      const count = Number(node.getAttribute(attribute));
      if (Number.isInteger(count) && count > 0 && count <= 100) props[property] = count;
    }
  }
  if (tag === "ol" && node.hasAttribute("start")) props.start = Number(node.getAttribute("start")) || 1;
  if (tag === "br" || tag === "hr") return createElement(tag, props);
  const element = createElement(tag, props, children);
  return tag === "table" ? <div className="rich-text-table" key={key}>{element}</div> : element;
}

export function WorkItemRichText({ value, emptyText = "暂无内容" }: { value?: string | null; emptyText?: string }) {
  const nodes = useMemo(() => value?.trim()
    ? [...richTextFragment(value).childNodes].map((node, index) => renderNode(node, `${index}`)) : null, [value]);
  return <div className="workitem-rich-text">{nodes || <p className="detail-muted">{emptyText}</p>}</div>;
}
