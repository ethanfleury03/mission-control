import fs from 'fs/promises';
import path from 'path';

/**
 * @deprecated Use RegistryService + PostgreSQL for runtime. DataManager is kept
 * only for import/export and migration utilities. Do not use for live reads/writes.
 */
export interface Agent {
  id: string;
  name: string;
  teamId: string;
  status: 'active' | 'idle' | 'paused' | 'error' | 'working' | 'moving';
  model: string;
  runtime: string;
  lastSeen: string;
  tokensUsed: number;
  description?: string;
  tokens?: string;
  avatarType?: 'cat' | 'robot-teal' | 'robot-orange' | 'robot-purple';
}

export interface Team {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
}

export class DataManager {
  private dataDir = path.join(__dirname, '../../../data');
  
  /**
   * Create a backup of a file before modifying it
   */
  private async createBackup(filename: string): Promise<void> {
    try {
      const sourcePath = path.join(this.dataDir, filename);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.dataDir, 'backups', `${filename}.${timestamp}.backup`);
      
      // Ensure backups directory exists
      await fs.mkdir(path.join(this.dataDir, 'backups'), { recursive: true });
      
      // Copy file to backup
      await fs.copyFile(sourcePath, backupPath);
    } catch (error) {
      console.error(`Failed to create backup for ${filename}:`, error);
      throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all agents, optionally filtered by team
   */
  async getAgents(teamId?: string): Promise<Agent[]> {
    try {
      const data = await fs.readFile(path.join(this.dataDir, 'agents.json'), 'utf-8');
      const parsed = JSON.parse(data);
      const agents = parsed.agents || [];
      
      if (teamId) {
        return agents.filter((agent: Agent) => agent.teamId === teamId);
      }
      
      return agents;
    } catch (error) {
      console.error('Failed to read agents:', error);
      throw new Error(`Failed to load agents: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a single agent by ID
   */
  async getAgent(id: string): Promise<Agent | null> {
    const agents = await this.getAgents();
    return agents.find(agent => agent.id === id) || null;
  }

  /**
   * Save agents array to file with atomic write
   */
  async saveAgents(agents: Agent[]): Promise<void> {
    try {
      // Create backup before modifying
      await this.createBackup('agents.json');
      
      // Write to temporary file first
      const tempPath = path.join(this.dataDir, 'agents.json.tmp');
      await fs.writeFile(
        tempPath,
        JSON.stringify({ agents }, null, 2),
        'utf-8'
      );
      
      // Atomic rename
      await fs.rename(tempPath, path.join(this.dataDir, 'agents.json'));
    } catch (error) {
      console.error('Failed to save agents:', error);
      throw new Error(`Failed to save agents: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new agent
   */
  async createAgent(agent: Omit<Agent, 'id'>): Promise<Agent> {
    const agents = await this.getAgents();
    
    // Generate new ID
    const maxId = agents.reduce((max, a) => {
      const num = parseInt(a.id);
      return num > max ? num : max;
    }, 0);
    
    const newAgent: Agent = {
      ...agent,
      id: String(maxId + 1),
    };
    
    agents.push(newAgent);
    await this.saveAgents(agents);
    
    return newAgent;
  }

  /**
   * Update an existing agent
   */
  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | null> {
    const agents = await this.getAgents();
    const index = agents.findIndex(agent => agent.id === id);
    
    if (index === -1) {
      return null;
    }
    
    agents[index] = { ...agents[index], ...updates };
    await this.saveAgents(agents);
    
    return agents[index];
  }

  /**
   * Delete an agent
   */
  async deleteAgent(id: string): Promise<boolean> {
    const agents = await this.getAgents();
    const filtered = agents.filter(agent => agent.id !== id);
    
    if (filtered.length === agents.length) {
      return false; // Agent not found
    }
    
    await this.saveAgents(filtered);
    return true;
  }

  /**
   * Get all teams
   */
  async getTeams(): Promise<Team[]> {
    try {
      const data = await fs.readFile(path.join(this.dataDir, 'teams.json'), 'utf-8');
      const parsed = JSON.parse(data);
      return parsed.teams || [];
    } catch (error) {
      console.error('Failed to read teams:', error);
      throw new Error(`Failed to load teams: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a single team by ID
   */
  async getTeam(id: string): Promise<Team | null> {
    const teams = await this.getTeams();
    return teams.find(team => team.id === id) || null;
  }

  /**
   * Save teams array to file with atomic write
   */
  async saveTeams(teams: Team[]): Promise<void> {
    try {
      // Create backup before modifying
      await this.createBackup('teams.json');
      
      // Write to temporary file first
      const tempPath = path.join(this.dataDir, 'teams.json.tmp');
      await fs.writeFile(
        tempPath,
        JSON.stringify({ teams }, null, 2),
        'utf-8'
      );
      
      // Atomic rename
      await fs.rename(tempPath, path.join(this.dataDir, 'teams.json'));
    } catch (error) {
      console.error('Failed to save teams:', error);
      throw new Error(`Failed to save teams: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new team
   */
  async createTeam(team: Omit<Team, 'id' | 'createdAt'>): Promise<Team> {
    const teams = await this.getTeams();
    
    // Generate new ID
    const teamNumber = teams.length + 1;
    const teamName = team.name.toLowerCase().replace(/\s+/g, '-');
    
    const newTeam: Team = {
      ...team,
      id: `team-${teamName}`,
      createdAt: new Date().toISOString(),
    };
    
    teams.push(newTeam);
    await this.saveTeams(teams);
    
    return newTeam;
  }

  /**
   * Update an existing team
   */
  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    const teams = await this.getTeams();
    const index = teams.findIndex(team => team.id === id);
    
    if (index === -1) {
      return null;
    }
    
    teams[index] = { ...teams[index], ...updates };
    await this.saveTeams(teams);
    
    return teams[index];
  }

  /**
   * Delete a team
   */
  async deleteTeam(id: string, moveAgentsToTeam?: string): Promise<boolean> {
    const teams = await this.getTeams();
    const filtered = teams.filter(team => team.id !== id);
    
    if (filtered.length === teams.length) {
      return false; // Team not found
    }
    
    // Handle agents in the deleted team
    if (moveAgentsToTeam) {
      const agents = await this.getAgents();
      const updatedAgents = agents.map(agent => {
        if (agent.teamId === id) {
          return { ...agent, teamId: moveAgentsToTeam };
        }
        return agent;
      });
      await this.saveAgents(updatedAgents);
    } else {
      // Just delete without moving (could cause orphaned agents)
      console.warn(`Deleting team ${id} without moving agents`);
    }
    
    await this.saveTeams(filtered);
    return true;
  }
}
