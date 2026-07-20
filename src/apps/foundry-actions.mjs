import { MODULE_ID } from "../constants.mjs";
import { L, LF } from "../i18n.mjs";

function assertMedia(item, types, errorKey) {
  if (!types.includes(item.type)) throw new Error(L(errorKey));
}

const broadcastSounds = new Map();

export function isBroadcastingAudio(src) {
  const sound = broadcastSounds.get(src);
  if (sound?.playing) return true;
  if (sound) broadcastSounds.delete(src);
  return false;
}

export function stopLocalAudio(src) {
  for (const sound of game.audio.playing.values()) {
    if (sound.src === src && sound.playing) sound.stop();
  }
}

function stopBroadcastAudio(src) {
  game.socket.emit(`module.${MODULE_ID}`, { action: "stopAudio", src });
  stopLocalAudio(src);
  broadcastSounds.delete(src);
}

export async function placeTile(item) {
  assertMedia(item, ["image", "video"], "Errors.TileNeedsMedia");
  if (!canvas?.ready || !canvas.scene) throw new Error(L("Errors.NoScene"));
  const loadTexture = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
  const tex = await loadTexture(item.path).catch(() => null);
  let width = tex?.width || canvas.grid.size * 2;
  let height = tex?.height || canvas.grid.size * 2;
  const cap = canvas.grid.size * 10;
  const scale = Math.min(1, cap / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const { x: cx, y: cy } = canvas.stage.pivot;
  await canvas.scene.createEmbeddedDocuments("Tile", [
    {
      texture: { src: item.path },
      x: Math.round(cx - width / 2),
      y: Math.round(cy - height / 2),
      width,
      height,
    },
  ]);
  return LF("Actions.TileDone", { name: item.name });
}

export async function showToPlayers(item) {
  if (item.type === "audio") {
    if (isBroadcastingAudio(item.path)) {
      stopBroadcastAudio(item.path);
      return LF("Actions.AudioStopped", { name: item.name });
    }
    const sound = await foundry.audio.AudioHelper.play(
      { src: item.path, volume: 0.8, loop: false },
      true,
    );
    if (sound) broadcastSounds.set(item.path, sound);
    return LF("Actions.SharedDone", { name: item.name });
  }
  assertMedia(item, ["image", "video"], "Errors.ShowUnsupported");
  const popout = new foundry.applications.apps.ImagePopout({
    src: item.path,
    window: { title: item.name },
    shareable: true,
  });
  await popout.render(true);
  popout.shareImage();
  return LF("Actions.SharedDone", { name: item.name });
}

function chatContent(item) {
  const src = foundry.utils.escapeHTML(item.path);
  const name = foundry.utils.escapeHTML(item.name);
  switch (item.type) {
    case "image":
      return `<img src="${src}" alt="${name}" style="max-width: 100%;">`;
    case "video":
      return `<video controls style="max-width: 100%;" src="${src}"></video>`;
    case "audio":
      return `<audio controls style="width: 100%;" src="${src}"></audio>`;
    default:
      return `<a href="${src}" target="_blank">${name}</a>`;
  }
}

export async function sendToChat(item, whisperIds = []) {
  await CONFIG.ChatMessage.documentClass.create({
    content: chatContent(item),
    whisper: whisperIds,
  });
  return whisperIds.length
    ? LF("Actions.WhisperDone", { name: item.name })
    : LF("Actions.ChatDone", { name: item.name });
}

export async function whisperToUser(item) {
  const targets = game.users.filter((u) => u.active && u.id !== game.user.id);
  if (!targets.length) throw new Error(L("Errors.NoActiveUsers"));
  const options = targets
    .map((u) => `<option value="${u.id}">${foundry.utils.escapeHTML(u.name)}</option>`)
    .join("");
  const content = `<div class="form-group"><label>${L("Whisper.Label")}</label>
    <div class="form-fields"><select name="target">${options}</select></div></div>`;
  return new Promise((resolve) => {
    foundry.applications.api.DialogV2.confirm({
      window: { title: "FILE_MANAGER_DUNGEONS_LAB.Whisper.Title", icon: "fa-solid fa-user-secret" },
      content,
      yes: {
        label: "FILE_MANAGER_DUNGEONS_LAB.Whisper.Send",
        default: true,
        callback: async (ev) => {
          const userId = ev.currentTarget.querySelector("select[name='target']")?.value;
          resolve(userId ? await sendToChat(item, [userId]) : null);
        },
      },
      no: {
        label: "FILE_MANAGER_DUNGEONS_LAB.Dialog.Cancel",
        callback: () => resolve(null),
      },
    });
  });
}
