import { EmbedBuilder } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { buildTopClanImageFile } from "../utils/topClanImage.js";

dotenv.config();

const GAME_MODES = ["CTF", "TDM", "KOTH", "TKOTH", "FFA", "GunGame"];
const TIMEFRAMES = ["daily"];
const CHANNEL = "1126164735948230709";

const TEST_MODE = false;

const DATA_PATH = path.join(process.cwd(), "src/data/clans.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractClanData(name) {
  const match = name.match(/<color=(#[0-9A-Fa-f]{6})>\[(.*?)\]<\/color>/);
  if (!match) return null;

  return {
    color: match[1],
    clan: match[2]
  };
}

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({ updatedAt: 0, clans: [] }));
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

async function safeRequest(url, retries = 3) {
  try {
    return await axios.get(url);
  } catch (err) {
    if (retries > 0 && err.response?.status === 429) {
      await sleep(3000);
      return safeRequest(url, retries - 1);
    }
    throw err;
  }
}


async function fetchAllPages(gameMode, timeframe) {
  const API_BASE = process.env.topplayers;
  const boardName = `lb_${gameMode}_${timeframe}`;

  let page = 1;
  let totalPages = 1;
  let allPlayers = [];

  while (page <= totalPages) {
    const url = `${API_BASE}/api/getScore?boardName=${boardName}&page=${page}`;

    try {
      const { data } = await safeRequest(url);
      totalPages = data.totalPages ?? 1;
      allPlayers.push(...(data.data || []));
    } catch {
      console.warn(`[ClanTracker] Failed ${gameMode} page ${page}`);
    }

    page++;
    await sleep(1200);
  }

  return allPlayers;
}

async function computeClanLeaderboard() {
  const clanMap = {};

  const MODE_DIVISORS = {
    CTF: 2,
    KOTH: 100,
    TKOTH: 100,
    TDM: 50,
    FFA: 50,
    GunGame: 15
  };

  for (const gm of GAME_MODES) {
    for (const tf of TIMEFRAMES) {
      const players = await fetchAllPages(gm, tf);
      const divisor = MODE_DIVISORS[gm];

      if (!divisor) continue;

      for (const p of players) {
        const data = extractClanData(p.key);
        if (!data) continue;

        const { clan, color } = data;

        const playerPoints = Number(p.value);
        if (!Number.isFinite(playerPoints)) continue;

        if (!clanMap[clan]) {
          clanMap[clan] = {
            players: 0,
            rawPoints: 0,
            color
          };
        }

        clanMap[clan].players += 1;
        clanMap[clan].rawPoints += playerPoints / divisor;
      }
    }
  }

  return Object.entries(clanMap)
    .map(([clan, data]) => ({
      clan,
      count: data.players,
      points: Math.round(data.rawPoints),
      color: data.color
    }))
    .sort((a, b) => b.points - a.points);
}



export function buildClanEmbed(clans) {
  return new EmbedBuilder()
    .setAuthor({
      name: "REPULS.IO by DOCSKI",
      icon_url: "https://cdn.discordapp.com/avatars/213028561584521216/a6962bf317cf74819879890cc706cdc3.png?size=1024",
      url: "https://repuls.io",
})
    .setTitle(":trophy: Today's Top Clans")
    .setThumbnail(
      "https://cdn.discordapp.com/emojis/925776344380502126.webp?size=96&animated=true"
    )
    .setDescription(
      clans.slice(0, 5).map((c, i) => {
        const medal = ["🥇", "🥈", "🥉", "🏅", "🏅"][i];
        return `\n### **${medal} [${c.clan}]** — ${c.points} clan points • ${c.count} players`;
      }).join("\n\n")
    )
    .setColor(0x9b59b6)
    .setFooter({ text: "Daily reset • Repuls.io Clan Leaderboards" })
    .setTimestamp();
}

function msUntil530IST() {
  const now = new Date();
  const target = new Date();
  target.setUTCHours(0, 0, 0, 0);
  if (now > target) target.setUTCDate(target.getUTCDate() + 1);
  return target - now;
}

export async function updateClanData() {
  const clans = await computeClanLeaderboard();
  saveData({ updatedAt: Date.now(), clans });
  return clans;
}

export function initClanTracker(client) {
  console.log("[ClanTracker] Initialized");

  async function sendPost() {
    const { clans } = loadData();
    if (!clans.length) return;

    const channel = client.channels.cache.get(CHANNEL);
    if (!channel) return;

    const topClan = clans[0];
if (!topClan) return;

const imagePath = await buildTopClanImageFile(topClan);

const embed = buildClanEmbed(clans)
  .setImage("attachment://topclan.png");

await channel.send({
  embeds: [embed],
  files: [{
    attachment: imagePath,
    name: "topclan.png"
  }]
});

  }

  setInterval(updateClanData, 45 * 60 * 1000);
  updateClanData();

  if (TEST_MODE) {
    setInterval(sendPost, 5 * 60 * 1000);
    return;
  }

  setTimeout(() => {
    sendPost();
    setInterval(sendPost, 24 * 60 * 60 * 1000);
  }, msUntil530IST());
}
