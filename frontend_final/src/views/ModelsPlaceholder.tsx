import React from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';

export function ModelsPlaceholder() {
  return (
    <div className="space-y-6">
      {/* Page Title area */}
      <div>
        <h2 className="type-page-title text-[#1E293B]">Model Comparison</h2>
        <p className="type-body text-[#5F6F82] mt-1">
          Evaluative metrics, accuracy benchmarks, and machine learning model performance.
        </p>
      </div>

      {/* Section Placeholder Card */}
      <Card>
        <CardHeader
          title="Section Placeholder: Model Performance Benchmarking"
          subtitle="Empirical comparison between candidate algorithms"
        />
        <CardContent>
          <div className="py-12 px-4 text-center border border-dashed border-[#D8E0E8] rounded-[8px] bg-[#F2F6F8]">
            <p className="type-section-heading text-[#1E293B]">
              Model Comparison Component Area
            </p>
            <p className="type-body text-[#5F6F82] max-w-md mx-auto mt-2">
              This space will host model evaluation matrices (MAE, RMSE, R² scores, inference latency, memory footprint on microcontrollers) comparing Random Forest, XGBoost, and Neural Networks.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-mono text-[#8A98A8]">
              <span>Route: /models</span>
              <span>·</span>
              <span>Evaluation: Research Benchmarking</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
