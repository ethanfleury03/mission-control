'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LeftSidebar } from './components/LeftSidebar';
import { BottomBar } from './components/BottomBar';
import { KanbanBoard } from './components/KanbanBoard';
import { BlogsTab } from './components/BlogsTab';
import { DirectoryScraperTab } from './components/DirectoryScraperTab';
import { LeadGenerationTab } from './components/lead-generation/LeadGenerationTab';
import type { HubAppId } from './lib/hubApps';

const SIDEBAR_COLLAPSED_KEY = 'mc_sidebar_collapsed';

export default function ArrowHub() {
  const [activeApp, setActiveApp] = useState<HubAppId>('KANBAN');
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      <Header activeApp={activeApp} />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <LeftSidebar
          activeApp={activeApp}
          onAppChange={setActiveApp}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
        />

        {activeApp === 'KANBAN' ? (
          <KanbanBoard />
        ) : activeApp === 'BLOGS' ? (
          <BlogsTab />
        ) : activeApp === 'SCRAPER' ? (
          <DirectoryScraperTab />
        ) : activeApp === 'LEAD_GEN' ? (
          <LeadGenerationTab />
        ) : (
          <KanbanBoard />
        )}
      </div>

      <BottomBar />
    </div>
  );
}
