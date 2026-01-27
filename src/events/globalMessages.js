import WebSocket from "ws";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const DATA_FILE = path.join(process.cwd(), "src/data/messageCounts.json");

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

export function initGlobalMessages(client, channelId, sessionTicket) {
  const ws = new WebSocket(process.env.chat, {
    headers: {
      "Origin": "https://repuls.io",
      "User-Agent": "Mozilla/5.0",
    },
  });

  let lastReplyTime = 0;
  const REPLY_COOLDOWN = 120 * 1000;

  ws.on("open", () => {
    console.log("Connected to Repuls chat WebSocket!");

    const authPacket = {
      ev: "authenticate",
      data: JSON.stringify({ sessionTicket, friendList: [] }),
    };
    ws.send(JSON.stringify(authPacket));
    console.log("Authentication packet sent.");

    setTimeout(() => {
      const subscribePacket = {
        ev: "subscribeChannel",
        data: JSON.stringify({ channelName: "Global" }),
      };
      ws.send(JSON.stringify(subscribePacket));
      console.log("Subscribed to Global chat.");
    }, 500);
  });

  ws.on("message", async (msg) => {
    try {
      const packet = JSON.parse(msg.toString());
      if (packet.ev === "channelMessage") {
        const chat = JSON.parse(packet.data);
        const { sender, message } = chat;

        const BOT_NAME = "repulsclanclash";
        if (sender === BOT_NAME) {
          return;
        }

        const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        if (!data[sender]) data[sender] = 0;
        data[sender]++;
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

        const now = Date.now();
        const lower = message.toLowerCase();
      }
    } catch (e) {
      console.log("Error parsing WebSocket message:", e);
    }
  });

  ws.on("close", () => {
    console.log("Disconnected from Repuls chat.");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
}
