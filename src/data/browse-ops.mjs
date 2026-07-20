import {
  IMAGE_EXTENSIONS,
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  EXTRA_TYPE_EXTENSIONS,
} from "../constants.mjs";
import { keyFor, parseKey, mergeEntry } from "./metadata-ops.mjs";

export function classifyExtension(path) {
  const ext = path.split(".").pop().toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  for (const [type, exts] of Object.entries(EXTRA_TYPE_EXTENSIONS)) {
    if (exts.includes(ext)) return type;
  }
  return "other";
}

function baseName(path) {
  const last = path.split("/").pop();
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function buildFolderItems(result, entries, source) {
  const toItem = (path, isFolder) => {
    const name = baseName(path);
    const entry = mergeEntry(entries, source, path, name);
    return {
      id: keyFor(source, path),
      source,
      path,
      name,
      type: isFolder ? "folder" : classifyExtension(path),
      isFolder,
      tags: entry.tags,
      color: entry.color,
      favorite: entry.favorite,
    };
  };
  return [
    ...(result?.dirs ?? []).map((d) => toItem(d, true)),
    ...(result?.files ?? []).map((f) => toItem(f, false)),
  ];
}

export function filterByExtensions(items, extensions) {
  if (!extensions?.length) return items;
  const exts = extensions.map((e) => e.toLowerCase());
  return items.filter((i) => i.isFolder || exts.some((e) => i.path.toLowerCase().endsWith(e)));
}

export function filterBySearch(items, query) {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.name.toLowerCase().includes(q));
}

export function sortItems(items, locale = "en") {
  return [...items].sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.name.localeCompare(b.name, locale);
  });
}

export function computeTagCounts(entries, tags) {
  const counts = Object.fromEntries(tags.map((t) => [t.id, 0]));
  for (const entry of Object.values(entries)) {
    for (const tagId of entry.tags) {
      if (tagId in counts) counts[tagId] += 1;
    }
  }
  return counts;
}

export function buildFilteredItems(entries, activeTagIds = [], activeColorIds = []) {
  const items = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (!activeTagIds.every((id) => entry.tags.includes(id))) continue;
    if (activeColorIds.length && !activeColorIds.includes(entry.color)) continue;
    const { source, path } = parseKey(key);
    items.push({
      id: key,
      source,
      path,
      name: entry.name,
      type: entry.isFolder ? "folder" : classifyExtension(path),
      isFolder: !!entry.isFolder,
      tags: entry.tags,
      color: entry.color,
      favorite: entry.favorite,
    });
  }
  return items;
}

export function computeColorCounts(entries, colorIds) {
  const counts = Object.fromEntries(colorIds.map((id) => [id, 0]));
  for (const entry of Object.values(entries)) {
    if (entry.color && entry.color in counts) counts[entry.color] += 1;
  }
  return counts;
}

export function computeFavorites(entries) {
  return Object.entries(entries)
    .filter(([, entry]) => entry.favorite && entry.isFolder)
    .map(([key, entry]) => {
      const { source, path } = parseKey(key);
      return { id: key, source, path, name: entry.name };
    });
}

export function pushRecent(recents, { source, path }, max = 5) {
  const key = (r) => `${r.source}:${r.path}`;
  const entry = { source, path, name: baseName(path) };
  return [entry, ...recents.filter((r) => key(r) !== key(entry))].slice(0, max);
}

export function buildCrumbs(target, rootLabel) {
  const crumbs = [{ name: rootLabel, path: "" }];
  let acc = "";
  for (const part of (target ?? "").split("/").filter(Boolean)) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push({ name: baseName(part), path: acc });
  }
  return crumbs;
}

export function buildTreeNodes(cacheMap, expandedPaths) {
  const nodes = [];
  const walk = (parentPath, depth) => {
    for (const child of cacheMap.get(parentPath) ?? []) {
      const expanded = expandedPaths.has(child.path);
      nodes.push({
        path: child.path,
        name: child.name,
        depth,
        expanded,
        loaded: cacheMap.has(child.path),
      });
      if (expanded) walk(child.path, depth + 1);
    }
  };
  walk("", 0);
  return nodes;
}
