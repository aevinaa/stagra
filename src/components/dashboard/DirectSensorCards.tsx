import React from 'react';
import { Thermometer, Droplet, Gauge } from 'lucide-react';
import { DirectSensorReading, SamplingNode } from '../../types';
import { DirectVsModelBadge } from '../common/DirectVsModelBadge';
import { MetricGauge } from '../common/MetricGauge';
import clsx from 'clsx';

interface DirectSensorCardsProps {
  reading: DirectSensorReading | null;
  node: SamplingNode | null;
}

export const DirectSensorCards: React.FC<DirectSensorCardsProps> = ({ reading, node }) => {
  if (!reading || !node) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-44 rounded-xl bg-[#0a101b] border border-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-300">
            MEASURED SENSOR TELEMETRY (PHYSICAL HARDWARE)
          </span>
        </div>
        <DirectVsModelBadge type="MEASURED" variant="minimal" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* 1. TEMPERATURE SENSOR */}
        <div className="p-4 rounded-xl bg-[#0a101b] border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
                  <Thermometer className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                    SENSOR 01
                  </span>
                  <h4 className="font-mono font-bold text-sm text-slate-100">Temperature</h4>
                </div>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-700/60 font-mono text-[10px] text-cyan-300 font-semibold">
                DS18B20
              </span>
            </div>

            <div className="my-3">
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-3xl font-extrabold text-slate-100 tracking-tight">
                  {reading.temperature.toFixed(1)}
                </span>
                <span className="text-sm font-semibold text-cyan-400">°C</span>
                <span className="text-xs text-slate-400 ml-1.5">
                  ({((reading.temperature * 9) / 5 + 32).toFixed(1)}°F)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5 leading-snug">
                Thermal kinetic driver. Warm water elevates environmental growth suitability and stagnation tendency.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <MetricGauge
              value={reading.temperature}
              min={10}
              max={45}
              unit="°C"
              label="Thermal Range"
              optimalRange={[18, 26]}
              warningThreshold={30}
              criticalThreshold={33}
              precision={1}
            />
          </div>
        </div>

        {/* 2. pH SENSOR */}
        <div className="p-4 rounded-xl bg-[#0a101b] border border-slate-800 hover:border-teal-500/40 transition-all flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-teal-950/60 border border-teal-800/60 text-teal-400">
                  <Droplet className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                    SENSOR 02
                  </span>
                  <h4 className="font-mono font-bold text-sm text-slate-100">pH Level</h4>
                </div>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-teal-950/80 border border-teal-700/60 font-mono text-[10px] text-teal-300 font-semibold">
                E-201-C
              </span>
            </div>

            <div className="my-3">
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-3xl font-extrabold text-slate-100 tracking-tight">
                  {reading.ph.toFixed(2)}
                </span>
                <span className="text-sm font-semibold text-teal-400">pH</span>
                <span className="text-xs text-slate-400 ml-1.5">
                  {reading.ph < 6.5 ? '(Acidic)' : reading.ph > 8.5 ? '(Alkaline)' : '(Neutral)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5 leading-snug">
                Chemical balance index. Shifts capture organic acidification or algal blooms.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <MetricGauge
              value={reading.ph}
              min={4}
              max={11}
              unit="pH"
              label="Acidity Balance"
              optimalRange={[6.5, 8.5]}
              warningThreshold={8.8}
              criticalThreshold={9.2}
              precision={2}
            />
          </div>
        </div>

        {/* 3. TDS SENSOR */}
        <div className="p-4 rounded-xl bg-[#0a101b] border border-slate-800 hover:border-sky-500/40 transition-all flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-400">
                  <Gauge className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                    SENSOR 03
                  </span>
                  <h4 className="font-mono font-bold text-sm text-slate-100">Total Dissolved Solids</h4>
                </div>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-700/60 font-mono text-[10px] text-sky-300 font-semibold">
                Analog TDS
              </span>
            </div>

            <div className="my-3">
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-3xl font-extrabold text-slate-100 tracking-tight">
                  {Math.round(reading.tds)}
                </span>
                <span className="text-sm font-semibold text-sky-400">ppm</span>
                <span className="text-xs text-slate-400 ml-1.5">
                  ({(reading.tds * 1.56).toFixed(0)} µS/cm)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5 leading-snug">
                Ionic concentration. Captures evaporative mineral density & organic decay solids.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <MetricGauge
              value={reading.tds}
              min={50}
              max={1000}
              unit="ppm"
              label="Ionic Load"
              optimalRange={[100, 450]}
              warningThreshold={550}
              criticalThreshold={750}
              precision={0}
            />
          </div>
        </div>

      </div>
    </div>
  );
};
