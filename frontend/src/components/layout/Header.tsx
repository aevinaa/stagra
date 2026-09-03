import React, { useEffect, useState } from 'react';
import {
  Waves,
  Bell,
  Clock,
} from 'lucide-react';
import { useTelemetry } from '../../context/TelemetryContext';
import { Link } from 'react-router-dom';
import { formatTimeWithIST } from '../../utils/dateUtils';
import clsx from 'clsx';

export const Header: React.FC = () => {
  const {
    unreadAlertsCount,
  } = useTelemetry();

  const [timeString, setTimeString] = useState('');

  useEffect(() => {
    const updateClock = () => {
      setTimeString(formatTimeWithIST(new Date()));
    };

    updateClock();

    const timer = setInterval(updateClock, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-[#090e17] border-b border-slate-800/90 sticky top-0 z-30">

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="flex items-center justify-between min-h-16 gap-4">

          {/* =====================================================
              BRAND
              ===================================================== */}
          <Link
            to="/"
            className="flex items-center gap-3 group min-w-0"
          >

            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-teal-500/10 border border-cyan-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)] group-hover:border-cyan-400 transition-colors shrink-0">
              <Waves className="w-6 h-6 text-cyan-400 group-hover:scale-105 transition-transform" />
            </div>


            <div className="min-w-0">

              <div className="flex items-center gap-2">

                <span className="font-mono font-extrabold text-lg tracking-wider text-slate-100 group-hover:text-cyan-300 transition-colors">
                  STAGRA
                </span>

                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/50">
                  RESEARCH PROTOTYPE
                </span>

              </div>

              <p className="text-[10px] text-slate-500 hidden sm:block leading-none truncate">
                Stagnant Water Assessment &amp; Growth Risk Analysis
              </p>

            </div>

          </Link>


          {/* =====================================================
              CURRENT PROTOTYPE STATUS
              ===================================================== */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1522] border border-slate-800">

            <span className="w-2 h-2 rounded-full bg-emerald-400" />

            <div className="font-mono text-[10px]">
              <span className="text-slate-500">
                NODE
              </span>

              <span className="text-cyan-300 font-bold ml-1.5">
                STG-PROTO-01
              </span>
            </div>

          </div>


          {/* =====================================================
              RIGHT CONTROLS
              ===================================================== */}
          <div className="flex items-center gap-2">

            <div className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] text-slate-400 px-2.5 py-1.5 rounded bg-[#0b121e] border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {timeString || '00:00:00 IST'}
              </span>
            </div>


            <Link
              to="/alerts"
              className={clsx(
                'relative p-2 rounded-lg border transition-all flex items-center justify-center',
                unreadAlertsCount > 0
                  ? 'bg-rose-950/40 border-rose-600/50 text-rose-300 hover:bg-rose-900/40'
                  : 'bg-[#0d1522] border-slate-700/80 text-slate-400 hover:text-slate-200'
              )}
              title={
                unreadAlertsCount > 0
                  ? `${unreadAlertsCount} unacknowledged alerts`
                  : 'Alerts'
              }
              aria-label="Open alerts"
            >

              <Bell className="w-4 h-4" />

              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white font-mono font-bold text-[9px] flex items-center justify-center">
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