import React from 'react';
import { Cpu, Server, Layers, ChevronRight, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataSourceType, SamplingNode } from '../../types';
import clsx from 'clsx';

interface CompactSystemHealthProps {
  node: SamplingNode | null;
  dataSourceMode: DataSourceType;
  isLiveStreaming: boolean;
}

export const CompactSystemHealth: React.FC<CompactSystemHealthProps> = ({
  node,
  dataSourceMode,
  isLiveStreaming,
}) => {
  return (
    <div className="p-3.5 rounded-xl bg-[#090f1a] border border-slate-800/90 text-xs font-mono shadow-sm flex flex-wrap items-center justify-between gap-3">
      {/* Left: System Status Chips */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
        
        {/* Hardware Station */}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-slate-400">Station:</span>
          <strong className="text-slate-100">1 Active Prototype Node</strong>
        </div>

        {/* Ingestion Mode */}
        <div className="flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Ingestion:</span>
          <span
            className={clsx(
              'px-1.5 py-0.2 rounded font-semibold text-[10px]',
              dataSourceMode === 'SIMULATED DATA'
                ? 'bg-amber-950/70 text-amber-300 border border-amber-700/50'
                : 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/50'
            )}
          >
            {dataSourceMode}
          </span>
        </div>

        {/* Sampling Frequency */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-teal-400" />
          <span className="text-slate-400">Sampling Tick:</span>
          <strong className="text-slate-200">5.0s REST / JSON</strong>
        </div>

        {/* Model Pipeline */}
        <div className="hidden md:flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-slate-400">Model:</span>
          <span className="text-slate-200">Proposed Transformer + GNN</span>
        </div>
      </div>

      {/* Right: Diagnostics Link */}
      <Link
        to="/system"
        className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-bold transition-colors ml-auto sm:ml-0"
      >
        <span>System Diagnostics</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
};
