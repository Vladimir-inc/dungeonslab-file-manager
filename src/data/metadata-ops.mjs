export function keyFor(source, path) {
  return `${source}:${path}`;
}

export function parseKey(key) {
  const i = key.indexOf(":");
  return { source: key.slice(0, i), path: key.slice(i + 1) };
}

export function defaultEntry(name, isFolder = false) {
  return { tags: [], color: null, favorite: false, name, isFolder };
}

export function mergeEntry(entries, source, path, fallbackName) {
  return entries[keyFor(source, path)] ?? defaultEntry(fallbackName);
}

export function isDefaultEntry(entry) {
  return entry.tags.length === 0 && entry.color === null && !entry.favorite;
}

export function pruneDefaultEntries(entries) {
  const next = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (!isDefaultEntry(entry)) next[key] = entry;
  }
  return next;
}

export function stampEntryFields(entries, items, patch) {
  const next = { ...entries };
  for (const it of items) {
    const key = it.id ?? keyFor(it.source, it.path);
    const existing = next[key] ?? defaultEntry(it.name, it.isFolder);
    next[key] = { ...existing, name: it.name, isFolder: it.isFolder, ...patch };
  }
  return pruneDefaultEntries(next);
}

export function upsertTagOnEntries(entries, items, tagId, add) {
  const next = { ...entries };
  for (const it of items) {
    const key = it.id ?? keyFor(it.source, it.path);
    const existing = next[key] ?? defaultEntry(it.name, it.isFolder);
    const tags = add
      ? existing.tags.includes(tagId)
        ? existing.tags
        : [...existing.tags, tagId]
      : existing.tags.filter((t) => t !== tagId);
    next[key] = {
      ...existing,
      name: it.name ?? existing.name,
      isFolder: it.isFolder ?? existing.isFolder,
      tags,
    };
  }
  return pruneDefaultEntries(next);
}

export function pruneTagFromEntries(entries, tagId) {
  const next = {};
  for (const [key, entry] of Object.entries(entries)) {
    const updated = entry.tags.includes(tagId)
      ? { ...entry, tags: entry.tags.filter((t) => t !== tagId) }
      : entry;
    if (!isDefaultEntry(updated)) next[key] = updated;
  }
  return next;
}
