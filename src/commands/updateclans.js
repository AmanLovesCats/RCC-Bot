import { SlashCommandBuilder } from "discord.js";
import { GAME_MODES, TIMEFRAMES, fetchLeaderboard, extractClanData, saveClanData } from "../events/clantracker.js";

export const data = new SlashCommandBuilder()
  .setName("updateclans")
  .setDescription("Manually refresh the clan leaderboard data");

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const startTime = Date.now();
    await interaction.editReply("⏳ Clan data update started. This may take several minutes...");

    const newClanData = {};

    for (const mode of GAME_MODES) {
      for (const timeframe of TIMEFRAMES) {
        const board = `lb_${mode}_${timeframe}`;
        console.log(`Fetching leaderboard(for error logging): ${board}...`);

        let entries;
        try {
          entries = await fetchLeaderboard(board);
        } catch (err) {
          console.error(`Failed to fetch ${board}:`, err);
          continue;
        }

        for (const entry of entries) {
          const username = entry.key;
          const value = entry.value || 0;
          const data = extractClanData(username);
          if (!data) continue;

          const { clan, color } = data;

          if (!newClanData[clan]) {
            newClanData[clan] = { totalValue: 0, color, players: [] };
          }

          newClanData[clan].totalValue += value;

          if (!newClanData[clan].players.includes(username))
            newClanData[clan].players.push(username);
        }

        await new Promise((r) => setTimeout(r, 500));
      }
    }

    saveClanData(newClanData);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    await interaction.editReply(`✅ Clan data updated successfully in ${duration}s!`);
  } catch (err) {
    console.error("Clan update failed:", err);
    try {
      await interaction.editReply("❌ An error occurred while updating clan data.");
    } catch {}
  }
}
