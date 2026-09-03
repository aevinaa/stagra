import React from 'react';
import { Thermometer, Droplet, Gauge, Activity, Battery, Wifi, Info } from 'lucide-react';
import { DirectSensorReading, SamplingNode } from '../../types';
import { DirectVsModelBadge } from '../common/DirectVsModelBadge';
import { MetricGauge } from '../common/MetricGauge';
import clsx from 'clsx';

interface DirectSensorPanelProps {
  reading: DirectSensorReading | null;
  node: SamplingNode | null;
}

export const DirectSensorPanel: React.FC<DirectSensorPanelProps> = ({ reading, node }) => {
  if (!reading || !node) {
    return (
      <div className="p-8 rounded-xl bg-[#0b121e] border border-cyan-800/40 animate-pulse text-center font-mono text-xs text-cyan-400">
        INITIALIZING DIRECT SENSOR TELEMETRY BUS...
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#0a101b] border border-cyan-500/30 p-5 shadow-lg relative overflow-hidden">
      {/* Subtle top indicator line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-600" />

      {/* Header section with DIRECT SENSOR DATA banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <DirectVsModelBadge type="MEASURED" variant="header-tag" subtext="Raw Physical ADC & Digital Sensors" />
          </div>
          <p className="text-xs text-slate-400 font-sans">
            Direct physical telemetry received from node <span className="font-mono text-cyan-300 font-semibold">{node.name}</span>
          </p>
        </div>

        {/* Hardware Status metadata */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#070c14] border border-slate-800">
            <Battery className="w-3.5 h-3.5 text-emerald-400" />
            <span>{reading.batteryVoltage.toFixed(2)}V ({node.batteryLevelPct}%)</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#070c14] border border-slate-800">
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
            <span>{reading.signalStrengthDbm} dBm</span>
          </div>
        </div>
      </div>

      {/* 3 Core Direct Physical Sensor Parameter Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
        
        {/* 1. TEMPERATURE SENSOR */}
        <div className="p-4 rounded-xl bg-[#0d1624] border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
                <Thermometer className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                  PHYSICAL SENSOR 01
                </span>
                <h4 className="font-mono font-bold text-sm text-slate-100">Temperature</h4>
              </div>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-700/60 font-mono text-[10px] text-cyan-300 font-semibold">
              DS18B20 1-Wire
            </span>
          </div>

          <div className="my-4">
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-3xl font-extrabold text-slate-100 tracking-tight">
                {reading.temperature.toFixed(1)}
              </span>
              <span className="text-sm font-semibold text-cyan-400">°C</span>
              <span className="text-xs text-slate-400 ml-2">
                ({((reading.temperature * 9) / 5 + 32).toFixed(1)}°F)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-sans mt-1">
              Water column thermal gradient. Warm water accelerates stagnation kinetics.
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/60">
            <MetricGauge
              value={reading.temperature}
              min={10}
              max={45}
              unit="°C"
              label="Thermal Tolerance"
              optimalRange={[18, 26]}
              warningThreshold={30}
              criticalThreshold={33}
              precision={1}
            />
          </div>
        </div>

        {/* 2. pH SENSOR */}
        <div className="p-4 rounded-xl bg-[#0d1624] border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-teal-950/60 border border-teal-800/60 text-teal-400">
                <Droplet className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                  PHYSICAL SENSOR 02
                </span>
                <h4 className="font-mono font-bold text-sm text-slate-100">pH Level</h4>
              </div>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-teal-950/80 border border-teal-700/60 font-mono text-[10px] text-teal-300 font-semibold">
              Analog E-201-C
            </span>
          </div>

          <div className="my-4">
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-3xl font-extrabold text-slate-100 tracking-tight">
                {reading.ph.toFixed(2)}
              </span>
              <span className="text-sm font-semibold text-teal-400">pH</span>
              <span
                className={clsx(
                  'text-xs font-mono font-semibold ml-2 px-1.5 py-0.5 rounded',
                  reading.ph >= 6.5 && reading.ph <= 8.5
                    ? 'bg-emerald-950/80 text-emerald-300'
                    : 'bg-amber-950/80 text-amber-300'
                )}
              >
                {reading.ph < 6.5 ? 'Acidic Drift' : reading.ph > 8.5 ? 'Alkaline Bloom' : 'Neutral Safe'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-sans mt-1">
              Hydrogen ion activity. Shifts indicate potential biological activity or environmental chemical drift.
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/60">
            <MetricGauge
              value={reading.ph}
              min={4.0}
              max={11.0}
              unit="pH"
              label="Hydrogen Ion Balance"
              optimalRange={[6.5, 8.5]}
              warningThreshold={8.6}
              criticalThreshold={9.5}
              precision={2}
            />
          </div>
        </div>
      </div>

      {/* Sensor exclusion banner - explicitly respecting instruction: DO & Turbidity are NOT live sensors */}
      <div className="mt-4 p-2.5 rounded-lg bg-[#070c14] border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Active Hardware Register: <strong className="text-slate-200"> ADC1_CH3 (pH), GPIO4 1-Wire (Temp)</strong>
          </span>
        </div>
        <div className="text-[11px] text-slate-400 hidden sm:block">
          DO & Turbidity reserved for Phase II Expansion
        </div>
      </div>
    </div>
  );
};
