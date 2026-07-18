import { L, LF } from "../i18n.mjs";
import { classifyExtension } from "../data/browse-ops.mjs";
import { parseFmDrag, soundDataForFile, pageDataForFile } from "../data/drop-ops.mjs";

const HOVER = "fm-drop-hover";

function clearHover(root) {
  for (const n of root.querySelectorAll(`.${HOVER}`)) n.classList.remove(HOVER);
}

function wire(root, onDrop) {
  if (!root || root.dataset.fmDropWired) return;
  root.dataset.fmDropWired = "1";
  root.addEventListener("dragover", (event) => {
    event.preventDefault();
    clearHover(root);
    event.target.closest(".directory-item[data-entry-id]")?.classList.add(HOVER);
  });
  root.addEventListener("dragleave", (event) => {
    if (!root.contains(event.relatedTarget)) clearHover(root);
  });
  root.addEventListener("drop", async (event) => {
    clearHover(root);
    const payload = parseFmDrag(event.dataTransfer?.getData("text/plain") ?? "");
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      await onDrop(event, payload);
    } catch (err) {
      console.error("drop-targets:", err);
      ui.notifications.error(err.message);
    }
  });
}

async function onPlaylistDrop(event, { path }) {
  if (classifyExtension(path) !== "audio") {
    ui.notifications.warn(L("Drop.NotAudio"));
    return;
  }
  const sound = soundDataForFile(path);
  const row = event.target.closest(".directory-item[data-entry-id]");
  if (row) {
    const playlist = game.playlists.get(row.dataset.entryId);
    if (!playlist) {
      ui.notifications.warn(L("Drop.TargetGone"));
      return;
    }
    await CONFIG.PlaylistSound.documentClass.create(sound, { parent: playlist });
    ui.notifications.info(LF("Drop.TrackAdded", { track: sound.name, playlist: playlist.name }));
  } else {
    const folder = event.target.closest(".directory-item.folder")?.dataset.folderId ?? null;
    const playlist = await CONFIG.Playlist.documentClass.create({
      name: sound.name,
      sounds: [sound],
      folder,
    });
    ui.notifications.info(LF("Drop.PlaylistCreated", { playlist: playlist.name }));
  }
}

async function onJournalDrop(event, { path }) {
  const page = pageDataForFile(path);
  const row = event.target.closest(".directory-item[data-entry-id]");
  if (row) {
    const entry = game.journal.get(row.dataset.entryId);
    if (!entry) {
      ui.notifications.warn(L("Drop.TargetGone"));
      return;
    }
    await entry.createEmbeddedDocuments("JournalEntryPage", [page]);
    ui.notifications.info(LF("Drop.PageAdded", { page: page.name, entry: entry.name }));
  } else {
    const folder = event.target.closest(".directory-item.folder")?.dataset.folderId ?? null;
    const entry = await CONFIG.JournalEntry.documentClass.create({
      name: page.name,
      pages: [page],
      folder,
    });
    ui.notifications.info(LF("Drop.EntryCreated", { entry: entry.name }));
  }
}

export function registerDropTargets() {
  Hooks.on("renderPlaylistDirectory", (app, html) => {
    if (!game.user?.isGM) return;
    wire(html instanceof HTMLElement ? html : html[0], onPlaylistDrop);
  });
  Hooks.on("renderJournalDirectory", (app, html) => {
    if (!game.user?.isGM) return;
    wire(html instanceof HTMLElement ? html : html[0], onJournalDrop);
  });
}
