import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../data/esports.json');
const BACKUP_PATH = path.join(__dirname, '../data/esports_backup.json');

export const loadDB = () => {
    if (fs.existsSync(DB_PATH)) {
        try {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.error('Error loading DB, resetting.', e);
            return {};
        }
    }
    return {};
};

export const saveDB = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(data, null, 2), 'utf8');
};