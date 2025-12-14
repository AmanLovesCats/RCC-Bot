import axios from "axios";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

const GAME_MODES = ["CTF", "TDM", "KOTH", "TKOTH", "FFA", "GunGame"];
const TIMEFRAMES = ["daily", "weekly", "global"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanPlayerName(name) {
  return name.replace(/<color=.*?>(.*?)<\/color>/g, "[$1]");
}

async function fetchLeaderboard(gameMode, timeframe, clansOnly = false) {
  const boardName = `lb_${gameMode}_${timeframe}`;
  const API_BASE = process.env.clantracker;

  if (!API_BASE) {
    throw new Error("clantracker environment variable is not set dum dum");
  }

  const API_URL = `${API_BASE}?boardName=${boardName}&page=1`;

  try {
    const { data } = await axios.get(API_URL);
    if (!data?.data?.length) return [];
    let entries = data.data.map((entry) => ({
      name: cleanPlayerName(entry.key),
      score: entry.value,
    }));

    if (clansOnly) entries = entries.filter((e) => e.name.startsWith("["));
    return entries.slice(0, 5);
  } catch {
    return [];
  }
}

function buildLeaderboardEmbed(gameMode, timeframe, type, data) {
  const embed = new EmbedBuilder()
    .setTitle(`${timeframe.toUpperCase()} ${type.toUpperCase()} — ${gameMode}`)
    .setColor(type === "clans" ? 0xffa500 : 0x3498db)
    .setFooter({ text: "RCC Leaderboards" })
    .setTimestamp();

  if (!data || data.length === 0) {
    embed.setDescription("No entries found for this leaderboard.");
    return embed;
  }

  const desc = data
    .map((entry, i) => `**${i + 1}.** ${entry.name} — ${entry.score}`)
    .join("\n");
  embed.setDescription(desc);
  return embed;
}

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Shows RCC leaderboards for a specific timeframe, type, and game mode.")
  .addStringOption((opt) =>
    opt
      .setName("timeframe")
      .setDescription("Choose timeframe: daily, weekly, global")
      .setRequired(true)
      .addChoices(
        { name: "Daily", value: "daily" },
        { name: "Weekly", value: "weekly" },
        { name: "Global", value: "global" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("Choose type: players or clans")
      .setRequired(true)
      .addChoices(
        { name: "Players", value: "players" },
        { name: "Clans", value: "clans" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("gamemode")
      .setDescription("Game mode (CTF, TDM, KOTH, TKOTH, FFA, GunGame)")
      .setRequired(true)
      .addChoices(...GAME_MODES.map((g) => ({ name: g, value: g })))
  );

export async function execute(interaction) {
  await interaction.deferReply();
  const timeframe = interaction.options.getString("timeframe");
  const type = interaction.options.getString("type");
  const gameMode = interaction.options.getString("gamemode");

  const data = await fetchLeaderboard(gameMode, timeframe, type === "clans");
  const embed = buildLeaderboardEmbed(gameMode, timeframe, type, data);
  await interaction.editReply({ embeds: [embed] });
}
