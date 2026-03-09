'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LeftSidebar } from './components/LeftSidebar';
import { MainContent } from './components/MainContent';
import { RightSidebar } from './components/RightSidebar';
import { BottomBar } from './components/BottomBar';
import { KanbanBoard } from './components/KanbanBoard';
import { AgentOffice } from './components/AgentOffice';
import { MapTab } from './components/MapTab';
import { SystemMetrics, Task, ActivityDataPoint, Session, Agent, Alert, CronJob } from './lib/types';

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

export default function MissionControl() {
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [mounted, setMounted] = useState(false);

  const [metrics, setMetrics] = useState<SystemMetrics>(EMPTY_METRICS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activityData, setActivityData] = useState<ActivityDataPoint[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [crons, setCrons] = useState<CronJob[]>([]);

  const refreshOverviewData = useCallback(async () => {
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
      console.error('Overview refresh failed', err);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    refreshOverviewData();
    const id = setInterval(refreshOverviewData, 15000);
    return () => clearInterval(id);
  }, [mounted, refreshOverviewData]);

  if (!mounted) {
    return <div className="h-screen flex flex-col bg-bg-primary" />;
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 flex overflow-hidden">
        {activeTab !== 'MAP' && activeTab !== 'AGENTS' && <LeftSidebar agents={agents} sessions={sessions} />}

        {activeTab === 'MAP' ? (
          <MapTab />
        ) : activeTab === 'KANBAN' ? (
          <KanbanBoard />
        ) : activeTab === 'AGENTS' ? (
          <AgentOffice />
        ) : (
          <MainContent
            metrics={metrics}
            tasks={tasks}
            sessions={sessions}
            activityData={activityData}
          />
        )}

        {activeTab !== 'KANBAN' && activeTab !== 'MAP' && activeTab !== 'AGENTS' && (
          <RightSidebar alerts={alerts} crons={crons} />
        )}
      </div>

      <BottomBar />
    </div>
  );
}
