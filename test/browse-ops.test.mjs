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
  decodePath,
  normalizePathInput,
  splitParent,
  buildQuickJumpIndex,
  filterQuickJump,
  fuzzyScore,
} from "../src/data/browse-ops.mjs";

describe("fuzzyScore", () => {
  it("matches subsequences in order and rejects missing letters", () => {
    expect(fuzzyScore("cstrd", "Curse of Strahd")).not.toBeNull();
    expect(fuzzyScore("катмб", "Забытые катакомбы")).not.toBeNull();
    expect(fuzzyScore("xyz", "Curse of Strahd")).toBeNull();
    expect(fuzzyScore("strc", "Curse of Strahd")).toBeNull();
  });

  it("ranks consecutive and word-start matches above scattered ones", () => {
    expect(fuzzyScore("map", "map.webp")).toBeGreaterThan(fuzzyScore("map", "mystic-sharp.png"));
    expect(fuzzyScore("tok", "tokens")).toBeGreaterThan(fuzzyScore("tok", "stone-block"));
  });

  it("treats an empty query as a zero-score match", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});

describe("buildQuickJumpIndex", () => {
  const parts = {
    recents: [{ source: "data", path: "maps/dungeons", name: "dungeons" }],
    favorites: [{ source: "data", path: "tokens", name: "tokens" }],
    treeFolders: [
      { path: "maps", name: "maps" },
      { path: "maps/dungeons", name: "dungeons" },
    ],
    entries: {
      "data:audio/music": { name: "music", isFolder: true, tags: [], color: null },
      "data:maps/hero.webp": { name: "hero.webp", isFolder: false, tags: [], color: null },
    },
    source: "data",
  };

  it("merges recents, favorites, tree and folder entries without duplicates", () => {
    const index = buildQuickJumpIndex(parts);
    expect(index.map((e) => e.path)).toEqual(["maps/dungeons", "tokens", "maps", "audio/music"]);
  });

  it("keeps recents first and skips file entries", () => {
    const index = buildQuickJumpIndex(parts);
    expect(index[0]).toMatchObject({ path: "maps/dungeons", source: "data" });
    expect(index.some((e) => e.path === "maps/hero.webp")).toBe(false);
  });
});

describe("filterQuickJump", () => {
  const index = [
    { source: "data", path: "maps/dungeons", name: "dungeons" },
    { source: "data", path: "tokens", name: "tokens" },
    { source: "data", path: "maps/%D0%93%D0%BE%D1%80%D0%BE%D0%B4%D0%B0", name: "Города" },
  ];

  it("returns the head of the index for an empty query", () => {
    expect(filterQuickJump(index, "", 2)).toHaveLength(2);
    expect(filterQuickJump(index, "  ")[0].name).toBe("dungeons");
  });

  it("matches by name and by decoded path, case-insensitively", () => {
    expect(filterQuickJump(index, "TOK")).toHaveLength(1);
    expect(filterQuickJump(index, "город")[0].name).toBe("Города");
    expect(filterQuickJump(index, "maps/дун")).toHaveLength(0);
    expect(filterQuickJump(index, "maps/dun")[0].path).toBe("maps/dungeons");
  });
});

describe("normalizePathInput", () => {
  it("converts backslashes and trims stray slashes and spaces", () => {
    expect(normalizePathInput("  \\maps\\dungeons\\  ")).toBe("maps/dungeons");
    expect(normalizePathInput("/maps//dungeons/")).toBe("maps/dungeons");
    expect(normalizePathInput("maps / dungeons")).toBe("maps/dungeons");
  });

  it("returns an empty string for empty or root input", () => {
    expect(normalizePathInput("")).toBe("");
    expect(normalizePathInput("   ")).toBe("");
    expect(normalizePathInput("/")).toBe("");
    expect(normalizePathInput(null)).toBe("");
  });
});

describe("splitParent", () => {
  it("splits a path into parent and base segment", () => {
    expect(splitParent("maps/dungeons/hero.webp")).toEqual({
      parent: "maps/dungeons",
      base: "hero.webp",
    });
    expect(splitParent("hero.webp")).toEqual({ parent: "", base: "hero.webp" });
  });

  it("handles the empty root path", () => {
    expect(splitParent("")).toEqual({ parent: "", base: "" });
  });
});

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

describe("decodePath", () => {
  it("decodes spaces and non-latin segments, keeps malformed input as-is", () => {
    expect(decodePath("maps/%D0%9C%D0%BE%D0%B8%20%D0%BA%D0%B0%D1%80%D1%82%D1%8B")).toBe(
      "maps/Мои карты",
    );
    expect(decodePath("maps/dungeons")).toBe("maps/dungeons");
    expect(decodePath("maps/50% off")).toBe("maps/50% off");
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
