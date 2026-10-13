import React from 'react';
import { Menu } from 'lucide-react';
import { SystemStatus } from '../../types';
import { IS_MOCK_MODE } from '../../services/api';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  title?: string;
  room?: string | null;
  systemStatus?: SystemStatus | null;
  /** True when the last system-status request failed (backend or dev server unreachable). */
  statusUnavailable?: boolean;
  lastUpdated?: string;
}

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

const TONE_STYLES: Record<Tone, { pill: string; dot: string }> = {
  ok: { pill: 'text-[#27845A] bg-[#EEF8F2] border-[#D5E0E4]', dot: 'bg-[#27845A] animate-pulse' },
  warn: { pill: 'text-[#C47A13] bg-[#FFF8E8] border-[#E7C98A]', dot: 'bg-[#C47A13]' },
  bad: { pill: 'text-[#C94343] bg-[#FDF0F0] border-[#E9C4C4]', dot: 'bg-[#C94343]' },
  neutral: { pill: 'text-[#607780] bg-[#E8F0F2] border-[#D5E0E4]', dot: 'bg-[#8A98A8]' },
};

function describeStatus(
  systemStatus: SystemStatus | null | undefined,
  statusUnavailable: boolean,
): { label: string; tone: Tone } {
  if (IS_MOCK_MODE) return { label: 'Simulated stream', tone: 'warn' };
  if (statusUnavailable) return { label: 'Status unavailable', tone: 'bad' };
  if (!systemStatus) return { label: 'Checking status…', tone: 'neutral' };

  switch (systemStatus.dataStatus) {
    case 'receiving':
      return { label: 'Receiving data', tone: 'ok' };
    case 'no_data':
      return { label: 'No data yet', tone: 'neutral' };
    case 'stale':
      return { label: 'Data stale', tone: 'warn' };
    case 'clock_skew':
      return { label: 'Clock skew', tone: 'warn' };
    default:
      return { label: 'Status unknown', tone: 'neutral' };
  }
}

function formatReadingTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString();
}

export function Header({
  onToggleMobileMenu,
  title = 'Indoor Air Quality Monitoring',
  room,
  systemStatus,
  statusUnavailable = false,
  lastUpdated,
}: HeaderProps) {
  const status = describeStatus(systemStatus, statusUnavailable);
  const tone = TONE_STYLES[status.tone];
  const displayTime = lastUpdated || formatReadingTime(systemStatus?.lastPacketTime);
  const showReadingTime = !IS_MOCK_MODE && !statusUnavailable;

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
            {IS_MOCK_MODE && (
              <span
                className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded border text-[#C47A13] bg-[#FFF8E8] border-[#E7C98A]"
                title="Data is generated in the browser. It is not sensor data."
              >
                MOCK DATA
              </span>
            )}
          </div>
          {room && (
            <span className="text-[12px] text-[#607780] font-medium leading-tight">
              {room}
            </span>
          )}
        </div>
      </div>

      {/* Right: Telemetry status indicator */}
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-2 text-xs">
          {/* Status Indicator */}
          <span className={`flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full border ${tone.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${tone.dot}`} />
            <span>{status.label}</span>
          </span>

          {showReadingTime && (
            <>
              <span className="text-[#D5E0E4] hidden sm:inline" aria-hidden="true">|</span>

              {/* Newest stored reading */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#607780]">
                <span>Last reading:</span>
                <span className="font-mono text-[#19323C] font-medium tracking-tight">
                  {displayTime}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}