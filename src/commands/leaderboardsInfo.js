import pkg from "discord.js";

const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SectionBuilder,
} = pkg;

export const data = new SlashCommandBuilder()
  .setName("leaderboard-info")
  .setDescription("Shows information about the Repuls.io Leaderboards.");

export async function execute(interaction) {
  const commands = await interaction.client.application.commands.fetch();

  const leaderboardCmd = `</leaderboard:${commands.find(c => c.name === "leaderboard")?.id}>`;
  const userCmd = `</user:${commands.find(c => c.name === "user")?.id}>`;

  const title = new TextDisplayBuilder().setContent(
    "### 📊 Repuls.io Leaderboard Information",
  );

  const infoText = new TextDisplayBuilder().setContent(
    [
      "The **Repuls.io Leaderboards** track competitive performance across multiple game modes.",
      "",
      "### 🔧 Useful Commands",
      `• ${leaderboardCmd} — View the full leaderboard with detailed breakdowns.`,
      `• ${userCmd} — Look up a specific player by username.`,
      "",
      "### 🏆 Leaderboards Include:",
      "**Timeframe:** Leaderboards are segregated into Daily, Weekly and Global Leaderboards on the basis of timeframe",
      "**Category:**  Leaderboards can either be filtered by Players(Individuals) or Clans.",
      "**Gamemodes:** Capture The Flag, Team Control, Team Deathmatch, Control, Free For All and Gun Game",
      "",
      "Total combinations: **36 Leaderboards**",
      "",
      "### 🔄 Update Frequency",
      "• Daily resets at **<t:1765324800:t>**",
      "• Weekly resets every **168 hours (7 days)** after last refresh.",
      "",
      "### 🎮 Esports",
      "Events are occasionally held for leaderboard rankings. Most recent: **The Relay**.",
      "",
      "**Useful links below.**",
    ].join("\n"),
  );

  const thumbnail = new ThumbnailBuilder({
    media: {
      url: "https://cdn.discordapp.com/attachments/1126500874471079966/1448330537201827882/icon.png?ex=693ade6c&is=69398cec&hm=a32260c613a01e7442185811f0d02ef894a632c851d2b649370d82cfdabbe27a",
    },
  });

  const section = new SectionBuilder()
    .addTextDisplayComponents(title, infoText)
    .setThumbnailAccessory(thumbnail);

  const lbBtn = new ButtonBuilder()
    .setLabel("Open Leaderboards")
    .setStyle(ButtonStyle.Link)
    .setURL("https://repuls.io/leaderboard/");

  const playBtn = new ButtonBuilder()
    .setLabel("Play REPULS")
    .setStyle(ButtonStyle.Link)
    .setURL("https://repuls.io");

  const esportsBtn = new ButtonBuilder()
    .setLabel("Esports Discord")
    .setStyle(ButtonStyle.Link)
    .setURL("https://discord.gg/HY9w2eXE");

  try {
    await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        section,
        { type: 1, components: [lbBtn, playBtn, esportsBtn] },
      ],
      ephemeral: false,
    });
  } catch (err) {
    console.error(err);
    await interaction.reply("huh");
    await interaction.followUp({
      flags: MessageFlags.IsComponentsV2,
      components: [
        section,
        { type: 1, components: [lbBtn, playBtn, esportsBtn] },
      ],
      ephemeral: false,
    });
  }
}
