import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  LayoutDashboard,
  History as HistoryIcon,
  LineChart,
  Bell,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useTelemetry } from '../../context/TelemetryContext';
import clsx from 'clsx';

export const Navbar: React.FC = () => {
  const { unreadAlertsCount } = useTelemetry();

  const navItems = [
    {
      to: '/',
      label: 'Home',
      icon: Home,
      exact: true,
      description: 'Project Overview & Research Pipeline',
    },
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Direct Sensor vs Model Telemetry Console',
    },
    {
      to: '/history',
      label: 'History',
      icon: HistoryIcon,
      description: 'Temporal Time-Series & Statistical Analysis',
    },
    {
      to: '/predictions',
      label: 'Predictions',
      icon: LineChart,
      description: 'Transformer Temporal & GNN Spatial Graphs',
    },
    {
      to: '/alerts',
      label: 'Alerts',
      icon: Bell,
      badge: unreadAlertsCount > 0 ? unreadAlertsCount : undefined,
      description: 'Threshold Triggers & Water Degradation Warnings',
    },
    {
      to: '/system',
      label: 'System',
      icon: Cpu,
      description: 'Hardware Health & Future Sensor Roadmap',
    },
  ];

  return (
    <nav className="bg-[#080d16] border-b border-slate-800 px-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto no-scrollbar py-1">
        <div className="flex items-center space-x-1 sm:space-x-2 py-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono font-medium transition-all duration-150 whitespace-nowrap',
                  isActive
                    ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-700/60 shadow-[0_0_12px_rgba(6,182,212,0.15)] font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={clsx(
                      'w-4 h-4 shrink-0 transition-colors',
                      isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'
                    )}
                  />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-teal-400" />
          <span>Transformer + GNN Proposed Architecture</span>
        </div>
      </div>
    </nav>
  );
};
