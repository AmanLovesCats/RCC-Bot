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
  .setName("ping")
  .setDescription("Check the bot's ping.");

export async function execute(interaction) {

  const ping = interaction.client.ws.ping;

  const uptimeMs = interaction.client.uptime || 0;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;

  const uptimeStr = [
    days > 0 ? `${days}d` : "",
    hours > 0 ? `${hours}h` : "",
    minutes > 0 ? `${minutes}m` : "",
    `${seconds}s`
  ].filter(Boolean).join(" ") || "just now";

  const flavors = [
    "CORUM core charging... PULSE DETECTED!",
    "Energy link established. REPULS systems nominal.",
    "Knight Software online. Latency warp: ",
    "Sierra AI syncing... Ping response incoming!",
    "REPULS armor integrity: Fully charged and ready.",
    "Quantum bounce detected. Latency at ",
    "Repuls field stable. Echo returned in "
  ];
  const randomFlavor = flavors[Math.floor(Math.random() * flavors.length)];

  const maxPing = 500;
  const filled = Math.min(10, Math.max(0, Math.round(10 * (1 - ping / maxPing))));
  const empty = 10 - filled;

  let barEmoji = "█";
  let statusEmoji = "";
  let statusText = "Fully Charged";

  if (ping < 100) {
    barEmoji = "🟩";
    statusEmoji = "";
    statusText = "Dream ping";
  } else if (ping < 250) {
    barEmoji = "🟨";
    statusEmoji = "";
    statusText = "that's my ping lol";
  } else {
    barEmoji = "🟥";
    statusEmoji = "⚠️";
    statusText = "Someone crashed their protector in the servers";
  }

  const statusBar = barEmoji.repeat(filled) + "⬛".repeat(empty);


  const title = new TextDisplayBuilder().setContent(
    "### REPULS RCC BOT STATUS"
  );

  const statusContent = new TextDisplayBuilder().setContent(
    `${randomFlavor} **${ping}ms**\n` +
    `Energy Status: ${statusText} ${statusEmoji}\n` +
    `\`\`\`ansi\n${statusBar}  ${ping}ms / ${maxPing}ms\n\`\`\`\n` +
    `Uptime: ${uptimeStr}\n`
  );

  const thumbnail = new ThumbnailBuilder({
    media: { 
      url: "https://cdn.discordapp.com/attachments/1126500874471079966/1448330537201827882/icon.png?ex=693ade6c&is=69398cec&hm=a32260c613a01e7442185811f0d02ef894a632c851d2b649370d82cfdabbe27a" 
    },
  });

  const section = new SectionBuilder()
    .addTextDisplayComponents(title, statusContent)
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

  try {
    await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        section,
        {
          type: 1,
          components: [playBtn, betaBtn, lbBtn]
        }
      ],
    });
  } catch (err) {
    console.error(err);
    const errorMsg = { content: "Error displaying REPULS status.", ephemeral: true };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMsg);
    } else {
      await interaction.reply(errorMsg);
    }
  }
}