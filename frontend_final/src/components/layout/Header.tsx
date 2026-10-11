import React from 'react';
import { Menu } from 'lucide-react';
import { SystemStatus } from '../../types';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  title?: string;
  room?: string;
  systemStatus?: SystemStatus | null;
  lastUpdated?: string;
}

export function Header({
  onToggleMobileMenu,
  title = 'Indoor Air Quality Monitoring',
  room = 'Room 204',
  systemStatus,
  lastUpdated,
}: HeaderProps) {
  const isOnline = systemStatus ? systemStatus.esp32Connected : true;
  const displayTime = lastUpdated || (systemStatus ? new Date(systemStatus.lastPacketTime).toLocaleTimeString() : '--:--:--');
  return (
    <header className="h-16 bg-[#F8FAFB] border-b border-[#D5E0E4] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-10">
      {/* Left: Mobile menu button + Titles */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 -ml-2 text-[#607780] hover:text-[#19323C] rounded-[8px] hover:bg-[#EEF3F5] transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] sm:text-[16px] font-semibold text-[#19323C] leading-tight">
              {title}
            </h1>
          </div>
          <span className="text-[12px] text-[#607780] font-medium leading-tight">
            {room}
          </span>
        </div>
      </div>

      {/* Right: Telemetry status indicator */}
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-2 text-xs">
          {/* Status Indicator */}
          <span
            className={`flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full border ${
              isOnline
                ? 'text-[#27845A] bg-[#EEF8F2] border-[#D5E0E4]'
                : 'text-[#C94343] bg-[#FDF0F0] border-[#D5E0E4]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full inline-block ${
                isOnline ? 'bg-[#27845A] animate-pulse' : 'bg-[#C94343]'
              }`}
            />
            <span>{isOnline ? 'System Online' : 'System Offline'}</span>
          </span>

          <span className="text-[#D5E0E4] hidden sm:inline" aria-hidden="true">|</span>

          {/* Last updated timestamp */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#607780]">
            <span>Last updated:</span>
            <span className="font-mono text-[#19323C] font-medium tracking-tight">
              {displayTime}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
