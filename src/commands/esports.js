import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits } from 'discord.js';
import * as XLSX from 'xlsx';
import { loadDB, saveDB } from '../utils/dbManager.js';

const CLAN_SERVER_ID = '1126164735323283576'; 

export const data = new SlashCommandBuilder()
    .setName('esports')
    .setDescription('Access the Esports Database')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('View stats of a specific user')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('admin')
            .setDescription('Toggle admin panel (Admin Only)')
            .setRequired(false)
            .addChoices(
                { name: 'Open Admin Panel', value: 'true' }
            ))
    .addBooleanOption(option =>
        option.setName('portal')
            .setDescription('Open the main esports tournament portal')
            .setRequired(false));

const getClanFromMember = async (client, userId) => {
    try {
        const clanGuild = client.guilds.cache.get(CLAN_SERVER_ID);
        if (!clanGuild) {
            console.log(`Clan server ${CLAN_SERVER_ID} not found`);
            return 'No Clan';
        }

        const clanMember = await clanGuild.members.fetch(userId).catch(() => null);
        if (!clanMember) return 'No Clan';

        const clanRole = clanMember.roles.cache.find(role => 
            role.name.toLowerCase().startsWith('clan ')
        );
        
        if (clanRole) {
            return clanRole.name.substring(5);
        }
        return 'No Clan';
    } catch (error) {
        console.error('Clan fetch error:', error);
        return 'No Clan';
    }
};

async function safeUpdate(interaction, embeds, components = []) {
    try {
        const embedArray = Array.isArray(embeds) ? embeds : embeds ? [embeds] : [];
        const componentArray = Array.isArray(components) ? components : components ? [components] : [];
        
        const payload = { embeds: embedArray, components: componentArray };

        if (embedArray.length === 0 && componentArray.length === 0) {
            payload.content = 'No data available.';
        }
        
        if (interaction.replied || interaction.deferred) {
            return await interaction.editReply(payload);
        } else {
            return await interaction.reply({ ...payload, fetchReply: true });
        }
    } catch (error) {
        console.error('Safe update error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Error displaying data.', ephemeral: true });
            }
        } catch (e) {
            console.error('Fallback reply failed:', e);
        }
    }
}



const calculateUserStats = (db, userId) => {
    const stats = {
        totalKills: 0,
        totalPoints: 0,
        tournamentsWon: [],
        tournamentsParticipated: [],
        prizeMoney: 0 
    };

    Object.values(db).forEach(tourney => {

        const participant = tourney.participants.find(p => p.discordId === userId);
        
        const isWinner = tourney.winnerId === userId;

        if (participant || isWinner) {

            stats.tournamentsParticipated.push({
                name: tourney.name,
                kills: participant ? participant.kills : 0,
                points: participant ? participant.points : 0,
                year: tourney.year,
                won: isWinner
            });

            if (participant) {
                stats.totalKills += participant.kills || 0;
                stats.totalPoints += participant.points || 0;
            }

            if (isWinner) {
                stats.tournamentsWon.push({
                    name: tourney.name,
                    prize: tourney.prize || 'N/A'
                });
            }
        }
    });
    return stats;
};

const formatDate = (excelDate) => {
    if (!excelDate) return 'Unknown';
    if (typeof excelDate === 'number' && excelDate > 20000) {
        const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        return date.toLocaleString();
    }

    const d = new Date(excelDate);
    if (!isNaN(d)) return d.toLocaleString();
    return String(excelDate);
};

export async function execute(interaction) {
    const db = loadDB();
    const targetUser = interaction.options.getUser('user');
    const isAdminRequest = interaction.options.getString('admin') === 'true';
    const portalRequest = interaction.options.getBoolean('portal');
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (isAdminRequest && isAdmin) {
        await showAdminPanel(interaction);
        return;
    }

    if (targetUser) {
        await showPlayerStats(interaction, targetUser);
        return;
    }

    if (portalRequest || (!targetUser && !isAdminRequest)) {
        await showPublicPanel(interaction);
        return;
    }
}


async function showPublicPanel(interaction) {
    const db = loadDB();

    const timestamp = Date.now();
    const tourneyNames = Object.keys(db)
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 25);

    const selectOptions = tourneyNames.length > 0 
        ? tourneyNames.map((name, index) => ({
            label: name.length > 100 ? name.substring(0, 97) + '...' : name,
            value: `details_${timestamp}_${index}_${name}`,
            description: `View ${name}`
        }))
        : [{ 
            label: 'No tournaments found', 
            value: `none_${timestamp}`, 
            description: 'dum dums didnt put data' 
        }];

    const embed = new EmbedBuilder()
        .setTitle('🏆 Esports Database Portal')
        .setDescription('Select a tournament or use buttons below.')
        .setColor(0x5865F2)
        .setTimestamp();

    const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('portal_quick_select')
            .setPlaceholder('View Detailed Tourney Details')
            .setOptions(selectOptions.slice(0, 25))
    );

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('portal_view_all')
            .setLabel('📋 All Tournaments')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('portal_search_player')
            .setLabel('👤 Search Player')
            .setStyle(ButtonStyle.Secondary)
    );

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components: [menuRow, buttonRow] });
        } else {
            await interaction.reply({ embeds: [embed], components: [menuRow, buttonRow] });
        }
    } catch (error) {
        console.error('Portal error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Failed to load portal. Please try again.', ephemeral: true });
        }
    }
}

async function showAdminPanel(interaction) {
    const db = loadDB();
    const timestamp = Date.now();
    const tourneyNames = Object.keys(db).slice(0, 25);
    
    const embed = new EmbedBuilder()
        .setTitle('🛠️ Admin Control Panel')
        .setDescription('Manage tournament databases.')
        .setColor(0xED4245)
        .addFields(
            { name: '📤 Actions', value: '• Upload Excel\n• Delete Tournament', inline: false }
        );

    const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('admin_menu')
            .setPlaceholder('Choose action...')
            .addOptions([
                { label: '📂 Upload Excel File', value: 'upload' },
                { label: '🗑️ Delete Tournament', value: 'delete' },
                { label: '📋 View All Tournaments', value: 'list' }
            ])
    );

    let deleteRow = null;
    if (tourneyNames.length > 0) {
        const deleteOptions = tourneyNames.map((name, index) => ({
            label: name.length > 100 ? name.substring(0, 97) + '...' : name,
            value: `delete_${timestamp}_${index}_${name}`,
            description: `${db[name].participants.length} participants`
        })).slice(0, 25);
        
        deleteRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('admin_delete_select')
                .setPlaceholder('Select tournament to delete...')
                .setOptions(deleteOptions)
        );
    }

    const components = [menuRow];
    if (deleteRow) components.push(deleteRow);

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components });
        } else {
            await interaction.reply({ embeds: [embed], components });
        }
    } catch (error) {
        console.error('Admin panel error:', error);
    }
}



async function showPlayerStats(interaction, targetUser) {
    await interaction.deferReply();
    const db = loadDB();
    const stats = calculateUserStats(db, targetUser.id);
    
    let member = interaction.guild.members.cache.get(targetUser.id);
    if (!member) {
        try { member = await interaction.guild.members.fetch(targetUser.id); } catch (e) {}
    }

    const clan = await getClanFromMember(interaction.client, targetUser.id);
    const avatar = targetUser.displayAvatarURL({ size: 256 });
    
    const rolesList = member 
        ? member.roles.cache
            .filter(r => r.id !== interaction.guild.id)
            .map(r => r.name)
            .slice(0, 5)
            .join(', ') || 'No roles'
        : 'N/A';

    const embed = new EmbedBuilder()
        .setTitle(`Player Profile: ${targetUser.username}`)
        .setThumbnail(avatar)
        .setColor(0x00AEFF)
        .addFields(
            { name: 'Clan', value: clan, inline: true },
            { name: 'Total Kills', value: stats.totalKills.toString(), inline: true },
            { name: 'Total Points', value: stats.totalPoints.toString(), inline: true },
            { name: 'Tournaments Won', value: stats.tournamentsWon.length.toString(), inline: true },
            { name: 'Roles', value: rolesList }
        )
        .setFooter({ text: `ID: ${targetUser.id}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`player_history_${targetUser.id}_0`)
            .setLabel('View Tournament History')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_back')
            .setLabel('Back to Portal')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
}


export async function handleInteractionCreate(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    const db = loadDB();
    const customId = interaction.customId;

    if (interaction.isStringSelectMenu()) {
        if (customId === 'portal_quick_select') {
            const choice = interaction.values[0];
            if (choice.startsWith('none_')) {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ content: 'No tournaments available. Upload data first!', components: [] });
                } else {
                    await interaction.reply({ content: 'No tournaments available. Upload data first!', ephemeral: true });
                }
                return;
            }
            
            const tourneyName = choice.split('_').slice(3).join('_');
            const tourney = db[tourneyName];
            
            if (!tourney) {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ content: 'Tournament not found!', components: [] });
                } else {
                    await interaction.reply({ content: 'Tournament not found!', ephemeral: true });
                }
                return;
            }
            
            await showTournamentDetails(interaction, tourney);
            return;
        }

        if (customId === 'admin_menu') {
            const choice = interaction.values[0];
            if (choice === 'upload') {
                await interaction.reply({ 
                    content: '📂 **Please attach your Excel file now.**\nNext message with attachment will be processed.', 
                    ephemeral: true 
                });
                
                const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
                const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

                collector.on('collect', async m => {
                    const attachment = m.attachments.first();
                    if (!attachment.name.endsWith('.xlsx') && !attachment.name.endsWith('.xls')) {
                        await m.reply('Invalid file format. Please upload an Excel file (.xlsx).');
                        return;
                    }

                    try {
                        const response = await fetch(attachment.url);
                        const arrayBuffer = await response.arrayBuffer();
                        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                        const sheetName = workbook.SheetNames[0];
                        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

                        if (sheetData.length < 2) {
                            await m.reply('Excel file appears empty or missing headers.');
                            return;
                        }

                        await processExcelData(interaction, sheetData, db);
                        await m.reply('✅ Database updated successfully!');
                    } catch (error) {
                        console.error(error);
                        await m.reply(`Error processing file: ${error.message}`);
                    }
                });

                collector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        interaction.followUp({ content: 'Timed out waiting for file.', ephemeral: true }).catch(() => {});
                    }
                });
            } else if (choice === 'delete') {
                if (interaction.replied || interaction.deferred) {
                    await interaction.update({ content: '🗑️ Select tournament to delete below:', components: [] });
                } else {
                    await interaction.reply({ content: '🗑️ Select tournament to delete below:', ephemeral: true });
                }
            } else if (choice === 'list') {
                await showTournamentList(interaction, db, 0);
            }
            return;
        }

        if (customId === 'admin_delete_select') {
    const choice = interaction.values[0];
    const parts = choice.split('_');
    const timestamp = parts[1];
    const index = parts[2]; 
    const tourneyName = parts.slice(3).join(' ');
    
    
    const db = loadDB();
    
    if (db[tourneyName]) {
        delete db[tourneyName];
        saveDB(db);
        await interaction.update({ 
            content: `✅ **Deleted** \`${tourneyName}\` from database!`,
            components: [] 
        });
    } else {
        const available = Object.keys(db).slice(0, 10);
        await interaction.update({ 
            content: `❌ Tournament "${tourneyName}" not found!\n\nAvailable: ${available.join(', ') || 'None'}`,
            components: [] 
        });
    }
    return;
}

        if (customId === 'esports_menu') {
            const choice = interaction.values[0];
            if (choice === 'view_tournaments') {
                await showTournamentList(interaction, db, 0);
            } else if (choice === 'search_player') {
                const modal = new ModalBuilder()
                    .setCustomId('search_player_modal')
                    .setTitle('Search Player');
                const input = new TextInputBuilder()
                    .setCustomId('player_search_input')
                    .setLabel('Enter Username or ID')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                const row = new ActionRowBuilder().addComponents(input);
                modal.addComponents(row);
                await interaction.showModal(modal);
            }
            return;
        }
    }

    if (interaction.isModalSubmit() && customId === 'search_player_modal') {
    const query = interaction.fields.getTextInputValue('player_search_input').toLowerCase();
    let user = interaction.guild.members.cache.find(m => m.user.username.toLowerCase() === query);
    if (!user) user = interaction.guild.members.cache.get(query);
    
    if (user) {
        await showPlayerStats(interaction, user.user);
    } else {
        await safeUpdate(interaction, [], []);
        await interaction.followUp({ content: 'User not found in this server.', ephemeral: true });
    }
    return;
}

    if (interaction.isButton()) {

        if (customId === 'portal_view_all') {
            await showTournamentList(interaction, db, 0);
            return;
        }
        if (customId === 'portal_search_player') {
            const modal = new ModalBuilder()
                .setCustomId('search_player_modal')
                .setTitle('Search Player');
            const input = new TextInputBuilder()
                .setCustomId('player_search_input')
                .setLabel('Enter Username or ID')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);
            await interaction.showModal(modal);
            return;
        }

        if (customId === 'player_back' || customId === 'tourney_list_back' || customId === 'tourney_details_back') {
            await showPublicPanel(interaction);
            return;
        }

        if (customId.startsWith('player_history_')) {
            const parts = customId.split('_');
            const userId = parts[2];
            const page = parseInt(parts[3]);
            const stats = calculateUserStats(db, userId);
            await showPlayerHistory(interaction, userId, stats, page);
            return;
        }

        if (customId.startsWith('tourney_list_')) {
            const parts = customId.split('_');
            const page = parseInt(parts[2]);
            await showTournamentList(interaction, db, page);
            return;
        }

        if (customId.startsWith('tourney_details_')) {
            const tourneyName = customId.replace('tourney_details_', '');
            const tourney = db[tourneyName];
            await showTournamentDetails(interaction, tourney);
            return;
        }
    }
}


async function processExcelData(interaction, sheetData, db) {
    const headers = sheetData[0].map(h => String(h).trim().toLowerCase());
    const getColIndex = (keyword) => headers.findIndex(h => h.includes(keyword));

    const idxName = getColIndex('tournament');
    const idxPart = getColIndex('participant');
    const idxId = getColIndex('id');
    const idxStat = getColIndex('kills') > -1 ? getColIndex('kills') : getColIndex('points');
    const idxType = getColIndex('event'); 
    const idxSubType = getColIndex('type'); 
    const idxCurr = getColIndex('currency');
    const idxYear = getColIndex('year');
    const idxStart = getColIndex('start');
    const idxEnd = getColIndex('end');
    const idxPrize = getColIndex('prize');

    if (idxName === -1 || idxPart === -1 || idxId === -1 || idxStat === -1) {
        await interaction.followUp({ content: '❌ Missing required columns', ephemeral: true });
        return;
    }

    const overwrites = [];
    const groupedTournaments = {};

    for (let i = 1; i < sheetData.length; i++) {
        const row = sheetData[i];

        const tName = row[idxName] ? String(row[idxName]).trim() : Object.keys(groupedTournaments)[0];
        
        if (!tName) continue;

        if (!groupedTournaments[tName]) {
            groupedTournaments[tName] = {
                name: tName,
                type: row[idxType] || 'Unknown',
                subType: row[idxSubType] || 'Tournament',
                currency: row[idxCurr] || 'Points',
                year: row[idxYear] ? Number(row[idxYear]) : new Date().getFullYear(),
                startDate: formatDate(row[idxStart]),
                endDate: formatDate(row[idxEnd]),
                participants: [],
                winnerId: null,
                winnerName: null,
                prize: row[idxPrize] || 'TBD'
            };
            
            if (db[tName]) overwrites.push(tName);
        }

        const participantName = String(row[idxPart] || 'Unknown').trim();
        const discordId = String(row[idxId] || '').trim();
        const statValue = Number(row[idxStat]) || 0;

        if (!discordId && !participantName) continue;

        const participantEntry = {
            name: participantName || `Player ${groupedTournaments[tName].participants.length + 1}`,
            discordId: discordId || '',
            kills: 0,
            points: 0
        };

        const isKills = headers[idxStat].includes('kill') || 
                       (row[idxCurr] && String(row[idxCurr]).toLowerCase().includes('kill'));
        
        if (isKills) participantEntry.kills = statValue;
        else participantEntry.points = statValue;

        const existingIdx = groupedTournaments[tName].participants.findIndex(
            p => p.discordId === participantEntry.discordId
        );
        if (existingIdx > -1) {
            groupedTournaments[tName].participants[existingIdx] = participantEntry;
        } else {
            groupedTournaments[tName].participants.push(participantEntry);
        }
    }

    let updateCount = 0;
    for (const [key, t] of Object.entries(groupedTournaments)) {
        const sorted = [...t.participants].sort((a, b) => {
            const valA = t.currency.toLowerCase().includes('kill') ? a.kills : a.points;
            const valB = t.currency.toLowerCase().includes('kill') ? b.kills : b.points;
            return valB - valA;
        });
        
        if (sorted.length > 0) {
            t.winnerId = sorted[0].discordId;
            t.winnerName = sorted[0].name;
        }
        
        db[key] = t;
        updateCount++;
    }

    saveDB(db);

    let confirmMsg = `✅ **Updated ${updateCount} tournaments** (${Object.values(groupedTournaments).reduce((sum, t) => sum + t.participants.length, 0)} total participants)`;
    if (overwrites.length > 0) {
        confirmMsg += `\n\n⚠️ **Overwritten:** ${overwrites.join(', ')}`;
    }
    
    await interaction.followUp({ content: confirmMsg, ephemeral: true });
}


async function showTournamentList(interaction, db, page) {
    const tourneyNames = Object.keys(db);
    const itemsPerPage = 5;
    const totalPages = Math.ceil(tourneyNames.length / itemsPerPage) || 1;

    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;

    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = tourneyNames.slice(start, end);

    const embed = new EmbedBuilder()
        .setTitle('🏆 Tournaments Database')
        .setColor(0xFAA61A)
        .setFooter({ text: `Page ${page + 1}/${totalPages}` });

    let desc = '';
    pageItems.forEach(name => {
        const t = db[name];
        desc += `**${name}** (${t.year})\nType: ${t.type} | ${t.subType}\nWinner: ${t.winnerName || 'TBD'}\n\n`;
    });
    embed.setDescription(desc || 'No tournaments found.');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tourney_list_${page - 1}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`tourney_list_${page + 1}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
            .setCustomId('tourney_list_back')
            .setLabel('Back to Portal')
            .setStyle(ButtonStyle.Danger)
    );

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        await interaction.reply({ embeds: [embed], components: [row] });
    }
}

async function showTournamentDetails(interaction, tourney) {
    if (!tourney) {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Tournament not found.', ephemeral: true });
        } else {
            await interaction.editReply({ content: 'Tournament not found.' });
        }
        return;
    }

    const sortedParticipants = [...tourney.participants].sort((a, b) => 
        b.points - a.points || b.kills - a.kills
    );
    
    const topList = sortedParticipants.slice(0, 10).map((p, i) => 
        `**${i+1}.** ${p.name} - ${tourney.currency.includes('kill') ? p.kills + ' Kills' : p.points + ' Pts'}`
    ).join('\n') || 'No participants recorded.';

    const othersCount = Math.max(0, sortedParticipants.length - 10);

    const embed = new EmbedBuilder()
        .setTitle(`📊 ${tourney.name}`)
        .setColor(0x57F287)
        .addFields(
            { name: '🏅 Winner', value: tourney.winnerName || 'Unknown', inline: true },
            { name: '📅 Year', value: String(tourney.year), inline: true },
            { name: '🏆 Type', value: `${tourney.type} - ${tourney.subType}`, inline: true },
            { name: '⏱ Start Time', value: tourney.startDate || 'Unknown', inline: true },
            { name: '⏱ End Time', value: tourney.endDate || 'Unknown', inline: true },
            { name: '💰 Prize', value: tourney.prize || 'N/A', inline: true },
            { name: `👥 Participants (Top 10${othersCount > 0 ? ` +${othersCount}` : ''})`, value: topList }
        )
        .setFooter({ text: `Total Participants: ${tourney.participants.length}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('tourney_details_back')
            .setLabel('Back to Portal')
            .setStyle(ButtonStyle.Secondary)
    );

    await safeUpdate(interaction, [embed], [row]);

}

async function showPlayerHistory(interaction, userId, stats, page) {
    const history = stats.tournamentsParticipated;
    const itemsPerPage = 5;
    const totalPages = Math.ceil(history.length / itemsPerPage) || 1;
    
    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;

    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = history.slice(start, end);

    const user = await interaction.client.users.fetch(userId).catch(() => ({ username: 'Unknown' }));

    const embed = new EmbedBuilder()
        .setTitle(`History: ${user.username}`)
        .setColor(0x00AEFF)
        .setFooter({ text: `Page ${page + 1}/${totalPages} | Total: ${stats.totalKills} Kills / ${stats.totalPoints} Points` });

    let desc = '';
    pageData.forEach(t => {
        const icon = t.won ? '🏆' : '👤';
        desc += `${icon} **${t.name}** (${t.year})\nKills: ${t.kills} | Points: ${t.points}\n`;
    });
    embed.setDescription(desc || 'No history found.');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`player_history_${userId}_${page - 1}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`player_history_${userId}_${page + 1}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
            .setCustomId('player_back')
            .setLabel('Back to Profile')
            .setStyle(ButtonStyle.Danger)
    );

    if (interaction.replied) await interaction.editReply({ embeds: [embed], components: [row] });
    else await interaction.reply({ embeds: [embed], components: [row] });
}