import React from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';

export function AnalyticsPlaceholder() {
  return (
    <div className="space-y-6">
      {/* Page Title area */}
      <div>
        <h2 className="type-page-title text-[#1E293B]">Analytics</h2>
        <p className="type-body text-[#5F6F82] mt-1">
          Historical trends, time-series distributions, and environmental correlations.
        </p>
      </div>

      {/* Section Placeholder Card */}
      <Card>
        <CardHeader
          title="Section Placeholder: Historical Data & Sensor Correlations"
          subtitle="Time-series analysis and environmental exposure logging"
        />
        <CardContent>
          <div className="py-12 px-4 text-center border border-dashed border-[#D8E0E8] rounded-[8px] bg-[#F2F6F8]">
            <p className="type-section-heading text-[#1E293B]">
              Analytics Component Area
            </p>
            <p className="type-body text-[#5F6F82] max-w-md mx-auto mt-2">
              This space will display multi-channel time-series charts, temperature vs. humidity regressions, and gas concentration distributions across time intervals.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-mono text-[#8A98A8]">
              <span>Route: /analytics</span>
              <span>·</span>
              <span>Domain: Environmental Analytics</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
