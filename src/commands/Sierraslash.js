import { SlashCommandBuilder } from "discord.js";
import { generateReply } from "../events/sierra.js";

const COOLDOWN = 30 * 1000;
const userCooldowns = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName("sierra")
    .setDescription("Ask Sierra, the REPULS AI archivist, a question.")
    .addStringOption((option) =>
      option.setName("query").setDescription("Your question for Sierra").setRequired(true)
    ),

  async execute(interaction) {
    const userInput = interaction.options.getString("query");

    const last = userCooldowns.get(interaction.user.id) || 0;
    const now = Date.now();
    if (now - last < COOLDOWN) {
      const remaining = Math.ceil((COOLDOWN - (now - last)) / 1000);
      await interaction.reply({ content: `Commander, please wait ${remaining}s before asking again.`, ephemeral: true });
      return;
    }
    userCooldowns.set(interaction.user.id, now);

    await interaction.deferReply();

    const client = interaction.client;
    if (!client.loreEmbeddings) {
      await interaction.editReply(
        "Sierra is still syncing her archives. Please wait a moment, commander."
      );
      return;
    }

    try {
      const estimatedTime = Math.min(500 + userInput.length * 50, 8000);
      await interaction.channel.sendTyping();
      await new Promise(r => setTimeout(r, estimatedTime));


      const reply = await generateReply(client.loreEmbeddings, userInput);
      await interaction.editReply(reply);
    } catch (err) {
      console.error("Error in /sierra:", err);
      await interaction.editReply("Sierra encountered an error, commander.");
      console.log("UserInput from slash:", userInput);
    }
  },
};
