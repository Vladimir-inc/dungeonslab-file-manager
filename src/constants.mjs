export const MODULE_ID = "file-manager-dungeons-lab";

export const SETTINGS = {
  ENTRIES: "entries",
  TAGS: "tags",
  ACCENT_COLOR: "accentColor",
  DEFAULT_VIEW: "defaultView",
  PREVIEW_OPEN: "previewOpen",
  INTRO_SEEN: "introSeen",
  RECENT_FOLDERS: "recentFolders",
};

export const RECENT_FOLDERS_MAX = 5;

export const LABEL_COLORS = [
  { id: "red", labelKey: "FILE_MANAGER_DUNGEONS_LAB.Colors.Red", hex: "#e5534b" },
  { id: "orange", labelKey: "FILE_MANAGER_DUNGEONS_LAB.Colors.Orange", hex: "#e8823c" },
  { id: "yellow", labelKey: "FILE_MANAGER_DUNGEONS_LAB.Colors.Yellow", hex: "#d9b13b" },
  { id: "green", labelKey: "FILE_MANAGER_DUNGEONS_LAB.Colors.Green", hex: "#57ab5a" },
  { id: "blue", labelKey: "FILE_MANAGER_DUNGEONS_LAB.Colors.Blue", hex: "#539bf5" },
  { id: "purple", labelKey: "FILE_MANAGER_DUNGEONS_LAB.Colors.Purple", hex: "#986ee2" },
];

export const ACCENT_OPTIONS = ["#e8823c", "#539bf5", "#57ab5a", "#986ee2"];
export const VIEW_MODES = ["grid", "list", "compact", "portrait"];

export const IMAGE_EXTENSIONS = [
  "apng",
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tiff",
  "webp",
];
export const AUDIO_EXTENSIONS = ["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav"];
export const VIDEO_EXTENSIONS = ["m4v", "mp4", "ogv", "webm"];

export const EXTRA_TYPE_EXTENSIONS = {
  code: ["js", "mjs", "cjs", "ts", "css", "less", "scss", "html", "hbs", "xml"],
  data: ["json", "db", "yml", "yaml", "csv"],
  doc: ["txt", "md"],
  pdf: ["pdf"],
  archive: ["zip", "rar", "7z", "tar", "gz"],
  font: ["ttf", "otf", "woff", "woff2", "eot"],
};
