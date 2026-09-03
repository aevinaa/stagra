import React, { useMemo, useState } from 'react';
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
import {
  DirectSensorReading,
  ModelDerivedData,
} from '../../types';
import { DirectVsModelBadge } from '../common/DirectVsModelBadge';
import {
  Activity,
  Thermometer,
  Droplet,
  TrendingUp,
} from 'lucide-react';
import { formatShortTimeIST } from '../../utils/dateUtils';
import clsx from 'clsx';

interface ActiveTelemetryStreamChartProps {
  readings: DirectSensorReading[];
  models: ModelDerivedData[];
}

type Metric = 'risk' | 'temp' | 'ph';

export const ActiveTelemetryStreamChart: React.FC<
  ActiveTelemetryStreamChartProps
> = ({ readings, models }) => {
  const [selectedMetric, setSelectedMetric] =
    useState<Metric>('risk');

  const chartData = useMemo(() => {
    return readings.map((reading, index) => {
      const model =
        models[index] || models[models.length - 1];

      return {
        time: formatShortTimeIST(reading.timestamp),
        timestamp: reading.timestamp,
        temperature: reading.temperature,
        ph: reading.ph,
        riskScore: model?.riskScore ?? 0,
        confidence: model?.modelConfidence ?? null,
      };
    });
  }, [readings, models]);

  const metricConfig = useMemo(() => {
    switch (selectedMetric) {
      case 'temp':
        return {
          title: 'Temperature Trend',
          subtitle:
            'Measured water temperature across the active sampling window.',
          key: 'temperature' as const,
          unit: '°C',
          badge: 'MEASURED' as const,
          stroke: '#06b6d4',
          fill: 'url(#temperatureGradient)',
          domain: ['dataMin - 1', 'dataMax + 1'],
          referenceValue: 30,
          referenceLabel: 'Caution: 30°C',
          icon: Thermometer,
        };

      case 'ph':
        return {
          title: 'pH Trend',
          subtitle:
            'Measured pH variation across the active sampling window.',
          key: 'ph' as const,
          unit: 'pH',
          badge: 'MEASURED' as const,
          stroke: '#14b8a6',
          fill: 'url(#phGradient)',
          domain: [5, 9.5],
          referenceValue: 8.5,
          referenceLabel: 'Upper reference: 8.5 pH',
          icon: Droplet,
        };

      case 'risk':
      default:
        return {
          title: 'Degradation Risk Trend',
          subtitle:
            'Derived risk index calculated from measured temperature and pH behaviour.',
          key: 'riskScore' as const,
          unit: '/ 100',
          badge: 'DERIVED' as const,
          stroke: '#10b981',
          fill: 'url(#riskGradient)',
          domain: [0, 100],
          referenceValue: 70,
          referenceLabel: 'Critical reference: 70',
          icon: TrendingUp,
        };
    }
  }, [selectedMetric]);

  const Icon = metricConfig.icon;

  const activeIndex =
    chartData.length > 0 ? chartData.length - 1 : -1;

  const latestValue =
    activeIndex >= 0
      ? chartData[activeIndex][metricConfig.key]
      : null;

  return (
    <div className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg">

      {/* =====================================================
          HEADER
          ===================================================== */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pb-4 border-b border-slate-800">

        <div className="flex items-start gap-3">

          <div className="p-2.5 rounded-lg bg-[#0d1624] border border-slate-800 text-cyan-400 shrink-0">
            <Activity className="w-5 h-5" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">

              <div className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-cyan-400" />

                <h3 className="font-mono font-bold text-sm text-slate-100">
                  {metricConfig.title}
                </h3>
              </div>

              <DirectVsModelBadge
                type={metricConfig.badge}
                variant="minimal"
              />
            </div>

            <p className="text-[11px] text-slate-400 font-sans mt-1 max-w-xl">
              {metricConfig.subtitle}
            </p>
          </div>

        </div>


        {/* =================================================
            METRIC SELECTOR
            ================================================= */}
        <div className="flex items-center rounded-lg bg-[#0d1624] p-1 border border-slate-800 gap-1 font-mono text-[10px]">

          <button
            onClick={() => setSelectedMetric('risk')}
            className={clsx(
              'px-2.5 py-1.5 rounded transition-colors',
              selectedMetric === 'risk'
                ? 'bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-700/60'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Risk
          </button>

          <button
            onClick={() => setSelectedMetric('temp')}
            className={clsx(
              'px-2.5 py-1.5 rounded transition-colors',
              selectedMetric === 'temp'
                ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-700/60'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Temperature
          </button>

          <button
            onClick={() => setSelectedMetric('ph')}
            className={clsx(
              'px-2.5 py-1.5 rounded transition-colors',
              selectedMetric === 'ph'
                ? 'bg-teal-950/80 text-teal-300 font-bold border border-teal-700/60'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            pH
          </button>

        </div>

      </div>


      {/* =====================================================
          CURRENT VALUE
          ===================================================== */}
      <div className="flex items-center justify-between gap-4 mt-4">

        <div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
            Current Value
          </div>

          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className="text-xl font-extrabold font-mono"
              style={{ color: metricConfig.stroke }}
            >
              {latestValue ?? '--'}
            </span>

            <span className="text-[10px] text-slate-500 font-mono">
              {metricConfig.unit}
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
            Samples
          </div>

          <div className="text-sm font-mono font-bold text-slate-200">
            {readings.length}
          </div>
        </div>

      </div>


      {/* =====================================================
          CHART
          ===================================================== */}
      <div className="h-64 w-full mt-3 font-mono text-xs">

        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-slate-500">
            No telemetry available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{
                top: 12,
                right: 18,
                left: -12,
                bottom: 0,
              }}
            >

              <defs>

                <linearGradient
                  id="riskGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="#10b981"
                    stopOpacity={0.32}
                  />
                  <stop
                    offset="95%"
                    stopColor="#10b981"
                    stopOpacity={0}
                  />
                </linearGradient>


                <linearGradient
                  id="temperatureGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="#06b6d4"
                    stopOpacity={0.30}
                  />
                  <stop
                    offset="95%"
                    stopColor="#06b6d4"
                    stopOpacity={0}
                  />
                </linearGradient>


                <linearGradient
                  id="phGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="#14b8a6"
                    stopOpacity={0.30}
                  />
                  <stop
                    offset="95%"
                    stopColor="#14b8a6"
                    stopOpacity={0}
                  />
                </linearGradient>

              </defs>


              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                vertical={false}
              />


              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{
                  fontSize: 9,
                  fill: '#94a3b8',
                }}
                tickLine={{
                  stroke: '#334155',
                }}
                minTickGap={28}
              />


              <YAxis
                stroke="#64748b"
                tick={{
                  fontSize: 9,
                  fill: '#94a3b8',
                }}
                tickLine={{
                  stroke: '#334155',
                }}
                domain={metricConfig.domain as any}
              />


              <Tooltip
                cursor={{
                  stroke: '#475569',
                  strokeDasharray: '3 3',
                }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) {
                    return null;
                  }

                  const data = payload[0].payload;

                  return (
                    <div className="bg-[#0b1320] border border-slate-700 p-3 rounded-lg shadow-xl font-mono text-xs min-w-[190px]">

                      <div className="text-[9px] text-slate-500 uppercase tracking-wider">
                        Timestamp
                      </div>

                      <div className="text-[10px] text-slate-300 mt-0.5">
                        {formatShortTimeIST(data.timestamp)} IST
                      </div>

                      <div className="mt-2 text-[9px] text-slate-500 uppercase tracking-wider">
                        {metricConfig.title}
                      </div>

                      <div
                        className="text-lg font-bold mt-0.5"
                        style={{
                          color: metricConfig.stroke,
                        }}
                      >
                        {data[metricConfig.key]}{' '}
                        <span className="text-[10px] text-slate-500">
                          {metricConfig.unit}
                        </span>
                      </div>

                      {data.confidence !== null && (
                        <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                          Simulated confidence:{' '}
                          <strong className="text-emerald-300">
                            {data.confidence}%
                          </strong>
                        </div>
                      )}

                    </div>
                  );
                }}
              />


              <ReferenceLine
                y={metricConfig.referenceValue}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{
                  value: metricConfig.referenceLabel,
                  position: 'insideTopRight',
                  fill: '#64748b',
                  fontSize: 9,
                }}
              />


              <Area
                type="monotone"
                dataKey={metricConfig.key}
                stroke={metricConfig.stroke}
                strokeWidth={2}
                fillOpacity={1}
                fill={metricConfig.fill}
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  fill: '#0a101b',
                }}
                isAnimationActive={true}
              />

            </AreaChart>
          </ResponsiveContainer>
        )}

      </div>


      {/* =====================================================
          FOOTER
          ===================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono mt-2 pt-3 border-t border-slate-800/80">

        <span className="flex items-center gap-1.5 text-slate-400">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: metricConfig.stroke,
            }}
          />

          Active Track:{' '}
          <strong className="text-slate-200">
            {metricConfig.title}
          </strong>
        </span>

        <span className="text-slate-500">
          {readings.length} samples · IST
        </span>

      </div>

    </div>
  );
};