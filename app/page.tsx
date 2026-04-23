'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LeftSidebar } from './components/LeftSidebar';
import { MainContent } from './components/MainContent';
import { RightSidebar } from './components/RightSidebar';
import { BottomBar } from './components/BottomBar';
import { KanbanBoard } from './components/KanbanBoard';
import { AgentOffice } from './components/AgentOffice';
import { BlogsTab } from './components/BlogsTab';
import { DirectoryScraperTab } from './components/DirectoryScraperTab';
import { LeadGenerationTab } from './components/lead-generation/LeadGenerationTab';
import { SystemMetrics, Task, ActivityDataPoint, Session, Agent, Alert, CronJob } from './lib/types';
import type { HubAppId } from './lib/hubApps';

const EMPTY_METRICS: SystemMetrics = {
  activeSessions: 0,
  totalSessions: 0,
  agentsOnline: 0,
  agentsIdle: 0,
  activityPerMin: 0,
  errors60m: 0,
  overdueCrons: 0,
  wipTasks: 0,
  blockedTasks: 0,
  avgDoneTime: 'n/a',
  healthIndex: 100,
  tokensTotal: 0,
};

const SIDEBAR_COLLAPSED_KEY = 'mc_sidebar_collapsed';

const GeoIntelligenceEntry = dynamic(
  () => import('./geo-intelligence-entry').then((m) => m.GeoIntelligenceEntry),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-screen w-full items-center justify-center text-sm text-white/70"
        style={{ backgroundColor: '#05070d', minHeight: '100vh' }}
      >
        Loading Geo Intelligence…
      </div>
    ),
  },
);

export default function ArrowHub() {
  const [activeApp, setActiveApp] = useState<HubAppId>('GEO_INTELLIGENCE');
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openClawHubOff, setOpenClawHubOff] = useState(false);
  const [openClawEnvLocked, setOpenClawEnvLocked] = useState(false);

  const [metrics, setMetrics] = useState<SystemMetrics>(EMPTY_METRICS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activityData, setActivityData] = useState<ActivityDataPoint[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [crons, setCrons] = useState<CronJob[]>([]);

  const refreshOpenClawData = useCallback(async () => {
    if (openClawHubOff) return;
    try {
      const [
        metricsRes,
        tasksRes,
        sessionsRes,
        agentsRes,
        activityRes,
        alertsRes,
        cronsRes,
      ] = await Promise.all([
        fetch('/api/metrics', { cache: 'no-store' }),
        fetch('/api/tasks', { cache: 'no-store' }),
        fetch('/api/sessions', { cache: 'no-store' }),
        fetch('/api/agents', { cache: 'no-store' }),
        fetch('/api/activity', { cache: 'no-store' }),
        fetch('/api/alerts', { cache: 'no-store' }),
        fetch('/api/crons', { cache: 'no-store' }),
      ]);

      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (activityRes.ok) setActivityData(await activityRes.json());
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (cronsRes.ok) setCrons(await cronsRes.json());
    } catch (err) {
      console.error('OpenClaw stats refresh failed', err);
    }
  }, [openClawHubOff]);

  useEffect(() => {
    setMounted(true);
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    (async () => {
      try {
        const res = await fetch('/api/hub/openclaw-toggle', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setOpenClawHubOff(!!data.off);
          setOpenClawEnvLocked(!!data.envDisabled);
          if (data.off) {
            setMetrics(EMPTY_METRICS);
            setTasks([]);
            setSessions([]);
            setAgents([]);
            setActivityData([]);
            setAlerts([]);
            setCrons([]);
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, [mounted]);

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

  const toggleOpenClawHub = useCallback(async () => {
    if (openClawEnvLocked) return;
    const next = !openClawHubOff;
    try {
      await fetch('/api/hub/openclaw-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ off: next }),
      });
      const res = await fetch('/api/hub/openclaw-toggle', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setOpenClawHubOff(!!data.off);
        setOpenClawEnvLocked(!!data.envDisabled);
        if (data.off) {
          setMetrics(EMPTY_METRICS);
          setTasks([]);
          setSessions([]);
          setAgents([]);
          setActivityData([]);
          setAlerts([]);
          setCrons([]);
        } else {
          refreshOpenClawData();
        }
      }
    } catch (err) {
      console.error('OpenClaw hub toggle failed', err);
    }
  }, [openClawEnvLocked, openClawHubOff, refreshOpenClawData]);

  useEffect(() => {
    if (!mounted) return;

    refreshOpenClawData();
    const id = setInterval(refreshOpenClawData, 15000);
    return () => clearInterval(id);
  }, [mounted, refreshOpenClawData]);

  if (!mounted) {
    if (activeApp === 'GEO_INTELLIGENCE') {
      return (
        <div className="h-screen w-full" style={{ backgroundColor: '#05070d' }}>
          <div className="flex h-full items-center justify-center text-sm text-white/70">
            Loading Geo Intelligence…
          </div>
        </div>
      );
    }
    return (
      <div className="h-screen flex flex-col" style={{ backgroundColor: '#f4f4f5' }}>
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (activeApp === 'GEO_INTELLIGENCE') {
    return (
      <div className="relative h-screen overflow-hidden bg-[#020409]">
        <div className="absolute right-4 top-4 z-40">
          <button
            type="button"
            onClick={() => setActiveApp('OPENCLAW')}
            className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur-md transition-colors hover:border-brand/30 hover:bg-brand/15 hover:text-white"
          >
            Open Mission Control
          </button>
        </div>
        <GeoIntelligenceEntry />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden hub-shell">
      <Header
        activeApp={activeApp}
        openClawHubOff={openClawHubOff}
        openClawEnvLocked={openClawEnvLocked}
        onOpenClawHubToggle={toggleOpenClawHub}
      />

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
        ) : activeApp === 'AGENTS' ? (
          <AgentOffice />
        ) : activeApp === 'SCRAPER' ? (
          <DirectoryScraperTab />
        ) : activeApp === 'LEAD_GEN' ? (
          <LeadGenerationTab />
        ) : (
          <MainContent
            metrics={metrics}
            tasks={tasks}
            sessions={sessions}
            activityData={activityData}
          />
        )}

        {activeApp === 'OPENCLAW' && <RightSidebar alerts={alerts} crons={crons} />}
      </div>

      <BottomBar />
    </div>
  );
}
