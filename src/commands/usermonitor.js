import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";

let usermonitorEvent = null;

const NOTIFY_CHANNEL_ID = "1126164735948230709";

export const data = new SlashCommandBuilder()
  .setName("usermonitor")
  .setDescription("User monitoring controls")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt => 
    opt.setName("username").setDescription("Username").setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("action")
      .setDescription("Action")
      .setRequired(true)
      .addChoices(
        { name: "On", value: "on" },
        { name: "Off", value: "off" },
        { name: "Status", value: "status" },
        { name: "Test On", value: "test_on" },
        { name: "Test Off", value: "test_off" }
      )
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: false });

  if (!usermonitorEvent) {
    const eventPath = '../events/usermonitor.js';
    const eventModule = await import(eventPath);
    usermonitorEvent = eventModule;
    eventModule.setClient(interaction.client);
  }

  const username = interaction.options.getString("username")?.trim();
  const action = interaction.options.getString("action");

  if (action === "test_on") {
    usermonitorEvent.setTestMode(true);
    return interaction.editReply("✅ **TEST MODE ON** - Only for Aman while testing. Won't affect anything.");
  }

  if (action === "test_off") {
    usermonitorEvent.setTestMode(false);
    return interaction.editReply("✅ **TEST MODE OFF** - Normal logging");
  }

  if (!username) {
    return interaction.editReply("❌ **Usage**: `/usermonitor username:Player action:on/off/status`, didn't I tell you lol");
  }

  if (action === "status") {
    const status = await usermonitorEvent.getUserStatus(username);
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${username} Status`)
      .setDescription(status.isMonitored ? "✅ **MONITORING**" : "❌ **OFF**")
      .addFields(
        { name: "📈 Daily Scores", value: status.dailyScores.length ? status.dailyScores.join('\n') : "Not ranked", inline: true },
        { name: "💬 Last Chat", value: status.lastChat, inline: true },
        { name: "⏰ Last Updates", value: status.lastChanges.length ? status.lastChanges.join('\n') : "None", inline: false },
        { name: "🔧 Test Mode", value: status.testMode ? "✅ ON" : "❌ OFF", inline: true }
      )
      .setColor(status.isMonitored ? 0x00ff00 : 0xff0000)
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  const enabled = action === "on";
  usermonitorEvent.toggleMonitor(username, enabled);
  
  const embed = new EmbedBuilder()
    .setTitle(`${enabled ? "✅" : "❌"} ${username} ${action.toUpperCase()}`)
    .setDescription(`${enabled ? "ENABLED" : "DISABLED"}`)
    .addFields({ name: "Notifies", value: `<#${NOTIFY_CHANNEL_ID}>`, inline: true })
    .setColor(enabled ? 0x00ff00 : 0xffa500)
    .setTimestamp();

  interaction.editReply({ embeds: [embed] });
}
