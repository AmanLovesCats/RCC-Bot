import { SlashCommandBuilder, PermissionFlagsBits  } from "discord.js";
import { getClanLeaderboardEmbed } from "../events/clantracker.js";

export const data = new SlashCommandBuilder()
  .setName("clans")
  .setDescription("View the current clan leaderboard")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function stripColorTags(text) {
  if (!text) return text;
  return text.replace(/<color=[^>]+>(.*?)<\/color>/gi, "$1");
}

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    let embed = await getClanLeaderboardEmbed(interaction.client);
    if (!embed) {
      await interaction.editReply("No clan data available right now.");
      return;
    }

    const cleanEmbed = { ...embed.data };

    if (cleanEmbed.description) {
      cleanEmbed.description = stripColorTags(cleanEmbed.description);
    }

    if (Array.isArray(cleanEmbed.fields)) {
      cleanEmbed.fields = cleanEmbed.fields.map(f => ({
        ...f,
        name: stripColorTags(f.name),
        value: stripColorTags(f.value),
      }));
    }
    await interaction.editReply({ embeds: [cleanEmbed] });
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("There was an error executing this command.");
    } else {
      await interaction.reply({
        content: "There was an error executing this command.",
        ephemeral: true,
      });
    }
  }
}
