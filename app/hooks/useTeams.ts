import { useState, useEffect } from 'react';
import { Team } from '../lib/types';
import { fallbackTeams } from '../lib/fallbackData';

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:3001/api/teams');
      
      if (!response.ok) {
        throw new Error('Failed to fetch teams');
      }
      
      const data = await response.json();
      const teamList = data.teams || [];
      // Use fallback when API returns empty (e.g. data files not yet loaded in container)
      if (teamList.length === 0) {
        setTeams(fallbackTeams);
        setIsOffline(true);
      } else {
        setTeams(teamList);
        setIsOffline(false);
      }
    } catch (err: any) {
      console.warn('Teams API unavailable, using fallback data:', err.message);
      setTeams(fallbackTeams);
      setIsOffline(true);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const refetch = () => {
    fetchTeams();
  };

  return { teams, loading, error, refetch, setTeams, isOffline };
}
