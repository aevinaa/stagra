import React from 'react';
import { Radio, Cpu, Thermometer, Wind } from 'lucide-react';

interface SystemStatusStripProps {
  esp32Status?: 'Connected' | 'Disconnected';
  room?: string;
  samplingInterval?: string;
  activeSensors?: string[];
  className?: string;
}

export function SystemStatusStrip({
  esp32Status = 'Connected',
  room = 'Room 204',
  samplingInterval = '5.0s',
  activeSensors = ['DHT22 (Temp/Hum)', 'MQ135 (Gas)'],
  className = '',
}: SystemStatusStripProps) {
  return (
    <div
      className={`backdrop-blur-md bg-[#F9FBFC]/85 border border-[#D8E0E8] rounded-[12px] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-subtle ${className}`}
    >
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 text-[#1E293B] font-medium">
          <Cpu className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>MCU Node:</span>
          <span className="font-mono text-[#0F766E] bg-[#ECFDF5] px-1.5 py-0.5 rounded text-[11px] font-semibold border border-[#CCFBF1]">
            ESP32 DevKit-V1
          </span>
        </div>

        <span className="text-[#D8E0E8] hidden sm:inline" aria-hidden="true">|</span>

        <div className="flex items-center gap-1.5 text-[#5F6F82]">
          <Radio className="w-3.5 h-3.5 text-[#16A34A]" />
          <span>Link:</span>
          <span className="font-mono text-[#16A34A] font-medium">{esp32Status}</span>
        </div>

        <span className="text-[#D8E0E8] hidden sm:inline" aria-hidden="true">|</span>

        <div className="flex items-center gap-1.5 text-[#5F6F82]">
          <Wind className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>Location:</span>
          <span className="text-[#1E293B] font-medium">{room}</span>
        </div>

        <span className="text-[#D8E0E8] hidden md:inline" aria-hidden="true">|</span>

        <div className="flex items-center gap-1.5 text-[#5F6F82]">
          <Thermometer className="w-3.5 h-3.5 text-[#D97706]" />
          <span>Sensors:</span>
          <span className="text-[#1E293B] font-medium">{activeSensors.join(', ')}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs font-mono text-[#5F6F82]">
        <span>Rate:</span>
        <span className="text-[#1E293B] font-semibold">{samplingInterval}</span>
      </div>
    </div>
  );
}
