import React, { useState, useEffect } from 'react';
import { Waves, Bell, ShieldAlert, Cpu, ChevronDown, Check, Clock, Radio } from 'lucide-react';
import { useTelemetry } from '../../context/TelemetryContext';
import { Link, useLocation } from 'react-router-dom';
import { formatTimeWithIST } from '../../utils/dateUtils';
import clsx from 'clsx';

export const Header: React.FC = () => {
  const {
    nodes,
    activeNode,
    activeNodeId,
    setActiveNodeId,
    unreadAlertsCount,
    latestReading,
    latestModel,
    dataSourceMode,
    isLiveStreaming,
  } = useTelemetry();

  const [timeString, setTimeString] = useState<string>('');
  const [nodeDropdownOpen, setNodeDropdownOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeString(formatTimeWithIST(now));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-[#090e17] border-b border-slate-800/90 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Identity */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-teal-500/10 border border-cyan-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.2)] group-hover:border-cyan-400 transition-colors">
                <Waves className="w-6 h-6 text-cyan-400 group-hover:scale-105 transition-transform" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-lg tracking-wider text-slate-100 group-hover:text-cyan-300 transition-colors">
                    STAGRA
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/50">
                    RESEARCH
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block leading-none">
                  Stagnant Water Assessment & Growth Risk Analysis
                </p>
              </div>
            </Link>
          </div>

          {/* Center: Active Node Selector */}
          <div className="relative">
            <button
              onClick={() => setNodeDropdownOpen(!nodeDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1522] border border-slate-700 hover:border-cyan-500/50 text-slate-200 transition-all font-mono text-xs shadow-inner"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <div className="text-left">
                <span className="text-[10px] text-slate-400 block leading-none">ACTIVE NODE:</span>
                <span className="font-semibold text-cyan-300 truncate max-w-[140px] sm:max-w-[200px] block">
                  {activeNode?.name || 'Selecting Node...'}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
            </button>

            {nodeDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNodeDropdownOpen(false)}
                />
                <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-80 rounded-xl bg-[#0d1522] border border-slate-700 shadow-2xl z-50 p-2">
                  <div className="px-2.5 py-1 text-[10px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 flex justify-between">
                    <span>Research Sampling Nodes</span>
                    <span>ESP32 Grid</span>
                  </div>
                  <div className="py-1 space-y-1 max-h-72 overflow-y-auto">
                    {nodes.map((node) => {
                      const isCurrent = node.id === activeNodeId;
                      return (
                        <button
                          key={node.id}
                          onClick={() => {
                            setActiveNodeId(node.id);
                            setNodeDropdownOpen(false);
                          }}
                          className={clsx(
                            'w-full text-left p-2 rounded-lg transition-colors flex items-start gap-2 text-xs font-mono',
                            isCurrent
                              ? 'bg-cyan-950/70 border border-cyan-700/60 text-cyan-200'
                              : 'hover:bg-slate-800/60 text-slate-300'
                          )}
                        >
                          <span className="w-2 h-2 rounded-full mt-1.5 bg-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold flex items-center justify-between">
                              <span className="truncate">{node.name}</span>
                              {isCurrent && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">
                              {node.waterBodyType} • {node.code}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Controls: IST Clock & Alerts */}
          <div className="flex items-center gap-3">
            {/* IST Clock */}
            <div className="hidden md:flex items-center gap-1.5 font-mono text-xs text-slate-400 px-2.5 py-1 rounded bg-[#0b121e] border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{timeString || '00:00:00 IST'}</span>
            </div>

            {/* Alerts Quick Link */}
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
