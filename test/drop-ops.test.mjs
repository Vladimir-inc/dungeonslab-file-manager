import { describe, it, expect } from "vitest";
import {
  parseFmDrag,
  displayName,
  soundDataForFile,
  pageDataForFile,
} from "../src/data/drop-ops.mjs";

const MODULE_ID = "file-manager-dungeons-lab";

describe("parseFmDrag", () => {
  it("accepts our payload and returns source+path", () => {
    const text = JSON.stringify({ fmModule: MODULE_ID, fmSource: "data", fmPath: "audio/a.ogg" });
    expect(parseFmDrag(text)).toEqual({ source: "data", path: "audio/a.ogg" });
  });
  it("rejects foreign, malformed, and empty payloads", () => {
    expect(parseFmDrag(JSON.stringify({ fmModule: "other", fmPath: "x.ogg" }))).toBeNull();
    expect(parseFmDrag(JSON.stringify({ type: "Tile" }))).toBeNull();
    expect(parseFmDrag("not json")).toBeNull();
    expect(parseFmDrag("")).toBeNull();
  });
});

describe("displayName", () => {
  it("decodes and strips the extension", () => {
    expect(displayName("maps/hero%20image.webp")).toBe("hero image");
    expect(displayName("audio/track.ogg")).toBe("track");
  });
  it("keeps extensionless names intact", () => {
    expect(displayName("docs/README")).toBe("README");
  });
});

describe("soundDataForFile", () => {
  it("builds PlaylistSound data", () => {
    expect(soundDataForFile("audio/boss%20theme.mp3")).toEqual({
      name: "boss theme",
      path: "audio/boss%20theme.mp3",
      volume: 0.8,
    });
  });
});

describe("pageDataForFile", () => {
  it("maps image and pdf to matching page types", () => {
    expect(pageDataForFile("maps/a.webp")).toEqual({
      name: "a",
      type: "image",
      src: "maps/a.webp",
    });
    expect(pageDataForFile("docs/manual.pdf")).toEqual({
      name: "manual",
      type: "pdf",
      src: "docs/manual.pdf",
    });
  });
  it("maps video AND audio to the video page type (core has no audio page)", () => {
    expect(pageDataForFile("video/cut.webm").type).toBe("video");
    expect(pageDataForFile("audio/theme.mp3").type).toBe("video");
  });
  it("falls back to a text page with an escaped link (name AND href)", () => {
    const page = pageDataForFile("packs/a%20<b>.zip");
    expect(page.type).toBe("text");
    expect(page.src).toBeUndefined();
    expect(page.text.format).toBe(1);
    expect(page.text.content).toBe(
      '<p><a href="packs/a%20&lt;b&gt;.zip">a &lt;b&gt;</a></p>',
    );
  });
});
