import axios from 'axios';

export interface ParsedCommand {
  action: 'create' | 'update' | 'delete';
  entity: 'agent' | 'team';
  params: any;
  confidence?: number;
}

export class CommandParser {
  private apiKey: string;
  private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      console.warn('OPENROUTER_API_KEY not set. Command parsing will fail.');
    }
  }

  /**
   * Parse natural language command into structured JSON
   */
  async parseCommand(command: string): Promise<ParsedCommand> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'moonshotai/kimi-k2.5',
          messages: [
            {
              role: 'system',
              content: `You are a command parser for an agent management system. Parse natural language into structured JSON commands.

Supported Commands:

**CREATE AGENT**:
- "add agent named X to marketing team using gpt-4"
- "create a new agent called Bob for sales with claude-opus"
Output: {"action": "create", "entity": "agent", "params": {"name": "X", "teamId": "team-marketing", "model": "gpt-4", ...}}

**UPDATE AGENT**:
- "change Ava's model to claude-opus"
- "move Sam to sales team"
- "rename agent Forge to Hammer"
- "set Clawd's status to idle"
Output: {"action": "update", "entity": "agent", "params": {"name": "Ava", "changes": {"model": "claude-opus"}}}

**DELETE AGENT**:
- "delete agent Maya"
- "remove Clawd"
Output: {"action": "delete", "entity": "agent", "params": {"name": "Maya"}}

**CREATE TEAM**:
- "create a team called Engineering with blue color"
- "add team called DevOps"
Output: {"action": "create", "entity": "team", "params": {"name": "Engineering", "color": "#3b82f6", "description": ""}}

**UPDATE TEAM**:
- "rename Marketing to Growth"
- "change Sales team color to purple"
Output: {"action": "update", "entity": "team", "params": {"id": "team-marketing", "changes": {"name": "Growth"}}}

**DELETE TEAM**:
- "delete RIP team"
- "remove Labels team and move agents to marketing"
Output: {"action": "delete", "entity": "team", "params": {"id": "team-rip", "moveAgentsToTeam": "team-marketing"}}

IMPORTANT RULES:
1. Team IDs follow format: "team-{lowercase-name}" (e.g., "team-marketing", "team-sales")
2. For agent updates, use "name" to identify and "changes" for modifications
3. For team updates, use "id" to identify and "changes" for modifications
4. Model names should match common formats: "gpt-4", "claude-opus", "gpt-4-turbo", etc.
5. Status values: "active", "idle", "paused", "working", "moving", "error"
6. Avatar types: "cat", "robot-teal", "robot-orange", "robot-purple"
7. Return ONLY valid JSON, no additional text

Return format:
{
  "action": "create|update|delete",
  "entity": "agent|team",
  "params": { ... },
  "confidence": 0.0-1.0
}`
            },
            {
              role: 'user',
              content: command
            }
          ],
          temperature: 0.1,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      
      // Parse the JSON response
      let parsed: ParsedCommand;
      try {
        // Try to extract JSON if wrapped in markdown or text
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          parsed = JSON.parse(content);
        }
      } catch (parseError) {
        throw new Error(`Failed to parse AI response as JSON: ${content}`);
      }

      // Validate parsed command
      this.validateCommand(parsed);

      return parsed;
    } catch (error: any) {
      console.error('Command parsing error:', error);
      
      if (error.response) {
        throw new Error(
          `OpenRouter API error: ${error.response.data?.error?.message || error.response.statusText}`
        );
      }
      
      throw new Error(`Command parsing failed: ${error.message}`);
    }
  }

  /**
   * Validate that the parsed command has required fields
   */
  private validateCommand(command: any): void {
    if (!command.action || !['create', 'update', 'delete'].includes(command.action)) {
      throw new Error('Invalid action. Must be: create, update, or delete');
    }

    if (!command.entity || !['agent', 'team'].includes(command.entity)) {
      throw new Error('Invalid entity. Must be: agent or team');
    }

    if (!command.params || typeof command.params !== 'object') {
      throw new Error('Missing or invalid params');
    }

    // Entity-specific validation
    if (command.entity === 'agent') {
      if (command.action === 'create') {
        const required = ['name', 'teamId', 'model'];
        for (const field of required) {
          if (!command.params[field]) {
            throw new Error(`Missing required field for agent creation: ${field}`);
          }
        }
      } else if (command.action === 'update') {
        if (!command.params.name && !command.params.id) {
          throw new Error('Agent update requires name or id');
        }
      } else if (command.action === 'delete') {
        if (!command.params.name && !command.params.id) {
          throw new Error('Agent deletion requires name or id');
        }
      }
    }

    if (command.entity === 'team') {
      if (command.action === 'create') {
        if (!command.params.name) {
          throw new Error('Team creation requires name');
        }
      } else if (command.action === 'update' || command.action === 'delete') {
        if (!command.params.id && !command.params.name) {
          throw new Error('Team update/delete requires id or name');
        }
      }
    }
  }

  /**
   * Parse multiple commands from a single input
   */
  async parseMultipleCommands(input: string): Promise<ParsedCommand[]> {
    // Check if input contains multiple commands (connected by "and", "then", etc.)
    const separators = /\s+and\s+|\s+then\s+|\s*;\s*|\s*\.\s+/i;
    
    if (separators.test(input)) {
      const parts = input.split(separators).filter(p => p.trim());
      const commands: ParsedCommand[] = [];
      
      for (const part of parts) {
        try {
          const parsed = await this.parseCommand(part);
          commands.push(parsed);
        } catch (error) {
          console.warn(`Failed to parse command part: ${part}`, error);
        }
      }
      
      return commands;
    }
    
    // Single command
    return [await this.parseCommand(input)];
  }
}
