import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  BrainCircuit,
  Mail,
  MessageSquareText,
  Orbit,
  Newspaper,
  Target,
  ImagePlus,
  Phone,
  Shield,
} from 'lucide-react';

import { BLOGS_ENABLED } from '@/lib/features';

export type HubAppId =
  | 'BLOGS'
  | 'LEAD_GEN'
  | 'IMAGE_GEN'
  | 'GEO_INTELLIGENCE'
  | 'PHONE'
  | 'MANUALS'
  | 'RAG'
  | 'AI_HELP_DESK'
  | 'ADMIN'
  | 'OUTREACH_CRM';

export const DEFAULT_HUB_APP: HubAppId = 'GEO_INTELLIGENCE';

export interface HubApp {
  id: HubAppId;
  label: string;
  description: string;
  currentDescription?: string;
  searchPlaceholder?: string;
  icon: LucideIcon;
}

const ALL_HUB_APPS: HubApp[] = [
  {
    id: 'GEO_INTELLIGENCE',
    label: 'Geo Intelligence',
    description: 'Dealer ecosystem & coverage map',
    icon: Orbit,
  },
  {
    id: 'BLOGS',
    label: 'Blogs',
    description: 'Content pipeline',
    icon: Newspaper,
  },
  {
    id: 'LEAD_GEN',
    label: 'Lead Generation',
    description: 'Market databases & account qualification',
    icon: Target,
  },
  {
    id: 'IMAGE_GEN',
    label: 'Image Generation',
    description: 'Guided content creation workspace',
    icon: ImagePlus,
  },
  {
    id: 'PHONE',
    label: 'Phone',
    description: 'Cold calling & operations',
    icon: Phone,
  },
  {
    id: 'MANUALS',
    label: 'Manuals',
    description: 'Internal manual library',
    icon: BookOpen,
  },
  {
    id: 'RAG',
    label: 'RAG',
    description: 'Cited support assistant',
    icon: BrainCircuit,
  },
  {
    id: 'AI_HELP_DESK',
    label: 'AI Help Desk',
    description: 'Submit requests & track tickets',
    currentDescription: 'client ticket portal',
    searchPlaceholder: 'Search tickets, comments, requesters...',
    icon: MessageSquareText,
  },
  {
    id: 'ADMIN',
    label: 'Admin',
    description: 'Users & security logs',
    icon: Shield,
  },
  {
    id: 'OUTREACH_CRM',
    label: 'Outreach CRM',
    description: 'Email outreach pipeline',
    currentDescription: 'Sasha campaign pipeline',
    searchPlaceholder: 'Search hub, contacts, campaigns...',
    icon: Mail,
  },
];

export function getHubApps(options: { includeAdmin?: boolean } = {}): HubApp[] {
  return ALL_HUB_APPS.filter((app) => {
    if (app.id === 'BLOGS' && !BLOGS_ENABLED) return false;
    if (app.id === 'ADMIN' && !options.includeAdmin) return false;
    return true;
  });
}

export const HUB_APPS: HubApp[] = getHubApps();
