import React from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { CurrentWaterConditionCard } from '../components/dashboard/CurrentWaterConditionCard';
import { DirectSensorPanel } from '../components/dashboard/DirectSensorPanel';
import { ActiveTelemetryStreamChart } from '../components/dashboard/ActiveTelemetryStreamChart';
import { DegradationForecastCard } from '../components/dashboard/DegradationForecastCard';
import { QuickAlertsTicker } from '../components/dashboard/QuickAlertsTicker';
import { CompactSystemHealth } from '../components/dashboard/CompactSystemHealth';
import { MapPin, Radio, RefreshCw } from 'lucide-react';
import { formatTimeWithIST } from '../utils/dateUtils';
import clsx from 'clsx';

export const Dashboard: React.FC = () => {
  const {
    activeNode,
    latestReading,
    latestModel,
    historicalReadings,
    historicalModels,
    alerts,
    acknowledgeAlert,
    dataSourceMode,
    isLiveStreaming,
    setIsLiveStreaming,
    triggerManualSample,
    lastUpdated,
  } = useTelemetry();

  const nodeName = activeNode?.name || 'Prototype Node 01';
  const nodeCode = activeNode?.code || 'STG-PROTO-01';
  const waterBodyType =
    activeNode?.waterBodyType || 'Prototype Water Sampling Site';

  return (
    <div className="space-y-6 pb-12">

      {/* =========================================================
          DASHBOARD HEADER
          ========================================================= */}
      <section className="rounded-xl bg-[#090f1a] border border-slate-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">

          {/* Prototype identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-400 shrink-0">
              <MapPin className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold font-mono text-slate-100 truncate">
                  {nodeName}
                </h1>

                <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 font-mono text-[10px] font-semibold">
                  {nodeCode}
                </span>

                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono text-[10px]">
                  {waterBodyType}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 mt-0.5">
                Single physical prototype monitoring node · Temperature + pH
              </p>
            </div>
          </div>

          {/* Status / controls */}
          <div className="flex items-center gap-2 sm:gap-3">

            <div className="hidden md:block text-right font-mono">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">
                Last telemetry
              </div>
              <div className="text-[11px] text-slate-200 font-semibold">
                {formatTimeWithIST(lastUpdated)}
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#0d1522] border border-slate-700 font-mono text-[10px]">
              <span
                className={clsx(
                  'w-2 h-2 rounded-full',
                  isLiveStreaming
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-slate-500'
                )}
              />

              <span className="text-slate-300">
                {isLiveStreaming ? 'LIVE STREAM' : 'PAUSED'}
              </span>
            </div>

            <button
              onClick={() => setIsLiveStreaming(!isLiveStreaming)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[10px] transition-colors',
                isLiveStreaming
                  ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300 hover:bg-emerald-950/60'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              )}
            >
              <Radio className="w-3.5 h-3.5" />
              {isLiveStreaming ? 'Pause' : 'Resume'}
            </button>

            <button
              onClick={triggerManualSample}
              className="p-1.5 rounded-lg border border-slate-700 bg-[#0d1522] text-slate-400 hover:text-cyan-300 hover:border-cyan-700/60 transition-colors"
              title="Refresh telemetry"
              aria-label="Refresh telemetry"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

          </div>
        </div>

        {/* Data mode strip */}
        <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono">
          <span className="flex items-center gap-1.5">
            <span
              className={clsx(
                'w-1.5 h-1.5 rounded-full',
                dataSourceMode === 'SIMULATED DATA'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              )}
            />
            <span className="text-slate-500">DATA SOURCE</span>
            <strong
              className={
                dataSourceMode === 'SIMULATED DATA'
                  ? 'text-amber-300'
                  : 'text-emerald-300'
              }
            >
              {dataSourceMode}
            </strong>
          </span>

          <span className="text-slate-700">•</span>

          <span className="text-slate-500">
            ACTIVE SENSORS:{' '}
            <strong className="text-cyan-300">
              TEMPERATURE / pH
            </strong>
          </span>

          <span className="text-slate-700">•</span>

          <span className="text-slate-500">
            NODE STATUS:{' '}
            <strong className="text-emerald-300">
              PROTOTYPE
            </strong>
          </span>
        </div>
      </section>


      {/* =========================================================
          CURRENT WATER CONDITION
          ========================================================= */}
      <section>
        <CurrentWaterConditionCard
          model={latestModel}
          node={activeNode}
        />
      </section>


      {/* =========================================================
          DIRECT SENSOR TELEMETRY
          ========================================================= */}
      <section>
        <DirectSensorPanel
          reading={latestReading}
          node={activeNode}
        />
      </section>


      {/* =========================================================
          ENVIRONMENTAL TREND + ALERTS
          ========================================================= */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="xl:col-span-2">
          <ActiveTelemetryStreamChart
            readings={historicalReadings}
            models={historicalModels}
          />
        </div>

        <div>
          <QuickAlertsTicker
            alerts={alerts}
            onAcknowledge={acknowledgeAlert}
          />
        </div>

      </section>


      {/* =========================================================
          DEGRADATION FORECAST
          ========================================================= */}
      <section>
        <DegradationForecastCard
          model={latestModel}
          node={activeNode}
        />
      </section>


      {/* =========================================================
          COMPACT SYSTEM STATUS
          ========================================================= */}
      <section>
        <CompactSystemHealth
          node={activeNode}
          dataSourceMode={dataSourceMode}
          isLiveStreaming={isLiveStreaming}
        />
      </section>

    </div>
  );
};