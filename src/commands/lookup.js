import axios from "axios";
import { SlashCommandBuilder } from "discord.js";

const GAME_MODES = ["CTF", "TDM", "KOTH", "TKOTH", "FFA", "GunGame"];
const TIMEFRAMES = ["daily", "weekly", "global"];
const COOLDOWN_MS = 10000;
const REQUEST_DELAY = 2000;
let globalLock = false;
let lastRequestTime = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanPlayerName(name) {
  return name.replace(/<color=.*?>(.*?)<\/color>/g, "$1");
}

async function throttledFetch(url) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY) await sleep(REQUEST_DELAY - elapsed);
  lastRequestTime = Date.now();
  return axios.get(url, { timeout: 8000 });
}

async function safeFetchLeaderboard(gameMode, timeframe) {
  const boardName = `lb_${gameMode}_${timeframe}`;
  const API_BASE = process.env.clantracker;

  if (!API_BASE) {
    throw new Error("clantracker environment variable is not set");
  }

  const url = `${API_BASE}?boardName=${boardName}&page=1`;

  let retries = 0;
  while (retries < 5) {
    try {
      const { data } = await throttledFetch(url);
      if (!Array.isArray(data?.data) || !data.data.length) return [];
      return data.data.map((entry, i) => ({
        rank: i + 1,
        name: cleanPlayerName(entry.key),
        score: entry.value,
        gameMode,
        timeframe,
      }));
    } catch (err) {
      if (err.response?.status === 429) {
        retries++;
        const retryAfter = Number(err.response.headers["retry-after"]) || 5;
        console.warn(`Rate limited fetching ${boardName}, retry ${retries}/5 after ${retryAfter}s.`);
        await sleep(retryAfter * 1000);
        continue;
      }
      console.error(`Error fetching ${boardName}:`, err.message);
      return [];
    }
  }
  console.error(`Failed ${boardName} after 5 retries.`);
  return [];
}

async function findUserPlacements(username) {
  const results = [];

  for (const timeframe of TIMEFRAMES) {
    console.log(`Fetching all modes for timeframe: ${timeframe}...`);
    const leaderboards = await Promise.all(
      GAME_MODES.map((mode) => safeFetchLeaderboard(mode, timeframe))
    );

    for (const leaderboard of leaderboards) {
      const found = leaderboard.find((e) =>
        e.name.toLowerCase().includes(username.toLowerCase())
      );
      if (found) results.push(found);
    }
  }

  return results;
}

export const data = new SlashCommandBuilder()
  .setName("user")
  .setDescription("View a specific Repuls.io user's leaderboard rankings.")
  .addStringOption((option) =>
    option
      .setName("username")
      .setDescription("Repuls in-game username")
      .setRequired(true)
  );

export async function execute(interaction) {
  const username = interaction.options.getString("username");

  if (!interaction.client.cooldowns) interaction.client.cooldowns = new Set();
  if (interaction.client.cooldowns.has(interaction.user.id)) {
    return interaction.reply({
      content: "Please wait 10 seconds before using this command again.",
      ephemeral: true,
    });
  }

  if (globalLock) {
    return interaction.reply({
      content: "The bot is currently processing another request. Please wait.",
      ephemeral: true,
    });
  }

  interaction.client.cooldowns.add(interaction.user.id);
  setTimeout(() => interaction.client.cooldowns.delete(interaction.user.id), COOLDOWN_MS);

  globalLock = true;
  try {
    await interaction.reply(`Searching leaderboards for **${username}**...`);

    const placements = await findUserPlacements(username);

    if (placements.length === 0) {
      await interaction.editReply(
        `No leaderboard entries found for **${username}** or their score is too low.`
      );
      return;
    }

    let response = `**Leaderboard Placements for ${username}:**\n\n`;
    for (const entry of placements) {
      response += `${entry.timeframe.toUpperCase()} ${entry.gameMode.toUpperCase()}: Rank ${entry.rank}, Score ${entry.score}\n`;
    }

    await interaction.editReply(response);
  } catch (err) {
    console.error("Unexpected error:", err);
    await interaction.editReply("An error occurred while fetching leaderboard data.");
  } finally {
    globalLock = false;
  }
}
