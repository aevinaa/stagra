import React from 'react';
import { SamplingNode, DataSourceType } from '../../types';
import {
  Activity,
  ChevronRight,
  Cpu,
  Database,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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
    <div className="rounded-xl bg-[#090f1a] border border-slate-800 p-3.5 shadow-sm">

      <div className="flex flex-wrap items-center justify-between gap-3">

        {/* Left status group */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-mono">

          {/* Prototype */}
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />

            <span className="text-slate-500">
              NODE
            </span>

            <strong className="text-slate-200">
              {node?.code || 'STG-PROTO-01'}
            </strong>
          </div>


          {/* Sensor set */}
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-teal-400" />

            <span className="text-slate-500">
              SENSORS
            </span>

            <strong className="text-teal-300">
              TEMP / pH
            </strong>
          </div>


          {/* Data source */}
          <div className="flex items-center gap-1.5">
            <span
              className={clsx(
                'w-1.5 h-1.5 rounded-full',
                dataSourceMode === 'SIMULATED DATA'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              )}
            />

            <span className="text-slate-500">
              DATA
            </span>

            <strong
              className={
                dataSourceMode === 'SIMULATED DATA'
                  ? 'text-amber-300'
                  : 'text-emerald-300'
              }
            >
              {dataSourceMode}
            </strong>
          </div>


          {/* Stream */}
          <div className="flex items-center gap-1.5">
            <span
              className={clsx(
                'w-1.5 h-1.5 rounded-full',
                isLiveStreaming
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-slate-500'
              )}
            />

            <span className="text-slate-500">
              STREAM
            </span>

            <strong className="text-slate-200">
              {isLiveStreaming ? 'ACTIVE' : 'PAUSED'}
            </strong>
          </div>

        </div>


        {/* System link */}
        <Link
          to="/system"
          className="flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <Database className="w-3.5 h-3.5" />
          System Diagnostics
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>

      </div>

    </div>
  );
};