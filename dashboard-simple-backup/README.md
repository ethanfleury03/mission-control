# 🎯 Mission Control

A complete autonomous agent management system for OpenClaw, featuring a visual "office" dashboard and Discord integration.

## 📁 Structure

```
mission-control/
├── AGENT_REGISTRY.md          # Master agent registry
├── agents/
│   ├── sales-agent/SKILL.md   # Sales agent definition
│   ├── support-agent/SKILL.md # Support agent definition
│   ├── research-agent/SKILL.md # Research agent definition
│   └── ops-agent/SKILL.md     # Ops agent definition
├── dashboard/
│   ├── index.html             # Visual office dashboard (UI)
│   ├── server.js              # Backend API server
│   ├── discord-bot.js         # Discord bot integration
│   ├── package.json           # Dependencies
│   └── README.md              # This file
├── tasks/                     # Task storage (active/completed)
└── cron/                      # Scheduled job definitions
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd mission-control/dashboard
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
# Discord Bot (optional - for Discord integration)
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Server Configuration
PORT=3456
DASHBOARD_URL=http://your-server:3456
MC_API=http://localhost:3456/api
```

### 3. Start the Dashboard Server

```bash
npm start
# or
node server.js
```

Dashboard will be available at: `http://localhost:3456`

### 4. Start the Discord Bot (optional)

```bash
node discord-bot.js
```

## 🎮 Features

### Visual Office Dashboard

- **Agent Desks**: Each agent has a visual "desk" showing status
- **Real-time Updates**: WebSocket connection for live status
- **Task Assignment**: Click "Assign Task" to spawn an agent
- **Activity Feed**: See what agents are doing in real-time
- **Status Indicators**: 🟢 Ready | 🟡 Busy | 🔴 Error | ⚪ Offline

### Discord Bot Commands

| Command | Description |
|---------|-------------|
| `/agent list` | Show all agents and their status |
| `/agent status <agent>` | Check specific agent details |
| `/agent spawn <agent> <task>` | Assign a task to an agent |
| `/agent kill <agent>` | Stop an agent's current task |
| `/missioncontrol dashboard` | Get dashboard link |
| `/missioncontrol status` | System status overview |

### Agents Available

| Agent | Emoji | Role | Capabilities |
|-------|-------|------|--------------|
| Sales Agent | 💼 | Lead Qualification | Email, Calendar, Research |
| Support Agent | 🎧 | Customer Support | Email, Discord, Escalation |
| Research Agent | 🔬 | Market Research | Web Search, Analysis, Reports |
| Ops Agent | ⚙️ | Operations | Monitoring, Approvals, Coordination |

## 🔧 Architecture

### How It Works

```
User (Discord or Dashboard)
    ↓
Mission Control API (server.js)
    ↓
OpenClaw Sessions API (sessions_spawn)
    ↓
Agent runs in isolated session
    ↓
Reports back via Discord/Message
```

### 24/7 Autonomous Operation

The system supports three operation modes:

1. **On-Demand** (User-triggered)
   - User assigns task via dashboard or Discord
   - Agent spawns, completes task, reports back
   - Agent returns to ready pool

2. **Scheduled** (Cron jobs)
   - Define tasks in `cron/` directory
   - System spawns agents at scheduled times
   - Daily reports, weekly summaries, etc.

3. **Event-Driven** (Heartbeats/Webhooks)
   - Agents spawn in response to events
   - New email → Email agent
   - Calendar event → Ops agent
   - Support ticket → Support agent

## 📝 Creating New Agents

1. Create directory: `mission-control/agents/my-agent/`
2. Write `SKILL.md` defining:
   - Purpose and when to use
   - Workflow steps
   - Tools available
   - Handoff rules
   - Output format
3. Register in `AGENT_REGISTRY.md`
4. Add to dashboard `server.js` agents object

## 🎨 Customization

### Adding to the Dashboard

Edit `dashboard/index.html`:
- Modify CSS variables for colors
- Add new agent desk cards
- Customize the office layout

### Discord Integration

The bot posts to channel `1469858204237299956` by default. Edit `discord-bot.js` to change:
- `MISSION_CONTROL_CHANNEL` constant
- Command definitions
- Embed formatting

## 🔒 Production Deployment

### Recommended Setup

1. **Host Dashboard**: Deploy to VPS or cloud (AWS, DigitalOcean, etc.)
2. **Reverse Proxy**: Use nginx to serve dashboard with SSL
3. **Process Manager**: Use PM2 to keep server running:
   ```bash
   npm install -g pm2
   pm2 start server.js --name mission-control-api
   pm2 start discord-bot.js --name mission-control-bot
   pm2 save
   pm2 startup
   ```
4. **Discord Activity** (optional): Register as Discord Embedded App for in-client UI

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | No | Bot token for Discord integration |
| `DISCORD_CLIENT_ID` | No | Application ID for slash commands |
| `PORT` | No | API server port (default: 3456) |
| `DASHBOARD_URL` | No | Public URL for dashboard |
| `MC_API` | No | Internal API endpoint |

## 🐛 Troubleshooting

### Dashboard not loading
- Check `server.js` is running: `node server.js`
- Verify port 3456 is not in use: `lsof -i :3456`
- Check firewall settings

### Discord bot not responding
- Verify `DISCORD_TOKEN` is set correctly
- Check bot has proper permissions in server
- Ensure slash commands are registered

### Agents not spawning
- Verify OpenClaw is running and accessible
- Check `sessions_spawn` API is available
- Review agent skill files are properly formatted

## 🎯 Next Steps

1. ✅ Create additional specialized agents
2. ✅ Build task queue system for high-demand agents
3. ✅ Add agent-to-agent communication protocols
4. ✅ Implement memory sharing between agents
5. ✅ Create visual workflow builder
6. ✅ Add agent performance analytics

## 📄 License

Part of OpenClaw workspace - custom implementation for Ethan Fleury / arrsys.com
