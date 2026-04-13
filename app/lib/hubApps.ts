import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Kanban,
  Newspaper,
  Bot,
} from 'lucide-react';

export type HubAppId = 'OVERVIEW' | 'KANBAN' | 'BLOGS' | 'AGENTS';

export interface HubApp {
  id: HubAppId;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const HUB_APPS: HubApp[] = [
  {
    id: 'OVERVIEW',
    label: 'Overview',
    description: 'Ops metrics and activity',
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
];
