import { EmbedBuilder } from "discord.js";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const GAME_MODES = ["CTF", "TDM", "KOTH", "TKOTH", "FFA", "GunGame"];
const TIMEFRAMES = ["daily"];
const lastTopPlayers = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHANNEL = "1126164735948230709";

function cleanPlayerName(name) {
  return name.replace(/<color=.*?>(.*?)<\/color>/g, "[$1]");
}

async function checkLeaderboard(gameMode, timeframe) {
  const boardName = `lb_${gameMode}_${timeframe}`;
  const API_BASE = process.env.topplayers;

  if (!API_BASE) {
    throw new Error("LEADERBOARD_API environment variable is not set dude");
  }

  const API_URL = `${API_BASE}/api/getScore?boardName=${boardName}&page=1`;

  try {
    const { data } = await axios.get(API_URL);
    const top = data?.data?.[0]?.key
      ? cleanPlayerName(data.data[0].key)
      : "No Data";
    return { gameMode, timeframe, topPlayer: top };
  } catch {
    return { gameMode, timeframe, topPlayer: "Unknown" };
  }
}

async function fetchAllLeaderboards() {
  const results = [];
  for (const gm of GAME_MODES) {
    for (const tf of TIMEFRAMES) {
      await sleep(1000);
      const result = await checkLeaderboard(gm, tf);
      results.push(result);
    }
  }
  return results;
}

function buildTopEmbed(results) {
  const modeEmojis = {
    CTF: "🚩",
    TDM: "⚔️",
    KOTH: "👑",
    TKOTH: "🔥",
    FFA: "💥",
    GunGame: "🔫",
  };

  const embed = new EmbedBuilder()
     .setAuthor({
      name: "REPULS.IO by DOCSKI",
      icon_url: "https://cdn.discordapp.com/avatars/213028561584521216/a6962bf317cf74819879890cc706cdc3.png?size=1024",
      url: "https://repuls.io",
})
    .setThumbnail(
      "https://cdn.discordapp.com/emojis/925776344380502126.webp?size=96&animated=true"
    )
    .setTitle("🏆 Top Daily Leaderboard Winners")
    .setDescription(
      results
        .map((r, i) => {
          const emoji = modeEmojis[r.gameMode] ?? "🎮";
          return `### **${emoji} ${r.gameMode}** — ${r.topPlayer}\n`;
        })
        .join("\n")
    )
    .setColor(0xf1c40f)
    .setFooter({ text: "Daily reset • Repuls.io Leaderboards" })
    .setTimestamp();

  return embed;
}


export function initDailyTopPlayers(client) {
  console.log("[DailyTopPlayers] Event initialized.");

  let preparedResults = null;

  async function prepareData() {
    console.log("[DailyTopPlayers] Pre-fetching leaderboard data (15 min before post)");
    preparedResults = await fetchAllLeaderboards();
    console.log("[DailyTopPlayers] Data prepared successfully");
  }

  async function sendPost() {
    try {
      if (!preparedResults) {
        console.warn("[DailyTopPlayers] No prepared data, fetching now");
        preparedResults = await fetchAllLeaderboards();
      }

      const embed = buildTopEmbed(preparedResults);
      preparedResults = null;

      const channel = client.channels.cache.get(CHANNEL);
      if (!channel) return console.error("Invalid DAILY TOP channel ID");

      await channel.send({ embeds: [embed] });
      console.log("[DailyTopPlayers] Posted daily winners");
    } catch (err) {
      console.error("[DailyTopPlayers] Error:", err.message);
    }
  }

  function msUntil525IST() {
    const now = new Date();
    const target = new Date();

    target.setUTCHours(23, 55, 0, 0);

    if (now > target) {
      target.setUTCDate(target.getUTCDate() + 1);
    }

    return target - now;
  }

  const initialDelay = msUntil525IST();
  const prefetchDelay = initialDelay - 15 * 60 * 1000;

  console.log(
    `[DailyTopPlayers] First post in ${Math.round(initialDelay / 60000)} minutes`
  );

  setTimeout(() => {
    prepareData();
    setInterval(prepareData, 24 * 60 * 60 * 1000);
  }, prefetchDelay);

  setTimeout(() => {
    sendPost();
    setInterval(sendPost, 24 * 60 * 60 * 1000);
  }, initialDelay);
}
