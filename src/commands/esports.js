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
        if (!clanGuild) return 'No Clan';

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

const getClanMembers = async (client, clanName) => {
    try {
        const clanGuild = client.guilds.cache.get(CLAN_SERVER_ID);
        if (!clanGuild) return [];

        const roleName = `clan ${clanName}`;
        let role = clanGuild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());

        if (!role) {
            role = clanGuild.roles.cache.find(r => r.name.toLowerCase() === clanName.toLowerCase());
        }

        if (!role) return [];

        const members = role.members.map(m => m.user);
        return members;
    } catch (error) {
        console.error('Error fetching clan members:', error);
        return [];
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
            return await interaction.reply(payload);
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

const calculateClanStats = async (client, db, clanName) => {
    const members = await getClanMembers(client, clanName);
    const memberIds = members.map(m => m.id);

    const stats = {
        totalKills: 0,
        totalPoints: 0,
        tournamentsWon: [],
        tournamentsParticipated: []
    };

    Object.values(db).forEach(tourney => {
        tourney.participants.forEach(p => {
            if (p.discordId && memberIds.includes(p.discordId)) {
                stats.totalKills += p.kills || 0;
            }
            if (!p.discordId && p.name.toLowerCase() === clanName.toLowerCase()) {
                 stats.totalKills += p.kills || 0;
            }
        });

        const isClanTourney = (tourney.type && tourney.type.toLowerCase().includes('clan')) ||
                              (tourney.subType && tourney.subType.toLowerCase().includes('clan'));
        
        if (isClanTourney) {
            const clanEntry = tourney.participants.find(p => p.name.toLowerCase() === clanName.toLowerCase());
            if (clanEntry) {
                stats.totalPoints += clanEntry.points || 0;
                stats.tournamentsParticipated.push({
                    name: tourney.name,
                    kills: clanEntry.kills,
                    points: clanEntry.points,
                    year: tourney.year,
                    won: tourney.winnerName && tourney.winnerName.toLowerCase() === clanName.toLowerCase()
                });
            }
        }

        if (tourney.winnerName && tourney.winnerName.toLowerCase() === clanName.toLowerCase()) {
            stats.tournamentsWon.push({
                name: tourney.name,
                prize: tourney.prize || 'N/A'
            });
        }
    });
    return { stats, members };
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

const checkClanExists = (db, clanName) => {
    return Object.values(db).some(t => 
        t.participants.some(p => p.name.toLowerCase() === clanName.toLowerCase())
    );
};

export async function execute(interaction) {
    const db = loadDB();
    const targetUser = interaction.options.getUser('user');
    const isAdminRequest = interaction.options.getString('admin') === 'true';
    const portalRequest = interaction.options.getBoolean('portal');
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const userId = interaction.user.id;

    // Admin Check with specific message
    if (isAdminRequest) {
        if (!isAdmin) {
            await interaction.reply({ content: 'you got guts to try', ephemeral: true });
            return;
        }
        await showAdminPanel(interaction, userId);
        return;
    }

    if (targetUser) {
        await showPlayerStats(interaction, targetUser, userId);
        return;
    }

    if (portalRequest || (!targetUser && !isAdminRequest)) {
        await showPublicPanel(interaction, userId);
        return;
    }
}

async function showPublicPanel(interaction, viewerId) {
    const db = loadDB();
    const timestamp = Date.now();
    const tourneyNames = Object.keys(db)
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 25);

    const selectOptions = tourneyNames.length > 0 
        ? tourneyNames.map((name, index) => ({
            label: name.length > 100 ? name.substring(0, 97) + '...' : name,
            value: `details_${timestamp}_${index}_${name}_${viewerId}`,
            description: `View ${name}`
        }))
        : [{ 
            label: 'No tournaments found', 
            value: `none_${timestamp}_${viewerId}`, 
            description: 'dum dums didnt put data' 
        }];

    const embed = new EmbedBuilder()
        .setTitle('🏆 Esports Database Portal')
        .setDescription('Select a tournament or use buttons below.')
        .setColor(0x5865F2)
        .setTimestamp();

    const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`portal_quick_select_${viewerId}`)
            .setPlaceholder('View Detailed Tourney Details')
            .setOptions(selectOptions.slice(0, 25))
    );

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`portal_view_all_${viewerId}`)
            .setLabel('📋 All Tournaments')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`portal_search_player_${viewerId}`)
            .setLabel('👤 Search Player')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`portal_search_clan_${viewerId}`)
            .setLabel('🛡️ Search Clan')
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

async function showAdminPanel(interaction, viewerId) {
    const db = loadDB();
    const timestamp = Date.now();
    const tourneyNames = Object.keys(db).slice(0, 25);
    
    const embed = new EmbedBuilder()
        .setTitle('🛠️ Admin Control Panel')
        .setDescription('Manage tournament databases.')
        .setColor(0xED4245)
        .addFields(
            { name: '📤 Actions', value: '• Upload Excel\n• Delete Tournament\n• Edit User Stats', inline: false }
        );

    const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`admin_menu_${viewerId}`)
            .setPlaceholder('Choose action...')
            .addOptions([
                { label: '📂 Upload Excel File', value: `upload_${viewerId}` },
                { label: '🗑️ Delete Tournament', value: `delete_${viewerId}` },
                { label: '📋 View All Tournaments', value: `list_${viewerId}` },
                { label: '✏️ Edit User Stats', value: `edit_user_${viewerId}` }
            ])
    );

    let deleteRow = null;
    if (tourneyNames.length > 0) {
        const deleteOptions = tourneyNames.map((name, index) => ({
            label: name.length > 100 ? name.substring(0, 97) + '...' : name,
            value: `delete_${timestamp}_${index}_${name}_${viewerId}`,
            description: `${db[name].participants.length} participants`
        })).slice(0, 25);
        
        deleteRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`admin_delete_select_${viewerId}`)
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
            await interaction.reply({ embeds: [embed], components, ephemeral: true });
        }
    } catch (error) {
        console.error('Admin panel error:', error);
    }
}

async function showPlayerStats(interaction, targetUser, viewerId) {
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
            .setCustomId(`player_history_${targetUser.id}_0_${viewerId}`)
            .setLabel('View Tournament History')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`player_back_${viewerId}`)
            .setLabel('Back to Portal')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function showClanProfile(interaction, clanName, viewerId) {
    await interaction.deferReply();
    const db = loadDB();

    if (!checkClanExists(db, clanName)) {
        await interaction.editReply({ content: `❌ No clan named \`${clanName}\` found in the database.`, components: [] });
        return;
    }

    const { stats, members } = await calculateClanStats(interaction.client, db, clanName);

    const memberList = members.length > 0 
        ? members.map(m => m.username).join(', ') 
        : 'No members found (Role might not exist)';

    const displayMembers = memberList.length > 1000 ? memberList.substring(0, 997) + '...' : memberList;

    const embed = new EmbedBuilder()
        .setTitle(`🛡️ Clan Profile: ${clanName}`)
        .setColor(0x57F287)
        .addFields(
            { name: 'Total Kills (Members + Entity)', value: stats.totalKills.toString(), inline: true },
            { name: 'Total Points (Clan Tourneys Only)', value: stats.totalPoints.toString(), inline: true },
            { name: 'Tournaments Won', value: stats.tournamentsWon.length.toString(), inline: true },
            { name: 'Member Count', value: members.length.toString(), inline: true }
        )
        .addFields(
            { name: 'Members', value: displayMembers || 'No members detected' }
        )
        .setFooter({ text: `Database Stats` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`clan_history_${clanName}_0_${viewerId}`)
            .setLabel('View Tournament History')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`player_back_${viewerId}`)
            .setLabel('Back to Portal')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
}

// Helper to verify ownership
const verifyOwnership = (interaction, idString) => {
    if (!idString) return false;
    const parts = idString.split('_');
    const ownerId = parts[parts.length - 1];
    return interaction.user.id === ownerId;
};

export async function handleInteractionCreate(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    const db = loadDB();
    const customId = interaction.customId;

    if (interaction.isStringSelectMenu()) {
        const value = interaction.values[0];
        
        
        if (!verifyOwnership(interaction, value) && !verifyOwnership(interaction, customId)) {
            await interaction.reply({ content: 'use your own man, try /esports', ephemeral: true });
            return;
        }

        // Extract base ID without the user suffix for logic
        const baseCustomId = customId.substring(0, customId.lastIndexOf('_'));

        if (baseCustomId === 'portal_quick_select') {
            const parts = value.split('_');
            const viewerId = parts[parts.length - 1];
            // Remove viewerId and timestamp/index to get name
            const tourneyName = parts.slice(3, -1).join('_'); 
            const tourney = db[tourneyName];
            
            if (!tourney) {
                await interaction.editReply({ content: 'Tournament not found!', components: [] });
                return;
            }
            
            await showTournamentDetails(interaction, tourney, viewerId);
            return;
        }

        if (baseCustomId === 'admin_menu') {
            const choice = value.split('_')[0]; // 'upload', 'delete', etc.
            const viewerId = value.split('_').pop();

            if (choice === 'upload') {
                await interaction.reply({ 
                    content: '📂 **Attach the tourney file now.**\nNext message with attachment will be processed.', 
                    ephemeral: true 
                });
                
                const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
                const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

                collector.on('collect', async m => {
                    const excelFiles = m.attachments.filter(att => 
                        att.name.endsWith('.xlsx') || att.name.endsWith('.xls')
                    );
                    
                    if (excelFiles.size === 0) {
                        await m.reply('❌ No valid Excel files found. upload .xlsx or .xls files dum dum');
                        return;
                    }

                    let totalUpdated = 0;
                    let totalErrors = 0;

                    for (const [index, attachment] of excelFiles.entries()) {
                        try {
                            const response = await fetch(attachment.url);
                            const arrayBuffer = await response.arrayBuffer();
                            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                            const sheetName = workbook.SheetNames[0];
                            const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

                            if (sheetData.length < 2) {
                                console.log(`File ${attachment.name} is empty`);
                                totalErrors++;
                                continue;
                            }

                            await processExcelData(interaction, sheetData, loadDB());
                            totalUpdated++;
                            
                        } catch (error) {
                            console.error(`Error processing ${attachment.name}:`, error);
                            totalErrors++;
                        }
                    }

                    await m.reply(
                        `✅ **Processed ${excelFiles.size} files**\n` +
                        `• Updated: ${totalUpdated}\n` +
                        `• Errors: ${totalErrors}`
                    );
                });

                collector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        interaction.followUp({ content: 'Timed out waiting for file.', ephemeral: true }).catch(() => {});
                    }
                });
            } else if (choice === 'delete') {
                await interaction.update({ content: '🗑️ Select tournament to delete below:', components: [] });
            } else if (choice === 'list') {
                await showTournamentList(interaction, db, 0, interaction.user.id);
            } else if (choice === 'edit_user') {
                const modal = new ModalBuilder()
                    .setCustomId(`admin_edit_user_modal_${interaction.user.id}`)
                    .setTitle('Edit User Stats');
                
                const inputUser = new TextInputBuilder()
                    .setCustomId('edit_user_id')
                    .setLabel('User ID')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                
                const inputTourney = new TextInputBuilder()
                    .setCustomId('edit_tourney_name')
                    .setLabel('Tournament Name')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const inputKills = new TextInputBuilder()
                    .setCustomId('edit_kills')
                    .setLabel('New Kills Amount')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setValue('0');

                const inputPoints = new TextInputBuilder()
                    .setCustomId('edit_points')
                    .setLabel('New Points Amount')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setValue('0');

                const row1 = new ActionRowBuilder().addComponents(inputUser);
                const row2 = new ActionRowBuilder().addComponents(inputTourney);
                const row3 = new ActionRowBuilder().addComponents(inputKills);
                const row4 = new ActionRowBuilder().addComponents(inputPoints);

                modal.addComponents(row1, row2, row3, row4);
                await interaction.showModal(modal);
            }
            return;
        }

        if (baseCustomId === 'admin_delete_select') {
            const parts = value.split('_');
            const viewerId = parts[parts.length - 1]; 
            const tourneyName = parts.slice(3, -1).join('_');
            
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
    }

    if (interaction.isModalSubmit()) {
        // Basic ownership check for modals based on CustomID suffix
        if (!verifyOwnership(interaction, customId)) {
            await interaction.reply({ content: 'use your own man, try /esports', ephemeral: true });
            return;
        }

        const baseCustomId = customId.substring(0, customId.lastIndexOf('_'));

        if (baseCustomId === 'search_player_modal') {
            const query = interaction.fields.getTextInputValue('player_search_input').toLowerCase();
            let user = interaction.guild.members.cache.find(m => m.user.username.toLowerCase() === query);
            if (!user) user = interaction.guild.members.cache.get(query);
            
            if (user) {
                await showPlayerStats(interaction, user.user, interaction.user.id);
            } else {
                await safeUpdate(interaction, [], []);
                await interaction.followUp({ content: 'User not found in this server.', ephemeral: true });
            }
            return;
        }

        if (baseCustomId === 'search_clan_modal') {
            const clanName = interaction.fields.getTextInputValue('clan_search_input').trim();
            if(clanName) {
                await showClanProfile(interaction, clanName, interaction.user.id);
            } else {
                await interaction.reply({ content: 'Invalid Clan Name', ephemeral: true });
            }
            return;
        }

        if (baseCustomId === 'admin_edit_user_modal') {
            const userId = interaction.fields.getTextInputValue('edit_user_id').trim();
            const tourneyName = interaction.fields.getTextInputValue('edit_tourney_name').trim();
            const kills = parseInt(interaction.fields.getTextInputValue('edit_kills')) || 0;
            const points = parseInt(interaction.fields.getTextInputValue('edit_points')) || 0;

            if(!db[tourneyName]) {
                await interaction.reply({ content: `❌ Tournament \`${tourneyName}\` not found.`, ephemeral: true });
                return;
            }

            let displayName = `User ${userId}`;
            try {
                const user = await interaction.client.users.fetch(userId);
                displayName = user.username;
            } catch (e) {}

            const participantIndex = db[tourneyName].participants.findIndex(p => p.discordId === userId);
            const participant = participantIndex > -1 
                ? db[tourneyName].participants[participantIndex]
                : { name: displayName, discordId: userId, kills: 0, points: 0 };

            participant.name = displayName;
            participant.kills = kills;
            participant.points = points;

            if (participantIndex > -1) {
                db[tourneyName].participants[participantIndex] = participant;
            } else {
                db[tourneyName].participants.push(participant);
            }

            saveDB(db);

            await interaction.reply({ 
                content: `✅ Updated stats for **${displayName}** in \`${tourneyName}\`.\nNew Kills: ${kills} | New Points: ${points}`, 
                ephemeral: true 
            });
            return;
        }
    }

    if (interaction.isButton()) {
        if (!verifyOwnership(interaction, customId)) {
            await interaction.reply({ content: 'use your own man, try /esports', ephemeral: true });
            return;
        }

        const parts = customId.split('_');
        const viewerId = parts[parts.length - 1];
        const baseAction = parts.slice(0, -1).join('_');

        if (baseAction === 'portal_view_all') {
            await showTournamentList(interaction, db, 0, viewerId);
            return;
        }
        if (baseAction === 'portal_search_player') {
            const modal = new ModalBuilder()
                .setCustomId(`search_player_modal_${viewerId}`)
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
        if (baseAction === 'portal_search_clan') {
            const modal = new ModalBuilder()
                .setCustomId(`search_clan_modal_${viewerId}`)
                .setTitle('Search Clan');
            const input = new TextInputBuilder()
                .setCustomId('clan_search_input')
                .setLabel('Enter Clan Name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);
            await interaction.showModal(modal);
            return;
        }

        if (baseAction === 'player_back' || baseAction === 'tourney_list_back' || baseAction === 'tourney_details_back') {
            await showPublicPanel(interaction, viewerId);
            return;
        }

        if (customId.startsWith('player_history_')) {
            // Format: player_history_targetId_page_viewerId
            const targetUserId = parts[2];
            const page = parseInt(parts[3]);
            const stats = calculateUserStats(db, targetUserId);
            await showPlayerHistory(interaction, targetUserId, stats, page, viewerId);
            return;
        }

        if (customId.startsWith('clan_history_')) {
            // Format: clan_history_name_parts_0_viewerId
            // Reconstruct clan name (everything between 'clan_history_' and '_page_viewerId')
            // Structure: ['clan', 'history', ...clanNameParts..., page, viewerId]
            const page = parseInt(parts[parts.length - 2]);
            const clanName = parts.slice(2, parts.length - 2).join('_');
            const { stats } = await calculateClanStats(interaction.client, db, clanName);
            await showClanHistory(interaction, clanName, stats, page, viewerId);
            return;
        }

        if (baseAction.startsWith('tourney_list_')) {
            // Format: tourney_list_page_viewerId
            const page = parseInt(parts[2]);
            await showTournamentList(interaction, db, page, viewerId);
            return;
        }

        if (baseAction.startsWith('tourney_details_')) {
            // Format: tourney_details_tourneyName_viewerId
            // Note: tourneyName can have underscores.
            // parts[0] = tourney, parts[1] = details. Rest is name + viewerId
            const tourneyName = parts.slice(2, parts.length - 1).join('_');
            const tourney = db[tourneyName];
            await showTournamentDetails(interaction, tourney, viewerId);
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
    const idxSubType = getColIndex('subtype');
    const idxCurr = getColIndex('currency');
    const idxYear = getColIndex('year');
    const idxStart = getColIndex('start');
    const idxEnd = getColIndex('end');
    const idxPrize = getColIndex('prize');

    if (idxName === -1 || idxPart === -1 || idxStat === -1) {
        await interaction.followUp({ content: '❌ Missing required columns (Tournament, Participant, or Stats)', ephemeral: true });
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
                subType: row[idxSubType] || 'Unknown',
                currency: row[idxCurr] ? String(row[idxCurr]) : 'Points',
                year: row[idxYear] ? Number(row[idxYear]) : new Date().getFullYear(),
                startDate: formatDate(row[idxStart]),
                endDate: formatDate(row[idxEnd]),
                participants: [],
                winnerId: null, 
                winnerName: null,
                prize: row[idxPrize] || 'TBD',
                firstProcessed: false
            };
            
            if (db[tName]) overwrites.push(tName);
        }

        const participantName = String(row[idxPart] || 'Unknown').trim();
        const discordId = idxId > -1 ? String(row[idxId] || '').trim() : '';
        const statValue = Number(row[idxStat]) || 0;

        if (!participantName) continue;

        const participantEntry = {
            name: participantName || `Player ${groupedTournaments[tName].participants.length + 1}`,
            discordId: discordId, 
            kills: 0,
            points: 0
        };

        let isKills = false;
        const currentRowCurrency = row[idxCurr] ? String(row[idxCurr]).trim() : null;

        if (currentRowCurrency) {
            isKills = currentRowCurrency.toLowerCase().includes('kill');
            groupedTournaments[tName].currency = currentRowCurrency;
        } else {
            const tourneyCurrency = groupedTournaments[tName].currency;
            if (tourneyCurrency && tourneyCurrency.toLowerCase().includes('kill')) {
                isKills = true;
            } else {
                isKills = false;
            }
        }
        
        if (isKills) {
            participantEntry.kills = statValue;
        } else {
            participantEntry.points = statValue;
        }

        if (!groupedTournaments[tName].firstProcessed) {
            if (discordId) {
                groupedTournaments[tName].winnerId = discordId;
                groupedTournaments[tName].winnerName = participantName;
            } else {
                groupedTournaments[tName].winnerName = participantName;
                groupedTournaments[tName].winnerId = null; 
            }
            groupedTournaments[tName].firstProcessed = true;
        }

        const existingIdx = groupedTournaments[tName].participants.findIndex(p => {
            if (discordId && p.discordId === discordId) return true;
            if (!discordId && !p.discordId && p.name.toLowerCase() === participantName.toLowerCase()) return true;
            return false;
        });

        if (existingIdx > -1) {
            groupedTournaments[tName].participants[existingIdx] = participantEntry;
        } else {
            groupedTournaments[tName].participants.push(participantEntry);
        }
    }

    let updateCount = 0;
    for (const [key, t] of Object.entries(groupedTournaments)) {
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

async function showTournamentList(interaction, db, page, viewerId) {
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
            .setCustomId(`tourney_list_${page - 1}_${viewerId}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`tourney_list_${page + 1}_${viewerId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`tourney_list_back_${viewerId}`)
            .setLabel('Back to Portal')
            .setStyle(ButtonStyle.Danger)
    );

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        await interaction.reply({ embeds: [embed], components: [row] });
    }
}

async function showTournamentDetails(interaction, tourney, viewerId) {
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
            .setCustomId(`tourney_details_back_${viewerId}`)
            .setLabel('Back to Portal')
            .setStyle(ButtonStyle.Secondary)
    );

    await safeUpdate(interaction, [embed], [row]);
}

async function showPlayerHistory(interaction, userId, stats, page, viewerId) {
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
            .setCustomId(`player_history_${userId}_${page - 1}_${viewerId}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`player_history_${userId}_${page + 1}_${viewerId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`player_back_${viewerId}`)
            .setLabel('Back to Profile')
            .setStyle(ButtonStyle.Danger)
    );

    if (interaction.replied) await interaction.editReply({ embeds: [embed], components: [row] });
    else await interaction.reply({ embeds: [embed], components: [row] });
}

async function showClanHistory(interaction, clanName, stats, page, viewerId) {
    const history = stats.tournamentsParticipated;
    const itemsPerPage = 5;
    const totalPages = Math.ceil(history.length / itemsPerPage) || 1;
    
    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;

    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = history.slice(start, end);

    const embed = new EmbedBuilder()
        .setTitle(`History: ${clanName}`)
        .setColor(0x57F287)
        .setFooter({ text: `Page ${page + 1}/${totalPages} | Total: ${stats.totalKills} Kills / ${stats.totalPoints} Points` });

    let desc = '';
    pageData.forEach(t => {
        const icon = t.won ? '🏆' : '🛡️';
        desc += `${icon} **${t.name}** (${t.year})\nKills: ${t.kills} | Points: ${t.points}\n`;
    });
    embed.setDescription(desc || 'No history found.');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`clan_history_${clanName}_${page - 1}_${viewerId}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`clan_history_${clanName}_${page + 1}_${viewerId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`player_back_${viewerId}`)
            .setLabel('Back to Profile')
            .setStyle(ButtonStyle.Danger)
    );

    if (interaction.replied) await interaction.editReply({ embeds: [embed], components: [row] });
    else await interaction.reply({ embeds: [embed], components: [row] });
}