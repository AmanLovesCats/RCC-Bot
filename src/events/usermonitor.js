import WebSocket from "ws";
import { EmbedBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import axios from "axios";

const GAME_MODES = ["CTF", "TDM", "KOTH", "TKOTH", "FFA", "GunGame"];
const DATA_FILE = path.join(process.cwd(), "src/data/usermonitor.json");
const NOTIFY_CHANNEL_ID = "1126164735948230709";
const CHECK_INTERVAL = 60 * 1000;
const NOTIFY_COOLDOWN = 3 * 60 * 1000;
const BIG_LEAP_THRESHOLD = 1000;

let ws = null;
let monitoringInterval = null;
let client = null;
let TEST_MODE = false;

export function setClient(newClient) {
  client = newClient;
}

export function setTestMode(enabled) {
  TEST_MODE = enabled;
  const data = loadData();
  data.testMode = enabled;
  saveData(data);
  console.log(`[USERMONITOR] Test mode ${enabled ? 'ON' : 'OFF'}`);
}

function log(message, forceConsole = false) {
  const prefix = (TEST_MODE || forceConsole) ? "[DEBUG] " : "[INFO] ";
  //console.log(prefix + message);
}

function extractBaseUsername(fullName, targetUsername) {
  const cleanFull = fullName.replace(/<color=.*?>/g, "").replace(/<\/color>/g, "");
  const targetLower = targetUsername.toLowerCase();
  
  if (cleanFull.toLowerCase() === targetLower) {
    return fullName;
  }
  
  const clanMatch = cleanFull.match(/\[.*?\]\s*(.+)/i);
  if (clanMatch) {
    const baseName = clanMatch[1].trim();
    if (baseName.toLowerCase() === targetLower) {
      return fullName;
    }
  }
  
  return null;
}

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ 
      monitored: {}, 
      lastChecks: {}, 
      chatActivity: {},
      lastNotifications: {},
      testMode: false
    }, null, 2));
  }
}

function loadData() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { monitored: {}, lastChecks: {}, chatActivity: {}, lastNotifications: {}, testMode: false };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[ERROR] Failed to save data:", e);
  }
}

async function fetchPlayerScore(gameMode, timeframe, username) {
  if (TEST_MODE) log(`Fetching ${timeframe} ${gameMode} for ${username}`);
  const boardName = `lb_${gameMode}_${timeframe}`;
  const API_BASE = process.env.clantracker;
  if (!API_BASE) return null;
  
  try {
    const { data } = await axios.get(`${API_BASE}?boardName=${boardName}&page=1`, { timeout: 10000 });
    if (!data?.data?.length) return null;
    
    for (const entry of data.data) {
      const matchedName = extractBaseUsername(entry.key, username);
      if (matchedName) {
        if (TEST_MODE) log(`✅ FOUND ${username} as "${matchedName}" in ${gameMode}: ${entry.value}`);
        return { 
          name: matchedName,
          baseName: username,
          score: entry.value 
        };
      }
    }
    return null;
  } catch (e) {
    if (TEST_MODE) log(`❌ Failed ${gameMode} ${timeframe}: ${e.message}`);
    return null;
  }
}

function startChatMonitoring() {
  if (ws) ws.close();
  
  const CHAT_TOKEN = "D6DF54CE8058AD8E-98F3B225FA181532-34E8C2E49EEBFD11-DF3EF-8DE619C0777952F-AFngPwnzzDui232P+Vb/SM9PwxMvxpADU2BiSI9EF18=";
  ws = new WebSocket(process.env.chat || "wss://repuls.io/chat", {
    headers: {
      "Origin": "https://repuls.io",
      "User-Agent": "Mozilla/5.0",
      "Authorization": CHAT_TOKEN
    }
  });

  ws.on("open", () => {
    log("Chat WS for Admin connected", true);
    ws.send(JSON.stringify({
      ev: "authenticate",
      data: JSON.stringify({ sessionTicket: CHAT_TOKEN, friendList: [] })
    }));
    setTimeout(() => {
      ws.send(JSON.stringify({
        ev: "subscribeChannel",
        data: JSON.stringify({ channelName: "Global" })
      }));
    }, 1000);
  });

  ws.on("message", (msg) => {
    try {
      const packet = JSON.parse(msg.toString());
      if (packet.ev === "channelMessage") {
        const chat = JSON.parse(packet.data);
        const { sender, message } = chat;
        
        const data = loadData();
        for (const [user, enabled] of Object.entries(data.monitored)) {
          if (!enabled) continue;
          
          const senderMatched = extractBaseUsername(sender, user);
          const isSelfChat = senderMatched || sender.toLowerCase() === user.toLowerCase();
          const isMentioned = message.toLowerCase().includes(user.toLowerCase());
          
          if (isSelfChat || isMentioned) {
            data.chatActivity[user] = {
              timestamp: Date.now(),
              type: isSelfChat ? "self_chat" : "mentioned",
              by: sender,
              message: message.substring(0, 100),
              displayName: senderMatched || sender
            };
            saveData(data);
            log(`TRIGGERED ${user} (${isSelfChat ? 'self' : 'mention'}) as "${senderMatched || sender}"`, true);
          }
        }
      }
    } catch (e) {
      log("Chat parse error: " + e.message);
    }
  });

  ws.on("close", () => setTimeout(startChatMonitoring, 3000));
  ws.on("error", (e) => log("Chat WS error: " + e.message));
}

async function checkChatNotifications() {
  const data = loadData();
  const now = Date.now();
  const notifyChannel = client?.channels.cache.get(NOTIFY_CHANNEL_ID);
  if (!notifyChannel) return;

  for (const [username, chatActivity] of Object.entries(data.chatActivity || {})) {
    if (now - chatActivity.timestamp < 2 * 60 * 1000) {
      const embed = new EmbedBuilder()
        .setTitle(`💬 ${username} ${chatActivity.type === 'self_chat' ? 'Chatted' : 'Mentioned'}`)
        .setDescription(
          chatActivity.type === 'self_chat' 
            ? `**[${chatActivity.displayName}] Global chat:** "${chatActivity.message}..."`
            : `**Mentioned by ${chatActivity.by}:** "${chatActivity.message}..."`
        )
        .setColor(chatActivity.type === 'self_chat' ? 0x00ff00 : 0x9b59b6)
        .setTimestamp();
      
      await notifyChannel.send({ embeds: [embed] });
      log(`SENT CHAT NOTIF: ${username}`, true);
      delete data.chatActivity[username];
      saveData(data);
    }
  }
}

async function checkLeaderboards() {
  log("=== CHECK CYCLE ===", TEST_MODE);
  const data = loadData();
  const now = Date.now();
  const notifyChannel = client?.channels.cache.get(NOTIFY_CHANNEL_ID);
  if (!notifyChannel) return;

  await checkChatNotifications();

  const activeUsers = Object.keys(data.monitored).filter(u => data.monitored[u]);
  log(`Monitoring ${activeUsers.length} users`, TEST_MODE);

  for (const username of activeUsers) {
    log(`\nChecking ${username}`, TEST_MODE);
    
    let dailyChanges = [];
    let bigLeaps = [];
    let leaderboardSwitches = [];

    for (const gameMode of GAME_MODES) {
      const key = `${username}_daily_${gameMode}`;
      
      const currentScore = await fetchPlayerScore(gameMode, "daily", username);
      const lastData = data.lastChecks[key];
      const lastScore = lastData?.score || 0;
      const lastNotifyTime = data.lastNotifications[key] || 0;

      log(`${gameMode}: ${currentScore ? `${currentScore.name} (${currentScore.score})` : 'N/A'} (was ${lastScore})`, TEST_MODE);
      
      if (currentScore) {
        const scoreChange = currentScore.score - lastScore;
        
        if (scoreChange > 100 && (now - lastNotifyTime > NOTIFY_COOLDOWN)) {
          dailyChanges.push({ 
            mode: gameMode, 
            displayName: currentScore.name,
            before: lastScore, 
            after: currentScore.score, 
            change: scoreChange 
          });
          data.lastNotifications[key] = now;
          log(`REGULAR CHANGE ${gameMode}: +${scoreChange}`, true);
        }
        
        if (scoreChange > BIG_LEAP_THRESHOLD) {
          bigLeaps.push({ 
            mode: gameMode, 
            displayName: currentScore.name,
            before: lastScore, 
            after: currentScore.score, 
            change: scoreChange 
          });
          log(`BIG LEAP ${gameMode}: +${scoreChange}`, true);
        }
        
        if (lastScore === 0 && currentScore.score > 0) {
          leaderboardSwitches.push({ mode: gameMode, displayName: currentScore.name });
          log(`NEW APPEARANCE ${gameMode} as ${currentScore.name}`, true);
        }

        data.lastChecks[key] = { score: currentScore.score, timestamp: now, displayName: currentScore.name };
      }
    }

    if (dailyChanges.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle(`📈 ${username} Points Changed, they are online right now`)
        .setDescription(dailyChanges.map(c => 
          `**${c.mode}** (${c.displayName})\n${c.before.toLocaleString()} → **${c.after.toLocaleString()}**\n+${c.change} pts`
        ).join('\n'))
        .setColor(0x3498db)
        .setTimestamp();
      notifyChannel.send({ embeds: [embed] });
    }

    if (bigLeaps.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle(`🚨 ${username} SUSPICIOUS LEAP!`)
        .setDescription(bigLeaps.map(c => 
          `**${c.mode}** (${c.displayName})\n${c.before.toLocaleString()} → **${c.after.toLocaleString()}**\n+${c.change} pts`
        ).join('\n'))
        .setColor(0xff0000)
        .setTimestamp();
      notifyChannel.send({ embeds: [embed] });
    }

    if (leaderboardSwitches.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle(`🔄 ${username} appeared as:`)
        .setDescription(leaderboardSwitches.map(s => `**${s.mode}**: ${s.displayName}`).join('\n'))
        .setDescription("New leaderboard appearances detected.")
        .setColor(0xffa500)
        .setTimestamp();
      notifyChannel.send({ embeds: [embed] });
    }
  }
  
  saveData(data);
}

export function init(clientInstance) {
  setClient(clientInstance);
  log("UserMonitor started", true);
  monitoringInterval = setInterval(checkLeaderboards, CHECK_INTERVAL);
  startChatMonitoring();
}

export function toggleMonitor(username, enabled) {
  const data = loadData();
  data.monitored[username] = enabled;
  saveData(data);
  log(`${username} ${enabled ? 'ON' : 'OFF'}`, true);
}

export async function getUserStatus(username) {
  const data = loadData();
  const dailyScores = [];
  const lastChanges = [];

  for (const gm of GAME_MODES) {
    const score = await fetchPlayerScore(gm, "daily", username);
    if (score) {
      dailyScores.push(`**${gm}**: ${score.name} (${score.score.toLocaleString()})`);
    }
    const lastCheck = data.lastChecks[`${username}_daily_${gm}`];
    if (lastCheck && lastCheck.score > 0) {
      lastChanges.push(`**${gm}**: ${lastCheck.displayName || 'Unknown'} (${new Date(lastCheck.timestamp).toLocaleString("en-US")})`);
    }
  }

  const chatActivity = data.chatActivity[username];
  return {
    isMonitored: !!data.monitored[username],
    dailyScores,
    lastChat: chatActivity ? `${chatActivity.type} (${new Date(chatActivity.timestamp).toLocaleString("en-US")})` : "Never",
    lastChanges,
    totalMonitored: Object.keys(data.monitored).filter(u => data.monitored[u]).length
  };
}
