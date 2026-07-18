import { MODULE_ID, LABEL_COLORS, VIEW_MODES, SETTINGS, RECENT_FOLDERS_MAX } from "../constants.mjs";
import { parseKey } from "../data/metadata-ops.mjs";
import { fileIconSvg } from "../ui/file-icons.mjs";
import { randomPhrase, DISCORD_URL } from "../ui/phrases.mjs";
import { L, LF } from "../i18n.mjs";
import {
  getEntries,
  getTags,
  setTags,
  setEntryFieldsForItems,
  setTagOnItems,
  deleteTag,
} from "../data/metadata-store.mjs";
import {
  buildFolderItems,
  buildFilteredItems,
  filterByExtensions,
  filterBySearch,
  sortItems,
  computeTagCounts,
  computeColorCounts,
  computeFavorites,
  pushRecent,
  buildCrumbs,
  buildTreeNodes,
} from "../data/browse-ops.mjs";
import {
  placeTile,
  showToPlayers,
  sendToChat,
  whisperToUser,
  isBroadcastingAudio,
} from "./foundry-actions.mjs";

const { FilePicker } = foundry.applications.apps;

const METADATA_PARTS = ["main", "sidebar", "preview", "overlays"];

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default class FileManagerApp extends FilePicker {
  static DEFAULT_OPTIONS = {
    id: "file-manager-app",
    tag: "div",
    classes: ["file-manager-dungeons-lab"],
    window: {
      icon: "fa-solid fa-folder-open",
      resizable: true,
      contentClasses: ["fm-window-content"],
    },
    position: { width: 1200, height: 760 },
    actions: {
      goUp: FileManagerApp.#onGoUp,
      navigate: FileManagerApp.#onNavigate,
      switchSource: FileManagerApp.#onSwitchSource,
      setView: FileManagerApp.#onSetView,
      selectItem: FileManagerApp.#onSelectItem,
      clearFilters: FileManagerApp.#onClearFilters,
      toggleTagFilter: FileManagerApp.#onToggleTagFilter,
      toggleColorFilter: FileManagerApp.#onToggleColorFilter,
      expandTreeNode: FileManagerApp.#onExpandTreeNode,
      newFolder: FileManagerApp.#onNewFolder,
      upload: FileManagerApp.#onUploadClick,
      toggleMedia: FileManagerApp.#onToggleMedia,
      toggleAudio: FileManagerApp.#onToggleAudio,
      confirmSelect: FileManagerApp.#onConfirmSelect,
      setColor: FileManagerApp.#onSetColor,
      ctxSetColor: FileManagerApp.#onCtxSetColor,
      bulkSetColor: FileManagerApp.#onBulkSetColor,
      ctxToggleFavorite: FileManagerApp.#onToggleFavorite,
      ctxUnfavorite: FileManagerApp.#onCtxUnfavorite,
      editTags: FileManagerApp.#onEditTags,
      ctxEditTags: FileManagerApp.#onCtxEditTags,
      bulkOpenTagModal: FileManagerApp.#onBulkOpenTagModal,
      openTagManager: FileManagerApp.#onOpenTagManager,
      closeTagModal: FileManagerApp.#onCloseTagModal,
      tagModalToggle: FileManagerApp.#onTagModalToggle,
      tagModalAdd: FileManagerApp.#onTagModalAdd,
      tagModalRename: FileManagerApp.#onTagModalRename,
      tagModalDelete: FileManagerApp.#onTagModalDelete,
      closeContextMenu: FileManagerApp.#onCloseContextMenu,
      ctxOpen: FileManagerApp.#onCtxOpen,
      previewAction: FileManagerApp.#onPreviewAction,
      ctxPreviewAction: FileManagerApp.#onCtxPreviewAction,
      clearSelection: FileManagerApp.#onClearSelection,
      togglePreview: FileManagerApp.#onTogglePreview,
      phraseClick: FileManagerApp.#onPhraseClick,
    },
  };

  static PARTS = {
    toolbar: { template: `modules/${MODULE_ID}/templates/parts/toolbar.hbs` },
    sidebar: { template: `modules/${MODULE_ID}/templates/parts/sidebar.hbs`, scrollable: [""] },
    main: { template: `modules/${MODULE_ID}/templates/parts/main.hbs`, scrollable: [""] },
    preview: { template: `modules/${MODULE_ID}/templates/parts/preview.hbs`, scrollable: [""] },
    statusbar: { template: `modules/${MODULE_ID}/templates/parts/statusbar.hbs` },
    overlays: { template: `modules/${MODULE_ID}/templates/parts/overlays.hbs` },
  };

  get title() {
    return L("Title");
  }

  constructor(options = {}) {
    super(options);
    this.searchQuery = "";
    this.activeTagIds = [];
    this.activeColorIds = [];
    this.selectedIds = [];
    this.viewMode = game.settings.get(MODULE_ID, SETTINGS.DEFAULT_VIEW) ?? VIEW_MODES[0];
    this.previewOpen = game.settings.get(MODULE_ID, SETTINGS.PREVIEW_OPEN) ?? true;
    this.recents = game.settings.get(MODULE_ID, SETTINGS.RECENT_FOLDERS) ?? [];
    this.treeCache = new Map();
    this.treeExpanded = new Set();
    this.contextMenu = null;
    this.tagModal = null;
    this.toastText = null;
    this._phrase = null;
    this._activatedMedia = new Set();
    this._anchorId = null;
    this._initialSelectDone = false;
  }

  #audio = null;
  #audioPath = null;

  async _prepareContext(options) {
    const base = await super._prepareContext(options);
    const entries = getEntries();
    const tags = getTags();
    const locale = game.i18n.lang;
    if (!this.rendered) this._phrase = randomPhrase(locale);
    const tagCounts = computeTagCounts(entries, tags);

    if (!this.treeCache.has("")) {
      try {
        const rootResult = await this.constructor.browse(this.activeSource, "");
        this.treeCache.set("", FileManagerApp.#dirsToTreeChildren(rootResult.dirs));
      } catch {
        this.treeCache.set("", []);
      }
    }
    if (this.result?.dirs && typeof this.result.target === "string") {
      this.treeCache.set(this.result.target, FileManagerApp.#dirsToTreeChildren(this.result.dirs));
    }

    const filtering = this.activeTagIds.length > 0 || this.activeColorIds.length > 0;
    const searching = !!this.searchQuery.trim();
    const raw = filterByExtensions(
      filtering
        ? buildFilteredItems(entries, this.activeTagIds, this.activeColorIds)
        : buildFolderItems(this.result, entries, this.activeSource),
      this.extensions,
    );

    let items = sortItems(filterBySearch(raw, this.searchQuery), locale).map((item) => {
      const isGif = item.type === "image" && item.path.toLowerCase().endsWith(".gif");
      return {
        ...item,
        isImage: item.type === "image" && !isGif,
        isAudio: item.type === "audio",
        isVideo: item.type === "video",
        isGif,
        needsActivation: item.type === "video" || isGif,
        mediaActive: this._activatedMedia.has(item.path),
        selected: this.selectedIds.includes(item.id),
        tagChips: item.tags.map((tid) => tags.find((t) => t.id === tid)).filter(Boolean),
        colorHex: item.color ? (LABEL_COLORS.find((c) => c.id === item.color)?.hex ?? null) : null,
        typeIcon: fileIconSvg(item.type),
      };
    });

    if (!this._initialSelectDone) {
      this._initialSelectDone = true;
      const current = items.find((i) => !i.isFolder && i.path === this.request);
      if (current) {
        this.selectedIds = [current.id];
        items = items.map((i) => (i.id === current.id ? { ...i, selected: true } : i));
      }
    }
    this._lastItems = items;

    const rootLabel = this.activeSource === "public" ? "Public" : "Data";
    const crumbs = filtering
      ? [
          { name: rootLabel, path: "", nav: true },
          { name: L("Toolbar.TagResults"), path: "", nav: false },
        ]
      : buildCrumbs(this.target, rootLabel).map((c) => ({ ...c, nav: true }));

    const previewItem = this.#previewItem();
    const selectedCount = this.selectedIds.length;
    const isFolderPicker = this.type === "folder";
    const showSelect = !!(this.field || this.callback);

    return Object.assign(base, {
      items,
      emptyFolder: items.length === 0 && !filtering && !searching,
      noResults: items.length === 0 && (filtering || searching),
      filtering,
      search: this.searchQuery,
      crumbs,
      views: VIEW_MODES.map((v) => ({
        id: v,
        active: v === this.viewMode,
        icon: {
          grid: "fa-grip",
          list: "fa-list",
          compact: "fa-bars",
          portrait: "fa-image-portrait",
        }[v],
        label: L(`View.${v.charAt(0).toUpperCase()}${v.slice(1)}`),
      })),
      view: this.viewMode,
      sourcesList: ["data", "public"]
        .filter((s) => s in this.sources)
        .map((s) => ({
          id: s,
          label: s === "data" ? "Data" : "Public",
          active: s === this.activeSource,
        })),
      showCreateFolder: this.canCreateFolder && !filtering,
      showUpload: this.canUpload && !filtering,
      treeNodes: buildTreeNodes(this.treeCache, this.treeExpanded).map((n) => ({
        ...n,
        active: !filtering && n.path === this.target,
      })),
      favorites: computeFavorites(entries),
      recents: this.recents,
      tags: tags.map((t) => ({
        ...t,
        active: this.activeTagIds.includes(t.id),
        count: tagCounts[t.id] ?? 0,
      })),
      colorFilters: (() => {
        const colorCounts = computeColorCounts(
          entries,
          LABEL_COLORS.map((c) => c.id),
        );
        return LABEL_COLORS.map((c) => ({
          id: c.id,
          hex: c.hex,
          label: game.i18n.localize(c.labelKey),
          active: this.activeColorIds.includes(c.id),
          count: colorCounts[c.id] ?? 0,
        }));
      })(),
      labelColors: LABEL_COLORS,
      selectedCount,
      showBulk: selectedCount > 1,
      previewItem,
      previewColors: previewItem
        ? LABEL_COLORS.map((c) => ({ ...c, active: c.id === previewItem.color }))
        : [],
      previewProps: previewItem
        ? [
            { k: L("Properties.Type"), v: L(`Types.${previewItem.type}`) },
            { k: L("Properties.Source"), v: previewItem.source },
            { k: L("Properties.Path"), v: previewItem.path },
          ]
        : [],
      pvActions: this.#buildPreviewActions(previewItem),
      contextMenu: this.contextMenu,
      tagModal: this.#prepareTagModal(tags, tagCounts),
      toastText: this.toastText,
      accent: game.settings.get(MODULE_ID, SETTINGS.ACCENT_COLOR),
      previewOpen: this.previewOpen,
      phrase: this._phrase,
      statusCount: LF("Status.Count", { count: items.length }),
      statusSelected: selectedCount ? LF("Status.Selected", { count: selectedCount }) : "",
      showSelect,
      selectLabel: isFolderPicker ? L("Footer.SelectFolder") : L("Footer.SelectFile"),
      selectDisabled: !isFolderPicker && !(previewItem && !previewItem.isFolder),
    });
  }

  #buildPreviewActions(item) {
    if (!item || item.isFolder) return [];
    const actions = [];
    if (item.type === "image" || item.type === "video") {
      actions.push({ key: "tile", icon: "fa-object-group", label: L("Preview.ActionTile") });
    }
    if (["image", "video", "audio"].includes(item.type)) {
      const stopping = item.type === "audio" && isBroadcastingAudio(item.path);
      actions.push({
        key: "show",
        icon: stopping ? "fa-stop" : "fa-eye",
        label: stopping ? L("Preview.ActionStopAudio") : L("Preview.ActionShowPlayers"),
      });
    }
    actions.push({ key: "chat", icon: "fa-comment", label: L("Preview.ActionChat") });
    actions.push({ key: "whisper", icon: "fa-user-secret", label: L("Preview.ActionWhisper") });
    return actions;
  }

  static #dirsToTreeChildren(dirs) {
    return dirs.map((d) => {
      const last = d.split("/").pop() || d;
      let name;
      try {
        name = decodeURIComponent(last);
      } catch {
        name = last;
      }
      return { path: d, name };
    });
  }

  #prepareTagModal(tags, tagCounts) {
    if (!this.tagModal) return null;
    const assignItems = this.tagModal.assignItems;
    const assigning = !!assignItems?.length;
    const entries = getEntries();
    return {
      assigning,
      title: assigning ? L("TagModal.AssignTitle") : L("TagModal.Title"),
      rows: tags.map((t) => ({
        id: t.id,
        name: t.name,
        count: tagCounts[t.id] ?? 0,
        checked: assigning && assignItems.every((it) => entries[it.id]?.tags.includes(t.id)),
      })),
    };
  }

  #previewItem() {
    if (this.selectedIds.length !== 1) return null;
    return this._lastItems?.find((i) => i.id === this.selectedIds[0]) ?? null;
  }

  #contextItems() {
    const ids = this.contextMenu?.ids ?? [];
    return ids.map((id) => this._lastItems?.find((i) => i.id === id)).filter(Boolean);
  }

  #selectedItems() {
    return this.selectedIds.map((id) => this._lastItems?.find((i) => i.id === id)).filter(Boolean);
  }

  _onRender(context, options) {
    const parts = options.parts ?? Object.keys(this.constructor.PARTS);
    this.element.style.setProperty("--fm-accent", context.accent);
    if (parts.includes("toolbar")) this.#wireToolbar();
    if (parts.includes("sidebar")) this.#wireSidebar();
    if (parts.includes("main")) this.#wireMain();
    if (parts.includes("preview")) this.#wirePreview();
    if (parts.includes("overlays")) this.#wireOverlays();
  }

  #wireSidebar() {
    for (const el of this.element.querySelectorAll(".fm-tree-row[data-fav-id]")) {
      el.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.contextMenu = { ...this.#windowPoint(event), ids: [], favoriteId: el.dataset.favId };
        this.render({ parts: ["overlays"] });
      });
    }
  }

  #wireToolbar() {
    const searchInput = this.element.querySelector("input[name='search']");
    if (!searchInput) return;
    searchInput.addEventListener("input", (event) => {
      this.searchQuery = event.currentTarget.value;
      clearTimeout(this._searchDebounce);
      this._searchDebounce = setTimeout(() => {
        if (this.rendered) this.render({ parts: ["main", "statusbar"] });
      }, 150);
    });
  }

  #wireMain() {
    for (const el of this.element.querySelectorAll(".fm-item[data-item-id]")) {
      el.addEventListener("dblclick", (event) => this.#openItem(event, el.dataset.itemId));
      el.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#openItemContextMenu(event, el.dataset.itemId);
      });
      el.addEventListener("dragstart", (event) => {
        const item = this._lastItems?.find((i) => i.id === el.dataset.itemId);
        if (!item) return;
        const payload = { fmModule: MODULE_ID, fmSource: item.source, fmPath: item.path };
        if ((item.type === "image" || item.type === "video") && canvas?.ready) {
          Object.assign(payload, {
            type: "Tile",
            texture: { src: item.path },
            fromFilePicker: true,
            tileSize: canvas.dimensions?.size ?? 100,
          });
        }
        event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      });
    }

    const main = this.element.querySelector(".fm-main");
    if (main) {
      main.addEventListener("dragover", (event) => {
        if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
      });
      main.addEventListener("drop", (event) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (!files.length) return;
        event.preventDefault();
        this.#uploadFiles(files);
      });
      main.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.#openBackgroundContextMenu(event);
      });
    }
  }

  #wirePreview() {
    const item = this.#previewItem();
    if (this.#audio && this.#audioPath !== item?.path) this.#disposeAudio();
    const seek = this.element.querySelector(".fm-audio-seek");
    if (seek) {
      seek.addEventListener("input", () => {
        if (this.#audio?.duration) {
          this.#audio.currentTime = (Number(seek.value) / 1000) * this.#audio.duration;
        }
      });
    }
    this.#syncAudioUi();
  }

  #wireOverlays() {
    const newTagInput = this.element.querySelector("input[name='newTag']");
    if (newTagInput) {
      newTagInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        FileManagerApp.#onTagModalAdd.call(this, event, newTagInput);
      });
    }
  }

  #syncSelectionDom() {
    for (const el of this.element.querySelectorAll(".fm-item[data-item-id]")) {
      el.classList.toggle("selected", this.selectedIds.includes(el.dataset.itemId));
    }
  }

  static #onToggleAudio(event) {
    event.preventDefault();
    const item = this.#previewItem();
    if (!item || item.type !== "audio") return;
    if (!this.#audio || this.#audioPath !== item.path) {
      this.#disposeAudio();
      this.#audio = new Audio(item.path);
      this.#audioPath = item.path;
      this.#audio.addEventListener("timeupdate", () => this.#syncAudioUi());
      this.#audio.addEventListener("loadedmetadata", () => this.#syncAudioUi());
      this.#audio.addEventListener("ended", () => this.#syncAudioUi());
    }
    if (this.#audio.paused) this.#audio.play().catch((err) => ui.notifications.warn(err.message));
    else this.#audio.pause();
    this.#syncAudioUi();
  }

  #syncAudioUi() {
    const player = this.element?.querySelector(".fm-audio-player");
    if (!player) return;
    const a = this.#audio;
    const icon = player.querySelector(".fm-audio-toggle i");
    if (icon) icon.className = `fa-solid ${a && !a.paused ? "fa-pause" : "fa-play"}`;
    const seek = player.querySelector(".fm-audio-seek");
    if (seek && a?.duration && !seek.matches(":active")) {
      seek.value = String((a.currentTime / a.duration) * 1000);
    }
    const cur = player.querySelector(".fm-audio-cur");
    const dur = player.querySelector(".fm-audio-dur");
    if (cur) cur.textContent = formatTime(a?.currentTime ?? 0);
    if (dur) dur.textContent = formatTime(a?.duration ?? NaN);
  }

  #disposeAudio() {
    if (!this.#audio) return;
    this.#audio.pause();
    this.#audio.src = "";
    this.#audio = null;
    this.#audioPath = null;
  }

  #openItem(event, itemId) {
    event.preventDefault();
    const item = this._lastItems?.find((i) => i.id === itemId);
    if (!item) return;
    if (item.isFolder) {
      this.#navigateToItem(item);
      return;
    }
    this.#confirmSelection(item.path);
  }

  #confirmSelection(path) {
    if (!this.field && !this.callback) return;
    if (this.field) {
      this.field.value = path;
      this.field.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    }
    if (this.callback) this.callback(path, this);
    this.close();
  }

  static #onConfirmSelect(event) {
    event.preventDefault();
    if (this.type === "folder") {
      const single = this.#previewItem();
      this.#confirmSelection(single?.isFolder ? single.path : this.target);
      return;
    }
    const item = this.#previewItem();
    if (!item || item.isFolder) {
      this.#toast(L("Errors.NothingSelected"));
      return;
    }
    this.#confirmSelection(item.path);
  }

  #navigateToItem(item) {
    this.#resetFilters();
    this.#setSource(item.source);
    this.browse(item.path);
  }

  async browse(target = this.target, options = {}) {
    const result = await super.browse(target, options);
    this.#recordRecent();
    return result;
  }

  #recordRecent() {
    const path = this.result?.target;
    if (!path) return;
    this.recents = pushRecent(this.recents, { source: this.activeSource, path }, RECENT_FOLDERS_MAX);
    game.settings.set(MODULE_ID, SETTINGS.RECENT_FOLDERS, this.recents);
    if (this.rendered) this.render({ parts: ["sidebar"] });
  }

  #setSource(source) {
    if (!source || source === this.activeSource || !(source in this.sources)) return;
    this.activeSource = source;
    this.treeCache.clear();
    this.treeExpanded.clear();
  }

  #resetFilters() {
    this.activeTagIds = [];
    this.activeColorIds = [];
    this.searchQuery = "";
    this.selectedIds = [];
    this._anchorId = null;
    this._activatedMedia.clear();
  }

  #toast(text) {
    clearTimeout(this._toastTimeout);
    this.toastText = text;
    this.render({ parts: ["overlays"] });
    this._toastTimeout = setTimeout(() => {
      this.toastText = null;
      if (this.rendered) this.render({ parts: ["overlays"] });
    }, 2600);
  }

  async #withStore(fn, parts = METADATA_PARTS) {
    try {
      await fn();
    } catch (err) {
      console.error(`${MODULE_ID} |`, err);
      ui.notifications.error(err.message);
    }
    if (this.rendered) this.render({ parts });
  }

  async close(options) {
    clearTimeout(this._toastTimeout);
    clearTimeout(this._searchDebounce);
    this.#disposeAudio();
    return super.close(options);
  }

  static #onGoUp(event) {
    event.preventDefault();
    if (this.activeTagIds.length || this.activeColorIds.length || this.searchQuery) {
      this.#resetFilters();
      this.render();
      return;
    }
    const parts = this.target.split("/").filter(Boolean);
    parts.pop();
    this.selectedIds = [];
    this._activatedMedia.clear();
    this.browse(parts.join("/"));
  }

  static #onNavigate(event, target) {
    event.preventDefault();
    const el = target.closest("[data-path]") ?? target;
    this.#resetFilters();
    this.#setSource(el.dataset.source);
    this.browse(el.dataset.path ?? "");
  }

  static #onSwitchSource(event, target) {
    event.preventDefault();
    const source = target.closest("[data-source]").dataset.source;
    if (source === this.activeSource) return;
    this.#resetFilters();
    this.#setSource(source);
    this.browse("");
  }

  static #onSetView(event, target) {
    event.preventDefault();
    this.viewMode = target.closest("[data-view]").dataset.view;
    this.render({ parts: ["main", "toolbar"] });
  }

  static #onSelectItem(event, target) {
    event.preventDefault();
    const id = target.closest("[data-item-id]").dataset.itemId;
    const order = (this._lastItems ?? []).map((i) => i.id);
    if (event.ctrlKey || event.metaKey) {
      this.selectedIds = this.selectedIds.includes(id)
        ? this.selectedIds.filter((x) => x !== id)
        : [...this.selectedIds, id];
      this._anchorId = id;
    } else if (event.shiftKey && this._anchorId && order.includes(this._anchorId)) {
      const a = order.indexOf(this._anchorId);
      const b = order.indexOf(id);
      this.selectedIds = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    } else {
      this.selectedIds = [id];
      this._anchorId = id;
    }
    this.#syncSelectionDom();
    this.render({ parts: ["preview", "statusbar", "overlays"] });
  }

  static #onClearSelection(event) {
    event.preventDefault();
    this.selectedIds = [];
    this._anchorId = null;
    this.#syncSelectionDom();
    this.render({ parts: ["preview", "statusbar", "overlays"] });
  }

  static #onTogglePreview(event) {
    event.preventDefault();
    this.previewOpen = !this.previewOpen;
    game.settings.set(MODULE_ID, SETTINGS.PREVIEW_OPEN, this.previewOpen);
    this.render({ parts: ["preview", "toolbar"] });
  }

  static #onPhraseClick(event) {
    event.preventDefault();
    const url = foundry.utils.escapeHTML(DISCORD_URL);
    foundry.applications.api.DialogV2.confirm({
      window: { title: "FILE_MANAGER_DUNGEONS_LAB.Discord.Title", icon: "fa-brands fa-discord" },
      content: `<p>${L("Discord.Content")}</p>
        <p><a href="${url}" target="_blank" rel="noopener">${url}</a></p>`,
      yes: {
        label: "FILE_MANAGER_DUNGEONS_LAB.Discord.Open",
        icon: "fa-brands fa-discord",
        default: true,
        callback: () => window.open(DISCORD_URL, "_blank", "noopener"),
      },
      no: { label: "FILE_MANAGER_DUNGEONS_LAB.Dialog.Cancel" },
    });
  }

  static #onClearFilters(event) {
    event.preventDefault();
    this.#resetFilters();
    this.render();
  }

  static #onToggleTagFilter(event, target) {
    event.preventDefault();
    const tagId = target.closest("[data-tag-id]").dataset.tagId;
    this.activeTagIds = this.activeTagIds.includes(tagId)
      ? this.activeTagIds.filter((t) => t !== tagId)
      : [...this.activeTagIds, tagId];
    this.selectedIds = [];
    this._anchorId = null;
    this.render();
  }

  static #onToggleColorFilter(event, target) {
    event.preventDefault();
    const colorId = target.closest("[data-color-id]").dataset.colorId;
    this.activeColorIds = this.activeColorIds.includes(colorId)
      ? this.activeColorIds.filter((c) => c !== colorId)
      : [...this.activeColorIds, colorId];
    this.selectedIds = [];
    this._anchorId = null;
    this.render();
  }

  static async #onExpandTreeNode(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const path = target.closest("[data-tree-path]").dataset.treePath;
    if (this.treeExpanded.has(path)) {
      this.treeExpanded.delete(path);
    } else {
      this.treeExpanded.add(path);
      if (!this.treeCache.has(path)) {
        try {
          const result = await this.constructor.browse(this.activeSource, path);
          this.treeCache.set(path, FileManagerApp.#dirsToTreeChildren(result.dirs));
        } catch {
          this.treeCache.set(path, []);
        }
      }
    }
    this.render({ parts: ["sidebar"] });
  }

  static #onToggleMedia(event, target) {
    event.preventDefault();
    const el = target.closest("[data-item-id]");
    const item = this._lastItems?.find((i) => i.id === el?.dataset.itemId);
    if (!item) return;
    if (this._activatedMedia.has(item.path)) this._activatedMedia.delete(item.path);
    else this._activatedMedia.add(item.path);
    this.render({ parts: ["main"] });
  }

  static async #onNewFolder(event) {
    event.preventDefault();
    if (this.contextMenu) {
      this.contextMenu = null;
      this.render({ parts: ["overlays"] });
    }
    if (!this.canCreateFolder) return;
    const label = L("NewFolderDialog.Label");
    const content = `<div class="form-group"><label>${label}</label>
      <div class="form-fields"><input type="text" name="dirname" required autofocus></div></div>`;
    await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "FILE_MANAGER_DUNGEONS_LAB.NewFolderDialog.Title",
        icon: "fa-solid fa-folder-plus",
      },
      content,
      yes: {
        label: "FILE_MANAGER_DUNGEONS_LAB.Dialog.Create",
        default: true,
        callback: async (ev) => {
          const dirname = ev.currentTarget.querySelector("input[name='dirname']")?.value.trim();
          if (!dirname) return;
          const path = [this.target, dirname].filter(Boolean).join("/");
          try {
            await this.constructor.createDirectory(this.activeSource, path, {
              bucket: this.source.bucket,
            });
          } catch (err) {
            ui.notifications.error(err.message);
            return;
          }
          await this.constructor.browse(this.activeSource, path).catch(() => {});
          this.treeCache.delete(this.target);
          this.#resetFilters();
          this.browse(path);
        },
      },
      no: { label: "FILE_MANAGER_DUNGEONS_LAB.Dialog.Cancel" },
    });
  }

  static #onUploadClick(event) {
    event.preventDefault();
    if (this.contextMenu) {
      this.contextMenu = null;
      this.render({ parts: ["overlays"] });
    }
    if (!this.canUpload) return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.addEventListener("change", () => {
      if (input.files.length) this.#uploadFiles([...input.files]);
    });
    input.click();
  }

  #extensionAllowed(name) {
    if (!this.extensions?.length) return true;
    const lower = name.toLowerCase();
    return this.extensions.some((ext) => lower.endsWith(ext));
  }

  async #uploadFiles(files) {
    if (!this.canUpload || this.activeTagIds.length || this.activeColorIds.length) return;
    for (const file of files) {
      if (!this.#extensionAllowed(file.name)) {
        ui.notifications.error(LF("Errors.BadExtension", { name: file.name }));
        continue;
      }
      const response = await this.constructor.upload(this.activeSource, this.target, file, {
        bucket: this.source.bucket,
      });
      if (response?.error) {
        ui.notifications.error(response.error);
        continue;
      }
      if (response?.path) this.request = response.path;
    }
    this.browse(this.target);
  }

  static async #onSetColor(event, target) {
    event.preventDefault();
    const color = target.closest("[data-color]").dataset.color || null;
    const item = this.#previewItem();
    if (!item) return;
    await this.#withStore(() => setEntryFieldsForItems([item], { color }));
  }

  static async #onCtxSetColor(event, target) {
    event.preventDefault();
    const color = target.closest("[data-color]").dataset.color || null;
    const items = this.#contextItems();
    this.contextMenu = null;
    if (!items.length) return this.render({ parts: ["overlays"] });
    await this.#withStore(() => setEntryFieldsForItems(items, { color }));
  }

  static async #onBulkSetColor(event, target) {
    event.preventDefault();
    const color = target.closest("[data-color]").dataset.color || null;
    const items = this.#selectedItems();
    if (!items.length) return;
    await this.#withStore(() => setEntryFieldsForItems(items, { color }));
  }

  static async #onCtxUnfavorite(event) {
    event.preventDefault();
    const key = this.contextMenu?.favoriteId;
    this.contextMenu = null;
    if (!key) return this.render({ parts: ["overlays"] });
    const { source, path } = parseKey(key);
    const name = path.split("/").pop() || path;
    await this.#withStore(() =>
      setEntryFieldsForItems([{ id: key, source, path, name, isFolder: true }], {
        favorite: false,
      }),
    );
  }

  static async #onToggleFavorite(event) {
    event.preventDefault();
    const [item] = this.#contextItems();
    this.contextMenu = null;
    if (!item?.isFolder) return this.render({ parts: ["overlays"] });
    await this.#withStore(() => setEntryFieldsForItems([item], { favorite: !item.favorite }));
  }

  #openTagModal(items) {
    this.tagModal = {
      assignItems: items
        ? items.map((i) => ({
            id: i.id,
            source: i.source,
            path: i.path,
            name: i.name,
            isFolder: i.isFolder,
          }))
        : null,
    };
    this.render({ parts: ["overlays"] });
  }

  static #onEditTags(event) {
    event.preventDefault();
    const items = this.#selectedItems();
    if (items.length) this.#openTagModal(items);
  }

  static #onCtxEditTags(event) {
    event.preventDefault();
    const items = this.#contextItems();
    this.contextMenu = null;
    if (items.length) this.#openTagModal(items);
    else this.render({ parts: ["overlays"] });
  }

  static #onBulkOpenTagModal(event) {
    event.preventDefault();
    const items = this.#selectedItems();
    if (items.length) this.#openTagModal(items);
  }

  static #onOpenTagManager(event) {
    event.preventDefault();
    this.#openTagModal(null);
  }

  static #onCloseTagModal(event) {
    event.preventDefault();
    this.tagModal = null;
    this.render({ parts: ["overlays"] });
  }

  static async #onTagModalToggle(event, target) {
    event.preventDefault();
    const tagId = target.closest("[data-tag-id]").dataset.tagId;
    const items = this.tagModal?.assignItems ?? [];
    if (!items.length) return;
    const entries = getEntries();
    const allTagged = items.every((it) => entries[it.id]?.tags.includes(tagId));
    await this.#withStore(() => setTagOnItems(items, tagId, !allTagged));
  }

  static async #onTagModalAdd(event, target) {
    event.preventDefault();
    const input =
      target?.name === "newTag" ? target : this.element.querySelector("input[name='newTag']");
    const name = input?.value.trim();
    if (!name) return;
    await this.#withStore(async () => {
      const tags = getTags();
      tags.push({ id: `tag-${foundry.utils.randomID(8)}`, name });
      await setTags(tags);
      input.value = "";
    });
  }

  static async #onTagModalRename(event, target) {
    event.preventDefault();
    const tagId = target.closest("[data-tag-id]").dataset.tagId;
    const tags = getTags();
    const tag = tags.find((t) => t.id === tagId);
    if (!tag) return;
    const content = `<div class="form-group"><div class="form-fields">
      <input type="text" name="name" value="${foundry.utils.escapeHTML(tag.name)}" required autofocus>
      </div></div>`;
    await foundry.applications.api.DialogV2.confirm({
      window: { title: "FILE_MANAGER_DUNGEONS_LAB.TagModal.RenameTitle" },
      content,
      yes: {
        label: "FILE_MANAGER_DUNGEONS_LAB.Dialog.Save",
        default: true,
        callback: async (ev) => {
          const name = ev.currentTarget.querySelector("input[name='name']")?.value.trim();
          if (!name) return;
          tag.name = name;
          await this.#withStore(() => setTags(tags));
        },
      },
      no: { label: "FILE_MANAGER_DUNGEONS_LAB.Dialog.Cancel" },
    });
  }

  static async #onTagModalDelete(event, target) {
    event.preventDefault();
    const tagId = target.closest("[data-tag-id]").dataset.tagId;
    this.activeTagIds = this.activeTagIds.filter((t) => t !== tagId);
    await this.#withStore(() => deleteTag(tagId));
  }

  #windowPoint(event) {
    const content = this.element.querySelector(".fm-window-content") ?? this.element;
    const rect = content.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(event.clientX - rect.left, rect.width - 230)),
      y: Math.max(0, Math.min(event.clientY - rect.top, rect.height - 240)),
    };
  }

  #openItemContextMenu(event, itemId) {
    const ids = this.selectedIds.includes(itemId) ? this.selectedIds : [itemId];
    this.selectedIds = ids;
    this.#syncSelectionDom();
    const single = ids.length === 1 ? this._lastItems?.find((i) => i.id === ids[0]) : null;
    this.contextMenu = {
      ...this.#windowPoint(event),
      ids,
      background: false,
      singleFolder: !!single?.isFolder,
      favoriteLabel: single?.favorite ? L("Context.Unfavorite") : L("Context.Favorite"),
      actions: ids.length === 1 ? this.#buildPreviewActions(single) : [],
    };
    this.render({ parts: ["overlays", "preview", "statusbar"] });
  }

  #openBackgroundContextMenu(event) {
    const filtering = this.activeTagIds.length || this.activeColorIds.length;
    if (filtering || (!this.canCreateFolder && !this.canUpload)) return;
    this.selectedIds = [];
    this.#syncSelectionDom();
    this.contextMenu = { ...this.#windowPoint(event), ids: [], background: true };
    this.render({ parts: ["overlays", "preview", "statusbar"] });
  }

  static #onCloseContextMenu(event) {
    event.preventDefault();
    this.contextMenu = null;
    this.render({ parts: ["overlays"] });
  }

  static #onCtxOpen(event) {
    event.preventDefault();
    const [item] = this.#contextItems();
    this.contextMenu = null;
    if (item?.isFolder) this.#navigateToItem(item);
    else this.render({ parts: ["overlays"] });
  }

  async #runFoundryAction(key, item) {
    const handlers = {
      tile: placeTile,
      show: showToPlayers,
      chat: sendToChat,
      whisper: whisperToUser,
    };
    try {
      const message = await handlers[key]?.(item);
      this.render({ parts: ["preview"] });
      if (message) this.#toast(message);
    } catch (err) {
      ui.notifications.warn(err.message);
    }
  }

  static async #onPreviewAction(event, target) {
    event.preventDefault();
    const key = target.closest("[data-action-key]").dataset.actionKey;
    const item = this.#previewItem();
    if (!item) return;
    await this.#runFoundryAction(key, item);
  }

  static async #onCtxPreviewAction(event, target) {
    event.preventDefault();
    const key = target.closest("[data-action-key]").dataset.actionKey;
    const [item] = this.#contextItems();
    this.contextMenu = null;
    this.render({ parts: ["overlays"] });
    if (!item) return;
    await this.#runFoundryAction(key, item);
  }
}
