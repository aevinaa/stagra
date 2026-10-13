import React from 'react';
import { LayoutDashboard, LineChart, TrendingUp, GitCompare, Wind, X } from 'lucide-react';
import { NavRoute, NAV_ITEMS } from '../../types/navigation';

interface SidebarProps {
  currentPath: NavRoute;
  onNavigate: (path: NavRoute) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  currentPath,
  onNavigate,
  isOpenMobile = false,
  onCloseMobile,
}: SidebarProps) {
  const getNavIcon = (id: string, isActive: boolean) => {
    const iconClass = `w-4 h-4 shrink-0 transition-colors ${
      isActive ? 'text-[#176B87]' : 'text-[#607780] group-hover:text-[#19323C]'
    }`;

    switch (id) {
      case 'dashboard':
        return <LayoutDashboard className={iconClass} />;
      case 'analytics':
        return <LineChart className={iconClass} />;
      case 'prediction':
        return <TrendingUp className={iconClass} />;
      case 'models':
        return <GitCompare className={iconClass} />;
      default:
        return <LayoutDashboard className={iconClass} />;
    }
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#F4F7F8]">
      {/* Brand area */}
      <div className="h-16 px-5 border-b border-[#D5E0E4] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#E8F2F6] border border-[#D5E0E4] flex items-center justify-center text-[#176B87]">
            <Wind className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold text-[#19323C] leading-tight">
              Air Quality
            </span>
            <span className="text-[11px] font-normal text-[#607780] leading-tight">
              Monitoring System
            </span>
          </div>
        </div>

        {/* Mobile close button */}
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 text-[#607780] hover:text-[#19323C] rounded-[6px] hover:bg-[#EEF3F5] transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation section */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] uppercase tracking-wider font-semibold text-[#8A98A8]">
          Navigation
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive = currentPath === item.path;

          return (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.path);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[13px] font-medium transition-all text-left relative cursor-pointer ${
                isActive
                  ? 'bg-[#E8F2F6] text-[#176B87] shadow-2xs font-semibold'
                  : 'text-[#607780] hover:text-[#19323C] hover:bg-[#E8F0F2]'
              }`}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#176B87] rounded-r"
                  aria-hidden="true"
                />
              )}
              {getNavIcon(item.id, isActive)}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Hardware / embedded node metadata footer */}
      <div className="p-3 border-t border-[#D5E0E4] bg-[#EEF3F5]">
        <div className="p-2.5 rounded-[8px] bg-[#FAFCFC] border border-[#D5E0E4]">
          <div className="flex items-center justify-between text-[11px] text-[#607780] mb-1">
            <span className="font-medium text-[#19323C]">Telemetry Core</span>
            <span className="font-mono text-[#167C80] font-semibold text-[10px]">ESP32</span>
          </div>
          <div className="text-[11px] font-mono text-[#8A98A8] flex items-center justify-between">
            <span>Sensors</span>
            <span>DS18B20 · DHT11 · MQ135</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (fixed width, persistent) */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-[#D5E0E4] h-screen sticky top-0 bg-[#F4F7F8] z-20">
        {navContent}
      </aside>

      {/* Mobile Drawer (backdrop + sliding panel) */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#19323C]/30 backdrop-blur-[2px] transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <div className="relative flex flex-col w-64 max-w-xs bg-[#F4F7F8] h-full shadow-lg z-10 animate-in slide-in-from-left duration-200">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}