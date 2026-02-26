import { ParsedCommand } from './commandParser';
import type { RegistryAdapter, Agent, Team } from './registryAdapter';

export interface CommandResult {
  success: boolean;
  message: string;
  changes?: Array<{
    type: 'create' | 'update' | 'delete';
    entity: 'agent' | 'team';
    id: string;
    before?: any;
    after?: any;
  }>;
  error?: string;
}

export class CommandExecutor {
  constructor(private dataManager: RegistryAdapter) {}

  /**
   * Execute a parsed command and return the result
   */
  async execute(parsed: ParsedCommand): Promise<CommandResult> {
    try {
      switch (parsed.action) {
        case 'create':
          return await this.handleCreate(parsed);
        case 'update':
          return await this.handleUpdate(parsed);
        case 'delete':
          return await this.handleDelete(parsed);
        default:
          return {
            success: false,
            message: 'Unknown action',
            error: `Invalid action: ${parsed.action}`
          };
      }
    } catch (error: any) {
      console.error('Command execution error:', error);
      return {
        success: false,
        message: 'Command execution failed',
        error: error.message
      };
    }
  }

  /**
   * Execute multiple commands in sequence
   */
  async executeMultiple(commands: ParsedCommand[]): Promise<CommandResult> {
    const allChanges: CommandResult['changes'] = [];
    const messages: string[] = [];

    for (const command of commands) {
      const result = await this.execute(command);
      
      if (!result.success) {
        return {
          success: false,
          message: `Failed at: ${result.message}`,
          error: result.error,
          changes: allChanges
        };
      }

      if (result.changes) {
        allChanges.push(...result.changes);
      }
      messages.push(result.message);
    }

    return {
      success: true,
      message: messages.join('; '),
      changes: allChanges
    };
  }

  /**
   * Handle CREATE commands
   */
  private async handleCreate(parsed: ParsedCommand): Promise<CommandResult> {
    if (parsed.entity === 'agent') {
      return await this.createAgent(parsed.params);
    } else if (parsed.entity === 'team') {
      return await this.createTeam(parsed.params);
    }

    return {
      success: false,
      message: 'Unknown entity type',
      error: `Cannot create ${parsed.entity}`
    };
  }

  /**
   * Handle UPDATE commands
   */
  private async handleUpdate(parsed: ParsedCommand): Promise<CommandResult> {
    if (parsed.entity === 'agent') {
      return await this.updateAgent(parsed.params);
    } else if (parsed.entity === 'team') {
      return await this.updateTeam(parsed.params);
    }

    return {
      success: false,
      message: 'Unknown entity type',
      error: `Cannot update ${parsed.entity}`
    };
  }

  /**
   * Handle DELETE commands
   */
  private async handleDelete(parsed: ParsedCommand): Promise<CommandResult> {
    if (parsed.entity === 'agent') {
      return await this.deleteAgent(parsed.params);
    } else if (parsed.entity === 'team') {
      return await this.deleteTeam(parsed.params);
    }

    return {
      success: false,
      message: 'Unknown entity type',
      error: `Cannot delete ${parsed.entity}`
    };
  }

  /**
   * Create a new agent
   */
  private async createAgent(params: any): Promise<CommandResult> {
    const newAgent = await this.dataManager.createAgent({
      name: params.name,
      teamId: params.teamId,
      model: params.model,
      runtime: params.runtime || params.model,
      status: params.status || 'idle',
      lastSeen: new Date().toISOString(),
      tokensUsed: params.tokensUsed || 0,
      description: params.description || '',
      avatarType: params.avatarType || 'robot-teal',
      tokens: params.tokens || '0',
    });

    return {
      success: true,
      message: `Created agent ${newAgent.name}`,
      changes: [{
        type: 'create',
        entity: 'agent',
        id: newAgent.id,
        after: newAgent
      }]
    };
  }

  /**
   * Update an existing agent
   */
  private async updateAgent(params: any): Promise<CommandResult> {
    // Find agent by name or ID
    let agent: Agent | null = null;
    
    if (params.id) {
      agent = await this.dataManager.getAgent(params.id);
    } else if (params.name) {
      const agents = await this.dataManager.getAgents();
      agent = agents.find(a => a.name.toLowerCase() === params.name.toLowerCase()) || null;
    }

    if (!agent) {
      return {
        success: false,
        message: `Agent not found: ${params.name || params.id}`,
        error: 'Agent not found'
      };
    }

    const before = { ...agent };
    const changes = params.changes || {};
    
    // Apply changes
    const updatedAgent = await this.dataManager.updateAgent(agent.id, changes);

    if (!updatedAgent) {
      return {
        success: false,
        message: `Failed to update agent ${agent.name}`,
        error: 'Update failed'
      };
    }

    return {
      success: true,
      message: `Updated agent ${updatedAgent.name}`,
      changes: [{
        type: 'update',
        entity: 'agent',
        id: updatedAgent.id,
        before,
        after: updatedAgent
      }]
    };
  }

  /**
   * Delete an agent
   */
  private async deleteAgent(params: any): Promise<CommandResult> {
    // Find agent by name or ID
    let agent: Agent | null = null;
    
    if (params.id) {
      agent = await this.dataManager.getAgent(params.id);
    } else if (params.name) {
      const agents = await this.dataManager.getAgents();
      agent = agents.find(a => a.name.toLowerCase() === params.name.toLowerCase()) || null;
    }

    if (!agent) {
      return {
        success: false,
        message: `Agent not found: ${params.name || params.id}`,
        error: 'Agent not found'
      };
    }

    const before = { ...agent };
    const success = await this.dataManager.deleteAgent(agent.id);

    if (!success) {
      return {
        success: false,
        message: `Failed to delete agent ${agent.name}`,
        error: 'Deletion failed'
      };
    }

    return {
      success: true,
      message: `Deleted agent ${agent.name}`,
      changes: [{
        type: 'delete',
        entity: 'agent',
        id: agent.id,
        before
      }]
    };
  }

  /**
   * Create a new team
   */
  private async createTeam(params: any): Promise<CommandResult> {
    const newTeam = await this.dataManager.createTeam({
      name: params.name,
      description: params.description || '',
      color: params.color || '#22d3ee',
    });

    return {
      success: true,
      message: `Created team ${newTeam.name}`,
      changes: [{
        type: 'create',
        entity: 'team',
        id: newTeam.id,
        after: newTeam
      }]
    };
  }

  /**
   * Update an existing team
   */
  private async updateTeam(params: any): Promise<CommandResult> {
    // Find team by ID or name
    let team: Team | null = null;
    
    if (params.id) {
      team = await this.dataManager.getTeam(params.id);
    } else if (params.name) {
      const teams = await this.dataManager.getTeams();
      team = teams.find(t => t.name.toLowerCase() === params.name.toLowerCase()) || null;
    }

    if (!team) {
      return {
        success: false,
        message: `Team not found: ${params.name || params.id}`,
        error: 'Team not found'
      };
    }

    const before = { ...team };
    const changes = params.changes || {};
    
    const updatedTeam = await this.dataManager.updateTeam(team.id, changes);

    if (!updatedTeam) {
      return {
        success: false,
        message: `Failed to update team ${team.name}`,
        error: 'Update failed'
      };
    }

    return {
      success: true,
      message: `Updated team ${updatedTeam.name}`,
      changes: [{
        type: 'update',
        entity: 'team',
        id: updatedTeam.id,
        before,
        after: updatedTeam
      }]
    };
  }

  /**
   * Delete a team
   */
  private async deleteTeam(params: any): Promise<CommandResult> {
    // Find team by ID or name
    let team: Team | null = null;
    
    if (params.id) {
      team = await this.dataManager.getTeam(params.id);
    } else if (params.name) {
      const teams = await this.dataManager.getTeams();
      team = teams.find(t => t.name.toLowerCase() === params.name.toLowerCase()) || null;
    }

    if (!team) {
      return {
        success: false,
        message: `Team not found: ${params.name || params.id}`,
        error: 'Team not found'
      };
    }

    const before = { ...team };
    const success = await this.dataManager.deleteTeam(
      team.id,
      params.moveAgentsToTeam
    );

    if (!success) {
      return {
        success: false,
        message: `Failed to delete team ${team.name}`,
        error: 'Deletion failed'
      };
    }

    return {
      success: true,
      message: `Deleted team ${team.name}`,
      changes: [{
        type: 'delete',
        entity: 'team',
        id: team.id,
        before
      }]
    };
  }
}
