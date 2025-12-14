import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { fileURLToPath } from "url";
import Events from "discord.js";
dotenv.config();

const GROQ_API_KEY = process.env.GROQ;

const groq = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LORE_PATH = path.join(__dirname, "../data/lore.json");
const TOP_K = 3;
const OFFTOPIC_THRESHOLD = 0.15;

const COOLDOWN = 30 * 1000;
const userCooldowns = new Map();

function loadLore() {
  if (!fs.existsSync(LORE_PATH)) {
    console.error("Missing lore.json");
    process.exit(1);
  }
  const raw = fs.readFileSync(LORE_PATH, "utf8");
  return JSON.parse(raw).entries;
}

function textVectorize(text) {
  const words = text.toLowerCase().split(/\W+/);
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return freq;
}

function cosineLocalSim(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keys) {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function buildEmbeddingsIfNeeded(lore) {
  console.log("Using simple local text vectors");
  return lore.map((entry, i) => ({
    id: i,
    title: entry.title,
    text: entry.text,
    embedding: textVectorize(`${entry.title} ${entry.text}`),
  }));
}

async function retrieveRelevant(loreEmbeddings, userText, topK = TOP_K) {
  const qVec = textVectorize(userText);
  const scored = loreEmbeddings.map((e) => ({
    id: e.id,
    title: e.title,
    text: e.text,
    score: cosineLocalSim(qVec, e.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function buildPrompt(sources, userQuery) {
  const sourceText = sources
    .map((s, i) => `SOURCE ${i + 1} — ${s.title}:\n${s.text}`)
    .join("\n\n---\n\n");

  const system = `
You are "Sierra", the official AI archivist and lore-keeper for the REPULS universe.
You have two duties:

1. **Lore Mode** — If the user's question is about the REPULS universe, its factions, characters, timeline, technologies, or anything in the SOURCES, answer with immersive detail using only the provided sources.
2. **General Mode** — If the question is simple, social, or conversational (e.g. greetings, “how are you”, “who are you”, etc.), respond politely and naturally in your own voice as Sierra, maintaining your lore-keeper personality.

Rules:
- Address the user as “commander”.
- Use immersive, calm, confident tone.
- If the question is totally unrelated to either REPULS or casual conversation, reply exactly: “Sorry commander, wrong question.”
- Keep responses between 2–5 sentences.

End every reply naturally without disclaimers.
`;

  const user = `User question: "${userQuery}"

SOURCES:
${sourceText}

Now respond appropriately using the above rules.`;

  return { system, user };
}

async function generateReply(loreEmbeddings, userInput) {
  const retrieved = await retrieveRelevant(loreEmbeddings, userInput, TOP_K);

  if (retrieved.length === 0 || retrieved[0].score < OFFTOPIC_THRESHOLD) {
    return "Sorry commander, wrong question.";
  }

  const { system, user } = buildPrompt(retrieved, userInput);

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 1.0,
    max_tokens: 1000,
  });

  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) return "Sorry commander, I couldn't generate a response.";
  return text;
}

export function initSierraAI(client) {
  client.once("ready", async () => {
  console.log(`Sierra is online. Loading lore...`);
  const lore = loadLore();
  const loreEmbeddings = buildEmbeddingsIfNeeded(lore);
  client.loreEmbeddings = loreEmbeddings;
  console.log("Lore ready. Sierra operational, commander.");
});


  client.on("messageCreate", async (message) => {
    try {
      if (message.author.bot) return;

      const prefix = "!sierra";
      if (!message.content.toLowerCase().startsWith(prefix)) return;

      const userInput = message.content.slice(prefix.length).trim();
      if (!userInput) {
        await message.reply("Please provide your query, commander.");
        return;
      }


      const last = userCooldowns.get(message.author.id) || 0;
      const now = Date.now();
      if (now - last < COOLDOWN) {
        const remaining = Math.ceil((COOLDOWN - (now - last)) / 1000);
        await message.reply(`Commander, please wait ${remaining}s before asking again.`);
        return;
      }
      userCooldowns.set(message.author.id, now);


      if (!client.loreEmbeddings) {
        await message.reply("Sierra is still syncing her archives. Please wait a moment, commander.");
        return;
      }


      const estimatedTime = Math.min(500 + userInput.length * 50, 8000);
      await message.channel.sendTyping();
      await new Promise(r => setTimeout(r, estimatedTime));

      const reply = await generateReply(client.loreEmbeddings, userInput);
      await message.reply(reply);
    } catch (err) {
      console.error("Error handling message:", err);
      await message.reply("Sierra encountered an error. Try again later.");
    }
  });
}

export { generateReply };
