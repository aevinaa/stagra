import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { DirectSensorReading, ModelDerivedData } from '../../types';
import { DirectVsModelBadge } from '../common/DirectVsModelBadge';
import { Activity, Maximize2 } from 'lucide-react';
import { formatShortTimeIST } from '../../utils/dateUtils';
import clsx from 'clsx';

interface ActiveTelemetryStreamChartProps {
  readings: DirectSensorReading[];
  models: ModelDerivedData[];
}

export const ActiveTelemetryStreamChart: React.FC<ActiveTelemetryStreamChartProps> = ({
  readings,
  models,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<'temp' | 'ph' | 'tds' | 'risk'>('risk');

  // Format combined data for recharts using IST timestamps
  const chartData = readings.map((r, idx) => {
    const m = models[idx] || models[models.length - 1];
    const formattedTime = formatShortTimeIST(r.timestamp);

    return {
      time: formattedTime,
      timestamp: r.timestamp,
      temperature: r.temperature,
      ph: r.ph,
      tds: r.tds,
      riskScore: m?.riskScore || 0,
      confidence: m?.modelConfidence || 90,
    };
  });

  const getMetricConfig = () => {
    switch (selectedMetric) {
      case 'temp':
        return {
          title: 'Measured Temperature Stream',
          key: 'temperature',
          unit: '°C',
          stroke: '#06b6d4',
          fill: 'url(#tempGradient)',
          domain: ['dataMin - 1', 'dataMax + 1'],
          type: 'MEASURED' as const,
          refValue: 30.0,
          refLabel: 'Thermal Caution (30°C)',
        };
      case 'ph':
        return {
          title: 'Measured pH Level Stream',
          key: 'ph',
          unit: 'pH',
          stroke: '#14b8a6',
          fill: 'url(#phGradient)',
          domain: [5.0, 9.5],
          type: 'MEASURED' as const,
          refValue: 8.5,
          refLabel: 'Alkaline Bloom Bound (8.5 pH)',
        };
      case 'tds':
        return {
          title: 'Measured Total Dissolved Solids',
          key: 'tds',
          unit: 'ppm',
          stroke: '#38bdf8',
          fill: 'url(#tdsGradient)',
          domain: ['dataMin - 30', 'dataMax + 30'],
          type: 'MEASURED' as const,
          refValue: 550,
          refLabel: 'Stagnant Threshold (550 ppm)',
        };
      case 'risk':
      default:
        return {
          title: 'Derived Degradation Risk Score',
          key: 'riskScore',
          unit: '/ 100',
          stroke: '#10b981',
          fill: 'url(#riskGradient)',
          domain: [0, 100],
          type: 'DERIVED' as const,
          refValue: 70,
          refLabel: 'Critical Degradation Bound (70)',
        };
    }
  };

  const config = getMetricConfig();

  return (
    <div className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#0d1624] border border-slate-800 text-cyan-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono font-bold text-sm text-slate-100">{config.title}</h3>
              <DirectVsModelBadge type={config.type} variant="minimal" />
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              High-resolution time-series buffer ({readings.length} sampled data points)
            </p>
          </div>
        </div>

        {/* Metric Selector Tabs */}
        <div className="flex items-center rounded-lg bg-[#0d1624] p-1 border border-slate-800 gap-1 font-mono text-xs">
          <button
            onClick={() => setSelectedMetric('risk')}
            className={clsx(
              'px-2.5 py-1 rounded transition-colors',
              selectedMetric === 'risk'
                ? 'bg-teal-950/80 text-teal-300 font-bold border border-teal-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Risk Score (DERIVED)
          </button>
          <button
            onClick={() => setSelectedMetric('temp')}
            className={clsx(
              'px-2.5 py-1 rounded transition-colors',
              selectedMetric === 'temp'
                ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Temp (MEASURED)
          </button>
          <button
            onClick={() => setSelectedMetric('ph')}
            className={clsx(
              'px-2.5 py-1 rounded transition-colors',
              selectedMetric === 'ph'
                ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            pH (MEASURED)
          </button>
          <button
            onClick={() => setSelectedMetric('tds')}
            className={clsx(
              'px-2.5 py-1 rounded transition-colors',
              selectedMetric === 'tds'
                ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            TDS (MEASURED)
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full mt-4 font-mono text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="phGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="tdsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={{ stroke: '#334155' }}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={{ stroke: '#334155' }}
              domain={config.domain as any}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-[#0b1320] border border-slate-700 p-3 rounded-lg shadow-xl font-mono text-xs space-y-1">
                      <div className="text-slate-400 text-[10px]">{label} IST (Frame #{readings.indexOf(readings.find(r => r.timestamp === data.timestamp) || readings[0])})</div>
                      <div className="text-cyan-300 font-bold text-sm">
                        {payload[0].value} {config.unit}
                      </div>
                      <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                        Confidence: <span className="text-emerald-400">{data.confidence}%</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {config.refValue && (
              <ReferenceLine
                y={config.refValue}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                label={{
                  value: config.refLabel,
                  position: 'insideTopRight',
                  fill: '#f43f5e',
                  fontSize: 10,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey={config.key}
              stroke={config.stroke}
              strokeWidth={2}
              fillOpacity={1}
              fill={config.fill}
              isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.stroke }} />
          <span>Active Telemetry Track: <strong className="text-slate-200">{config.key.toUpperCase()}</strong></span>
        </span>
        <span className="text-slate-400">
          Continuous Ingestion Buffer
        </span>
      </div>
    </div>
  );
};
