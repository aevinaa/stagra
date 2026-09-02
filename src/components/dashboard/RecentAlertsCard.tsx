import React from 'react';
import { Bell, AlertTriangle, ShieldCheck, ChevronRight, Check } from 'lucide-react';
import { Alert } from '../../types';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

interface RecentAlertsCardProps {
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
}

export const RecentAlertsCard: React.FC<RecentAlertsCardProps> = ({
  alerts,
  onAcknowledge,
}) => {
  const activeAlerts = alerts.filter((a) => !a.acknowledged);

  return (
    <div className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg flex flex-col justify-between space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-cyan-400" />
          <h3 className="font-mono font-bold text-sm text-slate-100">Recent Alerts</h3>
          {activeAlerts.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-600/90 text-white font-mono text-[10px] font-bold">
              {activeAlerts.length} Active
            </span>
          )}
        </div>
        <Link
          to="/alerts"
          className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
        >
          <span>All Alerts</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Alert Stream Items */}
      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-0.5">
        {alerts.length === 0 ? (
          <div className="py-10 text-center text-xs font-mono text-slate-400">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
            <div className="text-slate-200 font-semibold">Telemetry Streams Nominal</div>
            <div className="text-[11px] text-slate-500 mt-0.5">No critical or warning thresholds exceeded.</div>
          </div>
        ) : (
          alerts.slice(0, 3).map((alert) => {
            const isCrit = alert.severity === 'CRITICAL';
            const isWarn = alert.severity === 'WARNING';

            return (
              <div
                key={alert.id}
                className={clsx(
                  'p-3 rounded-lg border text-xs font-mono transition-all',
                  alert.acknowledged
                    ? 'bg-[#080d16] border-slate-800 opacity-60 text-slate-400'
                    : isCrit
                    ? 'bg-rose-950/30 border-rose-600/50 text-rose-200'
                    : isWarn
                    ? 'bg-amber-950/30 border-amber-600/50 text-amber-200'
                    : 'bg-cyan-950/20 border-cyan-800/40 text-cyan-200'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={clsx(
                        'w-2 h-2 rounded-full shrink-0',
                        isCrit ? 'bg-rose-400 animate-ping' : isWarn ? 'bg-amber-400' : 'bg-cyan-400'
                      )}
                    />
                    <span className="font-bold text-slate-100 text-[11px] truncate max-w-[190px]">
                      {alert.title}
                    </span>
                  </div>

                  <span
                    className={clsx(
                      'text-[9px] px-1.5 py-0.2 rounded uppercase tracking-wider',
                      alert.directOrModel === 'DIRECT SENSOR'
                        ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/60'
                        : 'bg-teal-950/80 text-teal-300 border border-teal-700/60'
                    )}
                  >
                    {alert.directOrModel === 'DIRECT SENSOR' ? 'DIRECT' : 'MODEL'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 font-sans mt-1 leading-snug">
                  {alert.message}
                </p>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/80 text-[10px]">
                  <span className="text-slate-400">{alert.nodeName.split(' ')[0]}</span>
                  {!alert.acknowledged ? (
                    <button
                      onClick={() => onAcknowledge(alert.id)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono flex items-center gap-1 transition-colors"
                    >
                      <Check className="w-3 h-3 text-cyan-400" />
                      Ack
                    </button>
                  ) : (
                    <span className="text-emerald-400/80 text-[10px]">Acknowledged</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
