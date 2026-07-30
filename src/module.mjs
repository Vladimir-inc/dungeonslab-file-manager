import { registerSettings } from "./settings.mjs";
import { MODULE_ID, SETTINGS } from "./constants.mjs";
import FileManagerApp from "./apps/file-manager-app.mjs";
import { stopLocalAudio } from "./apps/foundry-actions.mjs";
import { sendGreetingMessage } from "./apps/greeting.mjs";
import { registerDropTargets } from "./apps/drop-targets.mjs";
import "../styles/module.less";

let standaloneApp = null;
function openFileManager() {
  const Impl = foundry.applications.apps.FilePicker.implementation;
  if (!standaloneApp || standaloneApp.constructor !== Impl) standaloneApp = new Impl({});
  standaloneApp.render(true);
  return true;
}

// The Forge (and similar hosts) install their own FilePicker at CONFIG.ux.FilePicker to add cloud
// sources - The Bazaar, The Forge Assets. Overwriting that slot with our vanilla-based class would
// clobber those sources everywhere. Instead we re-parent FileManagerApp *under* the active picker,
// inheriting its sources + browse routing, then install ours on top.
function installFileManagerPicker() {
  const Vanilla = foundry.applications.apps.FilePicker;
  const active = CONFIG.ux.FilePicker;
  if (
    active &&
    active !== FileManagerApp &&
    active !== Vanilla &&
    active.prototype instanceof Vanilla &&
    !(FileManagerApp.prototype instanceof active)
  ) {
    Object.setPrototypeOf(FileManagerApp, active);
    Object.setPrototypeOf(FileManagerApp.prototype, active.prototype);
  }
  CONFIG.ux.FilePicker = FileManagerApp;
}

Hooks.once("init", () => {
  registerSettings();

  game.socket.on(`module.${MODULE_ID}`, (data) => {
    if (data?.action === "stopAudio" && data.src) stopLocalAudio(data.src);
  });

  game.keybindings.register(MODULE_ID, "openFileManager", {
    name: "FILE_MANAGER_DUNGEONS_LAB.Keybindings.Open.Name",
    editable: [{ key: "KeyF", modifiers: ["Alt"] }],
    restricted: true,
    onDown: openFileManager,
  });

  game.keybindings.register(MODULE_ID, "selectAll", {
    name: "FILE_MANAGER_DUNGEONS_LAB.Keybindings.SelectAll.Name",
    editable: [{ key: "KeyA", modifiers: ["Control"] }],
    restricted: true,
    onDown: () => {
      // срабатывает только когда менеджер открыт, иначе Ctrl+A уходит ядру как обычно
      const app = [...foundry.applications.instances.values()]
        .filter((a) => a instanceof FileManagerApp && a.rendered)
        .at(-1);
      if (!app) return false;
      app.selectAll();
      return true;
    },
  });

  game.keybindings.register(MODULE_ID, "quickJump", {
    name: "FILE_MANAGER_DUNGEONS_LAB.Keybindings.QuickJump.Name",
    editable: [{ key: "KeyP", modifiers: ["Control"] }],
    restricted: true,
    onDown: () => {
      // работает только при открытом менеджере, иначе Ctrl+P уходит браузеру как обычно
      const app = [...foundry.applications.instances.values()]
        .filter((a) => a instanceof FileManagerApp && a.rendered)
        .at(-1);
      if (!app) return false;
      app.openQuickJump();
      return true;
    },
  });

  registerDropTargets();
});

Hooks.on("renderSidebar", (app, html) => {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const menu = root?.querySelector("nav.tabs menu");
  if (!menu || menu.querySelector(".fm-sidebar-launcher")) return;
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ui-control plain icon fa-solid fa-folder-open fm-sidebar-launcher";
  button.setAttribute("aria-label", game.i18n.localize("FILE_MANAGER_DUNGEONS_LAB.Title"));
  button.dataset.tooltip = "";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openFileManager();
  });
  li.appendChild(button);
  const collapseLi = menu.querySelector("button.collapse")?.closest("li") ?? null;
  menu.insertBefore(li, collapseLi);
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  installFileManagerPicker();
  // индекс палитры греется заранее и в фоне, с задержкой, чтобы не мешать загрузке мира
  setTimeout(() => FileManagerApp.warmQuickJumpIndex("data"), 4000);
  if (game.settings.get(MODULE_ID, SETTINGS.DISABLE_CHAT_GREETING)) return;
  setTimeout(sendGreetingMessage, 5000);
});
