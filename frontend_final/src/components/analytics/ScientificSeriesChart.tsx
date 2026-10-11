import React, { useState, useId } from 'react';
import { HistoricalReading } from '../../types';
import { ChartTooltip } from '../ui/ChartTooltip';

interface ScientificSeriesChartProps {
  title: string;
  sensorLabel?: string;
  metricKey: 'temperature' | 'humidity' | 'mq135';
  unit: string;
  strokeColor: string; // #176B87 (temp), #167C80 (humidity), #C47A13 (mq135)
  data: HistoricalReading[];
  showClassificationBands?: boolean;
  className?: string;
  height?: number;
}

export function ScientificSeriesChart({
  title,
  sensorLabel,
  metricKey,
  unit,
  strokeColor,
  data,
  showClassificationBands = false,
  className = '',
  height = 220,
}: ScientificSeriesChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartId = useId();

  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs font-mono text-[#8A98A8] border border-[#D5E0E4] rounded-[10px] bg-[#FAFCFC]">
        No telemetry records available for this time window.
      </div>
    );
  }

  // Extract numerical series
  const rawValues = data.map((d) => d[metricKey]);
  const minObserved = Math.min(...rawValues);
  const maxObserved = Math.max(...rawValues);

  // Compute Summary Statistics
  const sum = rawValues.reduce((a, b) => a + b, 0);
  const avg = Number((sum / rawValues.length).toFixed(1));
  const min = Number(minObserved.toFixed(1));
  const max = Number(maxObserved.toFixed(1));
  const latest = Number(rawValues[rawValues.length - 1].toFixed(1));

  // Determine scale range with comfortable scientific padding
  let minVal = Math.floor(minObserved * 0.98);
  let maxVal = Math.ceil(maxObserved * 1.02);

  // If showing MQ135 classification bands (250 and 350), extend scale so thresholds are clearly visible if data is near
  if (showClassificationBands) {
    minVal = Math.min(minVal, 150);
    maxVal = Math.max(maxVal, 380);
  }

  // Prevent zero divide
  const valRange = maxVal - minVal || 1;

  // Chart dimensions
  const width = 840;
  const padding = { top: 22, right: 30, bottom: 32, left: 54 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Compute coordinate points
  const points = data.map((d, i) => {
    const val = d[metricKey];
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + chartH - ((val - minVal) / valRange) * chartH;
    return { x, y, val, reading: d };
  });

  // SVG Polyline / Path generator
  const pathD = points.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, '');

  // Calculate threshold Y positions if requested
  const yLowThreshold =
    showClassificationBands && 250 >= minVal && 250 <= maxVal
      ? padding.top + chartH - ((250 - minVal) / valRange) * chartH
      : null;

  const yHighThreshold =
    showClassificationBands && 350 >= minVal && 350 <= maxVal
      ? padding.top + chartH - ((350 - minVal) / valRange) * chartH
      : null;

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  const formatFullTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return iso;
    }
  };

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
    setHoveredIdx(closestIdx);
  };

  const handlePointerLeave = () => {
    setHoveredIdx(null);
  };

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className={`bg-[#FAFCFC] border border-[#D5E0E4] rounded-[10px] p-4 sm:p-5 shadow-subtle ${className}`}>
      {/* 1. Header & Summary Statistics */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-[#D5E0E4]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="type-card-heading text-[#19323C]">{title}</h3>
            {sensorLabel && (
              <span className="text-[10px] font-mono text-[#8A98A8] bg-[#E8F0F2] px-2 py-0.5 rounded border border-[#D5E0E4]">
                {sensorLabel}
              </span>
            )}
          </div>
          <p className="type-metadata text-[#607780] mt-0.5">
            Unit: <span className="font-mono text-[#19323C] font-medium">{unit}</span> · Samples: {data.length}
          </p>
        </div>

        {/* Statistical Summary Box (Average, Minimum, Maximum) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="px-2.5 py-1.5 rounded-[6px] bg-[#E8F0F2] border border-[#D5E0E4] text-center">
            <span className="text-[10px] text-[#8A98A8] block uppercase tracking-wider">Average</span>
            <span className="font-semibold text-[#19323C] tabular-nums">
              {avg} <span className="text-[10px] font-normal text-[#607780]">{unit}</span>
            </span>
          </div>
          <div className="px-2.5 py-1.5 rounded-[6px] bg-[#E8F0F2] border border-[#D5E0E4] text-center">
            <span className="text-[10px] text-[#8A98A8] block uppercase tracking-wider">Minimum</span>
            <span className="font-semibold text-[#19323C] tabular-nums">
              {min} <span className="text-[10px] font-normal text-[#607780]">{unit}</span>
            </span>
          </div>
          <div className="px-2.5 py-1.5 rounded-[6px] bg-[#E8F0F2] border border-[#D5E0E4] text-center">
            <span className="text-[10px] text-[#8A98A8] block uppercase tracking-wider">Maximum</span>
            <span className="font-semibold text-[#19323C] tabular-nums">
              {max} <span className="text-[10px] font-normal text-[#607780]">{unit}</span>
            </span>
          </div>
          <div className="px-2.5 py-1.5 rounded-[6px] bg-[#E8F0F2] border border-[#D5E0E4] text-center">
            <span className="text-[10px] text-[#8A98A8] block uppercase tracking-wider">Current</span>
            <span className="font-semibold text-[#176B87] tabular-nums">
              {latest} <span className="text-[10px] font-normal text-[#607780]">{unit}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Scientific SVG Chart */}
      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block select-none overflow-visible cursor-crosshair touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <defs>
            <linearGradient id={`grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.10" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Classification Zones Background (for MQ135) */}
          {showClassificationBands && yLowThreshold && yHighThreshold && (
            <g className="opacity-40">
              {/* Moderate Band between 250 and 350 */}
              <rect
                x={padding.left}
                y={yHighThreshold}
                width={chartW}
                height={Math.max(0, yLowThreshold - yHighThreshold)}
                fill="#FFF8E8"
              />
              {/* High Band above 350 */}
              <rect
                x={padding.left}
                y={padding.top}
                width={chartW}
                height={Math.max(0, yHighThreshold - padding.top)}
                fill="#FDF0F0"
              />
            </g>
          )}

          {/* Subtle Horizontal Grid lines & Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = padding.top + chartH * ratio;
            const val = Math.round(maxVal - ratio * valRange);

            return (
              <g key={idx}>
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
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[10px] fill-[#8A98A8] font-mono select-none"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Project-Defined Threshold Lines (for MQ135) */}
          {showClassificationBands && yLowThreshold && (
            <g>
              <line
                x1={padding.left}
                y1={yLowThreshold}
                x2={width - padding.right}
                y2={yLowThreshold}
                stroke="#C47A13"
                strokeDasharray="4 2"
                strokeWidth="1.2"
                strokeOpacity="0.8"
              />
              <text
                x={width - padding.right}
                y={yLowThreshold - 4}
                textAnchor="end"
                className="text-[9px] fill-[#C47A13] font-mono font-medium"
              >
                Threshold Low/Mod (250)
              </text>
            </g>
          )}

          {showClassificationBands && yHighThreshold && (
            <g>
              <line
                x1={padding.left}
                y1={yHighThreshold}
                x2={width - padding.right}
                y2={yHighThreshold}
                stroke="#C94343"
                strokeDasharray="4 2"
                strokeWidth="1.2"
                strokeOpacity="0.8"
              />
              <text
                x={width - padding.right}
                y={yHighThreshold - 4}
                textAnchor="end"
                className="text-[9px] fill-[#C94343] font-mono font-medium"
              >
                Threshold Mod/High (350)
              </text>
            </g>
          )}

          {/* Area fill */}
          {points.length > 0 && (
            <path
              d={`${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`}
              fill={`url(#grad-${chartId})`}
            />
          )}

          {/* Solid Scientific Telemetry Series Path */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Time Labels on X Axis */}
          {points.filter((_, idx) => idx % Math.ceil(points.length / 7) === 0).map((pt, idx) => (
            <text
              key={idx}
              x={pt.x}
              y={height - 10}
              textAnchor="middle"
              className="text-[10px] fill-[#8A98A8] font-mono"
            >
              {formatTimestamp(pt.reading.timestamp)}
            </text>
          ))}

          {/* Regular Data point markers */}
          {points.map((pt, idx) => (
            <circle
              key={idx}
              cx={pt.x}
              cy={pt.y}
              r={hoveredIdx === idx ? 4.5 : 1.5}
              fill={hoveredIdx === idx ? strokeColor : '#FAFCFC'}
              stroke={strokeColor}
              strokeWidth="1.2"
              className="transition-all"
            />
          ))}

          {/* Active Hover Crosshair Line & Halo Ring */}
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
                fill={strokeColor}
                opacity="0.25"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={4.5}
                fill={strokeColor}
                stroke="#FAFCFC"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Interactive Invisible Overlay Rect across chart body */}
          <rect
            x={padding.left}
            y={padding.top}
            width={chartW}
            height={chartH}
            fill="transparent"
            className="cursor-crosshair"
          />
        </svg>

        {/* Hover Precision Tooltip */}
        {activePoint && (
          <ChartTooltip
            x={(activePoint.x / width) * 100}
            y={(activePoint.y / height) * 100}
            isPercentagePosition={true}
            title={formatFullTimestamp(activePoint.reading.timestamp)}
            subtitle={`Ground Truth Telemetry · ${sensorLabel || 'Sensor'}`}
            seriesType="observed"
            items={[
              {
                label: title,
                value: activePoint.val.toFixed(1),
                unit,
                color: strokeColor,
              },
              ...(metricKey !== 'temperature'
                ? [
                    {
                      label: 'Temperature',
                      value: activePoint.reading.temperature.toFixed(1),
                      unit: '°C',
                      color: '#176B87',
                    },
                  ]
                : []),
              ...(metricKey !== 'humidity'
                ? [
                    {
                      label: 'Humidity',
                      value: activePoint.reading.humidity.toFixed(1),
                      unit: '% RH',
                      color: '#167C80',
                    },
                  ]
                : []),
              ...(metricKey !== 'mq135'
                ? [
                    {
                      label: 'MQ135 Gas',
                      value: Math.round(activePoint.reading.mq135),
                      unit: 'sensor units',
                      color: '#C47A13',
                    },
                  ]
                : []),
              {
                label: 'Air Quality Level',
                value: activePoint.reading.airQuality,
                badge: activePoint.reading.airQuality,
                badgeColor:
                  activePoint.reading.airQuality === 'Low'
                    ? '#27845A'
                    : activePoint.reading.airQuality === 'Moderate'
                    ? '#C47A13'
                    : '#C94343',
                badgeBg:
                  activePoint.reading.airQuality === 'Low'
                    ? '#EEF8F2'
                    : activePoint.reading.airQuality === 'Moderate'
                    ? '#FFF8E8'
                    : '#FDF0F0',
              },
            ]}
            footer={
              showClassificationBands
                ? 'MQ135 raw sensor units with preliminary lab thresholds'
                : 'Concurrent readings recorded at this historical point'
            }
          />
        )}
      </div>

      {/* Footnote for Preliminary Thresholds */}
      {showClassificationBands && (
        <div className="mt-2 pt-2 border-t border-[#D5E0E4] text-[11px] text-[#8A98A8] flex flex-wrap items-center justify-between font-mono">
          <span>* Project-defined preliminary thresholds: Low (&lt;250) · Moderate (250–350) · High (&gt;350)</span>
          <span>Raw sensor units (not an official regulatory AQI)</span>
        </div>
      )}
    </div>
  );
}
