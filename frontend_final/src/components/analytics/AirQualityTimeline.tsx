import React, { useState } from 'react';
import { HistoricalReading } from '../../types';
import { ChartTooltip } from '../ui/ChartTooltip';

interface AirQualityTimelineProps {
  data: HistoricalReading[];
  className?: string;
}

export function AirQualityTimeline({ data, className = '' }: AirQualityTimelineProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  // Compute distribution
  const total = data.length;
  const lowCount = data.filter((d) => d.airQuality === 'Low').length;
  const modCount = data.filter((d) => d.airQuality === 'Moderate').length;
  const highCount = data.filter((d) => d.airQuality === 'High').length;

  const lowPct = ((lowCount / total) * 100).toFixed(1);
  const modPct = ((modCount / total) * 100).toFixed(1);
  const highPct = ((highCount / total) * 100).toFixed(1);

  const hoveredReading = hoveredIdx !== null ? data[hoveredIdx] : null;

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

  return (
    <div className={`bg-[#FAFCFC] border border-[#D5E0E4] rounded-[10px] p-4 shadow-subtle space-y-4 ${className}`}>
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[#D5E0E4]">
        <div>
          <h3 className="type-card-heading text-[#19323C]">
            Air Quality Classification Timeline & Distribution
          </h3>
          <p className="text-[12px] text-[#607780] mt-0.5">
            Discrete classification intervals across the active historical window ({total} samples).
          </p>
        </div>

        <div className="text-xs font-mono text-[#8A98A8]">
          <span>Sampling Interval: </span>
          <span className="text-[#19323C] font-medium">Continuous Telemetry Buffer</span>
        </div>
      </div>

      {/* 2. Three Distribution Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Low Card */}
        <div className="p-3 rounded-[8px] border border-[#D5E0E4] bg-[#E8F0F2]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#27845A]" />
              <span className="text-xs font-medium text-[#19323C]">Low</span>
            </div>
            <span className="px-1.5 py-0.5 rounded-[4px] bg-[#EEF8F2] border border-[#D5E0E4] text-[11px] font-mono font-semibold text-[#27845A]">
              &lt; 250 units
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between font-mono">
            <span className="text-xl font-semibold text-[#19323C] tabular-nums">{lowPct}%</span>
            <span className="text-xs text-[#607780]">{lowCount} samples</span>
          </div>
        </div>

        {/* Moderate Card */}
        <div className="p-3 rounded-[8px] border border-[#D5E0E4] bg-[#E8F0F2]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C47A13]" />
              <span className="text-xs font-medium text-[#19323C]">Moderate</span>
            </div>
            <span className="px-1.5 py-0.5 rounded-[4px] bg-[#FFF8E8] border border-[#D5E0E4] text-[11px] font-mono font-semibold text-[#C47A13]">
              250–350 units
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between font-mono">
            <span className="text-xl font-semibold text-[#19323C] tabular-nums">{modPct}%</span>
            <span className="text-xs text-[#607780]">{modCount} samples</span>
          </div>
        </div>

        {/* High Card */}
        <div className="p-3 rounded-[8px] border border-[#D5E0E4] bg-[#E8F0F2]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C94343]" />
              <span className="text-xs font-medium text-[#19323C]">High</span>
            </div>
            <span className="px-1.5 py-0.5 rounded-[4px] bg-[#FDF0F0] border border-[#D5E0E4] text-[11px] font-mono font-semibold text-[#C94343]">
              &gt; 350 units
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between font-mono">
            <span className="text-xl font-semibold text-[#19323C] tabular-nums">{highPct}%</span>
            <span className="text-xs text-[#607780]">{highCount} samples</span>
          </div>
        </div>
      </div>

      {/* 3. Horizontal Ribbon Timeline */}
      <div className="space-y-2 pt-1 relative">
        <div className="flex items-center justify-between text-xs text-[#607780]">
          <span>Sequential Timeline Ribbon</span>
          <span className="font-mono text-[11px] text-[#8A98A8]">
            {hoveredReading
              ? `${new Date(hoveredReading.timestamp).toLocaleTimeString()} · ${hoveredReading.airQuality} (${Math.round(hoveredReading.mq135)} units)`
              : 'Hover or tap segment for detailed sample readings'}
          </span>
        </div>

        {/* Timeline Bar Strip */}
        <div className="w-full h-6 rounded-[6px] overflow-hidden flex bg-[#E8F0F2] border border-[#D5E0E4] relative select-none">
          {data.map((reading, idx) => {
            let color = '#27845A'; // Low
            if (reading.airQuality === 'Moderate') color = '#C47A13';
            if (reading.airQuality === 'High') color = '#C94343';
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={idx}
                className="flex-1 h-full cursor-pointer transition-all hover:brightness-110 relative"
                style={{
                  backgroundColor: color,
                  transform: isHovered ? 'scaleY(1.15)' : undefined,
                  zIndex: isHovered ? 10 : 1,
                  outline: isHovered ? '2px solid #19323C' : undefined,
                }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onTouchStart={() => setHoveredIdx(idx)}
              />
            );
          })}
        </div>

        <div className="flex justify-between text-[10px] font-mono text-[#8A98A8] pt-0.5">
          <span>{new Date(data[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span>Timeline Progression (Left → Right)</span>
          <span>{new Date(data[data.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* Hover Precision Tooltip directly over Ribbon */}
        {hoveredReading && hoveredIdx !== null && (
          <ChartTooltip
            x={(hoveredIdx / (data.length - 1)) * 100}
            y={50}
            isPercentagePosition={true}
            title={formatFullTimestamp(hoveredReading.timestamp)}
            subtitle="Classification Interval"
            seriesType="observed"
            items={[
              {
                label: 'Air Quality Level',
                value: hoveredReading.airQuality,
                badge: hoveredReading.airQuality,
                badgeColor:
                  hoveredReading.airQuality === 'Low'
                    ? '#27845A'
                    : hoveredReading.airQuality === 'Moderate'
                    ? '#C47A13'
                    : '#C94343',
                badgeBg:
                  hoveredReading.airQuality === 'Low'
                    ? '#EEF8F2'
                    : hoveredReading.airQuality === 'Moderate'
                    ? '#FFF8E8'
                    : '#FDF0F0',
              },
              {
                label: 'MQ135 Gas Sensor',
                value: Math.round(hoveredReading.mq135),
                unit: 'sensor units',
                color: '#C47A13',
              },
              {
                label: 'Temperature',
                value: hoveredReading.temperature.toFixed(1),
                unit: '°C',
                color: '#176B87',
              },
              {
                label: 'Humidity',
                value: hoveredReading.humidity.toFixed(1),
                unit: '% RH',
                color: '#167C80',
              },
            ]}
            footer={
              hoveredReading.airQuality === 'Low'
                ? '< 250 units: Baseline indoor air'
                : hoveredReading.airQuality === 'Moderate'
                ? '250–350 units: Accumulating indoor contaminants'
                : '> 350 units: Elevated concentration'
            }
          />
        )}
      </div>

      {/* 4. Legend & Footnote */}
      <div className="pt-2 border-t border-[#D5E0E4] flex flex-wrap items-center justify-between text-[11px] text-[#8A98A8] font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#27845A]" /> Low (&lt;250)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#C47A13]" /> Moderate (250–350)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#C94343]" /> High (&gt;350)
          </span>
        </div>
        <span>Project-defined preliminary classification thresholds</span>
      </div>
    </div>
  );
}
