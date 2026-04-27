import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Orbit,
  Newspaper,
  Globe,
  Target,
  ImagePlus,
  Phone,
  Shield,
} from 'lucide-react';

import { BLOGS_ENABLED } from '@/lib/features';

export type HubAppId =
  | 'BLOGS'
  | 'SCRAPER'
  | 'LEAD_GEN'
  | 'IMAGE_GEN'
  | 'GEO_INTELLIGENCE'
  | 'PHONE'
  | 'MANUALS'
  | 'ADMIN';

export const DEFAULT_HUB_APP: HubAppId = 'GEO_INTELLIGENCE';

export interface HubApp {
  id: HubAppId;
  label: string;
  description: string;
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
    id: 'ADMIN',
    label: 'Admin',
    description: 'Users & security logs',
    icon: Shield,
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
