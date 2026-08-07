import { describe, it, expect } from "vitest";
import {
  CONVERTIBLE_IMAGE_EXTENSIONS,
  canConvertToWebp,
  webpName,
  resolveCollision,
} from "../src/data/convert-ops.mjs";

describe("canConvertToWebp", () => {
  it("rejects folders even with a convertible-looking path", () => {
    expect(canConvertToWebp({ path: "maps/heroes.png", isFolder: true })).toBe(false);
  });

  it("accepts every convertible extension, case-insensitively", () => {
    for (const ext of CONVERTIBLE_IMAGE_EXTENSIONS) {
      expect(canConvertToWebp({ path: `maps/hero.${ext}`, isFolder: false })).toBe(true);
      expect(canConvertToWebp({ path: `maps/hero.${ext.toUpperCase()}`, isFolder: false })).toBe(
        true,
      );
    }
  });

  it("rejects webp, svg, gif and other non-convertible types", () => {
    for (const ext of ["webp", "svg", "gif", "apng", "tiff", "zip", "json"]) {
      expect(canConvertToWebp({ path: `maps/hero.${ext}`, isFolder: false })).toBe(false);
    }
  });
});

describe("webpName", () => {
  it("replaces the extension with .webp", () => {
    expect(webpName("Hero.PNG")).toBe("Hero.webp");
    expect(webpName("hero.jpg")).toBe("hero.webp");
  });

  it("keeps multi-dot names intact up to the last dot", () => {
    expect(webpName("a.b.png")).toBe("a.b.webp");
  });
});

describe("resolveCollision", () => {
  it("returns the name as-is when it is free", () => {
    expect(resolveCollision("hero.webp", new Set(["other.webp"]))).toBe("hero.webp");
  });

  it("appends (2) when the name is taken", () => {
    expect(resolveCollision("hero.webp", new Set(["hero.webp"]))).toBe("hero (2).webp");
  });

  it("walks to (3) when (2) is also taken", () => {
    const taken = new Set(["hero.webp", "hero (2).webp"]);
    expect(resolveCollision("hero.webp", taken)).toBe("hero (3).webp");
  });

  it("treats collisions case-insensitively", () => {
    expect(resolveCollision("Hero.webp", new Set(["hero.webp"]))).toBe("Hero (2).webp");
    expect(resolveCollision("HERO.WEBP", new Set(["other.webp"]))).toBe("HERO.WEBP");
  });
});
