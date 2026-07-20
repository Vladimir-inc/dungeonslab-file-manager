import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { DISCORD_URL } from "../ui/phrases.mjs";
import { L } from "../i18n.mjs";

const W = 1280;
const H = 720;
const AUDIO_SRC = `modules/${MODULE_ID}/src/audio/dungeons-lab-intro.mp3`;
const LOGO_SRC = `modules/${MODULE_ID}/src/img/DL-logo-only.png`;
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Alegreya:ital,wght@0,400;0,500;1,400&display=swap";

const STORM_AT = 5;
const CREDIT_AT = 11;
const MODULE_AT = 17;
const TOTAL = 27;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const eo = (x) => 1 - Math.pow(1 - x, 3);
const ei = (x) => x * x * x;
const eio = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - Math.pow(-2 * x + 2, 3) / 2);

function flashI(t, ft) {
  const d = t - ft;
  if (d < 0 || d > 1.3) return 0;
  const atk = d < 0.035 ? d / 0.035 : 1;
  return atk * Math.exp(-d * 7.5) * (0.78 + 0.22 * Math.sin(d * 90));
}
function preDim(t, ft) {
  const d = ft - t;
  return d > 0 && d < 0.35 ? (1 - d / 0.35) * 0.35 : 0;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let z = Math.imul(a ^ (a >>> 15), 1 | a);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
function genBolt(rng, x0, y0, x1, y1, disp) {
  let pts = [
    [x0, y0],
    [x1, y1],
  ];
  for (let it = 0; it < 6; it++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const mx = (ax + bx) / 2 + (rng() - 0.5) * disp;
      const my = (ay + by) / 2 + (rng() - 0.5) * disp * 0.28;
      next.push([mx, my], [bx, by]);
    }
    pts = next;
    disp *= 0.52;
  }
  return pts;
}
const toPath = (pts) =>
  pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
function buildStrike(seed, x, groundY) {
  const rng = mulberry(seed);
  const x1 = x + (rng() - 0.5) * 160;
  const main = genBolt(rng, x + (rng() - 0.5) * 60, -20, x1, groundY, 150);
  const branches = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let b = 0; b < n; b++) {
    const idx = 8 + Math.floor(rng() * (main.length * 0.55));
    const [sx, sy] = main[idx];
    const len = 60 + rng() * 150;
    const dir = rng() < 0.5 ? -1 : 1;
    const ex = sx + dir * (30 + rng() * 90);
    const ey = sy + len;
    branches.push({
      d: toPath(genBolt(rng, sx, sy, ex, ey, 55)),
      o: 0.35 + rng() * 0.3,
      w: 1 + rng() * 0.8,
      at: idx / main.length,
    });
  }
  return { d: toPath(main), branches, hitX: x1 };
}
function strikeSvg(t, at, x, seed, groundY = 640) {
  const d = t - at;
  if (d < 0 || d > 1.0) return "";
  const LEAD = 0.09;
  const restrikes = [
    [LEAD, 1],
    [LEAD + 0.14, 0.55],
    [LEAD + 0.31, 0.3],
  ];
  let bright = 0;
  let k = 0;
  restrikes.forEach(([st, amp], i) => {
    const dd = d - st;
    if (dd >= 0) {
      const v = amp * Math.exp(-dd * 13);
      if (v > bright) bright = v;
      if (dd < 0.06) k = i;
    }
  });
  const s = buildStrike(seed + k * 131, x, groundY);
  const leadP = clamp(d / LEAD, 0, 1);
  const leader = d < LEAD + 0.02 ? 0.35 : 0;
  if (Math.max(bright, leader * 0.5) <= 0.015) return "";
  const impact = d >= LEAD ? Math.exp(-(d - LEAD) * 6) : 0;
  const branches = s.branches
    .map(
      (b) => `<g opacity="${bright * b.o * (leadP >= b.at ? 1 : 0)}">
        <path d="${b.d}" fill="none" stroke="rgba(140,175,255,0.7)" stroke-width="${b.w * 3.4}"
              stroke-linejoin="round" style="filter: blur(3px)"/>
        <path d="${b.d}" fill="none" stroke="#dbe7ff" stroke-width="${b.w}" stroke-linejoin="round"/>
      </g>`,
    )
    .join("");
  const impactSvg =
    impact > 0.02
      ? `<g opacity="${impact * bright * 1.4}">
          <ellipse cx="${s.hitX}" cy="${groundY}" rx="${70 + (1 - impact) * 90}" ry="${16 + (1 - impact) * 18}"
                   fill="rgba(150,185,255,0.5)" style="filter: blur(10px)"/>
          <ellipse cx="${s.hitX}" cy="${groundY}" rx="26" ry="7" fill="rgba(235,243,255,0.9)" style="filter: blur(4px)"/>
        </g>`
      : "";
  return `
    <path d="${s.d}" fill="none" stroke="rgba(110,150,255,0.5)" stroke-width="26" stroke-linejoin="round"
          stroke-linecap="round" opacity="${bright * 0.55}" style="filter: blur(14px)"/>
    <path d="${s.d}" fill="none" stroke="rgba(150,185,255,0.85)" stroke-width="9" stroke-linejoin="round"
          stroke-linecap="round" opacity="${bright * 0.8}" style="filter: blur(4px)"/>
    ${branches}
    <path d="${s.d}" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"
          pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - leadP}" opacity="${Math.max(bright, leader)}"/>
    ${impactSvg}`;
}

function el(cls, parent, html) {
  const node = document.createElement("div");
  node.className = cls;
  if (html != null) node.innerHTML = html;
  parent.appendChild(node);
  return node;
}

function ensureFonts() {
  if (document.getElementById("dl-intro-fonts")) return;
  const link = document.createElement("link");
  link.id = "dl-intro-fonts";
  link.rel = "stylesheet";
  link.href = FONTS_URL;
  document.head.appendChild(link);
}

function buildIntro(root, requestClose) {
  ensureFonts();

  const viewport = el("dl-viewport", root);
  const stage = el("dl-stage", viewport);
  el("dl-backdrop", stage);
  const fogBack = el("dl-fog dl-fog-back", stage);
  const fogFront = el("dl-fog dl-fog-front", stage);
  const bloom = el("dl-bloom", stage);
  const boltLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  boltLayer.setAttribute("viewBox", `0 0 ${W} ${H}`);
  boltLayer.setAttribute("class", "dl-bolts");
  stage.appendChild(boltLayer);
  const flash = el("dl-flash", stage);
  const embersLayer = el("dl-embers", stage);
  const embers = Array.from({ length: 16 }, () => el("dl-ember", embersLayer));

  const credit = el(
    "dl-scene dl-credit",
    stage,
    `<div class="dl-kicker"><span class="dl-rule dl-rule-l"></span>CREATED BY<span class="dl-rule dl-rule-r"></span></div>
     <div class="dl-title dl-title-credit">DUNGEONS LAB</div>`,
  );
  const module = el(
    "dl-scene dl-module",
    stage,
    `<div class="dl-kicker">A DUNGEONS LAB MODULE</div>
     <div class="dl-title dl-title-module">FILE MANAGER</div>
     <div class="dl-divider"><span class="dl-rule dl-rule-l"></span><span class="dl-diamond"></span><span class="dl-rule dl-rule-r"></span></div>
     <div class="dl-pitch">${L("Intro.Text")}</div>
     <div class="dl-tagline">BUILT BY DUNGEON MASTERS, FOR DUNGEON MASTERS</div>`,
  );
  const logo = document.createElement("img");
  logo.className = "dl-logo";
  logo.src = LOGO_SRC;
  logo.alt = "Dungeons Lab";
  stage.appendChild(logo);
  const dim = el("dl-dim", stage);
  el("dl-vignette", stage);
  const black = el("dl-black", stage);

  const actions = el(
    "dl-actions",
    root,
    `<button type="button" class="dl-btn" data-dl="dontshow">
       <i class="fa-solid fa-eye-slash"></i> ${L("Intro.DontShow")}</button>
     <button type="button" class="dl-btn dl-btn-discord" data-dl="discord">
       <i class="fa-brands fa-discord"></i> ${L("Discord.Open")}</button>
     <button type="button" class="dl-btn" data-dl="close">
       <i class="fa-solid fa-xmark"></i> ${L("Intro.Close")}</button>`,
  );

  const creditKicker = credit.querySelector(".dl-kicker");
  const creditTitle = credit.querySelector(".dl-title");
  const moduleKicker = module.querySelector(".dl-kicker");
  const moduleTitle = module.querySelector(".dl-title");
  const moduleDivider = module.querySelector(".dl-divider");
  const modulePitch = module.querySelector(".dl-pitch");
  const moduleTagline = module.querySelector(".dl-tagline");

  let sound = null;
  foundry.audio.AudioHelper.play({ src: AUDIO_SRC, volume: 0.9, loop: false }, false)
    .then((s) => {
      sound = s;
    })
    .catch(() => {});

  let raf = 0;
  let done = false;
  let scale = 0;
  const start = performance.now();
  let skipTo = 0;

  actions.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-dl]");
    if (!btn) return;
    event.preventDefault();
    if (btn.dataset.dl === "discord") {
      window.open(DISCORD_URL, "_blank", "noopener");
      return;
    }
    if (btn.dataset.dl === "dontshow") game.settings.set(MODULE_ID, SETTINGS.INTRO_SEEN, true);
    requestClose();
  });
  viewport.addEventListener("click", () => {
    if (done) return;
    const t = (performance.now() - start) / 1000 + skipTo;
    skipTo += Math.max(0, TOTAL - t);
  });

  const setEmbers = (t, opacity, color) => {
    embers.forEach((node, i) => {
      const sp = 26 + ((i * 37) % 40);
      const off = (i * 251) % 720;
      const y = H + 40 - ((t * sp + off) % (H + 120));
      const x = (((i * 173) % 100) / 100) * W + Math.sin(t * 0.8 + i) * 28;
      const life = clamp(1 - Math.abs(y / H - 0.45) * 1.6, 0, 0.8);
      node.style.transform = `translate(${x}px, ${y}px)`;
      node.style.opacity = life * opacity;
      node.style.background = `rgb(${color})`;
      node.style.boxShadow = `0 0 8px 2px rgba(${color},0.7)`;
    });
  };

  const frame = (now) => {
    const vw = viewport.clientWidth;
    if (vw && Math.abs(vw / W - scale) > 0.001) {
      scale = vw / W;
      stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    const t = (now - start) / 1000 + skipTo;

    let fogB = 0.55;
    let fogF = 0.85;
    let flashV = 0;
    let flashX = 50;
    let dimV = 0;
    let blackV = 0;
    let shakeX = 0;
    let shakeY = 0;
    let bloomV = 0;
    let boltHtml = "";
    let emberT = 0;
    let emberO = 0;
    let emberC = "240,160,74";

    if (t < 5.4) {
      const logoOp = eo(r(t, 0, 0.6)) * (1 - eio(r(t, 4.0, 5.0)));
      logo.style.opacity = logoOp;
      logo.style.transform = `translate(-50%, -50%) scale(${1 + 0.05 * eo(r(t, 0, 5.0))})`;
    } else {
      logo.style.opacity = 0;
    }

    if (t < STORM_AT) {
      const fade = eo(r(t, 0.2, 2.6));
      fogB = 0.55 * fade;
      fogF = 0.85 * fade;
      flashV = flashI(t, STORM_AT - 1.1) * 0.5;
      flashX = 72;
      blackV = 1 - fade;
    } else if (t < CREDIT_AT) {
      const ts = t - STORM_AT;
      const f1 = flashI(ts, 0.8);
      const f2 = flashI(ts, 1.7);
      const f3 = flashI(ts, 2.35);
      flashV = Math.max(f1, f2, f3);
      flashX = f3 > f2 ? 24 : 68;
      dimV = Math.max(preDim(ts, 0.8), preDim(ts, 1.7), preDim(ts, 2.35));
      const surge = eo(r(ts, 2.6, 3.8)) * (1 - eio(r(ts, 4.0, 5.85)));
      bloomV = surge * (0.75 + 0.25 * Math.sin(ts * 9));
      const amp = ts > 2.6 ? 9 * Math.exp(-(ts - 2.6) * 1.7) : 0;
      shakeX = Math.sin(ts * 47) * amp;
      shakeY = Math.cos(ts * 61) * amp * 0.6;
      boltHtml = strikeSvg(ts, 1.7, W * 0.68, 4211) + strikeSvg(ts, 2.35, W * 0.22, 9107, 600);
      emberT = ts;
      emberO = surge;
      emberC = "240,160,74";
    } else if (t < MODULE_AT) {
      const tc = t - CREDIT_AT;
      const settle = eio(r(tc, 0, 2.4));
      fogB = 0.55 - 0.1 * settle;
      fogF = 0.85 - 0.25 * settle;
      const fade = 1 - ei(r(tc, 4.7, 5.7));
      const kOp = eo(r(tc, 0.7, 1.6));
      const tOp = eo(r(tc, 1.2, 2.4));
      const track = 0.24 - 0.18 * eo(r(tc, 1.2, 3.0));
      const sweep = r(tc, 2.6, 4.2);
      const glow = eo(r(tc, 1.6, 3.0)) * fade;
      credit.style.opacity = 1;
      creditKicker.style.opacity = kOp * fade;
      creditTitle.style.opacity = tOp * fade;
      creditTitle.style.transform = `translateY(${18 * (1 - tOp)}px)`;
      creditTitle.style.letterSpacing = `${track}em`;
      creditTitle.style.backgroundPosition = `${(1 - sweep) * 200 - 50}% 0%`;
      creditTitle.style.filter = `drop-shadow(0 2px 3px rgba(0,0,0,0.85)) drop-shadow(0 0 ${24 * glow}px rgba(159,193,255,0.55))`;
      emberT = tc + 6;
      emberO = 0.55 * fade;
      emberC = "159,193,255";
    } else {
      const tm = Math.min(t - MODULE_AT, 10);
      const settle = eio(r(tm, 0, 2));
      fogB = 0.45 - 0.05 * settle;
      fogF = 0.6 - 0.1 * settle;
      credit.style.opacity = 0;
      const tOp = eo(r(tm, 0.7, 1.9));
      const reveal = eo(r(tm, 0.7, 2.1));
      const dv = eo(r(tm, 1.5, 2.4));
      const bOp = eo(r(tm, 2.1, 3.2));
      const sweep = r(tm, 3.0, 4.8);
      module.style.opacity = 1;
      moduleKicker.style.opacity = eo(r(tm, 0.3, 1.1));
      moduleTitle.style.opacity = tOp;
      moduleTitle.style.transform = `translateY(${20 * (1 - tOp)}px)`;
      moduleTitle.style.clipPath = `inset(0 ${50 - 50 * reveal}% 0 ${50 - 50 * reveal}%)`;
      moduleTitle.style.backgroundPosition = `${(1 - sweep) * 200 - 50}% 0%`;
      moduleDivider.style.opacity = dv;
      moduleDivider.style.transform = `scaleX(${0.2 + 0.8 * dv})`;
      modulePitch.style.opacity = bOp;
      modulePitch.style.transform = `translateY(${12 * (1 - bOp)}px)`;
      moduleTagline.style.opacity = eo(r(tm, 3.4, 4.6));
      emberT = tm + 12;
      emberO = 0.5;
      emberC = "159,193,255";
    }

    fogBack.style.opacity = fogB;
    fogFront.style.opacity = fogF;
    flash.style.opacity = flashV * 0.7;
    flash.style.background = `radial-gradient(ellipse at ${flashX}% -10%, rgba(200,218,255,0.9), rgba(90,120,220,0.28) 50%, rgba(0,0,0,0) 78%)`;
    dim.style.opacity = dimV;
    black.style.opacity = blackV;
    bloom.style.opacity = bloomV;
    stage.style.setProperty("--dl-shake", `${shakeX}px, ${shakeY}px`);
    boltLayer.innerHTML = boltHtml;
    setEmbers(emberT, emberO, emberC);

    if (t >= TOTAL && !done) {
      done = true;
      root.classList.add("is-done");
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    try {
      sound?.stop();
    } catch {}
  };
}

export class IntroApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "dl-intro-app",
    classes: ["dl-intro-window"],
    window: {
      title: "FILE_MANAGER_DUNGEONS_LAB.Intro.WindowTitle",
      icon: "fa-solid fa-dungeon",
      resizable: false,
      minimizable: false,
    },
    position: { width: 1024, height: "auto" },
  };

  #cleanup = null;

  async _renderHTML() {
    const root = document.createElement("div");
    root.className = "dl-intro";
    this.#cleanup = buildIntro(root, () => this.close());
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onClose(options) {
    super._onClose(options);
    this.#cleanup?.();
    this.#cleanup = null;
  }
}

export function maybeShowIntro() {
  if (game.settings.get(MODULE_ID, SETTINGS.INTRO_SEEN)) return;
  game.audio.unlock.then(() =>
    new IntroApp({ position: { width: Math.round(window.innerWidth * 0.7) } }).render(true),
  );
}

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
