/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { NavRoute } from './types/navigation';
import { SystemStatus } from './types';
import { getSystemStatus } from './services/api';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './views/DashboardView';
import { AnalyticsView } from './views/AnalyticsView';
import { PredictionView } from './views/PredictionView';
import { ModelsView } from './views/ModelsView';

function normalizePath(pathname: string): NavRoute {
  if (pathname === '/analytics') return '/analytics';
  if (pathname === '/prediction') return '/prediction';
  if (pathname === '/models') return '/models';
  return '/dashboard';
}

export default function App() {
  const [currentPath, setCurrentPath] = useState<NavRoute>(() => {
    return normalizePath(window.location.pathname);
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);

  // Poll or load initial system status from backend service
  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const status = await getSystemStatus();
        if (isMounted) {
          setSystemStatus(status);
          setStatusUnavailable(false);
        }
      } catch (err) {
        console.error('Failed to query system status:', err);
        if (isMounted) {
          // Never keep showing an old status after a failed poll.
          setSystemStatus(null);
          setStatusUnavailable(true);
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Check every 30s
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Sync state with browser forward/back buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(normalizePath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: NavRoute) => {
    if (path !== currentPath) {
      window.history.pushState(null, '', path);
      setCurrentPath(path);
    }
  };

  const renderActiveView = () => {
    switch (currentPath) {
      case '/dashboard':
        return <DashboardView />;
      case '/analytics':
        return <AnalyticsView />;
      case '/prediction':
        return <PredictionView />;
      case '/models':
        return <ModelsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF3F5] text-[#19323C] flex flex-row">
      {/* Light Sidebar */}
      <Sidebar
        currentPath={currentPath}
        onNavigate={navigateTo}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <Header
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
          title="Indoor Air Quality Monitoring"
          room={systemStatus?.room ?? null}
          systemStatus={systemStatus}
          statusUnavailable={statusUnavailable}
        />

        {/* Content Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}