import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import {
  Client,
  GatewayIntentBits,
  ActivityType,
  Collection,
  REST,
  Routes,
  Events,
} from "discord.js";

import { initCCUTracker } from "./events/CCU.js";
import { getLatestCCU } from "./events/CCU.js";
import { initClanTracker } from "./events/clantracker.js";
import { initSierraAI } from "./events/sierra.js";
import { initGlobalMessages } from "./events/globalMessages.js";

const GM_ID = "1447166337968373831";
const SESSION_TICKET = process.env.REPULS_SESSION_TICKET;

dotenv.config();

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

client.commands = new Collection();

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const commandModule = await import(`file://${filePath}`);
  const command = commandModule.default || commandModule;

  if (!command?.data?.name) {
    console.warn(`Skipping invalid command file: ${file}`);
    continue;
  }

  client.commands.set(command.data.name, command);
}

async function registerCommands(clientId, token) {
  const commands = [];
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));
  for (const file of commandFiles) {
    const commandModule = await import(`./commands/${file}`);
    const command = commandModule.default || commandModule;
    if (!command?.data) continue;

    const json = command.data.toJSON();
    json.integration_types = [0, 1];
    json.contexts = [0, 1, 2];
    commands.push(json);
  }

  const rest = new REST({ version: "10" }).setToken(token);
  try {
    console.log("Started refreshing global application commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Successfully registered global application commands.");
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
}

async function startBot() {

  initCCUTracker(client);
  initClanTracker(client);
  initSierraAI(client);
  initGlobalMessages(client, GM_ID, SESSION_TICKET);

  client.once(Events.ClientReady, async () => {
    console.log(`${client.user.tag} is ready to play repuls lol`);

    const baseActivities = [
      { name: "Repuls Global Chat", type: ActivityType.Watching },
    ];

    let index = 0;

    async function updateActivity() {
      let activity;

      const ccu = getLatestCCU();
      const realtimeNames = ccu > 0
        ? [
            `👾 ${ccu} players online in Repuls.io`,
            `🌍 ${ccu} knights active worldwide`,
          ]
        : [];

      const activities = [
        ...baseActivities,
        ...realtimeNames.map(name => ({ name, type: ActivityType.Watching })),
      ];

      if (activities.length === 0) return;

      const current = activities[index % activities.length];

      client.user.setPresence({
        activities: [{ name: current.name, type: current.type }],
        status: "dnd",
      });

      index = (index + 1) % activities.length;
    }

    updateActivity();
    setInterval(updateActivity, 10000);
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      const reply = {
        content: "There was an error executing this command man",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred)
        await interaction.followUp(reply);
      else await interaction.reply(reply);
    }
  });

  await client.login(process.env.TOKEN);
}

startBot();
