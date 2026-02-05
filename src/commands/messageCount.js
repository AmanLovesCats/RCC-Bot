import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "src/data/messageCounts.json");

export default {
  data: new SlashCommandBuilder()
    .setName("messagecount")
    .setDescription("Shows message statistics from Repuls global chat(admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Select what you want to view")
        .setRequired(true)
        .addChoices(
          { name: "Specific Player", value: "player" },
          { name: "Top Players", value: "top" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Repuls username (required if type = player)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const type = interaction.options.getString("type");
    const username = interaction.options.getString("username");

    if (!fs.existsSync(DATA_FILE)) {
      return interaction.reply({
        content: "No message data found yet.",
        ephemeral: true,
      });
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    if (type === "player") {
      if (!username) {
        return interaction.reply({
          content:
            "You must provide a **username** when using `type: player`.",
          ephemeral: true,
        });
      }

      const count = data[username] || 0;

      return interaction.reply({
        content: `**${username}** has sent **${count}** message(s) in Global chat.`,
        ephemeral: true,
      });
    }

    if (type === "top") {
      const entries = Object.entries(data);

      if (entries.length === 0) {
        return interaction.reply({
          content: "No message data available yet.",
          ephemeral: true,
        });
      }

      const top10 = entries
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(
          ([user, count], i) =>
            `**${i + 1}.** ${user} — **${count}** messages`
        )
        .join("\n");

      return interaction.reply({
        content: `🏆 **Top 10 Message Senders in Global Chat**\n\n${top10}`,
        ephemeral: true,
      });
    }
  },
};
