import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Kanban,
  Newspaper,
  Bot,
  Globe,
} from 'lucide-react';

export type HubAppId = 'OPENCLAW' | 'KANBAN' | 'BLOGS' | 'AGENTS' | 'SCRAPER';

export interface HubApp {
  id: HubAppId;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const HUB_APPS: HubApp[] = [
  {
    id: 'OPENCLAW',
    label: 'OpenClaw',
    description: 'Live OpenClaw stats & runtime',
    icon: LayoutDashboard,
  },
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
    id: 'AGENTS',
    label: 'Agents',
    description: 'Agent office',
    icon: Bot,
  },
  {
    id: 'SCRAPER',
    label: 'Directory Scraper',
    description: 'Extract contacts from directories',
    icon: Globe,
  },
];
