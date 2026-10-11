import React from 'react';

export interface TooltipItem {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  badge?: string;
  badgeColor?: string;
  badgeBg?: string;
}

export interface ChartTooltipProps {
  x: number; // percentage (0 - 100) or pixel
  y: number; // percentage (0 - 100) or pixel
  isPercentagePosition?: boolean;
  title?: string;
  subtitle?: string;
  items: TooltipItem[];
  footer?: string;
  seriesType?: 'observed' | 'prediction' | 'benchmark';
  alignRight?: boolean;
  className?: string;
}

/**
 * Universal scientific instrumentation chart tooltip for the Aqua Steel design system.
 * Follows laboratory IoT telemetry guidelines: solid surface, IBM Plex Mono values,
 * explicit units, and clear distinction between empirical telemetry and model inference.
 */
export function ChartTooltip({
  x,
  y,
  isPercentagePosition = true,
  title,
  subtitle,
  items,
  footer,
  seriesType,
  alignRight,
  className = '',
}: ChartTooltipProps) {
  // Determine if tooltip should flip horizontally to prevent container edge clipping
  const shouldFlip = alignRight !== undefined ? alignRight : isPercentagePosition ? x > 55 : false;

  const positionStyle: React.CSSProperties = isPercentagePosition
    ? {
        left: shouldFlip ? undefined : `${x}%`,
        right: shouldFlip ? `${100 - x}%` : undefined,
        top: `${Math.max(4, Math.min(80, y))}%`,
      }
    : {
        left: shouldFlip ? undefined : `${x}px`,
        right: shouldFlip ? `${x}px` : undefined,
        top: `${y}px`,
      };

  return (
    <div
      style={positionStyle}
      className={`absolute z-30 pointer-events-none transition-all duration-75 ease-out ${
        shouldFlip ? 'mr-3' : 'ml-3'
      } ${className}`}
    >
      <div className="bg-[#FAFCFC] border border-[#D5E0E4] rounded-[8px] p-2.5 sm:p-3 text-xs shadow-md min-w-[190px] max-w-[280px]">
        {/* Header: Title & Subtitle / Series Indicator */}
        {(title || subtitle) && (
          <div className="border-b border-[#D5E0E4] pb-1.5 mb-2">
            {subtitle && (
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono mb-0.5">
                <span className="text-[#8A98A8] uppercase tracking-wider">{subtitle}</span>
                {seriesType === 'observed' && (
                  <span className="text-[#176B87] bg-[#E8F2F6] px-1.5 py-0.2 rounded font-semibold text-[9px]">
                    GROUND TRUTH
                  </span>
                )}
                {seriesType === 'prediction' && (
                  <span className="text-[#C47A13] bg-[#FFF8E8] px-1.5 py-0.2 rounded font-semibold text-[9px]">
                    DEMO FORECAST
                  </span>
                )}
              </div>
            )}
            {title && (
              <div className="font-mono text-[11px] font-semibold text-[#19323C]">
                {title}
              </div>
            )}
          </div>
        )}

        {/* Body Items List */}
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                {item.color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                )}
                <span className="text-[#607780] truncate text-[11px]">
                  {item.label}:
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 font-mono">
                <span className="font-bold text-[#19323C] text-[12px] tabular-nums">
                  {item.value}
                </span>
                {item.unit && (
                  <span className="text-[10px] text-[#607780] font-normal">
                    {item.unit}
                  </span>
                )}
                {item.badge && (
                  <span
                    className="text-[9px] px-1.5 py-0.2 rounded font-semibold border border-[#D5E0E4]"
                    style={{
                      color: item.badgeColor || '#19323C',
                      backgroundColor: item.badgeBg || '#E8F0F2',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        {footer && (
          <div className="mt-2 pt-1.5 border-t border-[#D5E0E4] text-[10px] font-mono text-[#8A98A8] leading-tight">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
