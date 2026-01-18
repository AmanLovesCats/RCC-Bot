import {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SectionBuilder
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show all available RCC bot commands and info.");

export async function execute(interaction) {

  const commands = await interaction.client.application.commands.fetch();
  const leaderboardCmd = `</leaderboard:${commands.find(c => c.name === "leaderboard")?.id}>`;
  const userCmd = `</user:${commands.find(c => c.name === "user")?.id}>`;
  const sierraCmd = `</sierra:${commands.find(c => c.name === "sierra")?.id}>`;
  const findServersCmd = `</find-servers:${commands.find(c => c.name === "find-servers")?.id}>`;
  const leaderboardinfoCmd = `</leaderboard-info:${commands.find(c => c.name === "leaderboard-info")?.id}>`;

  const title = new TextDisplayBuilder().setContent(
    "### Heya! :RGBrepuls:"
  );

  const cmdList = new TextDisplayBuilder().setContent(
    [
      "",
      "\n\n**Here are the available RCC commands:**",
      `• ${leaderboardCmd} — View detailed listings of a specific leaderboard.`,
      `• ${userCmd} — View a specific user's ranking on the leaderboards.`,
      `• ${sierraCmd} or !sierra <question> — Ask the remade Sierra AI about REPULS lore.`,
      `• ${findServersCmd} — Find available or empty servers with a simple query.`,
      `• ${leaderboardinfoCmd} — Get detailed info on how the leaderboards work.`,
      "",
      "**Useful Links Below:**"
    ].join("\n")
  );

  const thumbnail = new ThumbnailBuilder({
    media: {
      url: "https://cdn.discordapp.com/attachments/1126500874471079966/1448330537201827882/icon.png?ex=693ade6c&is=69398cec&hm=a32260c613a01e7442185811f0d02ef894a632c851d2b649370d82cfdabbe27a",
    },
  });

  const section = new SectionBuilder()
    .addTextDisplayComponents(title, cmdList)
    .setThumbnailAccessory(thumbnail);

  const playBtn = new ButtonBuilder()
    .setLabel("Play REPULS")
    .setStyle(ButtonStyle.Link)
    .setURL("https://repuls.io");

  const betaBtn = new ButtonBuilder()
    .setLabel("BETA")
    .setStyle(ButtonStyle.Link)
    .setURL("https://repuls.io/beta");

  const lbBtn = new ButtonBuilder()
    .setLabel("Leaderboards")
    .setStyle(ButtonStyle.Link)
    .setURL("https://repuls.io/leaderboard/");

  const esportsBtn = new ButtonBuilder()
    .setLabel("Esports Discord")
    .setStyle(ButtonStyle.Link)
    .setURL("https://discord.gg/t62W9BMqXM");

  try {
    await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        section,
        { type: 1, components: [playBtn, betaBtn, lbBtn, esportsBtn] }
      ],
      ephemeral: true
    });
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: "There was an error sending the help menu.",
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: "There was an error sending the help menu.",
        ephemeral: true
      });
    }
  }
}
