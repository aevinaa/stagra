import React, { useState, useId } from 'react';
import { HistoricalReading } from '../../types';
import { ChartTooltip } from '../ui/ChartTooltip';

interface RecentTrendChartProps {
  data: HistoricalReading[];
  className?: string;
}

export function RecentTrendChart({ data, className = '' }: RecentTrendChartProps) {
  const [activeMetric, setActiveMetric] = useState<'mq135' | 'temperature' | 'humidity'>('mq135');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const chartId = useId();

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs font-mono text-[#8A98A8]">
        Awaiting sensor time-series data...
      </div>
    );
  }

  // Downsample to at most 48 points for clean rendering if dataset is large
  const displayPoints = data.length > 48
    ? data.filter((_, idx) => idx % Math.ceil(data.length / 48) === 0)
    : data;

  const values = displayPoints.map((d) => {
    if (activeMetric === 'mq135') return d.mq135;
    if (activeMetric === 'temperature') return d.temperature;
    return d.humidity;
  });

  const minVal = Math.floor(Math.min(...values) * 0.95);
  const maxVal = Math.ceil(Math.max(...values) * 1.05);
  const valRange = maxVal - minVal || 1;

  // SVG dimensions & padding
  const width = 800;
  const height = 240;
  const padding = { top: 20, right: 24, bottom: 32, left: 48 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = displayPoints.map((d, i) => {
    const val = activeMetric === 'mq135' ? d.mq135 : activeMetric === 'temperature' ? d.temperature : d.humidity;
    const x =
      displayPoints.length > 1
        ? padding.left + (i / (displayPoints.length - 1)) * chartW
        : padding.left + chartW / 2;
    const y = padding.top + chartH - ((val - minVal) / valRange) * chartH;
    return { x, y, val, item: d };
  });

  const pathD = points.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, '');

  // Format time for ticks
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  const formatFullTimestamp = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return isoString;
    }
  };

  // Color config according to updated system tokens
  const metricConfig = {
    mq135: {
      color: '#C47A13', // Moderate / amber accent for MQ135
      unit: 'raw units',
      label: 'MQ135 Gas Sensor (raw)',
    },
    temperature: {
      color: '#176B87', // Primary Accent
      unit: '°C',
      label: 'Temperature',
    },
    humidity: {
      color: '#167C80', // Teal / Environmental Accent
      unit: '% RH',
      label: 'Relative Humidity',
    },
  }[activeMetric];

  // Full-canvas pointer tracking for smooth, responsive hover
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i].x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setHoveredIndex(closestIdx);
  };

  const handlePointerLeave = () => {
    setHoveredIndex(null);
  };

  const activePoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Metric Selector Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 bg-[#E8F0F2] rounded-[8px] border border-[#D5E0E4]">
          <button
            onClick={() => setActiveMetric('mq135')}
            className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-colors cursor-pointer ${
              activeMetric === 'mq135'
                ? 'bg-[#FAFCFC] text-[#C47A13] shadow-subtle font-semibold border border-[#D5E0E4]'
                : 'text-[#607780] hover:text-[#19323C]'
            }`}
          >
            MQ135
          </button>
          <button
            onClick={() => setActiveMetric('temperature')}
            className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-colors cursor-pointer ${
              activeMetric === 'temperature'
                ? 'bg-[#FAFCFC] text-[#176B87] shadow-subtle font-semibold border border-[#D5E0E4]'
                : 'text-[#607780] hover:text-[#19323C]'
            }`}
          >
            Temperature
          </button>
          <button
            onClick={() => setActiveMetric('humidity')}
            className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-colors cursor-pointer ${
              activeMetric === 'humidity'
                ? 'bg-[#FAFCFC] text-[#167C80] shadow-subtle font-semibold border border-[#D5E0E4]'
                : 'text-[#607780] hover:text-[#19323C]'
            }`}
          >
            Humidity
          </button>
        </div>

        {/* Current Active Reading badge */}
        <div className="text-xs font-mono text-[#607780]">
          Latest:{' '}
          <span className="font-semibold text-[#19323C]">
            {points[points.length - 1]?.val.toFixed(1)} {metricConfig.unit}
          </span>
        </div>
      </div>

      {/* SVG Chart Surface */}
      <div className="relative w-full overflow-hidden bg-[#FAFCFC] rounded-[8px] border border-[#D5E0E4] p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-48 sm:h-56 block overflow-visible select-none cursor-crosshair touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <defs>
            <linearGradient id={`gradient-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metricConfig.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={metricConfig.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines (Subtle grid) */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const y = padding.top + chartH * pct;
            const val = Math.round(maxVal - pct * valRange);
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#D5E0E4"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-[#8A98A8] font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          {points.length > 0 && (
            <path
              d={`${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`}
              fill={`url(#gradient-${chartId})`}
            />
          )}

          {/* Telemetry line */}
          <path
            d={pathD}
            fill="none"
            stroke={metricConfig.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Time axis labels */}
          {points.filter((_, idx) => idx % Math.ceil(points.length / 6) === 0).map((p, idx) => (
            <text
              key={idx}
              x={p.x}
              y={height - 10}
              textAnchor="middle"
              className="text-[10px] fill-[#8A98A8] font-mono"
            >
              {formatTime(p.item.timestamp)}
            </text>
          ))}

          {/* Data point markers */}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === idx ? 4.5 : 2}
              fill={hoveredIndex === idx ? metricConfig.color : '#FAFCFC'}
              stroke={metricConfig.color}
              strokeWidth="1.5"
              className="transition-all"
            />
          ))}

          {/* Active Hover Crosshair Line & Halo */}
          {activePoint && (
            <g pointerEvents="none">
              <line
                x1={activePoint.x}
                y1={padding.top}
                x2={activePoint.x}
                y2={padding.top + chartH}
                stroke="#607780"
                strokeDasharray="2 2"
                strokeWidth="1.2"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={8}
                fill={metricConfig.color}
                opacity="0.25"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={4.5}
                fill={metricConfig.color}
                stroke="#FAFCFC"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Transparent interactive overlay layer spanning chart area */}
          <rect
            x={padding.left}
            y={padding.top}
            width={chartW}
            height={chartH}
            fill="transparent"
            className="cursor-crosshair"
          />
        </svg>

        {/* Hover Precision Tooltip using unified ChartTooltip */}
        {activePoint && (
          <ChartTooltip
            x={(activePoint.x / width) * 100}
            y={(activePoint.y / height) * 100}
            isPercentagePosition={true}
            title={formatFullTimestamp(activePoint.item.timestamp)}
            subtitle="Observed Telemetry"
            seriesType="observed"
            items={[
              {
                label: metricConfig.label,
                value: activePoint.val.toFixed(1),
                unit: metricConfig.unit,
                color: metricConfig.color,
              },
              ...(activeMetric !== 'temperature'
                ? [
                    {
                      label: 'Temperature',
                      value: activePoint.item.temperature.toFixed(1),
                      unit: '°C',
                      color: '#176B87',
                    },
                  ]
                : []),
              ...(activeMetric !== 'humidity'
                ? [
                    {
                      label: 'Humidity',
                      value: activePoint.item.humidity.toFixed(1),
                      unit: '% RH',
                      color: '#167C80',
                    },
                  ]
                : []),
              ...(activeMetric !== 'mq135'
                ? [
                    {
                      label: 'MQ135 Gas',
                      value: Math.round(activePoint.item.mq135),
                      unit: 'raw units',
                      color: '#C47A13',
                    },
                  ]
                : []),
            ]}
            footer="Concurrent readings at this telemetry packet"
          />
        )}
      </div>
    </div>
  );
}