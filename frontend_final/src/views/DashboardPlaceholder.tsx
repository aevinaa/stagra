import React from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { SystemStatusStrip } from '../components/ui/SystemStatusStrip';
import { StatusPill } from '../components/ui/StatusPill';

export function DashboardPlaceholder() {
  return (
    <div className="space-y-6">
      {/* Page Title area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="type-page-title">Dashboard</h2>
          <p className="type-body text-[#5F6F82] mt-1">
            Real-time telemetry and current environmental sensor readings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill systemStatus="ONLINE" />
        </div>
      </div>

      {/* Subtle translucent status strip - live system status */}
      <SystemStatusStrip
        esp32Status="Connected"
        room="Room 204"
        samplingInterval="5.0s"
        activeSensors={['DHT22 (Temp & Hum)', 'MQ135 (Gas Sensor)']}
      />

      {/* Section Placeholder Card */}
      <Card>
        <CardHeader
          title="Section Placeholder: Real-Time Sensor Telemetry"
          subtitle="Awaiting live stream integration from ESP32 node"
        />
        <CardContent>
          <div className="py-12 px-4 text-center border border-dashed border-[#D8E0E8] rounded-[8px] bg-[#F2F6F8]">
            <p className="type-section-heading text-[#1E293B]">
              Dashboard Component Area
            </p>
            <p className="type-body text-[#5F6F82] max-w-md mx-auto mt-2">
              This space will present live metric cards (Temperature, Relative Humidity, MQ135 Gas Level), AQI index gauge, and historical real-time sparklines.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-mono text-[#8A98A8]">
              <span>Route: /dashboard</span>
              <span>·</span>
              <span>Theme: Laboratory Light (#EEF2F5)</span>
              <span>·</span>
              <span>Status: Architecture Ready</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
