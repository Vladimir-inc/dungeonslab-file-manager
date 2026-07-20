import { MODULE_ID, SETTINGS, ACCENT_OPTIONS, VIEW_MODES } from "./constants.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.ENTRIES, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, SETTINGS.TAGS, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTINGS.PREVIEW_OPEN, {
    scope: "client",
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.INTRO_SEEN, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTINGS.RECENT_FOLDERS, {
    scope: "client",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTINGS.ACCENT_COLOR, {
    name: "FILE_MANAGER_DUNGEONS_LAB.Settings.AccentColor.Name",
    hint: "FILE_MANAGER_DUNGEONS_LAB.Settings.AccentColor.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: Object.fromEntries(ACCENT_OPTIONS.map((c) => [c, c])),
    default: ACCENT_OPTIONS[0],
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_VIEW, {
    name: "FILE_MANAGER_DUNGEONS_LAB.Settings.DefaultView.Name",
    hint: "FILE_MANAGER_DUNGEONS_LAB.Settings.DefaultView.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      grid: "FILE_MANAGER_DUNGEONS_LAB.View.Grid",
      list: "FILE_MANAGER_DUNGEONS_LAB.View.List",
      compact: "FILE_MANAGER_DUNGEONS_LAB.View.Compact",
      portrait: "FILE_MANAGER_DUNGEONS_LAB.View.Portrait",
    },
    default: VIEW_MODES[0],
  });
}
