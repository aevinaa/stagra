import React, { useState } from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { DirectVsModelBadge } from '../components/common/DirectVsModelBadge';
import {
  Bell,
  AlertTriangle,
  ShieldCheck,
  CheckCheck,
  Filter,
  Check,
  Sliders,
  Info,
} from 'lucide-react';
import { formatDateTimeIST, formatTimeWithIST } from '../utils/dateUtils';
import clsx from 'clsx';

type SeverityFilter = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO';
type CategoryFilter = 'ALL' | 'MEASURED' | 'DERIVED' | 'PREDICTED';

export const Alerts: React.FC = () => {
  const {
    alerts,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    unreadAlertsCount,
  } = useTelemetry();

  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>('ALL');

  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>('ALL');

  const filteredAlerts = alerts.filter((alert) => {
    if (
      severityFilter !== 'ALL' &&
      alert.severity !== severityFilter
    ) {
      return false;
    }

    if (categoryFilter !== 'ALL') {
      const category =
        alert.category ||
        (alert.directOrModel === 'DIRECT SENSOR'
          ? 'MEASURED'
          : alert.directOrModel === 'MODEL-DERIVED'
          ? 'PREDICTED'
          : 'DERIVED');

      if (category !== categoryFilter) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-6 pb-12">

      {/* =====================================================
          HEADER
          ===================================================== */}
      <section className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-xl bg-[#0a101b] border border-slate-800">

        <div>

          <div className="flex items-center gap-2 flex-wrap">

            <Bell className="w-5 h-5 text-cyan-400" />

            <h1 className="text-xl font-bold font-mono text-slate-100">
              Alerts &amp; Warnings
            </h1>

            {unreadAlertsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[10px] font-bold">
                {unreadAlertsCount} Unacknowledged
              </span>
            )}

          </div>

          <p className="text-xs text-slate-400 font-sans mt-1 max-w-2xl">
            Monitoring notifications generated from measured sensor
            thresholds, derived risk indicators, and simulated
            prediction outputs.
          </p>

        </div>


        {unreadAlertsCount > 0 && (
          <button
            onClick={acknowledgeAllAlerts}
            className="px-3.5 py-1.5 rounded-lg bg-[#0d1624] hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs flex items-center gap-2 transition-colors"
          >
            <CheckCheck className="w-4 h-4 text-cyan-400" />
            Acknowledge All
          </button>
        )}

      </section>


      {/* =====================================================
          FILTER BAR
          ===================================================== */}
      <section className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-[#0d1624] border border-slate-800 font-mono text-xs">

        <div className="flex items-center gap-2 flex-wrap">

          <span className="text-slate-400 text-[11px] flex items-center gap-1">
            <Filter className="w-3 h-3 text-cyan-400" />
            Severity:
          </span>

          {(
            ['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const
          ).map((severity) => (
            <button
              key={severity}
              onClick={() => setSeverityFilter(severity)}
              className={clsx(
                'px-2.5 py-1 rounded transition-colors',
                severityFilter === severity
                  ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-600/50'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {severity}
            </button>
          ))}

        </div>


        <div className="flex items-center gap-2 flex-wrap">

          <span className="text-slate-400 text-[11px]">
            Category:
          </span>

          {(
            ['ALL', 'MEASURED', 'DERIVED', 'PREDICTED'] as const
          ).map((category) => (
            <button
              key={category}
              onClick={() =>
                setCategoryFilter(category)
              }
              className={clsx(
                'px-2.5 py-1 rounded transition-colors',
                categoryFilter === category
                  ? category === 'MEASURED'
                    ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-600/50'
                    : category === 'DERIVED'
                    ? 'bg-teal-950/80 text-teal-300 font-bold border border-teal-600/50'
                    : category === 'PREDICTED'
                    ? 'bg-indigo-950/80 text-indigo-300 font-bold border border-indigo-600/50'
                    : 'bg-slate-800 text-slate-200 font-bold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {category}
            </button>
          ))}

        </div>

      </section>


      {/* =====================================================
          ALERT STREAM
          ===================================================== */}
      <section className="space-y-3">

        {filteredAlerts.length === 0 ? (
          <div className="py-16 text-center rounded-xl bg-[#0a101b] border border-slate-800">

            <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto opacity-80" />

            <h2 className="font-mono font-bold text-slate-100 text-sm mt-3">
              No Active Alerts
            </h2>

            <p className="text-xs text-slate-400 font-sans max-w-md mx-auto mt-1">
              No configured threshold violations or simulated
              prediction warnings are currently active.
            </p>

          </div>
        ) : (
          filteredAlerts.map((alert) => {

            const isCritical =
              alert.severity === 'CRITICAL';

            const isWarning =
              alert.severity === 'WARNING';

            const category =
              alert.category ||
              (alert.directOrModel === 'DIRECT SENSOR'
                ? 'MEASURED'
                : alert.directOrModel === 'MODEL-DERIVED'
                ? 'PREDICTED'
                : 'DERIVED');

            return (
              <article
                key={alert.id}
                className={clsx(
                  'p-5 rounded-xl border font-mono transition-all space-y-3',
                  alert.acknowledged
                    ? 'bg-[#080d16] border-slate-800/80 opacity-70'
                    : isCritical
                    ? 'bg-rose-950/20 border-rose-600/60 shadow-[0_0_15px_rgba(244,63,94,0.10)]'
                    : isWarning
                    ? 'bg-amber-950/20 border-amber-600/60 shadow-[0_0_15px_rgba(245,158,11,0.10)]'
                    : 'bg-[#0a101b] border-slate-800'
                )}
              >

                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">

                  <div className="flex items-start gap-2.5">

                    <span
                      className={clsx(
                        'w-3 h-3 rounded-full shrink-0 mt-1',
                        isCritical
                          ? 'bg-rose-500'
                          : isWarning
                          ? 'bg-amber-400'
                          : 'bg-cyan-400'
                      )}
                    />

                    <div>

                      <h3 className="font-bold text-sm text-slate-100">
                        {alert.title}
                      </h3>

                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Node:{' '}
                        <strong className="text-slate-200">
                          {alert.nodeName}
                        </strong>{' '}
                        • {formatDateTimeIST(alert.timestamp)}
                      </div>

                    </div>

                  </div>


                  <div className="flex items-center gap-2">

                    <DirectVsModelBadge
                      type={category}
                      variant="minimal"
                    />

                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded text-[10px] uppercase font-bold border',
                        isCritical
                          ? 'bg-rose-950/80 text-rose-300 border-rose-600/60'
                          : isWarning
                          ? 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      )}
                    >
                      {alert.severity}
                    </span>

                  </div>

                </div>


                {/* Description */}
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {alert.message}
                </p>


                {/* Interpretation */}
                <div className="p-3 rounded-lg bg-[#070c14] border border-slate-800/80 flex items-start gap-2">

                  <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />

                  <div>

                    <span className="text-cyan-300 font-semibold font-mono text-[10px]">
                      INTERPRETATION:{' '}
                    </span>

                    <span className="text-slate-400 font-sans text-[11px]">
                      {alert.scientificImpact}
                    </span>

                  </div>

                </div>


                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">

                  <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400">

                    <span>
                      Threshold:{' '}
                      <strong className="text-slate-200">
                        {alert.thresholdValue}
                      </strong>
                    </span>

                    <span>
                      Recorded:{' '}
                      <strong
                        className={
                          isCritical
                            ? 'text-rose-300'
                            : isWarning
                            ? 'text-amber-300'
                            : 'text-slate-200'
                        }
                      >
                        {alert.actualValue}
                      </strong>
                    </span>

                  </div>


                  {!alert.acknowledged ? (
                    <button
                      onClick={() =>
                        acknowledgeAlert(alert.id)
                      }
                      className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Check className="w-3.5 h-3.5 text-cyan-400" />
                      Acknowledge
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Acknowledged
                      {alert.acknowledgedAt
                        ? ` at ${formatTimeWithIST(
                            alert.acknowledgedAt
                          )}`
                        : ''}
                    </span>
                  )}

                </div>

              </article>
            );
          })
        )}

      </section>


      {/* =====================================================
          PROTOTYPE THRESHOLDS
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 space-y-4">

        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">

          <Sliders className="w-4 h-4 text-cyan-400" />

          <div>
            <h2 className="font-bold text-slate-100 text-sm font-mono">
              Prototype Threshold Reference
            </h2>

            <p className="text-[10px] text-slate-500 font-sans mt-0.5">
              Current interface thresholds for experimental monitoring.
              These are prototype settings, not regulatory limits.
            </p>
          </div>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">

          {/* Temperature */}
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">

            <div className="text-cyan-400 font-bold">
              Temperature (°C)
            </div>

            <div className="text-slate-300 mt-1">
              Reference: 18 – 26°C
            </div>

            <div className="text-amber-400 text-[11px]">
              Warning: &gt; 30°C
            </div>

            <div className="text-rose-400 text-[11px]">
              Critical: &gt; 33.5°C
            </div>

          </div>


          {/* pH */}
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">

            <div className="text-teal-400 font-bold">
              pH Level
            </div>

            <div className="text-slate-300 mt-1">
              Reference: 6.50 – 8.50
            </div>

            <div className="text-amber-400 text-[11px]">
              Warning: &lt;6.5 or &gt;8.5
            </div>

            <div className="text-rose-400 text-[11px]">
              Critical: &lt;5.8 or &gt;9.2
            </div>

          </div>


          {/* Risk */}
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">

            <div className="text-emerald-400 font-bold">
              Degradation Risk
            </div>

            <div className="text-slate-300 mt-1">
              Reference: 0 – 34
            </div>

            <div className="text-amber-400 text-[11px]">
              Elevated: 55 – 74
            </div>

            <div className="text-rose-400 text-[11px]">
              Critical: ≥75 / 100
            </div>

          </div>

        </div>

      </section>

    </div>
  );
};