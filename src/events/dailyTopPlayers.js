import { EmbedBuilder } from "discord.js";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const GAME_MODES = ["CTF", "TDM", "KOTH", "TKOTH", "FFA", "GunGame"];
const TIMEFRAMES = ["daily"];
const lastTopPlayers = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanPlayerName(name) {
  return name.replace(/<color=.*?>(.*?)<\/color>/g, "[$1]");
}

async function checkLeaderboard(gameMode, timeframe) {
  const boardName = `lb_${gameMode}_${timeframe}`;
  const API_BASE = process.env.topplayers;

  if (!API_BASE) {
    throw new Error("LEADERBOARD_API environment variable is not set");
  }

  const API_URL = `${API_BASE}/api/getScore?boardName=${boardName}&page=1`;

  try {
    const { data } = await axios.get(API_URL);
    const top = data?.data?.[0]?.key ? cleanPlayerName(data.data[0].key) : "No Data";
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
  const now = new Date().toLocaleString("en-GB", { hour12: false });

  const embed = new EmbedBuilder()
    .setThumbnail("https://cdn.discordapp.com/emojis/925776344380502126.webp?size=96&animated=true")
    .setTitle("🏆 Today's Top Daily Leaderboard Players!")
    .setColor(0x2ecc71)
    .setTimestamp();

  for (const r of results) {
    embed.addFields({
      name: `${r.gameMode} (${r.timeframe})`,
      value: r.topPlayer,
      inline: true,
    });
  }

  return embed;
}

export function initDailyTopPlayers(client, CHANNEL_ID) {
  console.log("[DailyTopPlayers] Event initialized.");

  async function performDailyPost() {
    try {
      console.log("[DailyTopPlayers] Starting warm-up fetch");
      const warmupResults = await fetchAllLeaderboards();
      console.log("[DailyTopPlayers] Warm-up fetch complete");

      await sleep(15 * 60 * 1000);

      console.log("[DailyTopPlayers] Fetching again for final post...");
      const finalResults = await fetchAllLeaderboards();
      const embed = buildTopEmbed(finalResults);

      const channel = client.channels.cache.get(CHANNEL_ID);
      if (!channel) return console.error("Invalid DAILY TOP channel ID");

      await channel.send({ embeds: [embed] });
      console.log("[DailyTopPlayers] Posted daily winners.");
    } catch (err) {
      console.error("[DailyTopPlayers] Error:", err.message);
    }
  }

  const now = new Date();
  const nextPost = new Date();

  nextPost.setUTCHours(23, 55, 0, 0);

  if (nextPost < now) {
    nextPost.setUTCDate(nextPost.getUTCDate() + 1);
  }

  const delay = nextPost.getTime() - now.getTime();
  console.log(`[DailyTopPlayers] First daily post scheduled in ${Math.round(delay / 60000)} minutes.`);

  setTimeout(() => {
    performDailyPost();
    setInterval(performDailyPost, 24 * 60 * 60 * 1000);
  }, delay);
}
