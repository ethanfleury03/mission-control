'use client';

import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { LeftSidebar } from './components/LeftSidebar';
import { MainContent } from './components/MainContent';
import { RightSidebar } from './components/RightSidebar';
import { BottomBar } from './components/BottomBar';
import { KanbanBoard } from './components/KanbanBoard';
import { AgentOffice } from './components/AgentOffice';
import { MapTab } from './components/MapTab';
import { SystemMetrics, Task, ActivityDataPoint, Session, Agent, Alert, CronJob } from './lib/types';

export default function MissionControl() {
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return <div className="h-screen flex flex-col bg-bg-primary" />;
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 flex overflow-hidden">
        {activeTab !== 'MAP' && activeTab !== 'AGENTS' && <LeftSidebar agents={[] as Agent[]} sessions={[] as Session[]} />}

        {activeTab === 'MAP' ? (
          <MapTab />
        ) : activeTab === 'KANBAN' ? (
          <KanbanBoard />
        ) : activeTab === 'AGENTS' ? (
          <AgentOffice />
        ) : (
          <MainContent 
            metrics={{} as SystemMetrics}
            tasks={[] as Task[]}
            sessions={[] as Session[]}
            activityData={[] as ActivityDataPoint[]}
          />
        )}
        
        {activeTab !== 'KANBAN' && activeTab !== 'MAP' && activeTab !== 'AGENTS' && <RightSidebar alerts={[] as Alert[]} crons={[] as CronJob[]} />}
      </div>
      
      <BottomBar />
    </div>
  );
}