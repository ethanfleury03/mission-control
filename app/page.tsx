'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LeftSidebar } from './components/LeftSidebar';
import { BottomBar } from './components/BottomBar';
import { BlogsTab } from './components/BlogsTab';
import { DirectoryScraperTab } from './components/DirectoryScraperTab';
import { ImageGenerationTab } from './components/ImageGenerationTab';
import { LeadGenerationTab } from './components/lead-generation/LeadGenerationTab';
import { ManualsTab } from './components/ManualsTab';
import { PhoneTab } from './components/PhoneTab';
import type { HubAppId } from './lib/hubApps';
import { BLOGS_ENABLED } from '@/lib/features';

const SIDEBAR_COLLAPSED_KEY = 'mc_sidebar_collapsed';

const GeoIntelligenceEntry = dynamic(
  () => import('./geo-intelligence-entry').then((module) => module.GeoIntelligenceEntry),
  {
    ssr: false,
    loading: () => (
      <main className="flex flex-1 items-center justify-center bg-[#0b1222] text-sm text-white/70">
        Loading Geo Intelligence...
      </main>
    ),
  },
);

export default function ArrowHub() {
  const [activeApp, setActiveApp] = useState<HubAppId>('IMAGE_GEN');
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const resolvedActiveApp = activeApp === 'BLOGS' && !BLOGS_ENABLED ? 'IMAGE_GEN' : activeApp;

  useEffect(() => {
    setMounted(true);
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  if (!mounted) {
    return <div className="h-screen flex flex-col bg-bg-primary" />;
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden hub-shell">
      <Header activeApp={resolvedActiveApp} />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <LeftSidebar
          activeApp={resolvedActiveApp}
          onAppChange={setActiveApp}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
        />

        {resolvedActiveApp === 'BLOGS' ? (
          <BlogsTab />
        ) : resolvedActiveApp === 'SCRAPER' ? (
          <DirectoryScraperTab />
        ) : resolvedActiveApp === 'IMAGE_GEN' ? (
          <ImageGenerationTab />
        ) : resolvedActiveApp === 'GEO_INTELLIGENCE' ? (
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-[#0b1222]">
            <GeoIntelligenceEntry />
          </main>
        ) : resolvedActiveApp === 'LEAD_GEN' ? (
          <LeadGenerationTab />
        ) : resolvedActiveApp === 'PHONE' ? (
          <PhoneTab />
        ) : resolvedActiveApp === 'MANUALS' ? (
          <ManualsTab />
        ) : (
          <ImageGenerationTab />
        )}
      </div>

      <BottomBar />
    </div>
  );
}
