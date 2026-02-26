import { useEffect, useState } from 'react';
import { ProfileData } from '../../src/components/team/types';

/**
 * Hook to load profile data from markdown files
 */
export function useOrgData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async (profileFile: string): Promise<ProfileData | null> => {
    setLoading(true);
    setError(null);

    try {
      // Extract filename from path
      const filename = profileFile.includes('/') 
        ? profileFile.split('/').pop() || profileFile
        : profileFile;
      
      // Try API route first
      const apiPath = `/api/profiles/${filename}`;
      let response: Response;
      
      try {
        response = await fetch(apiPath);
      } catch {
        // If API doesn't exist, try direct file path (for development)
        // This will work if files are in public directory
        response = await fetch(`/memory/profiles/${filename}`);
      }
      
      if (!response.ok) {
        throw new Error(`Failed to load profile: ${profileFile}`);
      }

      const text = await response.text();
      return parseProfileMarkdown(text, profileFile);
    } catch (err) {
      console.error('Error loading profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
      
      // Return mock data for development
      return {
        id: profileFile.split('/').pop()?.replace('.md', '') || 'unknown',
        name: 'Unknown',
        role: 'Team Member',
        department: 'Unknown',
        email: null,
        permissions: [],
        brainDump: [],
        longTermMemory: [],
      };
    } finally {
      setLoading(false);
    }
  };

  return { loadProfile, loading, error };
}

/**
 * Parse markdown profile file into ProfileData
 */
function parseProfileMarkdown(markdown: string, profileFile: string): ProfileData {
  const lines = markdown.split('\n');
  const data: Partial<ProfileData> = {
    id: profileFile.split('/').pop()?.replace('.md', '') || 'unknown',
    brainDump: [],
    longTermMemory: [],
  };

  let currentSection: 'brainDump' | 'longTermMemory' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Parse basic fields
    if (line.startsWith('**ID:**')) {
      data.id = line.replace('**ID:**', '').trim();
    } else if (line.startsWith('**Name:**')) {
      data.name = line.replace('**Name:**', '').trim();
    } else if (line.startsWith('**Role:**')) {
      data.role = line.replace('**Role:**', '').trim();
    } else if (line.startsWith('**Email:**')) {
      const email = line.replace('**Email:**', '').trim();
      data.email = email === 'null' || email === '' ? null : email;
    } else if (line.startsWith('**Department:**')) {
      data.department = line.replace('**Department:**', '').trim();
    } else if (line.includes('**Authorized Proactive User**')) {
      if (!data.permissions) data.permissions = [];
      data.permissions.push('proactive_access');
    } else if (line.includes('**Org Manager**')) {
      if (!data.permissions) data.permissions = [];
      data.permissions.push('org_manager');
    } else if (line.includes('**System Admin**')) {
      if (!data.permissions) data.permissions = [];
      data.permissions.push('system_admin');
    }

    // Parse sections
    if (line === '## Brain Dump (Incoming Notes)') {
      currentSection = 'brainDump';
    } else if (line === '## Long-Term Memory') {
      currentSection = 'longTermMemory';
    } else if (line.startsWith('##') || line.startsWith('---')) {
      currentSection = null;
    } else if (currentSection && line.startsWith('-')) {
      const content = line.replace(/^-\s*/, '').trim();
      if (content && data[currentSection]) {
        data[currentSection]!.push(content);
      }
    }
  }

  return {
    id: data.id || 'unknown',
    name: data.name || 'Unknown',
    role: data.role || 'Team Member',
    department: data.department || 'Unknown',
    email: data.email || null,
    permissions: data.permissions || [],
    brainDump: data.brainDump || [],
    longTermMemory: data.longTermMemory || [],
  };
}
