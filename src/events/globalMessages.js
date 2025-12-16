import WebSocket from "ws";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
dotenv.config();

const DATA_FILE = path.join(process.cwd(), "src/data/messageCounts.json");

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function initGlobalMessages(client, channelId, sessionTicket) {
  const ws = new WebSocket(process.env.chat, {
    headers: {
      Origin: "https://repuls.io",
      "User-Agent": "Mozilla/5.0",
    },
  });

  let lastReplyTime = 0;

  const REPLY_COOLDOWN = 120 * 1000;
  const REPLY_DELAY = 4000;
  const BOT_NAME = "repulsclanclash";

  async function generateAIReply(sender, message) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly, concise AI chatting casually in a multiplayer game global chat. Keep replies short, natural, and non-spammy. Be aware that you are talking with children, nothing innapropriate should be said, no swears, no references. Anything out of context should be ignored and chat should be focused on gaming.",
          },
          {
            role: "user",
            content: `${sender}: ${message}`,
          },
        ],
        max_tokens: 40,
        temperature: 0.7,
      });

      return completion.choices[0]?.message?.content?.trim();
    } catch (err) {
      console.error("OpenAI error:", err.message);
      return null;
    }
  }

  ws.on("open", () => {
    console.log("Connected to Repuls chat WebSocket!");

    ws.send(
      JSON.stringify({
        ev: "authenticate",
        data: JSON.stringify({ sessionTicket, friendList: [] }),
      })
    );

    setTimeout(() => {
      ws.send(
        JSON.stringify({
          ev: "subscribeChannel",
          data: JSON.stringify({ channelName: "Global" }),
        })
      );
      console.log("Subscribed to Global chat.");
    }, 500);
  });

  ws.on("message", async (msg) => {
    try {
      const packet = JSON.parse(msg.toString());
      if (packet.ev !== "channelMessage") return;

      const chat = JSON.parse(packet.data);
      const { sender, message } = chat;

      if (!sender || sender === BOT_NAME) return;

      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      data[sender] = (data[sender] || 0) + 1;
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

      const now = Date.now();
      if (now - lastReplyTime < REPLY_COOLDOWN) return;

      const reply = await generateAIReply(sender, message);
      if (!reply) return;

      lastReplyTime = now;

      setTimeout(() => {
        ws.send(
          JSON.stringify({
            ev: "publishMessage",
            data: JSON.stringify({
              channel: "Global",
              message: reply,
            }),
          })
        );
      }, REPLY_DELAY);
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
