import { describe, it, expect } from "vitest";
import {
  classifyExtension,
  buildFolderItems,
  filterByExtensions,
  filterBySearch,
  sortItems,
  buildFilteredItems,
  computeTagCounts,
  computeColorCounts,
  computeFavorites,
  pushRecent,
  buildCrumbs,
  buildTreeNodes,
} from "../src/data/browse-ops.mjs";

describe("classifyExtension", () => {
  it("classifies images, audio, video, and falls back to other", () => {
    expect(classifyExtension("maps/a.webp")).toBe("image");
    expect(classifyExtension("audio/a.OGG")).toBe("audio");
    expect(classifyExtension("video/a.webm")).toBe("video");
    expect(classifyExtension("bin/a.exe")).toBe("other");
  });

  it("classifies the secondary icon types", () => {
    expect(classifyExtension("scripts/main.js")).toBe("code");
    expect(classifyExtension("data/world.json")).toBe("data");
    expect(classifyExtension("notes/readme.txt")).toBe("doc");
    expect(classifyExtension("docs/manual.PDF")).toBe("pdf");
    expect(classifyExtension("packs/stuff.zip")).toBe("archive");
    expect(classifyExtension("fonts/signika.woff2")).toBe("font");
  });
});

describe("buildFolderItems", () => {
  const result = { dirs: ["maps/dungeons"], files: ["maps/hero%20image.webp"] };
  const entries = {
    "data:maps/dungeons": {
      tags: [],
      color: "purple",
      favorite: true,
      name: "dungeons",
      isFolder: true,
    },
  };

  it("builds folder items with metadata merged in", () => {
    const folder = buildFolderItems(result, entries, "data").find((i) => i.isFolder);
    expect(folder).toMatchObject({
      id: "data:maps/dungeons",
      path: "maps/dungeons",
      name: "dungeons",
      color: "purple",
      favorite: true,
      type: "folder",
    });
  });

  it("builds file items classified by extension, url-decoded name, default metadata", () => {
    const file = buildFolderItems(result, entries, "data").find((i) => !i.isFolder);
    expect(file).toMatchObject({
      path: "maps/hero%20image.webp",
      name: "hero image.webp",
      type: "image",
      tags: [],
      color: null,
      favorite: false,
    });
  });
});

describe("filterByExtensions", () => {
  const items = [
    { path: "maps", isFolder: true },
    { path: "maps/a.WEBP", isFolder: false },
    { path: "audio/b.ogg", isFolder: false },
  ];
  it("keeps folders and matching files only, case-insensitively", () => {
    expect(filterByExtensions(items, [".webp", ".png"]).map((i) => i.path)).toEqual([
      "maps",
      "maps/a.WEBP",
    ]);
  });
  it("passes everything when no restriction is set", () => {
    expect(filterByExtensions(items, [])).toEqual(items);
    expect(filterByExtensions(items, undefined)).toEqual(items);
  });
});

describe("filterBySearch", () => {
  const items = [{ name: "Dragon lair" }, { name: "Tavern" }];
  it("is case-insensitive substring match", () => {
    expect(filterBySearch(items, "drag")).toEqual([{ name: "Dragon lair" }]);
  });
  it("returns everything for an empty/whitespace query", () => {
    expect(filterBySearch(items, "  ")).toEqual(items);
  });
});

describe("sortItems", () => {
  it("sorts folders before files, then alphabetically, without mutating input", () => {
    const items = [
      { name: "b-file", isFolder: false },
      { name: "a-folder", isFolder: true },
      { name: "a-file", isFolder: false },
      { name: "b-folder", isFolder: true },
    ];
    const sorted = sortItems(items, "en");
    expect(sorted.map((i) => i.name)).toEqual(["a-folder", "b-folder", "a-file", "b-file"]);
    expect(items[0].name).toBe("b-file");
  });
});

describe("computeTagCounts", () => {
  it("counts entries referencing each known tag id", () => {
    const entries = {
      a: { tags: ["fight"], color: null, favorite: false, name: "a", isFolder: false },
      b: { tags: ["fight", "amb"], color: null, favorite: false, name: "b", isFolder: false },
    };
    expect(computeTagCounts(entries, [{ id: "fight" }, { id: "amb" }, { id: "city" }])).toEqual({
      fight: 2,
      amb: 1,
      city: 0,
    });
  });
});

describe("buildFilteredItems", () => {
  const entries = {
    "data:maps/a.webp": {
      tags: ["fight", "amb"],
      color: "red",
      favorite: false,
      name: "a.webp",
      isFolder: false,
    },
    "data:maps/b.webp": {
      tags: ["fight"],
      color: "blue",
      favorite: false,
      name: "b.webp",
      isFolder: false,
    },
  };

  it("tags combine with AND, mapped to item shape", () => {
    const items = buildFilteredItems(entries, ["fight", "amb"], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "data:maps/a.webp",
      source: "data",
      path: "maps/a.webp",
      name: "a.webp",
      type: "image",
      color: "red",
    });
  });

  it("colors combine with OR and stack with tag filters", () => {
    expect(buildFilteredItems(entries, [], ["red", "blue"])).toHaveLength(2);
    expect(buildFilteredItems(entries, [], ["blue"]).map((i) => i.color)).toEqual(["blue"]);
    expect(buildFilteredItems(entries, ["fight"], ["red"]).map((i) => i.color)).toEqual(["red"]);
  });
});

describe("computeColorCounts", () => {
  it("counts entries per known color id", () => {
    const entries = {
      a: { tags: [], color: "red", favorite: false, name: "a", isFolder: false },
      b: { tags: [], color: "red", favorite: false, name: "b", isFolder: false },
      c: { tags: [], color: null, favorite: true, name: "c", isFolder: true },
    };
    expect(computeColorCounts(entries, ["red", "blue"])).toEqual({ red: 2, blue: 0 });
  });
});

describe("computeFavorites", () => {
  it("returns only folder entries marked favorite, with source/path parsed from the key", () => {
    const entries = {
      "data:maps": { tags: [], color: null, favorite: true, name: "maps", isFolder: true },
      "data:a.webp": { tags: [], color: null, favorite: true, name: "a.webp", isFolder: false },
      "public:icons": { tags: [], color: null, favorite: false, name: "icons", isFolder: true },
    };
    const favs = computeFavorites(entries);
    expect(favs).toEqual([{ id: "data:maps", source: "data", path: "maps", name: "maps" }]);
  });
});

describe("pushRecent", () => {
  it("adds a new entry to the front, deriving the name from the path", () => {
    const recents = pushRecent([], { source: "data", path: "maps/dungeons" });
    expect(recents).toEqual([{ source: "data", path: "maps/dungeons", name: "dungeons" }]);
  });

  it("moves a re-opened folder back to the front instead of duplicating it", () => {
    const recents = [
      { source: "data", path: "maps/a", name: "a" },
      { source: "data", path: "maps/b", name: "b" },
    ];
    expect(pushRecent(recents, { source: "data", path: "maps/b" })).toEqual([
      { source: "data", path: "maps/b", name: "b" },
      { source: "data", path: "maps/a", name: "a" },
    ]);
  });

  it("treats the same path under a different source as distinct", () => {
    const recents = [{ source: "data", path: "maps", name: "maps" }];
    const result = pushRecent(recents, { source: "public", path: "maps" });
    expect(result).toEqual([
      { source: "public", path: "maps", name: "maps" },
      { source: "data", path: "maps", name: "maps" },
    ]);
  });

  it("caps the list at max, dropping the oldest", () => {
    const recents = Array.from({ length: 5 }, (_, i) => ({
      source: "data",
      path: `f${i}`,
      name: `f${i}`,
    }));
    const result = pushRecent(recents, { source: "data", path: "new" }, 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ source: "data", path: "new", name: "new" });
    expect(result.find((r) => r.path === "f4")).toBeUndefined();
  });
});

describe("buildCrumbs", () => {
  it("builds cumulative path crumbs from the root label", () => {
    expect(buildCrumbs("maps/dungeons", "Data")).toEqual([
      { name: "Data", path: "" },
      { name: "maps", path: "maps" },
      { name: "dungeons", path: "maps/dungeons" },
    ]);
  });
  it("root target yields just the root crumb", () => {
    expect(buildCrumbs("", "Data")).toEqual([{ name: "Data", path: "" }]);
  });
});

describe("buildTreeNodes", () => {
  it("walks the lazy cache, descending only into expanded paths", () => {
    const cache = new Map([
      [
        "",
        [
          { path: "audio", name: "audio" },
          { path: "maps", name: "maps" },
        ],
      ],
      ["maps", [{ path: "maps/dungeons", name: "dungeons" }]],
    ]);
    const nodes = buildTreeNodes(cache, new Set(["maps"]));
    expect(nodes).toEqual([
      { path: "audio", name: "audio", depth: 0, expanded: false, loaded: false },
      { path: "maps", name: "maps", depth: 0, expanded: true, loaded: true },
      { path: "maps/dungeons", name: "dungeons", depth: 1, expanded: false, loaded: false },
    ]);
  });
});
