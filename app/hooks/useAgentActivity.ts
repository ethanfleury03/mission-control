import { useMemo } from 'react';

interface Agent {
  id: string;
  name: string;
  model: string;
  tokens: string;
  status: 'working' | 'moving' | 'idle';
}

export function useAgentActivity(agents: Agent[]) {
  return useMemo(() => {
    const count = agents?.length ?? 0;
    const workingCount = agents.filter(a => a?.status === 'working').length;
    const idleCount = agents.filter(a => a?.status === 'idle').length;
    
    // Parse tokens and sum them (remove 'K' and convert to number)
    const totalTokens = agents.reduce((sum, a) => {
      const raw = a?.tokens ? String(a.tokens).replace('K', '') : '0';
      const tokenValue = (parseFloat(raw) || 0) * 1000;
      return sum + tokenValue;
    }, 0);
    
    // Guard against division by zero when agents is empty
    const activityLevel = count > 0 ? workingCount / count : 0;
    
    return {
      activityLevel,
      ambientIntensity: Math.min(1, totalTokens / 60000) || 0,
      workingCount,
      idleCount,
      totalTokens,
    };
  }, [agents]);
}
