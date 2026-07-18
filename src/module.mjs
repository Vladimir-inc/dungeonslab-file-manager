import { registerSettings } from "./settings.mjs";
import { MODULE_ID } from "./constants.mjs";
import FileManagerApp from "./apps/file-manager-app.mjs";
import { stopLocalAudio } from "./apps/foundry-actions.mjs";
import { maybeShowIntro, sendGreetingMessage } from "./apps/intro.mjs";
import { registerDropTargets } from "./apps/drop-targets.mjs";
import "../styles/module.less";

let standaloneApp = null;
function openFileManager() {
  const Impl = foundry.applications.apps.FilePicker.implementation;
  if (!standaloneApp || standaloneApp.constructor !== Impl) standaloneApp = new Impl({});
  standaloneApp.render(true);
  return true;
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
  CONFIG.ux.FilePicker = FileManagerApp;
  maybeShowIntro();
  setTimeout(sendGreetingMessage, 5000);
});
