import React, { useState, useId } from 'react';
import { HistoricalReading, AirQualityPrediction } from '../../types';
import { ChartTooltip } from '../ui/ChartTooltip';

interface PredictionTrendChartProps {
  history: HistoricalReading[];
  prediction: AirQualityPrediction;
  className?: string;
}

export function PredictionTrendChart({
  history,
  prediction,
  className = '',
}: PredictionTrendChartProps) {
  const chartId = useId();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Take the last 16 historical readings to present recent empirical observed trend
  const recentHistory = history.slice(-16);
  if (recentHistory.length === 0) return null;

  // Extract last observed point
  const lastHistoryPoint = recentHistory[recentHistory.length - 1];
  const lastTimestamp = new Date(lastHistoryPoint.timestamp).getTime();

  // Multi-horizon forecast data from prediction
  const forecastSteps = prediction.forecast?.filter((s) => s.minutesAhead > 0) || [
    { minutesAhead: 5, airQuality: 'Moderate' as const, predictedMq135: 335 },
    { minutesAhead: 10, airQuality: 'High' as const, predictedMq135: 358 },
    { minutesAhead: 15, airQuality: 'High' as const, predictedMq135: 382 },
  ];

  const futurePoints = forecastSteps.map((f) => ({
    timestamp: new Date(lastTimestamp + f.minutesAhead * 60 * 1000).toISOString(),
    mq135: f.predictedMq135 ?? (lastHistoryPoint.mq135 + f.minutesAhead * 4.2),
    isProjected: true,
    airQuality: f.airQuality,
    minutesAhead: f.minutesAhead,
  }));

  const allPoints = [
    ...recentHistory.map((h) => ({
      ...h,
      isProjected: false,
      minutesAhead: 0,
    })),
    ...futurePoints,
  ];

  const values = allPoints.map((p) => p.mq135);
  const minVal = Math.floor(Math.min(...values, 80) * 0.95);
  const maxVal = Math.ceil(Math.max(...values, 390) * 1.05);
  const valRange = maxVal - minVal || 1;

  // SVG dimensions
  const width = 840;
  const height = 230;
  const padding = { top: 24, right: 32, bottom: 34, left: 54 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Split history coordinates vs future projection coordinates
  const historyCoords = recentHistory.map((d, i) => {
    const x = padding.left + (i / (allPoints.length - 1)) * chartW;
    const y = padding.top + chartH - ((d.mq135 - minVal) / valRange) * chartH;
    return { x, y, val: d.mq135, item: d };
  });

  const junctionPoint = historyCoords[historyCoords.length - 1];

  const futureCoords = futurePoints.map((d, i) => {
    const overallIdx = recentHistory.length + i;
    const x = padding.left + (overallIdx / (allPoints.length - 1)) * chartW;
    const y = padding.top + chartH - ((d.mq135 - minVal) / valRange) * chartH;
    return { x, y, val: d.mq135, item: d };
  });

  // Solid line path for observed data
  const historyPathD = historyCoords.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, '');

  // Dashed line path for model prediction
  const forecastPathD = [junctionPoint, ...futureCoords].reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, '');

  // Y positions for project-defined thresholds (250 and 350)
  const y250 = padding.top + chartH - ((250 - minVal) / valRange) * chartH;
  const y350 = padding.top + chartH - ((350 - minVal) / valRange) * chartH;

  const combinedPoints = [
    ...historyCoords.map((pt) => ({ ...pt, isProjected: false })),
    ...futureCoords.map((pt) => ({ ...pt, isProjected: true })),
  ];

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

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < combinedPoints.length; i++) {
      const diff = Math.abs(combinedPoints[i].x - svgX);
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

  const activePoint = hoveredIndex !== null ? combinedPoints[hoveredIndex] : null;

  return (
    <div className={`bg-[#FAFCFC] border border-[#D5E0E4] rounded-[10px] p-4 sm:p-5 shadow-subtle ${className}`}>
      {/* Chart Title and Demarcation Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#D5E0E4]">
        <div>
          <h3 className="type-card-heading text-[#19323C]">
            Sensor Trajectory: Observed vs. Model Prediction
          </h3>
          <p className="type-metadata text-[#607780] mt-0.5">
            MQ135 Gas Sensor telemetry (solid line) transitioning into model inference (dashed line)
          </p>
        </div>

        {/* Demarcation Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 bg-[#176B87] inline-block" />
            <span className="text-[#19323C] font-semibold">Solid line: Observed sensor data</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 border-b-2 border-dashed border-[#C47A13] inline-block" />
            <span className="text-[#C47A13] font-semibold">Dashed line: Model prediction (Demo Forecast)</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block select-none overflow-visible cursor-crosshair touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          {/* Background Band Partition for Predicted Region */}
          <rect
            x={junctionPoint.x}
            y={padding.top}
            width={width - padding.right - junctionPoint.x}
            height={chartH}
            fill="#FFF8E8"
            opacity="0.3"
          />

          {/* Grid lines */}
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
                  className="text-[10px] fill-[#8A98A8] font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Threshold markers */}
          <line
            x1={padding.left}
            y1={y250}
            x2={width - padding.right}
            y2={y250}
            stroke="#C47A13"
            strokeDasharray="4 2"
            strokeWidth="1"
            strokeOpacity="0.6"
          />
          <text
            x={padding.left + 6}
            y={y250 - 4}
            className="text-[9px] fill-[#C47A13] font-mono font-medium"
          >
            Moderate Threshold (250)
          </text>

          <line
            x1={padding.left}
            y1={y350}
            x2={width - padding.right}
            y2={y350}
            stroke="#C94343"
            strokeDasharray="4 2"
            strokeWidth="1"
            strokeOpacity="0.6"
          />
          <text
            x={padding.left + 6}
            y={y350 - 4}
            className="text-[9px] fill-[#C94343] font-mono font-medium"
          >
            High Threshold (350)
          </text>

          {/* Vertical NOW Boundary Divider */}
          <line
            x1={junctionPoint.x}
            y1={padding.top}
            x2={junctionPoint.x}
            y2={padding.top + chartH}
            stroke="#176B87"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
          <text
            x={junctionPoint.x}
            y={padding.top - 8}
            textAnchor="middle"
            className="text-[10px] font-mono fill-[#176B87] font-semibold"
          >
            NOW (Current)
          </text>

          {/* 1. OBSERVED SENSOR DATA LINE (SOLID) */}
          <path
            d={historyPathD}
            fill="none"
            stroke="#176B87"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Observed Points Circles */}
          {historyCoords.map((pt, idx) => (
            <circle
              key={`obs-${idx}`}
              cx={pt.x}
              cy={pt.y}
              r={idx === historyCoords.length - 1 ? 4 : 2}
              fill={idx === historyCoords.length - 1 ? '#176B87' : '#FAFCFC'}
              stroke="#176B87"
              strokeWidth="1.5"
            />
          ))}

          {/* 2. MODEL PREDICTION LINE (DASHED) */}
          <path
            d={forecastPathD}
            fill="none"
            stroke="#C47A13"
            strokeWidth="2.2"
            strokeDasharray="5 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Future Prediction Points Circles */}
          {futureCoords.map((pt, idx) => (
            <g key={`pred-${idx}`}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={4}
                fill="#FAFCFC"
                stroke="#C47A13"
                strokeWidth="2"
              />
              <text
                x={pt.x}
                y={pt.y - 8}
                textAnchor="middle"
                className="text-[10px] font-mono fill-[#C47A13] font-bold"
              >
                +{pt.item.minutesAhead}m
              </text>
            </g>
          ))}

          {/* Active Hover Crosshair Line & Halo Ring */}
          {activePoint && (
            <g pointerEvents="none">
              <line
                x1={activePoint.x}
                y1={padding.top}
                x2={activePoint.x}
                y2={padding.top + chartH}
                stroke={activePoint.isProjected ? '#C47A13' : '#176B87'}
                strokeDasharray="2 2"
                strokeWidth="1.2"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={8}
                fill={activePoint.isProjected ? '#C47A13' : '#176B87'}
                opacity="0.25"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={4.5}
                fill={activePoint.isProjected ? '#C47A13' : '#176B87'}
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

          {/* X Axis labels */}
          <text
            x={padding.left}
            y={height - 10}
            className="text-[10px] fill-[#8A98A8] font-mono"
          >
            Past Readings (Historical Telemetry)
          </text>

          <text
            x={width - padding.right}
            y={height - 10}
            textAnchor="end"
            className="text-[10px] fill-[#C47A13] font-mono font-medium"
          >
            Forecast Horizon (+15 min)
          </text>
        </svg>

        {/* Hover Precision Tooltip distinguishing Observed vs Predicted */}
        {activePoint && (
          <ChartTooltip
            x={(activePoint.x / width) * 100}
            y={(activePoint.y / height) * 100}
            isPercentagePosition={true}
            title={
              activePoint.isProjected
                ? `Forecast Target: ${formatFullTimestamp(activePoint.item.timestamp)}`
                : formatFullTimestamp((activePoint.item as HistoricalReading).timestamp)
            }
            subtitle={
              activePoint.isProjected
                ? `Demo Forecast · +${(activePoint.item as { minutesAhead: number }).minutesAhead}m Lookahead`
                : 'Ground Truth Telemetry · Observed'
            }
            seriesType={activePoint.isProjected ? 'prediction' : 'observed'}
            items={
              activePoint.isProjected
                ? [
                    {
                      label: 'Projected MQ135',
                      value: Math.round(activePoint.val),
                      unit: 'sensor units',
                      color: '#C47A13',
                    },
                    {
                      label: 'Predicted Level',
                      value: activePoint.item.airQuality,
                      badge: activePoint.item.airQuality,
                      badgeColor:
                        activePoint.item.airQuality === 'Low'
                          ? '#27845A'
                          : activePoint.item.airQuality === 'Moderate'
                          ? '#C47A13'
                          : '#C94343',
                      badgeBg:
                        activePoint.item.airQuality === 'Low'
                          ? '#EEF8F2'
                          : activePoint.item.airQuality === 'Moderate'
                          ? '#FFF8E8'
                          : '#FDF0F0',
                    },
                    {
                      label: 'Model Architecture',
                      value: prediction.modelUsed,
                      color: '#176B87',
                    },
                    {
                      label: 'Confidence',
                      value: `${Math.round(prediction.confidence * 100)}%`,
                    },
                  ]
                : [
                    {
                      label: 'Observed MQ135',
                      value: Math.round(activePoint.val),
                      unit: 'sensor units',
                      color: '#176B87',
                    },
                    {
                      label: 'Air Quality Level',
                      value: (activePoint.item as HistoricalReading).airQuality,
                      badge: (activePoint.item as HistoricalReading).airQuality,
                      badgeColor:
                        (activePoint.item as HistoricalReading).airQuality === 'Low'
                          ? '#27845A'
                          : (activePoint.item as HistoricalReading).airQuality === 'Moderate'
                          ? '#C47A13'
                          : '#C94343',
                      badgeBg:
                        (activePoint.item as HistoricalReading).airQuality === 'Low'
                          ? '#EEF8F2'
                          : (activePoint.item as HistoricalReading).airQuality === 'Moderate'
                          ? '#FFF8E8'
                          : '#FDF0F0',
                    },
                    {
                      label: 'Temperature',
                      value: (activePoint.item as HistoricalReading).temperature.toFixed(1),
                      unit: '°C',
                      color: '#176B87',
                    },
                    {
                      label: 'Humidity',
                      value: (activePoint.item as HistoricalReading).humidity.toFixed(1),
                      unit: '% RH',
                      color: '#167C80',
                    },
                  ]
            }
            footer={
              activePoint.isProjected
                ? `Sequential model projection (+${(activePoint.item as { minutesAhead: number }).minutesAhead} min)`
                : 'Direct physical sensor packet from ESP32 node'
            }
          />
        )}
      </div>

      {/* Chart Footer Demarcation */}
      <div className="mt-3 pt-2.5 border-t border-[#D5E0E4] flex flex-wrap items-center justify-between text-[11px] font-mono text-[#8A98A8]">
        <div>
          <span className="text-[#19323C] font-semibold">Boundary Note: </span>
          Data left of &quot;NOW&quot; consists of verified telemetry. Data right represents model inference.
        </div>
        <div className="text-[#C47A13]">
          Mock Prediction / Demo Forecast
        </div>
      </div>
    </div>
  );
}
