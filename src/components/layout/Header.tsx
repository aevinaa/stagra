import React, { useEffect, useState } from 'react';
import { Waves, Bell, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTelemetry } from '../../context/TelemetryContext';
import { formatTimeWithIST } from '../../utils/dateUtils';
import clsx from 'clsx';

export const Header: React.FC = () => {
  const { unreadAlertsCount } = useTelemetry();

  const [timeString, setTimeString] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      setTimeString(formatTimeWithIST(new Date()));
    };

    updateClock();

    const timer = window.setInterval(updateClock, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="bg-[#090e17] border-b border-slate-800/90 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Brand Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-3 group min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-cyan-500/20 to-teal-500/10 border border-cyan-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.2)] group-hover:border-cyan-400 transition-colors">
                <Waves className="w-6 h-6 text-cyan-400 group-hover:scale-105 transition-transform" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-lg tracking-wider text-slate-100 group-hover:text-cyan-300 transition-colors">
                    STAGRA
                  </span>

                  <span className="hidden sm:inline text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/50">
                    RESEARCH
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 hidden sm:block leading-none truncate">
                  Stagnant Water Assessment &amp; Growth Risk Analysis
                </p>
              </div>
            </Link>
          </div>

          {/* Current Prototype Node */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1522] border border-slate-700 font-mono text-xs shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>

            <div>
              <span className="text-[10px] text-slate-400 block leading-none">
                PROTOTYPE NODE
              </span>

              <span className="font-semibold text-cyan-300">
                STG-PROTO-01
              </span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3 shrink-0">

            {/* IST Clock */}
            <div className="hidden md:flex items-center gap-1.5 font-mono text-xs text-slate-400 px-2.5 py-1 rounded bg-[#0b121e] border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{timeString || '00:00:00 IST'}</span>
            </div>

            {/* Alerts */}
            <Link
              to="/alerts"
              className={clsx(
                'relative p-2 rounded-lg border transition-all flex items-center justify-center',
                unreadAlertsCount > 0
                  ? 'bg-rose-950/40 border-rose-600/50 text-rose-300 hover:bg-rose-900/40 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                  : 'bg-[#0d1522] border-slate-700/80 text-slate-400 hover:text-slate-200'
              )}
              title={`${unreadAlertsCount} unacknowledged research alerts`}
            >
              <Bell className="w-4 h-4" />

              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-mono font-bold text-[10px]">
                  {unreadAlertsCount}
                </span>
              )}
            </Link>
          </div>

        </div>
      </div>
    </header>
  );
};