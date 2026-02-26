import { useState, useEffect } from 'react';
import { Agent } from '../lib/types';
import { fallbackAgents } from '../lib/fallbackData';

export function useAgents(teamId?: string) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const url = teamId
        ? `http://localhost:3001/api/agents?teamId=${teamId}`
        : 'http://localhost:3001/api/agents';
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch agents');
      }
      
      const data = await response.json();
      let agentList = data.agents || [];
      if (teamId) {
        agentList = agentList.filter((a: Agent) => a.teamId === teamId);
      }
      // Use fallback when API returns empty (e.g. data files not yet loaded in container)
      if (agentList.length === 0) {
        agentList = teamId ? fallbackAgents.filter(a => a.teamId === teamId) : fallbackAgents;
        setIsOffline(true);
      } else {
        setIsOffline(false);
      }
      setAgents(agentList);
    } catch (err: any) {
      console.warn('Agents API unavailable, using fallback data:', err.message);
      const list = teamId ? fallbackAgents.filter(a => a.teamId === teamId) : fallbackAgents;
      setAgents(list);
      setIsOffline(true);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [teamId]);

  const refetch = () => {
    fetchAgents();
  };

  return { agents, loading, error, refetch, setAgents, isOffline };
}
