import {
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("find-servers")
    .setDescription("Find servers by region, map, mode, and whether they are empty.")
    .addStringOption(o =>
      o.setName("region")
        .setDescription("Region to search (AS01, EU01, NA01)")
        .setRequired(true)
        .addChoices(
          { name: "AS01", value: "AS01" },
          { name: "EU01", value: "EU01" },
          { name: "NA01", value: "NA01" },
        )
    )
    .addStringOption(o =>
      o.setName("map")
        .setDescription("Filter by map (optional)")
        .setRequired(false)
        .addChoices(
          { name: "Coastal", value: "Coastal" },
          { name: "Isolation", value: "Isolation" },
          { name: "Echoes", value: "Echoes" },
          { name: "Element", value: "Element" },
          { name: "Snow Fall", value: "Snow Fall" },
          { name: "Sand Lock", value: "Sand Lock" },
          { name: "Grunge", value: "Grunge" },
          { name: "Fortress", value: "Fortress" },
          { name: "Outlook", value: "Outlook" },
          { name: "Summit", value: "Summit" },
          { name: "Containment", value: "Containment" },
          { name: "Confront", value: "Confront" },
        )
    )
    .addStringOption(o =>
      o.setName("mode")
        .setDescription("Filter by game mode (optional)")
        .setRequired(false)
        .addChoices(
          { name: "Capture The Flag", value: "Capture The Flag" },
          { name: "Team Deathmatch", value: "Team Deathmatch" },
          { name: "Team Control Point", value: "Team Control Point" },
          { name: "Shotty Snipes", value: "Shotty Snipes" },
          { name: "Rocket Royale", value: "Rocket Royale" },
          { name: "Gun Game", value: "Gun Game" },
          { name: "Team Snipers", value: "Team Snipers" },
          { name: "Free For All", value: "Free For All" },
          { name: "Control Point", value: "Control Point" },
          { name: "Shotty Swords", value: "Shotty Swords" },
        )
    )
    .addBooleanOption(o =>
      o.setName("empty")
        .setDescription("Only empty servers?")
        .setRequired(false)
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction
   */
  async execute(interaction, client) {
    const region = interaction.options.getString("region");
    const mapFilter = interaction.options.getString("map");
    const modeFilter = interaction.options.getString("mode");
    const emptyOnly = interaction.options.getBoolean("empty") ?? false;

    const REGION_ENDPOINTS = {
      AS01: process.env.AS01,
      EU01: process.env.EU01,
      NA01: process.env.NA01,
    };

    async function fetchList() {
      try {
        const axios = (await import("axios")).default;
        const res = await axios.get(REGION_ENDPOINTS[region], { timeout: 6000 });
        const list = res.data.serverList || [];
        return list.map(s => ({
          ...s,
          playerCount: Number(s.playerCount) || 0,
          maxPlayers: Number(s.maxPlayers) || 0,
          webPort: s.webPort || s.webport || s.web_port || s.port || 0,
        }));
      } catch (e) {
        return [];
      }
    }

    await interaction.deferReply({ ephemeral: true });

    const servers = await fetchList();

    if (!servers.length) {
      return interaction.editReply(`No servers found for **${region}**. rip lmao`);
    }

    let filtered = servers;

    if (mapFilter) {
      filtered = filtered.filter(s =>
        s.gameMap?.toLowerCase() === mapFilter.toLowerCase()
      );
    }

    if (modeFilter) {
      filtered = filtered.filter(s =>
        s.gameMode?.toLowerCase() === modeFilter.toLowerCase()
      );
    }

    if (emptyOnly) {
      filtered = filtered.filter(s => s.playerCount === 0);
    }

    if (!filtered.length) {
      return interaction.editReply(
        `No servers match your filters.\nRegion: **${region}**` +
          (mapFilter ? `\nMap: **${mapFilter}**` : "") +
          (modeFilter ? `\nMode: **${modeFilter}**` : "") +
          (emptyOnly ? "\nEmpty only: **true**" : "")
      );
    }

    const embed = new EmbedBuilder()
      .setTitle(`Server Search Results (${region})`)
      .setColor(0x00ffcc)
      .setTimestamp();

    let desc = "";

    for (const s of filtered) {
      const link = `https://repuls.io/?r=${region.toLowerCase()}|${s.webPort}`;

      desc += `**${s.gameId}**\n`;
      desc += `🗺 ${s.gameMap} | 🎮 ${s.gameMode}\n`;
      desc += `👥 ${s.playerCount}/${s.maxPlayers}\n`;
      desc += `🔗 [Join Server](${link})\n\n`;

      if (desc.length > 3500) {
        desc += "… truncated …\n";
        break;
      }
    }

    embed.setDescription(desc);

    return interaction.editReply({ embeds: [embed] });
  },
};
