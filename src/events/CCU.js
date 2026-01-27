import fetch from "node-fetch";
import { AttachmentBuilder } from "discord.js";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "src/data");
const CCU_FILE = path.join(DATA_DIR, "ccuHistory.json");

let lastReportDate = null;

function loadPersistentData() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CCU_FILE)) return;

    const raw = JSON.parse(fs.readFileSync(CCU_FILE, "utf8"));

    ccuHistory = (raw.ccuHistory || []).map(e => ({
      ...e,
      time: new Date(e.time),
    }));

    peakGlobal = raw.peakGlobal || 0;
    peakRegion = raw.peakRegion || peakRegion;
    peakGamemode = raw.peakGamemode || peakGamemode;
  } catch (e) {
    console.error("Failed to load CCU persistence:", e.message);
  }
}


function savePersistentData() {
  try {
    fs.writeFileSync(
      CCU_FILE,
      JSON.stringify(
        {
          ccuHistory,
          peakGlobal,
          peakRegion,
          peakGamemode,
        },
        null,
        2
      )
    );
  } catch (e) {
    console.error("Failed to save CCU persistence:", e.message);
  }
}


const CCU_API = "https://stats.docskigames.com/api/ccu-current";
const POLL_INTERVAL = 60 * 1000;
const REPORT_CHANNEL_ID = "1126164735948230709";

const TEST_MODE = false;

export let latestGlobalCCU = 0;

let ccuHistory = [];
let peakGlobal = 0;

let peakRegion = {
  as01: 0,
  eu01: 0,
  na01: 0,
  na02: 0,
};

let peakGamemode = {
  cm: 0,
  cs: 0,
  hc: 0,
  wf: 0,
};

async function fetchCCU() {
  try {
    const res = await fetch(CCU_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    const globalTotal = 
      (data.global?.cm || 0) +
      (data.global?.cs || 0) +
      (data.global?.hc || 0) +
      (data.global?.wf || 0);

    latestGlobalCCU = globalTotal;

    ccuHistory.push({
      time: new Date(),
      global: globalTotal,
      cs: data.global?.cs || 0,
      hc: data.global?.hc || 0,
      wf: data.global?.wf || 0,
      cm: data.global?.cm || 0,
    });

    peakGlobal = Math.max(peakGlobal, globalTotal);

    for (const region in (data.perRegion || {})) {
      const total =
        (data.perRegion[region]?.cm || 0) +
        (data.perRegion[region]?.cs || 0) +
        (data.perRegion[region]?.hc || 0) +
        (data.perRegion[region]?.wf || 0);

      if (peakRegion[region] !== undefined) {
        peakRegion[region] = Math.max(peakRegion[region], total);
      }
    }

    for (const mode of ["cm", "cs", "hc", "wf"]) {
      peakGamemode[mode] = Math.max(
        peakGamemode[mode],
        data.global?.[mode] || 0
      );
    }
  } catch (err) {
    console.error("CCU fetch failed:", err.message);
  }
  savePersistentData();
}


async function generateChart() {
  const width = 900;
  const height = 400;
  const canvas = new ChartJSNodeCanvas({ width, height });

  const labels = ccuHistory.map(e =>
    e.time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  );

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Global",
          data: ccuHistory.map(e => e.global),
          borderWidth: 2,
          tension: 0.3,
        },
        {
          label: "Casual",
          data: ccuHistory.map(e => e.cs),
          borderWidth: 1,
          tension: 0.3,
        },
        {
          label: "Hardcore",
          data: ccuHistory.map(e => e.hc),
          borderWidth: 1,
          tension: 0.3,
        },
        {
          label: "Warfare",
          data: ccuHistory.map(e => e.wf),
          borderWidth: 1,
          tension: 0.3,
        },
        {
          label: "Custom",
          data: ccuHistory.map(e => e.cm),
          borderWidth: 1,
          tension: 0.3,
        },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true },
      },
    },
  };

  return await canvas.renderToBuffer(config);
}


async function sendReport(client) {
  const channel = await client.channels.fetch(REPORT_CHANNEL_ID);
  if (!channel) return;

  const chartBuffer = await generateChart();
  const attachment = new AttachmentBuilder(chartBuffer, {
    name: "ccu.png",
  });

  const embed = {
    color: 0x2f3136,
    author: {
      name: "REPULS.IO by DOCSKI",
      icon_url: "https://cdn.discordapp.com/avatars/213028561584521216/a6962bf317cf74819879890cc706cdc3.png?size=1024",
      url: "https://repuls.io",
    },
    thumbnail: {
  url: "https://cdn.discordapp.com/emojis/925776344380502126.webp?size=96&animated=true",
},

    title: "📊 Today's Repuls Activity!",
    description:
      `### 🌍 **Peak Global CCU:** ${peakGlobal}\n\n` +
      `### 🗺️ **Peak by Region**\n` +
      `AS01: ${peakRegion.as01}\n` +
      `EU01: ${peakRegion.eu01}\n` +
      `NA01: ${peakRegion.na01}\n` +
      `NA02: ${peakRegion.na02}\n\n` +
      `### 🎮 **Peak by Gamemode**\n` +
      `Casual: ${peakGamemode.cs}\n` +
      `Hardcore: ${peakGamemode.hc}\n` +
      `Warfare: ${peakGamemode.wf}\n` +
      `Custom: ${peakGamemode.cm}`,
    image: {
      url: "attachment://ccu.png",
    },
    timestamp: new Date().toISOString(),
  };

  await channel.send({
    embeds: [embed],
    files: [attachment],
  });
}


function resetDailyData() {
  ccuHistory = [];
  peakGlobal = 0;
  peakRegion = { as01: 0, eu01: 0, na01: 0, na02: 0 };
  peakGamemode = { cm: 0, cs: 0, hc: 0, wf: 0 };

  savePersistentData();
}


function startScheduler(client) {
  setInterval(fetchCCU, POLL_INTERVAL);

  if (TEST_MODE) {
    setInterval(() => sendReport(client), 5 * 60 * 1000);
    return;
  }

  setInterval(() => {
    const now = new Date();
    const ist = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );

    const todayKey = ist.toISOString().slice(0, 10);

    if (
      ist.getHours() === 5 &&
      ist.getMinutes() === 10 &&
      lastReportDate !== todayKey
    ) {
      lastReportDate = todayKey;

      sendReport(client).then(() => {
        setTimeout(() => {
          resetDailyData();
          console.log("Daily CCU data reset after report");
        }, 5000);
      }).catch(err => {
        console.error("Report failed, skipping reset:", err);
      });
    }
  }, 60 * 1000);
}


export function initCCUTracker(client) {
  loadPersistentData();
  fetchCCU();
  startScheduler(client);
}
