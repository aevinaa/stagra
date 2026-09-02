import React, { useState } from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { DirectVsModelBadge } from '../components/common/DirectVsModelBadge';
import {
  Bell,
  AlertTriangle,
  Biohazard,
  ShieldCheck,
  CheckCheck,
  Filter,
  Check,
  Sliders,
  Info,
  Clock,
} from 'lucide-react';
import { formatDateTimeIST, formatTimeWithIST } from '../utils/dateUtils';
import clsx from 'clsx';

export const Alerts: React.FC = () => {
  const { alerts, acknowledgeAlert, acknowledgeAllAlerts, unreadAlertsCount } = useTelemetry();
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'MEASURED' | 'DERIVED' | 'PREDICTED'>('ALL');

  const filteredAlerts = alerts.filter((alert) => {
    if (severityFilter !== 'ALL' && alert.severity !== severityFilter) return false;
    if (sourceFilter !== 'ALL') {
      const cat = alert.category || (alert.directOrModel === 'DIRECT SENSOR' ? 'MEASURED' : 'DERIVED');
      if (cat !== sourceFilter) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[#0a101b] border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold font-mono text-slate-100">
              System Alerts &amp; Degradation Warnings
            </h2>
            {unreadAlertsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-600 font-mono text-xs text-white font-bold">
                {unreadAlertsCount} Unacknowledged
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Automated threshold triggers for measured sensor boundaries and model-estimated degradation risk.
          </p>
        </div>

        {unreadAlertsCount > 0 && (
          <button
            onClick={acknowledgeAllAlerts}
            className="px-3.5 py-1.5 rounded-lg bg-[#0d1624] hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs flex items-center gap-2 transition-colors"
          >
            <CheckCheck className="w-4 h-4 text-cyan-400" />
            <span>Acknowledge All</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-[#0d1624] border border-slate-800 font-mono text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 text-[11px] flex items-center gap-1">
            <Filter className="w-3 h-3 text-cyan-400" />
            Severity:
          </span>
          {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={clsx(
                'px-2.5 py-1 rounded transition-colors',
                severityFilter === sev
                  ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-600/50'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {sev}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 text-[11px]">Category:</span>
          {(['ALL', 'MEASURED', 'DERIVED', 'PREDICTED'] as const).map((src) => (
            <button
              key={src}
              onClick={() => setSourceFilter(src)}
              className={clsx(
                'px-2.5 py-1 rounded transition-colors',
                sourceFilter === src
                  ? src === 'MEASURED'
                    ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-600/50'
                    : src === 'DERIVED'
                    ? 'bg-teal-950/80 text-teal-300 font-bold border border-teal-600/50'
                    : 'bg-indigo-950/80 text-indigo-300 font-bold border border-indigo-600/50'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      {/* Alert Cards Stream */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="py-16 text-center rounded-xl bg-[#0a101b] border border-slate-800 space-y-2">
            <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto opacity-80" />
            <h3 className="font-mono font-bold text-slate-100 text-sm">No Active Alerts</h3>
            <p className="text-xs text-slate-400 font-sans max-w-sm mx-auto">
              All physical sensor readings and predictive neural models are within normal experimental bounds.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isCrit = alert.severity === 'CRITICAL';
            const isWarn = alert.severity === 'WARNING';

            return (
              <div
                key={alert.id}
                className={clsx(
                  'p-5 rounded-xl border font-mono transition-all space-y-3',
                  alert.acknowledged
                    ? 'bg-[#080d16] border-slate-800/80 opacity-70'
                    : isCrit
                    ? 'bg-rose-950/30 border-rose-600/60 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                    : isWarn
                    ? 'bg-amber-950/30 border-amber-600/60 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                    : 'bg-[#0a101b] border-slate-800'
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={clsx(
                        'w-3 h-3 rounded-full shrink-0',
                        isCrit ? 'bg-rose-500 animate-ping' : isWarn ? 'bg-amber-400' : 'bg-cyan-400'
                      )}
                    />
                    <div>
                      <h4 className="font-bold text-sm text-slate-100">{alert.title}</h4>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Station: <strong className="text-slate-200">{alert.nodeName}</strong> • {formatDateTimeIST(alert.timestamp)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <DirectVsModelBadge
                      type={alert.category || (alert.directOrModel as any)}
                      variant="minimal"
                    />
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded text-[10px] uppercase font-bold border',
                        isCrit
                          ? 'bg-rose-950/80 text-rose-300 border-rose-600/60'
                          : isWarn
                          ? 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      )}
                    >
                      {alert.severity}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {alert.message}
                </p>

                {/* Research Scientific Rationale Box */}
                <div className="p-3 rounded-lg bg-[#070c14] border border-slate-800/80 text-xs flex items-start gap-2">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-cyan-300 font-semibold font-mono text-[11px]">Scientific Impact: </span>
                    <span className="text-slate-300 font-sans text-xs">{alert.scientificImpact}</span>
                  </div>
                </div>

                {/* Footer values & ack button */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center gap-4 text-[11px] text-slate-400">
                    <span>
                      Threshold: <strong className="text-slate-200">{alert.thresholdValue}</strong>
                    </span>
                    <span>
                      Recorded Value: <strong className="text-rose-300">{alert.actualValue}</strong>
                    </span>
                  </div>

                  {!alert.acknowledged ? (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Check className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Acknowledge Alert</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Acknowledged {alert.acknowledgedAt ? `at ${formatTimeWithIST(alert.acknowledgedAt)}` : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Experimental Threshold Reference Table */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 space-y-3 font-mono text-xs">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-slate-100 text-sm">Experimental Threshold Calibration Matrix</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">
            <div className="text-cyan-400 font-bold">Temperature (°C)</div>
            <div className="text-slate-300 mt-1">Normal: 18 - 26°C</div>
            <div className="text-amber-400 text-[11px]">Warning: &gt; 30°C</div>
            <div className="text-rose-400 text-[11px]">Critical: &gt; 33.5°C</div>
          </div>

          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">
            <div className="text-teal-400 font-bold">pH Level</div>
            <div className="text-slate-300 mt-1">Normal: 6.50 - 8.50</div>
            <div className="text-amber-400 text-[11px]">Warning: &lt;6.5 or &gt;8.5</div>
            <div className="text-rose-400 text-[11px]">Critical: &lt;5.8 or &gt;9.2</div>
          </div>

          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">
            <div className="text-emerald-400 font-bold">Degradation Risk</div>
            <div className="text-slate-300 mt-1">Normal: 0 - 34</div>
            <div className="text-amber-400 text-[11px]">Warning: 55 - 74</div>
            <div className="text-rose-400 text-[11px]">Critical: &gt; 75 / 100</div>
          </div>
        </div>
      </section>

    </div>
  );
};
