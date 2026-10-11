import React from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';

export function PredictionPlaceholder() {
  return (
    <div className="space-y-6">
      {/* Page Title area */}
      <div>
        <h2 className="type-page-title text-[#1E293B]">Prediction</h2>
        <p className="type-body text-[#5F6F82] mt-1">
          Machine learning inference and air-quality forecasting engine.
        </p>
      </div>

      {/* Section Placeholder Card */}
      <Card>
        <CardHeader
          title="Section Placeholder: Air Quality Forecasting"
          subtitle="Trained inference models for upcoming 1h, 6h, and 24h air-quality predictions"
        />
        <CardContent>
          <div className="py-12 px-4 text-center border border-dashed border-[#D8E0E8] rounded-[8px] bg-[#F2F6F8]">
            <p className="type-section-heading text-[#1E293B]">
              Prediction Component Area
            </p>
            <p className="type-body text-[#5F6F82] max-w-md mx-auto mt-2">
              This space will host model inference controls, parameter scenarios, predicted AQI risk categorizations (Low, Moderate, High), and forecast confidence bands.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-mono text-[#8A98A8]">
              <span>Route: /prediction</span>
              <span>·</span>
              <span>Inference Engine: Embedded / Server-side ML</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
