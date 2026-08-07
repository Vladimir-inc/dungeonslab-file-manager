import { DISCORD_URL } from "../ui/phrases.mjs";
import { L } from "../i18n.mjs";

// раньше тут жил целый анимированный интро-ролик, оставили только приветствие в чате
export function sendGreetingMessage() {
  const content = `<div class="dl-chat-greeting">
    <h3><i class="fa-solid fa-dungeon"></i> ${L("Intro.ChatTitle")}</h3>
    <p>${L("Intro.ChatBody")}</p>
    <p><a class="dl-chat-cta" href="${DISCORD_URL}" target="_blank" rel="noopener">
      <i class="fa-brands fa-discord"></i> ${L("Intro.ChatCta")}</a></p>
  </div>`;
  CONFIG.ChatMessage.documentClass.create({
    content,
    whisper: [game.user.id],
    speaker: { alias: "Dungeons Lab" },
  });
}
