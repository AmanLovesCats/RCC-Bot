import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { REST, Routes } from "discord.js";

dotenv.config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error("you forgot .env dum dum");
    process.exit(1);
}

const commandsPath = path.join(process.cwd(), "src", "commands");
const commands = [];
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

console.log(`Found ${commandFiles.length} command files...\n`);

for (let i = 0; i < commandFiles.length; i++) {
    const file = commandFiles[i];
    const filePath = path.join(commandsPath, file);
    
    try {
        console.log(`Loading: ${file}`);
        const commandModule = await import(`file://${filePath}`);
        const command = commandModule.default || commandModule;
        
        if (!command?.data) {
            console.warn(`Skipping ${file} no data property, why did u put it there then`);
            continue;
        }

        const json = command.data.toJSON();
        json.integration_types = [0, 1];
        json.contexts = [0, 1, 2];
        commands.push(json);
        
        console.log(`${file} loaded (${i + 1}/${commandFiles.length})`);
    } catch (error) {
        console.error(`Failed to load ${file}:`, error.message);
    }
}

console.log(`\nTotal valid commands: ${commands.length}`);
console.log("\nRegistering global commands...");

const rest = new REST({ version: "10" }).setToken(TOKEN);

try {

    console.log(" Deleting old commands...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log("Old commands deleted");


    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`Successfully registered ${commands.length} GLOBAL commands!`);
    console.log("\nGlobal commands trying to load in.");
    
} catch (error) {
    console.error("Failed to refresh commands:", error);
}
