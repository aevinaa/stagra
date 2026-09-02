import React from 'react';
import { Waves, Cpu, Database, BrainCircuit, Activity, ExternalLink, ShieldCheck } from 'lucide-react';
import { useTelemetry } from '../../context/TelemetryContext';

export const Footer: React.FC = () => {
  const { dataSourceMode, systemHealth } = useTelemetry();

  return (
    <footer className="bg-[#060910] border-t border-slate-800/80 mt-auto py-6 px-4 text-xs font-mono text-slate-400">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* End-to-end pipeline summary ribbon */}
        <div className="p-3.5 rounded-xl bg-[#090f1a] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-bold text-slate-200">RESEARCH PIPELINE ARCHITECTURE:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
            <span className="px-2 py-0.5 rounded bg-[#0f172a] border border-slate-700 text-cyan-300">
              Water Sample
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 rounded bg-[#0f172a] border border-cyan-800/60 text-cyan-300">
              Temp + pH + TDS Sensors
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 rounded bg-[#0f172a] border border-slate-700 text-slate-200">
              ESP32
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 rounded bg-[#0f172a] border border-slate-700 text-slate-200">
              Backend API
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 rounded bg-[#0f172a] border border-slate-700 text-slate-200">
              Historical DB
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 rounded bg-[#0f172a] border border-slate-700 text-slate-200">
              Preprocessing
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 rounded bg-[#0f172a] border border-teal-800/60 text-teal-300">
              Transformer (Temporal) + GNN (Spatial)
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 rounded bg-[#0f172a] border border-emerald-800/60 text-emerald-300">
              Prediction Layer
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500 text-cyan-200 font-bold">
              STAGRA Frontend
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-800/60 pt-4 text-[11px]">
          <div>
            <div className="font-bold text-slate-200 text-xs">
              STAGRA — Stagnant Water Assessment and Growth Risk Analysis
            </div>
            <p className="text-slate-400 mt-0.5">
              University Embedded Systems & Environmental IoT Research Group
            </p>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Direct Sensor Bus: <strong className="text-slate-300">Temp / pH / TDS</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Source Mode: <strong className="text-cyan-300">{dataSourceMode}</strong>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
