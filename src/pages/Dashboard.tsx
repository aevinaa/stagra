import React from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { CurrentWaterConditionCard } from '../components/dashboard/CurrentWaterConditionCard';
import { DirectSensorCards } from '../components/dashboard/DirectSensorCards';
import { ActiveTelemetryStreamChart } from '../components/dashboard/ActiveTelemetryStreamChart';
import { DegradationForecastCard } from '../components/dashboard/DegradationForecastCard';
import { RecentAlertsCard } from '../components/dashboard/RecentAlertsCard';
import { CompactSystemHealth } from '../components/dashboard/CompactSystemHealth';
import { MapPin, RefreshCw, Play, Pause } from 'lucide-react';
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

  return (
    <div className="space-y-6 pb-12">
      
      {/* 1. DASHBOARD HEADER: Clean, focused station & streaming header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#090f1a] border border-slate-800 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold font-mono text-slate-100">
                {activeNode?.name || 'Prototype Station 01'}
              </h2>
              <span className="px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 font-mono text-[10px] font-semibold">
                {activeNode?.code || 'NODE-01'}
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-300 font-mono text-[10px]">
                {activeNode?.waterBodyType || 'Retention Pond'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Active physical telemetry ingestion and degradation risk tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="text-right hidden md:block">
            <div className="text-[10px] text-slate-400">TELEMETRY LAST UPDATED</div>
            <div className="text-slate-200 font-semibold text-[11px]">{formatTimeWithIST(lastUpdated)}</div>
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
            <button
              onClick={() => setIsLiveStreaming(!isLiveStreaming)}
              className={clsx(
                'flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] transition-colors',
                isLiveStreaming
                  ? 'bg-teal-950/70 text-teal-300 border-teal-700/60 hover:bg-teal-900/60'
                  : 'bg-amber-950/70 text-amber-300 border-amber-700/60 hover:bg-amber-900/60'
              )}
              title={isLiveStreaming ? 'Pause streaming' : 'Resume live stream'}
            >
              {isLiveStreaming ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 text-amber-400" />}
              <span>{isLiveStreaming ? 'Live' : 'Paused'}</span>
            </button>

            <button
              onClick={triggerManualSample}
              className="p-1 rounded-md bg-[#0d1624] border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 transition-colors"
              title="Force immediate telemetry poll"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. CURRENT WATER CONDITION & DEGRADATION RISK (Answers Questions 2 & 4) */}
      <section>
        <CurrentWaterConditionCard model={latestModel} node={activeNode} />
      </section>

      {/* 3. THREE DIRECT SENSOR CARDS: Temperature, pH, TDS (Answers Question 1) */}
      <section>
        <DirectSensorCards reading={latestReading} node={activeNode} />
      </section>

      {/* 4. MAIN ENVIRONMENTAL TREND CHART (Answers Question 3) */}
      <section>
        <ActiveTelemetryStreamChart readings={historicalReadings} models={historicalModels} />
      </section>

      {/* 5 & 6. SPLIT GRID: Degradation Forecast & Recent Alerts (Answers Questions 4 & 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <DegradationForecastCard model={latestModel} node={activeNode} />
        </div>
        <div className="lg:col-span-5">
          <RecentAlertsCard alerts={alerts} onAcknowledge={acknowledgeAlert} />
        </div>
      </div>

      {/* 7. COMPACT SYSTEM HEALTH */}
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
