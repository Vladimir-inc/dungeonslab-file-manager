import {
  MODULE_ID,
  LABEL_COLORS,
  VIEW_MODES,
  SETTINGS,
  RECENT_FOLDERS_MAX,
  SOURCE_LABELS,
} from "../constants.mjs";
import { parseKey, keyFor } from "../data/metadata-ops.mjs";
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
  decodePath,
  normalizePathInput,
  splitParent,
  buildQuickJumpIndex,
  filterQuickJump,
} from "../data/browse-ops.mjs";
import { canConvertToWebp, webpName, resolveCollision } from "../data/convert-ops.mjs";
import {
  placeTile,
  showToPlayers,
  sendToChat,
  whisperToUser,
  isBroadcastingAudio,
} from "./foundry-actions.mjs";

const { FilePicker } = foundry.applications.apps;

const METADATA_PARTS = ["main", "sidebar", "preview", "overlays"];

const VIEW_ICONS = {
  grid: "fa-grip",
  list: "fa-list",
  compact: "fa-bars",
  portrait: "fa-image-portrait",
};

// полный индекс палитры: на уровне модуля, чтобы все окна менеджера делили один обход
const FULL_INDEX = {};

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// picks a friendly name for a source, falls back to whatever Foundry gave it so nothing ever shows blank
function sourceLabel(id) {
  return SOURCE_LABELS[id] ?? id;
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
      editPath: FileManagerApp.#onEditPath,
      switchTab: FileManagerApp.#onSwitchTab,
      addTab: FileManagerApp.#onAddTab,
      closeTab: FileManagerApp.#onCloseTab,
      toggleSplit: FileManagerApp.#onToggleSplit,
      closeSplit: FileManagerApp.#onCloseSplit,
      splitNavigate: FileManagerApp.#onSplitNavigate,
      swapPanes: FileManagerApp.#onSwapPanes,
      toggleSplitDir: FileManagerApp.#onToggleSplitDir,
      openPalette: FileManagerApp.#onOpenPalette,
      closePalette: FileManagerApp.#onClosePalette,
      paletteGo: FileManagerApp.#onPaletteGo,
      switchSource: FileManagerApp.#onSwitchSource,
      setView: FileManagerApp.#onSetView,
      toggleViewMenu: FileManagerApp.#onToggleViewMenu,
      closeViewMenu: FileManagerApp.#onCloseViewMenu,
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
      tagModalMove: FileManagerApp.#onTagModalMove,
      copyPath: FileManagerApp.#onCopyPath,
      closeContextMenu: FileManagerApp.#onCloseContextMenu,
      ctxOpen: FileManagerApp.#onCtxOpen,
      previewAction: FileManagerApp.#onPreviewAction,
      ctxPreviewAction: FileManagerApp.#onCtxPreviewAction,
      ctxConvertWebp: FileManagerApp.#onCtxConvertWebp,
      clearSelection: FileManagerApp.#onClearSelection,
      togglePreview: FileManagerApp.#onTogglePreview,
      phraseClick: FileManagerApp.#onPhraseClick,
    },
  };

  static PARTS = {
    tabs: { template: `modules/${MODULE_ID}/templates/parts/tabs.hbs` },
    toolbar: { template: `modules/${MODULE_ID}/templates/parts/toolbar.hbs` },
    sidebar: { template: `modules/${MODULE_ID}/templates/parts/sidebar.hbs`, scrollable: [""] },
    main: {
      template: `modules/${MODULE_ID}/templates/parts/main.hbs`,
      // item.hbs подгружается как partial - им рендерятся плитки обеих панелей
      templates: [`modules/${MODULE_ID}/templates/parts/item.hbs`],
      scrollable: [".fm-pane-primary", ".fm-pane-secondary"],
    },
    preview: { template: `modules/${MODULE_ID}/templates/parts/preview.hbs`, scrollable: [""] },
    statusbar: { template: `modules/${MODULE_ID}/templates/parts/statusbar.hbs` },
    overlays: { template: `modules/${MODULE_ID}/templates/parts/overlays.hbs` },
  };

  get title() {
    return L("Title");
  }

  // Forge's Bazaar and read-only asset buckets reject folder creation like they reject uploads, so on
  // Forge sources gate New Folder on upload permission (which the Forge picker computes) not the raw flag.
  get canMakeFolder() {
    if (["forgevtt", "forge-bazaar"].includes(this.activeSource)) return this.canUpload;
    return this.canCreateFolder;
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
    this.tabs = [];
    this.activeTabIndex = 0;
    this.pathEditing = false;
    this.splitOpen = false;
    this.splitSource = null;
    this.splitTarget = "";
    this.splitResult = null;
    this.splitDir = "row";
    this.activePane = 1;
    this.palette = null;
    this.viewMenuOpen = false;
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

    let items = this.#decorateItems(sortItems(filterBySearch(raw, this.searchQuery), locale), tags);

    if (!this._initialSelectDone) {
      this._initialSelectDone = true;
      const current = items.find((i) => !i.isFolder && i.path === this.request);
      if (current) {
        this.selectedIds = [current.id];
        items = items.map((i) => (i.id === current.id ? { ...i, selected: true } : i));
      }
    }

    // вкладки следуют за активной папкой - синхронизируем на каждой перерисовке
    const currentTab = {
      source: this.activeSource,
      target: this.result?.target ?? this.target ?? "",
    };
    if (!this.tabs.length) this.tabs = [currentTab];
    else this.tabs[this.activeTabIndex] = currentTab;

    let splitItems = [];
    let splitCrumbs = [];
    if (this.splitOpen && this.splitResult) {
      // id получают панельный префикс, чтобы выделение/медиа/превью не дублировались между
      // панелями, когда обе показывают одну папку; ключ хранилища метаданных - из source/path
      splitItems = this.#decorateItems(
        sortItems(
          filterByExtensions(
            buildFolderItems(this.splitResult, entries, this.splitSource),
            this.extensions,
          ),
          locale,
        ).map((item) => ({ ...item, id: `2|${item.id}`, pane: 2 })),
        tags,
      );
      splitCrumbs = buildCrumbs(this.splitTarget, sourceLabel(this.splitSource));
    }
    this._lastItems = [...items, ...splitItems];

    const rootLabel = sourceLabel(this.activeSource);
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
      pathEditing: this.pathEditing,
      pathValue: decodePath(this.result?.target ?? this.target ?? ""),
      tabs: this.tabs.map((t, i) => ({
        index: i,
        label: buildCrumbs(t.target, sourceLabel(t.source)).at(-1).name,
        active: i === this.activeTabIndex,
        dot: this.#folderDot(entries, t.source, t.target),
      })),
      showTabClose: this.tabs.length > 1,
      splitOpen: this.splitOpen,
      splitDir: this.splitDir,
      splitVertical: this.splitDir === "row",
      splitItems,
      splitCrumbs,
      paneOneActive: this.activePane !== 2,
      paneOneDot: this.#folderDot(entries, this.activeSource, this.result?.target ?? this.target),
      paneOneCount: LF("Status.Count", { count: items.length }),
      splitDot: this.#folderDot(entries, this.splitSource, this.splitTarget),
      splitCount: LF("Status.Count", { count: splitItems.length }),
      statusPane: this.splitOpen ? this.#activePaneStatus(splitCrumbs) : "",
      palette: this.#preparePalette(entries),
      views: VIEW_MODES.map((v) => ({
        id: v,
        active: v === this.viewMode,
        icon: VIEW_ICONS[v],
        label: L(`View.${v.charAt(0).toUpperCase()}${v.slice(1)}`),
      })),
      view: this.viewMode,
      viewMenuOpen: this.viewMenuOpen,
      currentView: {
        icon: VIEW_ICONS[this.viewMode],
        label: L(`View.${this.viewMode.charAt(0).toUpperCase()}${this.viewMode.slice(1)}`),
      },
      // used to just be data/public, now it lists whatever sources Foundry actually gives us (Forge included)
      sourcesList: Object.keys(this.sources).map((s) => ({
        id: s,
        label: sourceLabel(s),
        active: s === this.activeSource,
      })),
      showCreateFolder: this.canMakeFolder && !filtering,
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
            { k: L("Properties.Path"), v: previewItem.path, copy: true },
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

  #decorateItems(items, tags) {
    return items.map((item) => {
      const isGif = item.type === "image" && item.path.toLowerCase().endsWith(".gif");
      return {
        ...item,
        isImage: item.type === "image" && !isGif,
        isAudio: item.type === "audio",
        isVideo: item.type === "video",
        isGif,
        needsActivation: item.type === "video" || isGif,
        mediaActive: this._activatedMedia.has(item.id),
        selected: this.selectedIds.includes(item.id),
        tagChips: item.tags.map((tid) => tags.find((t) => t.id === tid)).filter(Boolean),
        colorHex: item.color ? (LABEL_COLORS.find((c) => c.id === item.color)?.hex ?? null) : null,
        typeIcon: fileIconSvg(item.type),
      };
    });
  }

  // цвет метки папки для точек на вкладках и в заголовках панелей
  #folderDot(entries, source, target) {
    const entry = entries[keyFor(source ?? "", target ?? "")];
    const hex = entry?.color ? LABEL_COLORS.find((c) => c.id === entry.color)?.hex : null;
    return hex ?? "#6b7d96";
  }

  #activePaneStatus(splitCrumbs) {
    const name =
      this.activePane === 2
        ? (splitCrumbs.at(-1)?.name ?? "")
        : buildCrumbs(this.result?.target ?? this.target ?? "", sourceLabel(this.activeSource)).at(
            -1,
          ).name;
    return LF("Status.ActivePane", { pane: this.activePane, name });
  }

  // слитый корпус (известные места + полный индекс) кешируется и пересобирается только
  // когда сменился источник или индексатор дописал новую пачку
  #syncPaletteCorpus(entries = getEntries()) {
    const full = FULL_INDEX[this.activeSource];
    const gen = full?.gen ?? -1;
    if (
      this._paletteCorpus &&
      this._paletteCorpus.source === this.activeSource &&
      this._paletteCorpus.gen === gen
    ) {
      return;
    }
    const index = buildQuickJumpIndex({
      treeFolders: [...this.treeCache.values()].flat(),
      entries,
      favorites: computeFavorites(entries),
      recents: this.recents,
      source: this.activeSource,
    });
    if (full) {
      const seen = new Set(index.map((e) => keyFor(e.source, e.path)));
      for (const e of [...full.folders, ...full.files]) {
        if (!seen.has(keyFor(e.source, e.path))) index.push(e);
      }
    }
    this._paletteCorpus = { source: this.activeSource, gen, list: index };
    this._paletteResultsQuery = null;
  }

  #computePaletteResults(value) {
    if (!this.palette) return;
    this.palette.query = value;
    this.#syncPaletteCorpus();
    if (this._paletteResultsQuery === value && this._paletteResults) return;
    this._paletteResults = filterQuickJump(this._paletteCorpus.list, value, 10);
    this._paletteResultsQuery = value;
    this.palette.sel = Math.min(this.palette.sel, Math.max(0, this._paletteResults.length - 1));
  }

  #paletteGroupLabel(results) {
    return this.palette.query.trim()
      ? LF("Palette.Matches", { count: results.length })
      : L("Palette.Recent");
  }

  #preparePalette(entries) {
    if (!this.palette) return null;
    this.#syncPaletteCorpus(entries);
    this.#computePaletteResults(this.palette.query);
    const results = this._paletteResults ?? [];
    return {
      query: this.palette.query,
      groupLabel: this.#paletteGroupLabel(results),
      hasResults: results.length > 0,
      results: results.map((r, i) => ({
        index: i,
        name: r.name,
        isFolder: r.isFolder !== false,
        displayPath: `${sourceLabel(r.source)} › ${decodePath(r.path) || "/"}`,
        active: i === this.palette.sel,
      })),
    };
  }

  // список результатов обновляется точечной пересборкой строк, без ререндера части:
  // поле ввода не пересоздаётся, поэтому никаких бликов при наборе и фоновой индексации
  #renderPaletteResults() {
    const body = this.element?.querySelector(".fm-palette-body");
    if (!body || !this.palette) return;
    const results = this._paletteResults ?? [];
    body.replaceChildren();
    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "fm-palette-empty";
      const title = document.createElement("div");
      title.textContent = L("Palette.NoResults");
      const hint = document.createElement("span");
      hint.textContent = L("Palette.NoResultsHint");
      empty.append(title, hint);
      body.append(empty);
      return;
    }
    const group = document.createElement("div");
    group.className = "fm-palette-group";
    group.textContent = this.#paletteGroupLabel(results);
    body.append(group);
    results.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = `fm-palette-row${i === this.palette.sel ? " active" : ""}`;
      row.dataset.action = "paletteGo";
      row.dataset.index = String(i);
      const icon = document.createElement("i");
      icon.className = `fa-solid ${r.isFolder === false ? "fa-file" : "fa-folder"}`;
      const text = document.createElement("div");
      text.className = "fm-palette-text";
      const name = document.createElement("span");
      name.className = "fm-palette-name";
      name.textContent = r.name;
      const path = document.createElement("span");
      path.className = "fm-palette-path";
      path.textContent = `${sourceLabel(r.source)} › ${decodePath(r.path) || "/"}`;
      text.append(name, path);
      const enter = document.createElement("span");
      enter.className = "fm-palette-enter";
      enter.textContent = "↵";
      row.append(icon, text, enter);
      row.addEventListener("mouseenter", () => {
        if (!this.palette) return;
        this.palette.sel = i;
        this.#syncPaletteSel();
      });
      body.append(row);
    });
  }

  // вызывается снаружи из хоткея Ctrl+P, поэтому метод публичный
  openQuickJump() {
    this.palette = { query: "", sel: 0 };
    this._paletteCorpus = null; // недавние/избранное могли измениться с прошлого открытия
    this.constructor.warmQuickJumpIndex(this.activeSource);
    this.render({ parts: ["overlays"] });
  }

  // фоновый обход источника: один раз за сессию, общий для всех окон менеджера, запускается
  // на старте мира. Пачки маленькие и с паузой, чтобы не напрягать сервер; потолок 2500 папок.
  // ponytail: сверх потолка индекс остаётся частичным, недостающее доезжает через недавние/дерево
  static async warmQuickJumpIndex(source = "data") {
    if (FULL_INDEX[source]) return;
    const state = { folders: [], files: [], dirs: 0, gen: 0, done: false };
    FULL_INDEX[source] = state;
    const MAX_DIRS = 2500;
    const queue = [""];
    const seen = new Set(queue);
    while (queue.length && state.dirs < MAX_DIRS) {
      const batch = queue.splice(0, 4);
      const results = await Promise.all(
        batch.map((dir) => this.browse(source, dir).catch(() => null)),
      );
      for (const result of results) {
        if (!result) continue;
        state.dirs += 1;
        for (const d of result.dirs ?? []) {
          if (seen.has(d)) continue;
          seen.add(d);
          queue.push(d);
          state.folders.push({
            source,
            path: d,
            name: decodePath(d.split("/").pop() || d),
            isFolder: true,
          });
        }
        for (const f of result.files ?? []) {
          state.files.push({
            source,
            path: f,
            name: decodePath(f.split("/").pop() || f),
            isFolder: false,
          });
        }
      }
      state.gen += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    state.done = true;
  }

  #closePalette() {
    if (!this.palette) return;
    clearTimeout(this._paletteDebounce);
    this.palette = null;
    this.render({ parts: ["overlays"] });
  }

  async #paletteGo(index, { newTab = false } = {}) {
    const r = this._paletteResults?.[index];
    if (!r) return;
    this.palette = null;
    this.render({ parts: ["overlays"] });
    // для файла открываем родительскую папку и выделяем его
    const isFile = r.isFolder === false;
    const target = isFile ? splitParent(r.path).parent : r.path;
    if (newTab) {
      this.tabs.push({ source: r.source, target });
      this.activeTabIndex = this.tabs.length - 1;
    }
    this.#resetFilters();
    this.#setSource(r.source);
    await this.browse(target);
    if (isFile) {
      const match = this._lastItems?.find((i) => i.id === keyFor(r.source, r.path));
      if (match) {
        this.selectedIds = [match.id];
        this._anchorId = match.id;
        this.#syncSelectionDom();
        this.render({ parts: ["preview", "statusbar", "overlays"] });
      }
    }
  }

  // подсветка строки палитры при наведении - без ререндера, чтобы не дёргать мышь
  #syncPaletteSel() {
    for (const row of this.element.querySelectorAll(".fm-palette-row[data-index]")) {
      row.classList.toggle("active", Number(row.dataset.index) === this.palette?.sel);
    }
  }

  static #onOpenPalette(event) {
    event.preventDefault();
    this.openQuickJump();
  }

  static #onClosePalette(event) {
    event.preventDefault();
    this.#closePalette();
  }

  static #onPaletteGo(event, target) {
    event.preventDefault();
    this.#paletteGo(Number(target.closest("[data-index]").dataset.index));
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
      return { path: d, name: decodePath(last) };
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
    if (this.contextMenu?.treeItem) return [this.contextMenu.treeItem];
    const ids = this.contextMenu?.ids ?? [];
    return ids.map((id) => this._lastItems?.find((i) => i.id === id)).filter(Boolean);
  }

  #selectedItems() {
    return this.selectedIds.map((id) => this._lastItems?.find((i) => i.id === id)).filter(Boolean);
  }

  _onRender(context, options) {
    const parts = options.parts ?? Object.keys(this.constructor.PARTS);
    this.element.style.setProperty("--fm-accent", context.accent);
    if (parts.includes("tabs")) this.#wireTabs();
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
    for (const el of this.element.querySelectorAll(".fm-tree-row[data-tree-path]")) {
      el.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#openTreeContextMenu(event, el.dataset.treePath);
      });
    }

    // папки сайдбара (избранное, недавние, дерево) принимают drop так же, как плитки папок
    for (const el of this.element.querySelectorAll(
      ".fm-tree-row[data-path], .fm-tree-row[data-tree-path]",
    )) {
      const dest = {
        source: el.dataset.source ?? this.activeSource,
        target: el.dataset.path ?? el.dataset.treePath,
      };
      el.addEventListener("dragover", (event) => {
        if (!this.#dropAccepts(event, dest)) return;
        event.preventDefault();
        el.classList.add("is-drop-target");
      });
      el.addEventListener("dragleave", () => el.classList.remove("is-drop-target"));
      el.addEventListener("drop", (event) => {
        el.classList.remove("is-drop-target");
        this.#dropOnDest(event, dest);
      });
    }
  }

  // ПКМ по папке в дереве сайдбара: собираем синтетический item, дальше работает обычное меню
  #openTreeContextMenu(event, path) {
    const source = this.activeSource;
    const entry = getEntries()[keyFor(source, path)];
    const item = {
      id: keyFor(source, path),
      source,
      path,
      name: decodePath(path.split("/").pop() || path),
      isFolder: true,
      favorite: !!entry?.favorite,
      color: entry?.color ?? null,
      tags: entry?.tags ?? [],
    };
    this.contextMenu = {
      ...this.#windowPoint(event),
      ids: [],
      treeItem: item,
      background: false,
      singleFolder: true,
      favoriteLabel: item.favorite ? L("Context.Unfavorite") : L("Context.Favorite"),
      actions: [],
    };
    this.render({ parts: ["overlays"] });
  }

  #clearTabHover() {
    clearTimeout(this._tabHoverTimer);
    this._tabHoverTimer = null;
  }

  // drag&drop на вкладки: задержка наведения переключает вкладку (spring-loaded, как в проводнике),
  // drop заливает файлы с диска или копирует внутренний файл в папку вкладки
  #wireTabs() {
    for (const tab of this.element.querySelectorAll(".fm-tab[data-tabid]")) {
      const index = Number(tab.dataset.tabid);
      tab.addEventListener("dragover", (event) => {
        const hasFiles = event.dataTransfer?.types?.includes("Files");
        const internal = !!this._dragItem && !this._dragItem.isFolder;
        if (!hasFiles && !internal) return;
        event.preventDefault();
        tab.classList.add("is-drop");
        if (index !== this.activeTabIndex && !this._tabHoverTimer) {
          this._tabHoverTimer = setTimeout(() => {
            this._tabHoverTimer = null;
            this.#switchToTab(index);
          }, 600);
        }
      });
      tab.addEventListener("dragleave", () => {
        tab.classList.remove("is-drop");
        this.#clearTabHover();
      });
      tab.addEventListener("drop", (event) => {
        tab.classList.remove("is-drop");
        this.#clearTabHover();
        const dest = this.tabs[index];
        if (!dest) return;
        this.#dropOnDest(event, { source: dest.source, target: dest.target });
      });
    }
  }

  #wireToolbar() {
    const pathInput = this.element.querySelector("input[name='pathInput']");
    if (pathInput) {
      pathInput.focus();
      pathInput.select();
      pathInput.addEventListener("keydown", (event) => {
        // stopPropagation, иначе Escape закроет всё окно, а Enter уйдёт форме
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          this.#goToPath(pathInput.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.#cancelPathEdit();
        }
      });
      pathInput.addEventListener("blur", () => this.#cancelPathEdit());
    }
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
        this._dragItem = {
          path: item.path,
          source: item.source,
          pane: item.pane ?? 1,
          isFolder: item.isFolder,
        };
      });
      el.addEventListener("dragend", () => {
        this._dragItem = null;
        for (const n of this.element.querySelectorAll(".is-drop, .is-drop-target")) {
          n.classList.remove("is-drop", "is-drop-target");
        }
      });

      // плитка папки - самостоятельная drop-цель: бросил файл на папку - скопировал в неё
      const tileItem = this._lastItems?.find((i) => i.id === el.dataset.itemId);
      if (tileItem?.isFolder) {
        const dest = { source: tileItem.source, target: tileItem.path };
        el.addEventListener("dragover", (event) => {
          if (!this.#dropAccepts(event, dest)) return;
          event.preventDefault();
          event.stopPropagation();
          el.classList.add("is-drop-target");
        });
        el.addEventListener("dragleave", () => el.classList.remove("is-drop-target"));
        el.addEventListener("drop", (event) => {
          el.classList.remove("is-drop-target");
          this.#dropOnDest(event, dest);
        });
      }
    }

    for (const pane of this.element.querySelectorAll(".fm-pane")) {
      const paneNum = Number(pane.dataset.pane);
      pane.addEventListener("mousedown", () => {
        if (this.splitOpen && this.activePane !== paneNum) {
          this.activePane = paneNum;
          this.#syncActivePaneDom();
        }
      });
      pane.addEventListener("dragover", (event) => {
        if (!this.#dropAccepts(event, this.#paneDest(paneNum))) return;
        event.preventDefault();
        pane.classList.add("is-drop");
      });
      pane.addEventListener("dragleave", (event) => {
        if (!pane.contains(event.relatedTarget)) pane.classList.remove("is-drop");
      });
      pane.addEventListener("drop", (event) => {
        pane.classList.remove("is-drop");
        if (paneNum === 1 && (this.activeTagIds.length || this.activeColorIds.length)) return;
        this.#dropOnDest(event, this.#paneDest(paneNum));
      });
    }

    const primaryPane = this.element.querySelector(".fm-pane-primary");
    if (primaryPane) {
      primaryPane.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.#openBackgroundContextMenu(event);
      });
    }
    const secondaryPane = this.element.querySelector(".fm-pane-secondary");
    if (secondaryPane) {
      // фоновое контекстное меню (новая папка/аплоад) целится в основную панель - тут глушим
      secondaryPane.addEventListener("contextmenu", (event) => event.preventDefault());
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

    const paletteInput = this.element.querySelector("input[name='paletteQuery']");
    if (paletteInput) {
      paletteInput.focus();
      paletteInput.setSelectionRange(paletteInput.value.length, paletteInput.value.length);
      paletteInput.addEventListener("input", () => {
        if (!this.palette) return;
        this.palette.query = paletteInput.value;
        this.palette.sel = 0;
        clearTimeout(this._paletteDebounce);
        // дебаунс, чтобы не гонять fuzzy по всему индексу на каждую букву
        this._paletteDebounce = setTimeout(() => {
          if (!this.palette || !this.rendered) return;
          this.#computePaletteResults(paletteInput.value);
          this.#renderPaletteResults();
        }, 100);
      });
      paletteInput.addEventListener("keydown", (event) => {
        if (!this.palette) return;
        const max = Math.max(0, (this._paletteResults?.length ?? 1) - 1);
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.#closePalette();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          this.palette.sel = Math.min(Math.max(this.palette.sel + delta, 0), max);
          this.#syncPaletteSel();
        } else if (event.key === "Enter") {
          event.preventDefault();
          clearTimeout(this._paletteDebounce);
          this.#computePaletteResults(paletteInput.value);
          this.#paletteGo(this.palette.sel);
        } else if (event.key === "Tab") {
          event.preventDefault();
          clearTimeout(this._paletteDebounce);
          this.#computePaletteResults(paletteInput.value);
          this.#paletteGo(this.palette.sel, { newTab: true });
        }
      });
    }

    for (const row of this.element.querySelectorAll(".fm-palette-row[data-index]")) {
      row.addEventListener("mouseenter", () => {
        if (!this.palette) return;
        this.palette.sel = Number(row.dataset.index);
        this.#syncPaletteSel();
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
    if (item.pane === 2) {
      this.#splitBrowse(item.source, item.path);
      return;
    }
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
    this.recents = pushRecent(
      this.recents,
      { source: this.activeSource, path },
      RECENT_FOLDERS_MAX,
    );
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
    clearTimeout(this._paletteDebounce);
    this.#clearTabHover();
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

  static #onEditPath(event) {
    event.preventDefault();
    this.pathEditing = true;
    this.render({ parts: ["toolbar"] });
  }

  #cancelPathEdit() {
    if (!this.pathEditing) return;
    this.pathEditing = false;
    if (this.rendered) this.render({ parts: ["toolbar"] });
  }

  async #goToPath(raw) {
    this.pathEditing = false;
    const target = normalizePathInput(raw);
    // сперва пробуем как папку; если сервер отверг - как файл: родительская папка + выделение
    if (await this.#tryBrowse(target)) return;
    const { parent, base } = splitParent(target);
    if (target && (await this.#tryBrowse(parent, base))) return;
    this.#toast(LF("Errors.PathNotFound", { path: decodePath(target) }));
    this.render({ parts: ["toolbar"] });
  }

  // инстансный browse() молча падает в корень на плохом пути, поэтому сначала валидируем статикой
  async #tryBrowse(target, selectName = null) {
    try {
      await this.constructor.browse(this.activeSource, target);
    } catch {
      return false;
    }
    this.#resetFilters();
    await this.browse(target);
    if (selectName) {
      const wanted = decodePath(selectName).toLowerCase();
      const match = this._lastItems?.find(
        (i) => !i.isFolder && i.pane !== 2 && i.name.toLowerCase() === wanted,
      );
      if (match) {
        this.selectedIds = [match.id];
        this._anchorId = match.id;
        this.#syncSelectionDom();
        this.render({ parts: ["preview", "statusbar", "overlays"] });
      } else {
        this.#toast(LF("Errors.PathNotFound", { path: decodePath(selectName) }));
      }
    }
    return true;
  }

  static #onSwitchTab(event, target) {
    event.preventDefault();
    this.#switchToTab(Number(target.closest("[data-tabid]").dataset.tabid));
  }

  #switchToTab(index) {
    const tab = this.tabs[index];
    if (!tab || index === this.activeTabIndex) return;
    this.activeTabIndex = index;
    this.#resetFilters();
    this.#setSource(tab.source);
    this.browse(tab.target);
  }

  static #onAddTab(event) {
    event.preventDefault();
    // новая вкладка = клон текущей папки, как «дублировать вкладку» в проводнике
    this.tabs.push({ source: this.activeSource, target: this.result?.target ?? this.target ?? "" });
    this.activeTabIndex = this.tabs.length - 1;
    this.render({ parts: ["tabs"] });
  }

  static #onCloseTab(event, target) {
    event.preventDefault();
    const index = Number(target.closest("[data-tabid]").dataset.tabid);
    if (this.tabs.length <= 1 || !this.tabs[index]) return;
    this.tabs.splice(index, 1);
    if (this.activeTabIndex === index) {
      this.activeTabIndex = Math.min(index, this.tabs.length - 1);
      const tab = this.tabs[this.activeTabIndex];
      this.#resetFilters();
      this.#setSource(tab.source);
      this.browse(tab.target);
    } else {
      if (this.activeTabIndex > index) this.activeTabIndex -= 1;
      this.render({ parts: ["tabs"] });
    }
  }

  static async #onToggleSplit(event) {
    event.preventDefault();
    if (this.splitOpen) return this.#closeSplit();
    this.splitOpen = true;
    this.activePane = 1;
    await this.#splitBrowse(this.activeSource, this.result?.target ?? this.target ?? "");
    this.render({ parts: ["tabs", "statusbar"] });
  }

  static #onCloseSplit(event) {
    event.preventDefault();
    this.#closeSplit();
  }

  #closeSplit() {
    this.splitOpen = false;
    this.splitResult = null;
    this.activePane = 1;
    this.render({ parts: ["main", "tabs", "statusbar"] });
  }

  async #splitBrowse(source, target) {
    try {
      this.splitResult = await this.constructor.browse(source, target);
      this.splitSource = source;
      this.splitTarget = this.splitResult?.target ?? target;
    } catch (err) {
      ui.notifications.warn(err.message);
      return;
    }
    if (this.rendered) this.render({ parts: ["main", "statusbar"] });
  }

  static #onSplitNavigate(event, target) {
    event.preventDefault();
    const el = target.closest("[data-path]") ?? target;
    this.#splitBrowse(this.splitSource, el.dataset.path ?? "");
  }

  static async #onSwapPanes(event) {
    event.preventDefault();
    if (!this.splitOpen) return;
    const first = { source: this.activeSource, target: this.result?.target ?? this.target ?? "" };
    const second = { source: this.splitSource, target: this.splitTarget };
    this.#resetFilters();
    this.#setSource(second.source);
    await this.browse(second.target);
    await this.#splitBrowse(first.source, first.target);
  }

  static #onToggleSplitDir(event) {
    event.preventDefault();
    this.splitDir = this.splitDir === "row" ? "column" : "row";
    this.render({ parts: ["main"] });
  }

  #syncActivePaneDom() {
    for (const pane of this.element.querySelectorAll(".fm-pane")) {
      pane.classList.toggle("is-active", Number(pane.dataset.pane) === this.activePane);
    }
    this.render({ parts: ["statusbar"] });
  }

  #paneDest(paneNum) {
    return paneNum === 2
      ? { source: this.splitSource, target: this.splitTarget }
      : { source: this.activeSource, target: this.result?.target ?? this.target ?? "" };
  }

  // единая проверка для всех drop-целей (панель, плитка папки, вкладка, дерево):
  // принимаем файлы с диска, либо внутренний файл, если папка назначения - не его собственная
  #dropAccepts(event, dest) {
    if (!dest?.source && dest?.target == null) return false;
    if (event.dataTransfer?.types?.includes("Files")) return true;
    const drag = this._dragItem;
    if (!drag || drag.isFolder) return false;
    return !(drag.source === dest.source && splitParent(drag.path).parent === dest.target);
  }

  #refreshIfVisible(dest) {
    if (this.splitOpen && dest.source === this.splitSource && dest.target === this.splitTarget) {
      this.#splitBrowse(dest.source, dest.target);
    }
    if (dest.source === this.activeSource && dest.target === (this.result?.target ?? this.target)) {
      this.browse(this.target);
    }
  }

  async #dropOnDest(event, dest) {
    if (!dest) return;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) {
      event.preventDefault();
      event.stopPropagation();
      await this.#uploadFilesTo(dest.source, dest.target, files);
      return;
    }
    const drag = this._dragItem;
    if (!drag || drag.isFolder) return;
    if (drag.source === dest.source && splitParent(drag.path).parent === dest.target) return;
    event.preventDefault();
    event.stopPropagation();
    this._dragItem = null;
    try {
      const name = await this.#copyFileTo(dest.source, dest.target, drag.path);
      const folder = buildCrumbs(dest.target, sourceLabel(dest.source)).at(-1).name;
      this.#toast(LF("Dnd.CopiedTo", { name, folder }));
    } catch (err) {
      ui.notifications.warn(err.message);
      return;
    }
    this.#refreshIfVisible(dest);
  }

  // в Foundry нет API перемещения/удаления файлов, поэтому перенос между панелями - копирование
  async #copyFileTo(source, targetDir, srcPath) {
    const name = decodePath(srcPath.split("/").pop() || srcPath);
    const resp = await fetch(srcPath);
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const blob = await resp.blob();
    const file = new File([blob], name, { type: blob.type });
    const up = await this.constructor.upload(source, decodePath(targetDir), file, {
      bucket: this.sources[source]?.bucket,
    });
    if (up?.error) throw new Error(up.error);
    return name;
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
    this.viewMenuOpen = false;
    this.render({ parts: ["main", "toolbar"] });
  }

  static #onToggleViewMenu(event) {
    event.preventDefault();
    this.viewMenuOpen = !this.viewMenuOpen;
    this.render({ parts: ["toolbar"] });
  }

  static #onCloseViewMenu(event) {
    event.preventDefault();
    this.viewMenuOpen = false;
    this.render({ parts: ["toolbar"] });
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

  // вызывается снаружи из хоткея Ctrl+A, поэтому метод публичный
  selectAll() {
    const ids = (this._lastItems ?? []).map((i) => i.id);
    if (!ids.length) return;
    this.selectedIds = ids;
    this._anchorId = ids[0];
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
    if (this._activatedMedia.has(item.id)) this._activatedMedia.delete(item.id);
    else this._activatedMedia.add(item.id);
    this.render({ parts: ["main"] });
  }

  static async #onNewFolder(event) {
    event.preventDefault();
    if (this.contextMenu) {
      this.contextMenu = null;
      this.render({ parts: ["overlays"] });
    }
    if (!this.canMakeFolder) return;
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
          // target stays percent-encoded end to end, so the new segment gets encoded too - that keeps
          // it comparable to the dirs browse() returns and lets names with a literal "%" survive
          const path = [this.target, foundry.utils.encodeURL(dirname)].filter(Boolean).join("/");
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
    if (this.activeTagIds.length || this.activeColorIds.length) return;
    return this.#uploadFilesTo(this.activeSource, this.target, files);
  }

  async #uploadFilesTo(source, target, files) {
    if (!this.canUpload) return;
    // browse/createDirectory decode the target server-side, the upload route joins it verbatim -
    // so a folder like "Моя папка" arrives as "%D0%9C.../%D0%BF..." and lands on a missing directory
    const decoded = decodePath(target);
    for (const file of files) {
      if (!this.#extensionAllowed(file.name)) {
        ui.notifications.error(LF("Errors.BadExtension", { name: file.name }));
        continue;
      }
      const response = await this.constructor.upload(source, decoded, file, {
        bucket: this.sources[source]?.bucket,
      });
      if (response?.error) {
        ui.notifications.error(response.error);
        continue;
      }
      if (response?.path) this.request = response.path;
    }
    this.#refreshIfVisible({ source, target });
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

  static async #onTagModalMove(event, target) {
    event.preventDefault();
    const el = target.closest("[data-tag-id]");
    const tags = getTags();
    const i = tags.findIndex((t) => t.id === el.dataset.tagId);
    const j = i + Number(el.dataset.dir);
    if (i < 0 || j < 0 || j >= tags.length) return;
    // порядок тегов хранится прямо в массиве настройки, так что просто меняем соседей местами
    [tags[i], tags[j]] = [tags[j], tags[i]];
    await this.#withStore(() => setTags(tags));
  }

  static #onCopyPath(event) {
    event.preventDefault();
    const item = this.#previewItem();
    if (!item) return;
    game.clipboard.copyPlainText(item.path);
    this.#toast(L("Properties.PathCopied"));
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
    const items = ids.map((id) => this._lastItems?.find((i) => i.id === id)).filter(Boolean);
    const single = ids.length === 1 ? (items[0] ?? null) : null;
    this.contextMenu = {
      ...this.#windowPoint(event),
      ids,
      background: false,
      singleFolder: !!single?.isFolder,
      favoriteLabel: single?.favorite ? L("Context.Unfavorite") : L("Context.Favorite"),
      actions: ids.length === 1 ? this.#buildPreviewActions(single) : [],
      canConvertWebp: this.canUpload && items.some(canConvertToWebp),
    };
    this.render({ parts: ["overlays", "preview", "statusbar"] });
  }

  #openBackgroundContextMenu(event) {
    const filtering = this.activeTagIds.length || this.activeColorIds.length;
    if (filtering || (!this.canMakeFolder && !this.canUpload)) return;
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

  static async #onCtxConvertWebp(event) {
    event.preventDefault();
    const items = this.#contextItems().filter(canConvertToWebp);
    this.contextMenu = null;
    this.render({ parts: ["overlays"] });
    if (!items.length) return;
    const quality = game.settings.get(MODULE_ID, SETTINGS.WEBP_QUALITY) ?? 0.9;

    // this.target не подходит: при активных фильтрах листинг виртуальный и файлы лежат
    // в разных папках - webp должен появиться рядом с исходником. На каждую папку
    // один browse(), чтобы собрать занятые имена (регистронезависимо) для коллизий
    const groups = new Map();
    for (const item of items) {
      const dir = splitParent(item.path).parent;
      const key = `${item.source}:${dir}`;
      if (groups.has(key)) continue;
      const taken = new Set();
      try {
        const result = await this.constructor.browse(item.source, dir);
        for (const f of result?.files ?? []) {
          taken.add(decodePath(f.split("/").pop() || f).toLowerCase());
        }
      } catch {
        // папку не прочитали - считаем пустой, реальная ошибка всплывёт на upload
      }
      groups.set(key, { source: item.source, dir, taken });
    }

    let converted = 0;
    let failed = 0;
    // последовательно, без Promise.all - память на огромных картах держится в рамках
    for (const [index, item] of items.entries()) {
      if (items.length > 1) {
        this.#toast(LF("Convert.Progress", { current: index + 1, total: items.length }));
      }
      const group = groups.get(`${item.source}:${splitParent(item.path).parent}`);
      try {
        const blob = await (await fetch(item.path)).blob();
        const bmp = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        canvas.getContext("2d").drawImage(bmp, 0, 0);
        bmp.close();
        const webp = await canvas.convertToBlob({ type: "image/webp", quality });
        const outName = resolveCollision(webpName(item.name), group.taken);
        group.taken.add(outName.toLowerCase());
        const response = await this.constructor.upload(
          item.source,
          decodePath(group.dir),
          new File([webp], outName, { type: "image/webp" }),
          { bucket: this.sources[item.source]?.bucket },
          { notify: false },
        );
        if (response?.error) throw new Error(response.error);
        converted += 1;
      } catch (err) {
        console.error(`${MODULE_ID} |`, err);
        failed += 1;
      }
    }

    for (const group of groups.values()) {
      this.#refreshIfVisible({ source: group.source, target: group.dir });
    }
    const done = LF("Convert.Done", { count: converted });
    this.#toast(failed ? `${done}. ${LF("Convert.Failed", { count: failed })}` : done);
  }
}
