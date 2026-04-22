import type { LucideIcon } from 'lucide-react';
import {
  Kanban,
  Newspaper,
  Globe,
  Target,
} from 'lucide-react';

export type HubAppId = 'KANBAN' | 'BLOGS' | 'SCRAPER' | 'LEAD_GEN';

export interface HubApp {
  id: HubAppId;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const HUB_APPS: HubApp[] = [
  {
    id: 'KANBAN',
    label: 'Work board',
    description: 'Tasks and kanban',
    icon: Kanban,
  },
  {
    id: 'BLOGS',
    label: 'Blogs',
    description: 'Content pipeline',
    icon: Newspaper,
  },
  {
    id: 'SCRAPER',
    label: 'Directory Scraper',
    description: 'Extract contacts from directories',
    icon: Globe,
  },
  {
    id: 'LEAD_GEN',
    label: 'Lead Generation',
    description: 'Market databases & account qualification',
    icon: Target,
  },
];
