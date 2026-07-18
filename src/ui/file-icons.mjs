const COLORS = {
  folder: { a: "#6b7d96", b: "#51617a" },
  image: { a: "#57ab5a", b: "#3d7a40" },
  video: { a: "#986ee2", b: "#6d4bb0" },
  audio: { a: "#539bf5", b: "#3a6fc0" },
  code: { a: "#3fb6c4", b: "#2b8794" },
  doc: { a: "#9aa4b2", b: "#6b7684" },
  pdf: { a: "#e5534b", b: "#b03a34" },
  archive: { a: "#d9b13b", b: "#a8862a" },
  font: { a: "#e87ba0", b: "#b5567a" },
  data: { a: "#7bc86c", b: "#569a49" },
  other: { a: "#6b7684", b: "#4d5866" },
};

const GLYPHS = {
  image: `<circle cx="19" cy="22" r="3.2" fill="#fff" opacity="0.9"/><path d="M13 34l7-8 5 5 4-4.5L34 34z" fill="#fff" opacity="0.9"/>`,
  video: `<path d="M19 20l12 6.5L19 33z" fill="#fff" opacity="0.92"/>`,
  audio: `<path d="M27 18v10.5a3.5 3.5 0 11-2-3.2V21l-6 1.5v8a3.5 3.5 0 11-2-3.2V20l10-2.5z" fill="#fff" opacity="0.92"/>`,
  code: `<path d="M18 20l-5.5 6L18 32M28 20l5.5 6L28 32" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.92" fill="none"/><path d="M24.8 18.5l-3.6 15" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>`,
  doc: `<path d="M14 20h18M14 25h18M14 30h12" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.9"/>`,
  pdf: `<text x="23" y="31" text-anchor="middle" font-family="Signika, sans-serif" font-size="11" font-weight="700" fill="#fff" opacity="0.95">PDF</text>`,
  archive: `<path d="M21 8h4v3h-4zM21 13h4v3h-4zM21 18h4v3h-4z" fill="#fff" opacity="0.85"/><rect x="19.5" y="23" width="7" height="8" rx="1.6" stroke="#fff" stroke-width="2" fill="none" opacity="0.9"/>`,
  font: `<text x="23" y="33" text-anchor="middle" font-family="Signika, sans-serif" font-size="20" font-weight="700" fill="#fff" opacity="0.95">Aa</text>`,
  data: `<ellipse cx="23" cy="19.5" rx="8" ry="3.4" stroke="#fff" stroke-width="2.2" fill="none" opacity="0.9"/><path d="M15 19.5v11c0 1.9 3.6 3.4 8 3.4s8-1.5 8-3.4v-11M15 25c0 1.9 3.6 3.4 8 3.4s8-1.5 8-3.4" stroke="#fff" stroke-width="2.2" fill="none" opacity="0.9" stroke-linecap="round"/>`,
  other: `<text x="23" y="32" text-anchor="middle" font-family="Signika, sans-serif" font-size="19" font-weight="700" fill="#fff" opacity="0.9">?</text>`,
};

export function fileIconSvg(type, size = 16) {
  const c = COLORS[type] ?? COLORS.other;
  if (type === "folder") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none">
      <path d="M5 12a3 3 0 013-3h9l4 4h19a3 3 0 013 3v20a3 3 0 01-3 3H8a3 3 0 01-3-3V12z" fill="${c.b}"/>
      <path d="M5 17h38v19a3 3 0 01-3 3H8a3 3 0 01-3-3V17z" fill="${c.a}"/>
      <path d="M5 17h38v3H5z" fill="rgba(255,255,255,0.14)"/>
    </svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 46 46" fill="none">
    <path d="M9 7a3 3 0 013-3h16l9 9v26a3 3 0 01-3 3H12a3 3 0 01-3-3V7z" fill="${c.a}"/>
    <path d="M28 4l9 9h-7a2 2 0 01-2-2V4z" fill="${c.b}"/>
    <path d="M28 4l9 9h-7a2 2 0 01-2-2V4z" fill="rgba(255,255,255,0.18)"/>
    ${GLYPHS[type] ?? GLYPHS.other}
  </svg>`;
}
