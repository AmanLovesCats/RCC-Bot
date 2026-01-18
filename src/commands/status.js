import {
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";
import axios from "axios";

const REGIONS_API = "https://regions.docskigames.com/getServers";

const UPTIME_API = "https://api.uptimerobot.com/v2/getMonitors";
const UPTIME_KEYS = {
  main: "m802168600-fbe3b661494e5eed0e0f800c",
  beta: "m802168604-9d219189ac5327198eadd3cf"
};

const PING_TIMEOUT = 5000;
const REGION_DELAY = 300;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkPing(url) {
  try {
    const res = await axios.get(url, {
      timeout: PING_TIMEOUT,
      validateStatus: () => true
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function fetchRegionsStatus() {
  const { data } = await axios.get(REGIONS_API, { timeout: 7000 });

  if (!Array.isArray(data?.regionList)) {
    throw new Error("Invalid regions API response");
  }

  const results = [];

  for (const region of data.regionList) {
    const isUp = await checkPing(region.pingAddress);

    results.push({
      name: region.region.toUpperCase(),
      status: isUp ? "🟢 Online" : "🔴 Offline"
    });

    await sleep(REGION_DELAY);
  }

  return results;
}

async function fetchUptimeStatus(apiKey) {
  const res = await axios.post(
    UPTIME_API,
    new URLSearchParams({
      api_key: apiKey,
      format: "json"
    }),
    { timeout: 7000 }
  );

  const monitor = res.data?.monitors?.[0];
  if (!monitor) return "⚠️ Unknown";

  if (monitor.status === 2) return "🟢 Online";
  if (monitor.status === 9) return "🔴 Offline";

  return "⚠️ Unknown";
}

export default {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Shows live Repuls.io server and website status"),

  async execute(interaction) {
    await interaction.reply({
      content: "⏳ Fetching live data...",
      ephemeral: false
    });

    try {
      const regions = await fetchRegionsStatus();

      await sleep(800);

      const mainSite = await fetchUptimeStatus(UPTIME_KEYS.main);
      await sleep(400);
      const betaSite = await fetchUptimeStatus(UPTIME_KEYS.beta);

      const embed = new EmbedBuilder()
        .setTitle("📡 Repuls.io Live Status")
        .setColor(0x00bfff)
        .setThumbnail(
          "https://cdn.discordapp.com/emojis/925776344380502126.webp?size=96&animated=true"
        )
        .addFields(
          {
            name: "🌐 Website Status",
            value:
              `**repuls.io** — ${mainSite}\n` +
              `**repuls.io/beta** — ${betaSite}`,
            inline: false
          },
          {
            name: "🖥️ Region Servers",
            value: regions
              .map(r => `**${r.name}** — ${r.status}`)
              .join("\n"),
            inline: false
          }
        )
        .setFooter({
          text: "Live data • Checked on demand"
        })
        .setTimestamp();

      await interaction.editReply({
        content: null,
        embeds: [embed]
      });

    } catch (err) {
      console.error("[/status] Error:", err);

      await interaction.editReply({
        content: "⚠️ Failed to fetch live status. Please try again shortly."
      });
    }
  }
};
