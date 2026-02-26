const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const MISSION_CONTROL_CHANNEL = '1469858204237299956'; // The channel you specified

// Mission Control API endpoint
const MC_API = process.env.MC_API || 'http://localhost:3456/api';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

// Slash commands definition
const commands = [
  new SlashCommandBuilder()
    .setName('agent')
    .setDescription('Manage Mission Control agents')
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all available agents')
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Check agent status')
        .addStringOption(opt =>
          opt.setName('agent')
            .setDescription('Agent ID')
            .setRequired(true)
            .addChoices(
              { name: 'Sales Agent', value: 'sales-agent' },
              { name: 'Support Agent', value: 'support-agent' },
              { name: 'Research Agent', value: 'research-agent' },
              { name: 'Ops Agent', value: 'ops-agent' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('spawn')
        .setDescription('Assign a task to an agent')
        .addStringOption(opt =>
          opt.setName('agent')
            .setDescription('Agent to assign')
            .setRequired(true)
            .addChoices(
              { name: 'Sales Agent', value: 'sales-agent' },
              { name: 'Support Agent', value: 'support-agent' },
              { name: 'Research Agent', value: 'research-agent' },
              { name: 'Ops Agent', value: 'ops-agent' }
            )
        )
        .addStringOption(opt =>
          opt.setName('task')
            .setDescription('Task description')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('kill')
        .setDescription('Stop an agent\'s current task')
        .addStringOption(opt =>
          opt.setName('agent')
            .setDescription('Agent to stop')
            .setRequired(true)
            .addChoices(
              { name: 'Sales Agent', value: 'sales-agent' },
              { name: 'Support Agent', value: 'support-agent' },
              { name: 'Research Agent', value: 'research-agent' },
              { name: 'Ops Agent', value: 'ops-agent' }
            )
        )
    ),
  
  new SlashCommandBuilder()
    .setName('missioncontrol')
    .setDescription('Open Mission Control dashboard')
    .addSubcommand(sub =>
      sub.setName('dashboard')
        .setDescription('Get link to Mission Control dashboard')
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Get system status overview')
    )
];

// Register commands
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Status emojis
const statusEmoji = {
  ready: '🟢',
  busy: '🟡',
  error: '🔴',
  offline: '⚪'
};

// Command handlers
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, options } = interaction;
  
  try {
    // /agent list
    if (commandName === 'agent' && options.getSubcommand() === 'list') {
      await interaction.deferReply();
      
      const response = await fetch(`${MC_API}/agents`);
      const agents = await response.json();
      
      const embed = new EmbedBuilder()
        .setTitle('🎯 Mission Control - Agents')
        .setDescription('Available autonomous agents')
        .setColor(0x00d4ff)
        .addFields(
          agents.map(agent => ({
            name: `${statusEmoji[agent.status]} ${agent.emoji} ${agent.name}`,
            value: `**Role:** ${agent.role}\n**Status:** ${agent.status.toUpperCase()}${agent.currentTask ? `\n**Task:** ${agent.currentTask.substring(0, 100)}...` : ''}`,
            inline: false
          }))
        )
        .setFooter({ text: 'Use /agent spawn to assign tasks' });
      
      await interaction.editReply({ embeds: [embed] });
    }
    
    // /agent status <agent>
    else if (commandName === 'agent' && options.getSubcommand() === 'status') {
      await interaction.deferReply();
      
      const agentId = options.getString('agent');
      const response = await fetch(`${MC_API}/agents/${agentId}`);
      
      if (!response.ok) {
        return interaction.editReply({ content: '❌ Agent not found' });
      }
      
      const agent = await response.json();
      
      const embed = new EmbedBuilder()
        .setTitle(`${agent.emoji} ${agent.name}`)
        .setDescription(agent.role)
        .setColor(agent.status === 'ready' ? 0x00ff88 : agent.status === 'busy' ? 0xffdd00 : 0xff3366)
        .addFields(
          { name: 'Status', value: `${statusEmoji[agent.status]} ${agent.status.toUpperCase()}`, inline: true },
          { name: 'Capabilities', value: agent.capabilities.join(', '), inline: true },
          { name: 'Current Task', value: agent.currentTask || 'None - Ready for assignment', inline: false }
        );
      
      await interaction.editReply({ embeds: [embed] });
    }
    
    // /agent spawn <agent> <task>
    else if (commandName === 'agent' && options.getSubcommand() === 'spawn') {
      await interaction.deferReply();
      
      const agentId = options.getString('agent');
      const task = options.getString('task');
      
      const response = await fetch(`${MC_API}/agents/${agentId}/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        return interaction.editReply({ content: `❌ Error: ${result.error}` });
      }
      
      const embed = new EmbedBuilder()
        .setTitle('🚀 Agent Launched')
        .setDescription(`${result.agent.emoji} **${result.agent.name}** is now working on your task`)
        .setColor(0x00ff88)
        .addFields(
          { name: 'Task', value: task.substring(0, 500), inline: false }
        )
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
      // Post to mission control channel
      const mcChannel = await client.channels.fetch(MISSION_CONTROL_CHANNEL);
      if (mcChannel) {
        await mcChannel.send({
          embeds: [new EmbedBuilder()
            .setTitle('🎯 New Task Assignment')
            .setDescription(`**${interaction.user.tag}** assigned a task to ${result.agent.name}`)
            .addFields({ name: 'Task', value: task.substring(0, 500) })
            .setColor(0x00d4ff)
            .setTimestamp()
          ]
        });
      }
    }
    
    // /agent kill <agent>
    else if (commandName === 'agent' && options.getSubcommand() === 'kill') {
      await interaction.deferReply();
      
      const agentId = options.getString('agent');
      
      const response = await fetch(`${MC_API}/agents/${agentId}/kill`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        return interaction.editReply({ content: `❌ Error: ${result.error}` });
      }
      
      await interaction.editReply({
        content: `🛑 **${result.agent.name}** task terminated. Agent is now ready.`
      });
    }
    
    // /missioncontrol dashboard
    else if (commandName === 'missioncontrol' && options.getSubcommand() === 'dashboard') {
      const embed = new EmbedBuilder()
        .setTitle('🎯 Mission Control Dashboard')
        .setDescription('Access the full agent management interface')
        .setColor(0x00d4ff)
        .addFields(
          { name: 'Dashboard URL', value: process.env.DASHBOARD_URL || 'http://localhost:3456' },
          { name: 'Features', value: '• Visual agent office\n• Real-time task assignment\n• Activity feed\n• Agent status monitoring' }
        );
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // /missioncontrol status
    else if (commandName === 'missioncontrol' && options.getSubcommand() === 'status') {
      await interaction.deferReply();
      
      const response = await fetch(`${MC_API}/status`);
      const status = await response.json();
      
      const embed = new EmbedBuilder()
        .setTitle('🎯 Mission Control System Status')
        .setColor(0x00ff88)
        .addFields(
          { name: 'System', value: status.online ? '🟢 Online' : '🔴 Offline', inline: true },
          { name: 'Active Agents', value: `${status.activeAgents}/${status.totalAgents}`, inline: true },
          { name: 'Tasks Running', value: String(status.busyAgents), inline: true },
          { name: 'Uptime', value: `${Math.floor(status.uptime / 60)}m ${Math.floor(status.uptime % 60)}s`, inline: true }
        )
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
    }
    
  } catch (error) {
    console.error('Command error:', error);
    await interaction.editReply({ content: '❌ An error occurred. Check console.' });
  }
});

// Bot ready event
client.once('ready', () => {
  console.log(`🤖 Mission Control Bot logged in as ${client.user.tag}`);
  registerCommands();
  
  // Set bot presence
  client.user.setActivity('Managing Agents | /agent list', { type: 'WATCHING' });
});

// Error handling
client.on('error', console.error);

// Login
if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN environment variable required');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
