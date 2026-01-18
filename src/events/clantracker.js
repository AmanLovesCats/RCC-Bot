import axios from "axios";
import fs from "fs";
import path from "path";
import { EmbedBuilder } from "discord.js";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const GAME_MODES = ["CTF", "TDM", "KOTH", "TKOTH", "FFA", "GunGame"];
const TIMEFRAMES = ["daily"];
const UPDATE_INTERVAL = 45 * 60 * 1000;
const API_BASE = process.env.clantracker;
const DELAY_BETWEEN_REQUESTS = 2500;
const DAILY_REPORT_INTERVAL = 24 * 60 * 60 * 1000;
const DAILY_REPORT_CHANNEL = "1126500874471079966";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../data");
const dataPath = path.resolve(dataDir, "clanData.json");

let clanData = {};

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({}, null, 2));

function loadClanData() {
    try {
        clanData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    } catch {
        clanData = {};
    }
}

function saveClanData() {
    fs.writeFileSync(dataPath, JSON.stringify(clanData, null, 2));
}

function extractClanData(username) {
    if (!username) return null;

    const colorMatch = username.match(/<color=(#[0-9A-Fa-f]{6})>/);
    const clanMatch = username.match(/<color=#[0-9A-Fa-f]{6}>(.*?)<\/color>/);
    if (!clanMatch) return null;

    return {
        clan: `[${clanMatch[1].trim()}]`,
        color: colorMatch ? colorMatch[1] : "#0077ffff"
    };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchLeaderboardStreaming(boardName, processEntry) {
    let page = 1;

    while (true) {
        try {
            const { data } = await axios.get(
                `${API_BASE}?boardName=${boardName}&page=${page}`
            );

            const pageData = data?.data;
            if (!pageData?.length) break;

            for (const entry of pageData) processEntry(entry);

            page++;
            await sleep(DELAY_BETWEEN_REQUESTS);

        } catch (err) {
            if (err.response?.status === 404) break;
            if (err.response?.status === 429) {
                await sleep(5000);
                continue;
            }
            break;
        }
    }
}

export async function fetchLeaderboard(boardName) {
    let results = [];
    let page = 1;

    while (true) {
        try {
            const { data } = await axios.get(
                `${API_BASE}?boardName=${boardName}&page=${page}`
            );

            const pageData = data?.data;
            if (!Array.isArray(pageData) || pageData.length === 0) break;

            results.push(...pageData);
            page++;

            await sleep(DELAY_BETWEEN_REQUESTS);

        } catch (err) {
            if (err.response?.status === 404) break;
            if (err.response?.status === 429) {
                await sleep(5000);
                continue;
            }
            break;
        }
    }

    return results;
}

async function updateClans() {
    clanData = {};
    saveClanData();

    for (const mode of GAME_MODES) {
        for (const timeframe of TIMEFRAMES) {

            const board = `lb_${mode}_${timeframe}`;
            console.log("Processing board:", board);

            await fetchLeaderboardStreaming(board, entry => {
                const username = entry.key;
                const value = entry.value || 0;

                const info = extractClanData(username);
                if (!info) return;

                const { clan, color } = info;

                if (!clanData[clan]) {
                    clanData[clan] = {
                        totalValue: 0,
                        color,
                        players: new Set()
                    };
                }

                clanData[clan].totalValue += value;
                clanData[clan].players.add(username);
            });

            for (const c in clanData)
                clanData[c].players = Array.from(clanData[c].players);

            saveClanData();
            await sleep(1000);
        }
    }
}

export async function getClanLeaderboardEmbed(client) {
    const guildId = "1124932599626866718";
    const guild = await client.guilds.fetch(guildId);

    const sorted = Object.entries(clanData)
        .map(([clan, data]) => ({
            clan,
            totalValue: data.totalValue || 0,
            color: data.color || "#5865F2",
            playerCount: Array.isArray(data.players) ? data.players.length : 0
        }))
        .sort((a, b) => b.totalValue - a.totalValue);

    if (sorted.length === 0) return null;

    const top = sorted[0];

    return new EmbedBuilder()
        .setAuthor({
          name: "REPULS.IO By Docski",
          iconURL: guild.iconURL({ dynamic: true, size: 128 }),
          url: "https://repuls.io"
        })
        .setThumbnail("https://cdn.discordapp.com/emojis/925776344380502126.webp?size=96&animated=true")
        .setTitle("Today's Top Clans!")
        .setColor(top.color || "#5865F2")
        .setDescription(
            sorted
                .slice(0, 10)
                .map(
                    (c, i) =>
                        `**${i + 1}. ${c.clan}**Points: ***${c.totalValue.toLocaleString()}*** · Members on the leaderboard: **${c.playerCount}\n**`
                )
                .join("\n")
        )
        .setFooter({
            text: "Admin View Enabled"
        });
}

async function sendDailyClanReport(client) {
    try {
        const channel = await client.channels.fetch(DAILY_REPORT_CHANNEL);
        if (!channel) return;

        const sorted = Object.entries(clanData)
            .map(([clan, data]) => ({
                clan,
                totalValue: data.totalValue || 0,
                color: data.color || "#5865F2",
                playerCount: Array.isArray(data.players) ? data.players.length : 0
            }))
            .sort((a, b) => b.totalValue - a.totalValue)
            .slice(0, 10);

        if (!sorted.length) return;

        const rankEmojis = ["🥇", "🥈", "🥉"];

        const leader = sorted[0];
        const runnerUp = sorted[1];

        const dominanceNote =
          runnerUp && leader.totalValue >= runnerUp.totalValue * 1.25
            ? `\n\n🔥 **${leader.clan} is dominating today!**`
               : "";

const embed = new EmbedBuilder()
    .setAuthor({
        name: "REPULS.IO By Docski",
        iconURL: guild.iconURL({ dynamic: true, size: 128 }),
        url: "https://repuls.io"
    })
    .setThumbnail(
        "https://cdn.discordapp.com/emojis/925776344380502126.webp?size=96&animated=true"
    )
    .setTitle("🏆 Top Clans — Daily Rankings")
    .setColor(sorted[0].color)
    .setDescription(
        sorted
            .map((c, i) => {
                const medal = rankEmojis[i] ?? "🏅";
                return (
                    `**${medal} ${i + 1}. ${c.clan}** — **${c.totalValue.toLocaleString()} Points**\n` +
                    `👥 Members on leaderboard: **${c.playerCount}**`
                );
            })
            .join("\n\n") + dominanceNote
    )
    .setFooter({
        text: "Daily leaderboard • https://repuls.io/leaderboard/"
    });

        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error("Failed to send daily clan report:", err);
    }
}

export function startDailyClanReport(client) {
    function msUntil525AM() {
    const now = new Date();
    const nowUTC = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const targetIST = new Date(nowUTC);
    targetIST.setUTCHours(5 - 5, 25 - 30, 0, 0);
    
    if (targetIST.getTime() <= nowUTC) {
        targetIST.setUTCDate(targetIST.getUTCDate() + 1);
    }

    return targetIST.getTime() - nowUTC;
}

    setTimeout(() => {
        sendDailyClanReport(client);

        setInterval(() => sendDailyClanReport(client), DAILY_REPORT_INTERVAL);

    }, msUntil525AM());
}

export async function initClanTracker(client) {
    loadClanData();
    await updateClans();
    setInterval(updateClans, UPDATE_INTERVAL);
    startDailyClanReport(client);
}

export {
    GAME_MODES,
    TIMEFRAMES,
    extractClanData,
    saveClanData,
    fetchLeaderboardStreaming,
    updateClans
};
