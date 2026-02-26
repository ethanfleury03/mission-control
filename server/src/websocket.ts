import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import url from 'url';

interface ClientConnection {
  ws: WebSocket;
  agentId?: string;
  isDashboard: boolean;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientConnection> = new Map();

  initialize(server: any): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const parsedUrl = url.parse(req.url || '', true);
      const agentId = parsedUrl.query.agentId as string | undefined;
      const isDashboard = parsedUrl.query.dashboard === 'true';
      
      console.log(`WebSocket connected: ${isDashboard ? 'dashboard' : 'agent'}${agentId ? ` (${agentId})` : ''}`);
      
      this.clients.set(ws, { ws, agentId, isDashboard });
      
      ws.on('close', () => {
        console.log(`WebSocket disconnected: ${agentId || 'dashboard'}`);
        this.clients.delete(ws);
      });
      
      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    });
    
    console.log('WebSocket server initialized');
  }

  // Broadcast to all dashboard clients
  broadcastToDashboards(message: any): void {
    const data = JSON.stringify(message);
    
    this.clients.forEach((client) => {
      if (client.isDashboard && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  // Send message to specific agent
  sendToAgent(agentId: string, message: any): void {
    const data = JSON.stringify(message);
    
    this.clients.forEach((client) => {
      if (client.agentId === agentId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  // Broadcast task update to all interested parties
  broadcastTaskUpdate(taskId: string, payload: any): void {
    this.broadcastToDashboards({
      type: 'task.update',
      taskId,
      payload,
      timestamp: new Date().toISOString()
    });
  }

  // Send human response to waiting agent
  sendReviewResponse(agentId: string, reviewId: string, response: any): void {
    this.sendToAgent(agentId, {
      type: 'review.response',
      reviewId,
      reviewType: response.type,
      approved: response.approved,
      response: response.response,
      timestamp: new Date().toISOString()
    });
  }

  // Generic broadcast method for any message
  broadcast(message: any): void {
    const data = JSON.stringify({
      ...message,
      timestamp: message.timestamp || new Date().toISOString()
    });
    
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  // Broadcast agent updates
  broadcastAgentUpdate(agent: any): void {
    this.broadcast({
      type: 'agents:updated',
      payload: { agent }
    });
  }

  // Broadcast team updates
  broadcastTeamUpdate(team: any): void {
    this.broadcast({
      type: 'teams:updated',
      payload: { team }
    });
  }
}

export const wsManager = new WebSocketManager();
