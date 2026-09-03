import React from 'react';
import {
  Bell,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
  Check,
} from 'lucide-react';
import { Alert } from '../../types';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

interface QuickAlertsTickerProps {
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
}

export const QuickAlertsTicker: React.FC<QuickAlertsTickerProps> = ({
  alerts,
  onAcknowledge,
}) => {
  const activeAlerts = alerts.filter((alert) => !alert.acknowledged);

  const visibleAlerts = alerts.slice(0, 4);

  return (
    <div className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg h-full flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">

          <Bell className="w-4 h-4 text-cyan-400 shrink-0" />

          <h3 className="font-mono font-bold text-sm text-slate-100">
            Recent Alerts
          </h3>

          {activeAlerts.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-600/90 text-white font-mono text-[10px] font-bold">
              {activeAlerts.length} Active
            </span>
          )}

        </div>

        <Link
          to="/alerts"
          className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors shrink-0"
        >
          Alert Center
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>


      {/* Alerts */}
      <div className="mt-3 space-y-2.5 flex-1">

        {visibleAlerts.length === 0 ? (
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center">
            <ShieldCheck className="w-9 h-9 text-emerald-400 mb-2 opacity-80" />

            <div className="text-xs font-mono font-bold text-slate-200">
              No Active Alerts
            </div>

            <p className="text-[10px] text-slate-500 font-sans mt-1 max-w-[220px]">
              Current measured parameters and derived risk indicators are
              within the configured prototype thresholds.
            </p>
          </div>
        ) : (
          visibleAlerts.map((alert) => {
            const isCritical = alert.severity === 'CRITICAL';
            const isWarning = alert.severity === 'WARNING';

            return (
              <div
                key={alert.id}
                className={clsx(
                  'p-3 rounded-lg border font-mono transition-all',
                  alert.acknowledged
                    ? 'bg-[#080d16] border-slate-800 opacity-60'
                    : isCritical
                    ? 'bg-rose-950/25 border-rose-700/50'
                    : isWarning
                    ? 'bg-amber-950/25 border-amber-700/50'
                    : 'bg-cyan-950/15 border-cyan-800/40'
                )}
              >

                <div className="flex items-start justify-between gap-2">

                  <div className="flex items-start gap-2 min-w-0">

                    <span
                      className={clsx(
                        'w-2 h-2 rounded-full shrink-0 mt-1',
                        isCritical
                          ? 'bg-rose-400 animate-pulse'
                          : isWarning
                          ? 'bg-amber-400'
                          : 'bg-cyan-400'
                      )}
                    />

                    <div className="min-w-0">
                      <div className="font-bold text-slate-100 text-[11px] truncate">
                        {alert.title}
                      </div>

                      <div className="text-[9px] text-slate-500 mt-0.5">
                        STG-PROTO-01
                      </div>
                    </div>

                  </div>


                  <span
                    className={clsx(
                      'text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 border',
                      alert.directOrModel === 'DIRECT SENSOR'
                        ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60'
                        : 'bg-teal-950/80 text-teal-300 border-teal-700/60'
                    )}
                  >
                    {alert.directOrModel === 'DIRECT SENSOR'
                      ? 'MEASURED'
                      : 'DERIVED'}
                  </span>

                </div>


                <p className="text-[10px] text-slate-300 font-sans mt-2 leading-relaxed">
                  {alert.message}
                </p>


                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80">

                  <span
                    className={clsx(
                      'text-[9px] font-mono uppercase',
                      isCritical
                        ? 'text-rose-300'
                        : isWarning
                        ? 'text-amber-300'
                        : 'text-slate-500'
                    )}
                  >
                    {alert.severity}
                  </span>


                  {!alert.acknowledged ? (
                    <button
                      onClick={() => onAcknowledge(alert.id)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-mono flex items-center gap-1 border border-slate-700 transition-colors"
                    >
                      <Check className="w-3 h-3 text-cyan-400" />
                      Ack
                    </button>
                  ) : (
                    <span className="text-[9px] text-slate-500 font-mono flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-400" />
                      Acknowledged
                    </span>
                  )}

                </div>

              </div>
            );
          })
        )}

      </div>


      {/* Footer */}
      <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between text-[9px] font-mono">

        <span className="text-slate-500">
          Alert source
        </span>

        <span className="text-slate-300">
          Sensor + Derived Risk
        </span>

      </div>

    </div>
  );
};