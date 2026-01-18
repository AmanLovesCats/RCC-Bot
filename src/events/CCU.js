import axios from "axios";
import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import ChartJS from "chart.js/auto";
import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const DAILY_STATS_CHANNEL = "1126500874471079966";

let dailyData = [];
let dailyHigh = 0;
let dailyLow = Infinity;
let lastRecordedDay = new Date().getUTCDate();

const DATA_DIR = path.resolve("src/data");
const RECORD_FILE = path.join(DATA_DIR, "ccu_records.json");

let records = { highest: 0, lowest: Infinity, dailyData: [] };

if (fs.existsSync(RECORD_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(RECORD_FILE, "utf8"));
    records = { ...records, ...saved };

    if (Array.isArray(saved.dailyData)) {
      dailyData = saved.dailyData.map(e => ({
        ...e,
        time: new Date(e.time)
      }));
    }

    dailyHigh = saved.dailyHigh ?? 0;
    dailyLow = saved.dailyLow ?? Infinity;
    lastRecordedDay = saved.lastRecordedDay ?? new Date().getUTCDate();

    console.log("Loaded daily CCU from file.");
  } catch (err) {
    console.error("Failed to read record file:", err.message);
  }
}
function saveRecords() {
  try {
    fs.writeFileSync(
      RECORD_FILE,
      JSON.stringify(
        {
          ...records,
          dailyData,
          dailyHigh,
          dailyLow,
          lastRecordedDay
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error("Failed to save record file:", err.message);
  }
}

function resetAfterDailySend() {
  dailyData = [];
  dailyHigh = 0;
  dailyLow = Infinity;
  lastRecordedDay = new Date().getUTCDate();

  ccuHistory = [];
  records = { highest: 0, lowest: Infinity, dailyData: [] };

  saveRecords();
  saveHistory();

  console.log("[Daily CCU] Data reset after daily summary");
}
function checkDailyReset() {
  const today = new Date().getUTCDate();
  if (today !== lastRecordedDay) {
    resetAfterDailySend();
  }
}

function updateDailyStats(entry) {
  dailyData.push(entry);

  if (entry.global > dailyHigh) dailyHigh = entry.global;
  if (entry.global < dailyLow) dailyLow = entry.global;

  saveRecords();
}
async function sendDailySummary(client) {
  if (dailyData.length === 0) return;

  const asPeak = Math.max(...dailyData.map(d => d.asTotal));
  const euPeak = Math.max(...dailyData.map(d => d.euTotal));
  const naPeak = Math.max(...dailyData.map(d => d.naTotal));

  const modePeaks = {
    cs: Math.max(...dailyData.map(d => d.cs)),
    hc: Math.max(...dailyData.map(d => d.hc)),
    wf: Math.max(...dailyData.map(d => d.wf)),
    cm: Math.max(...dailyData.map(d => d.cm)),
  };

  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 800, 400);

  new ChartJS(ctx, {
    type: "line",
    data: {
      labels: dailyData.map(e => e.time.toLocaleTimeString()),
      datasets: [
        { label: "Asia", data: dailyData.map(e => e.asTotal), borderColor: "#FF5555" },
        { label: "Europe", data: dailyData.map(e => e.euTotal), borderColor: "#5555FF" },
        { label: "North America", data: dailyData.map(e => e.naTotal), borderColor: "#55FF55" },
        { label: "Global", data: dailyData.map(e => e.global), borderColor: "#FFA500" },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: { display: true, text: "Last 24 hours", color: "white" },
        legend: { labels: { color: "white" } },
      },
      scales: {
        x: { display: false },
        y: { ticks: { color: "white" }, beginAtZero: true },
      },
    },
  });

  const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: "daily_ccu.png",
  });

  const embed = new EmbedBuilder()
    .setThumbnail("https://cdn.discordapp.com/emojis/925776344380502126.webp?size=96&animated=true")
    .setTitle("📊 Today's Repuls Activity!")
    .setColor("#0B27F4")
    .setDescription(
      `### **Global Peak:** ${dailyHigh}\n` +
      `### **Peak by Region:**\n` +
      `• 🌏 Asia: ${asPeak}\n` +
      `• 🇪🇺 Europe: ${euPeak}\n` +
      `• 🇺🇸 North America: ${naPeak}\n\n` +
      `### **Peak by Gamemode:**\n` +
      `• ⚔ Casual: ${modePeaks.cs}\n` +
      `• 💀 Hardcore: ${modePeaks.hc}\n` +
      `• 🌐 Warfare: ${modePeaks.wf}\n` +
      `• 🛠 Custom: ${modePeaks.cm}\n\n` +
      `**Summary Time:** <t:${Math.floor(Date.now() / 1000)}:F>`
    )
    .setImage("attachment://daily_ccu.png");

  const channel = await client.channels.fetch(DAILY_STATS_CHANNEL);
  if (channel) {
  await channel.send({ embeds: [embed], files: [attachment] });
  resetAfterDailySend();
}

console.log("Daily summary sent and data reset!");
}

const API_URL = process.env.CCU;

const UPDATE_INTERVAL = 10000;
const HISTORY_LIMIT = 1440;

const HISTORY_FILE = path.join(DATA_DIR, "ccu_history.json");

let ccuHistory = [];
let latestGlobalCCU = 0;

if (fs.existsSync(HISTORY_FILE)) {
  try {
    const savedHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    ccuHistory = savedHistory.map(h => ({
      ...h,
      time: new Date(h.time),
    }));
  } catch (err) {
    console.error("Failed to read CCU history file:", err.message);
  }
}

function getRegionData(region, data) {
  return {
    cs: data?.perRegion?.[region]?.cs ?? 0,
    hc: data?.perRegion?.[region]?.hc ?? 0,
    wf: data?.perRegion?.[region]?.wf ?? 0,
    cm: data?.perRegion?.[region]?.cm ?? 0,
  };
}

function getUniversalTimestamp() {
  const now = new Date();
  const iso = now.toISOString();
  const unix = Math.floor(now.getTime() / 1000);
  return { iso, unix };
}

function saveHistory() {
  try {
    fs.writeFileSync(
      HISTORY_FILE,
      JSON.stringify(ccuHistory, null, 2)
    );
  } catch (err) {
    console.error("Failed to save CCU history:", err.message);
  }
}

let saveCounter = 0;

async function fetchCCU(client) {
  try {
    checkDailyReset();

    const res = await axios.get(API_URL);
    const data = res.data;

    const as = getRegionData("as01", data);
    const eu = getRegionData("eu01", data);
    const na = getRegionData("na01", data);
    const rawGlobal = data?.global ?? {};

    const global = {
      cs: rawGlobal.cs ?? rawGlobal.CS ?? rawGlobal.casual ?? 0,
      hc: rawGlobal.hc ?? rawGlobal.HC ?? rawGlobal.hardcore ?? 0,
      wf: rawGlobal.wf ?? rawGlobal.WF ?? rawGlobal.warfare ?? 0,
      cm: rawGlobal.cm ?? rawGlobal.CM ?? rawGlobal.custom ?? 0,
    };

    const asTotal = as.cs + as.hc + as.wf + as.cm;
    const euTotal = eu.cs + eu.hc + eu.wf + eu.cm;
    const naTotal = na.cs + na.hc + na.wf + na.cm;
    const globalTotal = global.cs + global.hc + global.wf + global.cm;
    latestGlobalCCU = globalTotal;

    if (globalTotal > records.highest) records.highest = globalTotal;
    if (globalTotal < records.lowest) records.lowest = globalTotal;

    saveRecords();

    const { iso, unix } = getUniversalTimestamp();

    updateDailyStats({
      time: new Date(iso),
      asTotal,
      euTotal,
      naTotal,
      cs: global.cs,
      hc: global.hc,
      wf: global.wf,
      cm: global.cm,
      global: globalTotal
    });

    ccuHistory.push({
      time: new Date(iso),
      asTotal,
      euTotal,
      naTotal,
      global: globalTotal,
    });

    if (ccuHistory.length > HISTORY_LIMIT) ccuHistory.shift();

    saveCounter++;
    if (saveCounter >= 30) {
      saveHistory();
      saveCounter = 0;
    }

    await updateGraphAndEmbed(client, as, eu, na, global, unix, globalTotal);
  } catch (err) {
    console.error("Error fetching CCU:", err.message);
  }
}

async function updateGraphAndEmbed(client, as, eu, na, global, unix, total) {
}

export async function initCCUTracker(client) {
  console.log("CCU Tracker initialized.");

  await fetchCCU(client);

  setInterval(() => fetchCCU(client), UPDATE_INTERVAL);

  function msUntil6AMIST() {
    const now = new Date();
    const target = new Date();

    target.setUTCHours(0, 30, 0, 0);

    if (now > target) {
      target.setUTCDate(target.getUTCDate() + 1);
    }

    return target - now;
  }

  setTimeout(() => {
    sendDailySummary(client);
    setInterval(() => sendDailySummary(client), 24 * 60 * 60 * 1000);

  }, msUntil6AMIST());
}


export function getLatestCCU() {
  return latestGlobalCCU;
}
