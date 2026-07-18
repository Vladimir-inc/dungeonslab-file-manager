import { describe, it, expect } from "vitest";
import {
  keyFor,
  parseKey,
  defaultEntry,
  mergeEntry,
  isDefaultEntry,
  pruneDefaultEntries,
  stampEntryFields,
  upsertTagOnEntries,
  pruneTagFromEntries,
} from "../src/data/metadata-ops.mjs";

const item = (source, path, name, isFolder = false) => ({
  id: keyFor(source, path),
  source,
  path,
  name,
  isFolder,
});

describe("keyFor / parseKey", () => {
  it("round-trips source and path, tolerating colons in the path", () => {
    const key = keyFor("data", "maps/we:ird.webp");
    expect(key).toBe("data:maps/we:ird.webp");
    expect(parseKey(key)).toEqual({ source: "data", path: "maps/we:ird.webp" });
  });
});

describe("defaultEntry / isDefaultEntry", () => {
  it("builds an empty entry that registers as default", () => {
    const e = defaultEntry("a.webp");
    expect(e).toEqual({ tags: [], color: null, favorite: false, name: "a.webp", isFolder: false });
    expect(isDefaultEntry(e)).toBe(true);
  });

  it("any tag, color, or favorite makes an entry non-default", () => {
    expect(isDefaultEntry({ ...defaultEntry("a"), tags: ["t"] })).toBe(false);
    expect(isDefaultEntry({ ...defaultEntry("a"), color: "red" })).toBe(false);
    expect(isDefaultEntry({ ...defaultEntry("a"), favorite: true })).toBe(false);
  });
});

describe("mergeEntry", () => {
  it("returns the stored entry when present, default otherwise", () => {
    const stored = { tags: ["t1"], color: "red", favorite: true, name: "a.webp", isFolder: false };
    const entries = { "data:a.webp": stored };
    expect(mergeEntry(entries, "data", "a.webp", "a.webp")).toBe(stored);
    expect(mergeEntry(entries, "data", "b.webp", "b.webp")).toEqual(defaultEntry("b.webp"));
  });
});

describe("stampEntryFields", () => {
  it("applies a patch to every item, stamping name/isFolder", () => {
    const next = stampEntryFields({}, [item("data", "maps", "maps", true)], { favorite: true });
    expect(next["data:maps"]).toEqual({
      tags: [],
      color: null,
      favorite: true,
      name: "maps",
      isFolder: true,
    });
  });

  it("prunes entries that become fully default", () => {
    const entries = {
      "data:a.webp": { tags: [], color: "red", favorite: false, name: "a.webp", isFolder: false },
    };
    const next = stampEntryFields(entries, [item("data", "a.webp", "a.webp")], { color: null });
    expect(next).toEqual({});
  });

  it("does not mutate the input", () => {
    const entries = {};
    stampEntryFields(entries, [item("data", "a.webp", "a.webp")], { color: "red" });
    expect(entries).toEqual({});
  });
});

describe("upsertTagOnEntries", () => {
  it("adds a tag to every item without duplicating, creating entries as needed", () => {
    const entries = {
      "data:a.webp": {
        tags: ["t1"],
        color: null,
        favorite: false,
        name: "a.webp",
        isFolder: false,
      },
    };
    const next = upsertTagOnEntries(
      entries,
      [item("data", "a.webp", "a.webp"), item("data", "b.webp", "b.webp")],
      "t1",
      true,
    );
    expect(next["data:a.webp"].tags).toEqual(["t1"]);
    expect(next["data:b.webp"].tags).toEqual(["t1"]);
  });

  it("removes a tag and prunes entries that become default", () => {
    const entries = {
      "data:a.webp": {
        tags: ["t1"],
        color: null,
        favorite: false,
        name: "a.webp",
        isFolder: false,
      },
      "data:b.webp": {
        tags: ["t1"],
        color: "red",
        favorite: false,
        name: "b.webp",
        isFolder: false,
      },
    };
    const next = upsertTagOnEntries(
      entries,
      [item("data", "a.webp", "a.webp"), item("data", "b.webp", "b.webp")],
      "t1",
      false,
    );
    expect(next["data:a.webp"]).toBeUndefined();
    expect(next["data:b.webp"].tags).toEqual([]);
  });
});

describe("pruneTagFromEntries", () => {
  it("strips a deleted tag everywhere and prunes now-default entries", () => {
    const entries = {
      "data:a.webp": {
        tags: ["t1"],
        color: null,
        favorite: false,
        name: "a.webp",
        isFolder: false,
      },
      "data:b.webp": {
        tags: ["t1", "t2"],
        color: null,
        favorite: false,
        name: "b.webp",
        isFolder: false,
      },
      "data:c.webp": { tags: [], color: "blue", favorite: false, name: "c.webp", isFolder: false },
    };
    const next = pruneTagFromEntries(entries, "t1");
    expect(next["data:a.webp"]).toBeUndefined();
    expect(next["data:b.webp"].tags).toEqual(["t2"]);
    expect(next["data:c.webp"]).toEqual(entries["data:c.webp"]);
  });
});

describe("pruneDefaultEntries", () => {
  it("drops only fully-default entries", () => {
    const keep = { tags: [], color: "red", favorite: false, name: "k", isFolder: false };
    const entries = { keep, drop: defaultEntry("d") };
    expect(pruneDefaultEntries(entries)).toEqual({ keep });
  });
});
