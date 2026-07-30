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

// browse() hands back percent-encoded paths, so anything shown to a human or sent to an endpoint
// that does not decode on its own (the upload route) has to go through this first
export function decodePath(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function baseName(path) {
  return decodePath(path.split("/").pop());
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

// адресная строка принимает и виндовые слэши, и лишние слэши по краям - приводим к target-виду
export function normalizePathInput(raw) {
  return (raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .join("/");
}

export function splitParent(target) {
  const parts = (target ?? "").split("/").filter(Boolean);
  const base = parts.pop() ?? "";
  return { parent: parts.join("/"), base };
}

// индекс палитры быстрого перехода: недавние + избранное + закешированное дерево + папки из метаданных;
// порядок добавления задаёт приоритет при пустом запросе, дубли схлопываются по source:path
export function buildQuickJumpIndex({
  treeFolders = [],
  entries = {},
  favorites = [],
  recents = [],
  source = "data",
}) {
  const map = new Map();
  const add = (src, path, name) => {
    if (typeof path !== "string" || !src) return;
    const key = keyFor(src, path);
    if (map.has(key)) return;
    map.set(key, { source: src, path, name: name || baseName(path) || path, isFolder: true });
  };
  for (const r of recents) add(r.source, r.path, r.name);
  for (const f of favorites) add(f.source, f.path, f.name);
  for (const t of treeFolders) add(source, t.path, t.name);
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry.isFolder) continue;
    const { source: s, path } = parseKey(key);
    add(s, path, entry.name);
  }
  return [...map.values()];
}

const WORD_BOUNDARY = /[\s/_\-.]/;

// классический субпоследовательный fuzzy (как Ctrl+P в редакторах): все буквы запроса должны
// встретиться по порядку; бонусы за подряд идущие буквы, старт слова и цельную подстроку,
// штраф за разрывы. null - не совпало. Ожидает уже пониженные строки - горячий путь палитры.
// ponytail: жадный поиск слева направо, не DP-оптимум - на именах файлов разница не ощущается
function fuzzyScoreLower(q, t) {
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let prevMatch = -2;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    score += 1;
    if (found === prevMatch + 1) score += 5;
    if (found === 0 || WORD_BOUNDARY.test(t[found - 1])) score += 3;
    score -= Math.min(found - ti, 3) * 0.3;
    prevMatch = found;
    ti = found + 1;
  }
  if (t.includes(q)) score += q.length;
  return score;
}

export function fuzzyScore(query, text) {
  return fuzzyScoreLower((query ?? "").toLowerCase(), (text ?? "").toLowerCase());
}

// имя весит вдвое больше пути, чтобы «hero» находил hero.webp, а не всё содержимое папки hero/.
// Пониженные имя и декодированный путь кешируются прямо на записи индекса: decode+toLowerCase
// на каждом нажатии по всему индексу стоили дороже самого поиска
export function filterQuickJump(index, query, limit = 8) {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return index.slice(0, limit);
  const NONE = -1e9;
  const scored = [];
  for (const e of index) {
    const nameLower = (e.nl ??= e.name.toLowerCase());
    const pathLower = (e.pl ??= decodePath(e.path).toLowerCase());
    const nameScore = fuzzyScoreLower(q, nameLower);
    const pathScore = fuzzyScoreLower(q, pathLower);
    const score = Math.max(nameScore ?? NONE, pathScore == null ? NONE : pathScore * 0.5);
    if (score !== NONE) scored.push({ e, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.e.name.length - b.e.name.length)
    .slice(0, limit)
    .map((x) => x.e);
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
