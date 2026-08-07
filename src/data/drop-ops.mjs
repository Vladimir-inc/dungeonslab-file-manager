import { MODULE_ID } from "../constants.mjs";
import { classifyExtension } from "./browse-ops.mjs";

export function parseFmDrag(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data?.fmModule !== MODULE_ID || typeof data.fmPath !== "string") return null;
  return { source: data.fmSource, path: data.fmPath };
}

export function displayName(path) {
  let base = path.split("/").pop();
  try {
    base = decodeURIComponent(base);
  } catch {}
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function soundDataForFile(path) {
  return { name: displayName(path), path, volume: 0.8 };
}

const escapeHtml = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function pageDataForFile(path) {
  const name = displayName(path);
  const type = classifyExtension(path);
  if (type === "image" || type === "pdf") return { name, type, src: path };
  if (type === "video" || type === "audio") return { name, type: "video", src: path };
  return {
    name,
    type: "text",
    text: { content: `<p><a href="${escapeHtml(path)}">${escapeHtml(name)}</a></p>`, format: 1 },
  };
}
