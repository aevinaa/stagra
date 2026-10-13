import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { DataNotice, ApiErrorNotice } from '../components/common/DataNotice';
import {
  getCurrentConditions,
  getHistoricalReadings,
  getPrediction,
} from '../services/api';
import {
  CurrentConditions,
  HistoricalReading,
  AirQualityPrediction,
  AirQualityLevel,
} from '../types';
import { PredictionTrendChart } from '../components/prediction/PredictionTrendChart';
import { RefreshCw, Activity } from 'lucide-react';

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

export function PredictionView() {
  const [conditions, setConditions] = useState<CurrentConditions | null>(null);
  const [prediction, setPrediction] = useState<AirQualityPrediction | null>(null);
  const [history, setHistory] = useState<HistoricalReading[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // The prediction is checked first: when none exists (real mode, no trained and
      // evaluated model yet) nothing else on this page is shown.
      const pred = await getPrediction();
      if (!pred) {
        setPrediction(null);
        setConditions(null);
        setHistory([]);
        setLoadError(null);
        setLoadState('unavailable');
        return;
      }

      const [cur, hist] = await Promise.all([
        getCurrentConditions(),
        getHistoricalReadings('6h'),
      ]);
      setPrediction(pred);
      setConditions(cur);
      setHistory(hist.readings);
      setLoadError(null);
      setLoadState('ready');
    } catch (err) {
      console.error('Failed to load prediction data:', err);
      setLoadError(err);
      setLoadState('error');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loadState === 'loading') {
    return (
      <div className="py-24 text-center">
        <p className="type-body text-[#607780] font-mono">Loading telemetry and prediction model output...</p>
      </div>
    );
  }

  // Predefined status styling matching new design tokens (demo forecast levels only)
  const getLevelStyle = (level: AirQualityLevel) => {
    switch (level) {
      case 'Low':
        return {
          bg: 'bg-[#EEF8F2]',
          text: 'text-[#27845A]',
          border: 'border-[#D5E0E4]',
          label: 'LOW',
        };
      case 'Moderate':
        return {
          bg: 'bg-[#FFF8E8]',
          text: 'text-[#C47A13]',
          border: 'border-[#D5E0E4]',
          label: 'MODERATE',
        };
      case 'High':
        return {
          bg: 'bg-[#FDF0F0]',
          text: 'text-[#C94343]',
          border: 'border-[#D5E0E4]',
          label: 'HIGH',
        };
      default:
        return {
          bg: 'bg-[#E8F0F2]',
          text: 'text-[#607780]',
          border: 'border-[#D5E0E4]',
          label: String(level).toUpperCase(),
        };
    }
  };

  const isReady = loadState === 'ready' && conditions && prediction;

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#D5E0E4]">
        <div>
          <h2 className="type-page-title text-[#19323C]">Prediction</h2>
          <p className="type-body text-[#607780] mt-0.5">
            {isReady
              ? 'Short-term forecasting and sequential model inference (demo data, not a real model).'
              : 'Short-term forecasting and sequential model inference.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* DEMO / MOCK NOTICE BADGE (only when demo predictions are being shown) */}
          {isReady && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#E8F2F6] border border-[#D5E0E4] text-xs font-mono text-[#176B87]">
              <span className="w-2 h-2 rounded-full bg-[#176B87]" />
              <span className="font-semibold uppercase tracking-wider">Demo Forecast / Mock Prediction</span>
            </div>
          )}

          <button
            onClick={loadData}
            disabled={isRefreshing}
            className="p-1.5 rounded-[8px] border border-[#D5E0E4] bg-[#FAFCFC] hover:bg-[#E8F0F2] text-[#607780] hover:text-[#19323C] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh prediction model"
            aria-label="Refresh prediction model"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#176B87]' : ''}`} />
          </button>
        </div>
      </div>

      {loadState === 'unavailable' && (
        <DataNotice variant="unavailable" title="Prediction unavailable">
          No prediction model has been trained and evaluated on held-out real sensor data yet, so no
          forecast is shown. The MQ135 value is a raw, uncalibrated sensor reading, and no air-quality
          level is derived from it.
        </DataNotice>
      )}

      {loadState === 'error' && <ApiErrorNotice error={loadError} onRetry={loadData} />}

      {isReady && conditions && prediction && (
        <>
          {/* SECTION 1: OBSERVED SENSOR DATA */}
          <section aria-labelledby="observed-data-heading" className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#D5E0E4] pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#176B87]" />
                <h3 id="observed-data-heading" className="text-xs uppercase font-mono tracking-wider font-bold text-[#19323C]">
                  OBSERVED SENSOR DATA
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[#176B87] bg-[#E8F2F6] px-2 py-0.5 rounded border border-[#D5E0E4]">
                Ground Truth Telemetry
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Temperature */}
              <Card className="p-4 flex flex-col justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[#607780] font-mono block">
                  Temperature
                </span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-mono font-bold text-[#19323C] tabular-nums">
                    {conditions.temperature.toFixed(1)}
                  </span>
                  <span className="text-xs font-mono text-[#607780]">°C</span>
                </div>
                <div className="mt-2 pt-2 border-t border-[#D5E0E4] text-[10px] font-mono text-[#8A98A8]">
                  Sensor: DS18B20
                </div>
              </Card>

              {/* Humidity */}
              <Card className="p-4 flex flex-col justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[#607780] font-mono block">
                  Humidity
                </span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-mono font-bold text-[#19323C] tabular-nums">
                    {conditions.humidity.toFixed(1)}
                  </span>
                  <span className="text-xs font-mono text-[#607780]">% RH</span>
                </div>
                <div className="mt-2 pt-2 border-t border-[#D5E0E4] text-[10px] font-mono text-[#8A98A8]">
                  Sensor: DHT11
                </div>
              </Card>

              {/* MQ135 Reading */}
              <Card className="p-4 flex flex-col justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[#607780] font-mono block">
                  MQ135
                </span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-mono font-bold text-[#19323C] tabular-nums">
                    {Number.isInteger(conditions.mq135) ? conditions.mq135 : conditions.mq135.toFixed(1)}
                  </span>
                  <span className="text-xs font-mono text-[#607780]">raw units</span>
                </div>
                <div className="mt-2 pt-2 border-t border-[#D5E0E4] text-[10px] font-mono text-[#8A98A8]">
                  Raw value (uncalibrated)
                </div>
              </Card>

              {/* Data Source */}
              <Card className="p-4 flex flex-col justify-between border-l-4 border-l-[#176B87]">
                <span className="text-[11px] uppercase tracking-wider text-[#607780] font-mono block">
                  Data Source
                </span>
                <div className="mt-2">
                  <span className="text-xs font-mono font-bold text-[#19323C] break-all">
                    {conditions.experimentId ?? 'Browser-generated demo'}
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-[#D5E0E4] text-[10px] font-mono text-[#8A98A8]">
                  {conditions.isSynthetic ? 'Synthetic data' : 'Latest stored reading'}
                </div>
              </Card>
            </div>
          </section>

          {/* SECTION 2: MODEL PREDICTION (FORECAST TIMELINE) */}
          <section aria-labelledby="model-prediction-heading" className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#D5E0E4] pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C47A13]" />
                <h3 id="model-prediction-heading" className="text-xs uppercase font-mono tracking-wider font-bold text-[#19323C]">
                  MODEL PREDICTION
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[#C47A13] bg-[#FFF8E8] px-2.5 py-0.5 rounded border border-[#D5E0E4] font-semibold">
                Demo Forecast / Mock Prediction
              </span>
            </div>

            {/* Forecast Points: Current, +5 minutes, +10 minutes, +15 minutes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {prediction.forecast.map((step) => {
                const stepStyle = getLevelStyle(step.airQuality);
                const isNow = step.minutesAhead === 0;

                return (
                  <Card
                    key={step.minutesAhead}
                    className={`p-4 flex flex-col justify-between ${
                      isNow ? 'bg-[#FAFCFC]' : 'border-dashed border-[#D5E0E4] bg-[#FAFCFC]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono text-xs font-bold text-[#19323C]">
                          {step.label || (isNow ? 'Current' : `+${step.minutesAhead} minutes`)}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E8F0F2] text-[#607780]">
                          {isNow ? 'Observed Baseline' : 'Demo Forecast'}
                        </span>
                      </div>

                      <div className="mt-3">
                        <span className="text-[10px] font-mono text-[#8A98A8] block uppercase">
                          Demo level (mock)
                        </span>
                        <span
                          className={`inline-block mt-1 px-3 py-1 rounded-[5px] text-sm font-bold font-mono border ${stepStyle.bg} ${stepStyle.text} ${stepStyle.border}`}
                        >
                          {stepStyle.label}
                        </span>
                      </div>

                      <div className="mt-3 flex items-baseline gap-1 text-xs font-mono text-[#607780]">
                        <span>Projected MQ135:</span>
                        <span className="font-semibold text-[#19323C]">
                          {step.predictedMq135 ? Math.round(step.predictedMq135) : '—'}
                        </span>
                        <span className="text-[10px] text-[#8A98A8]">raw units</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-[#D5E0E4] text-[10px] font-mono text-[#8A98A8]">
                      {isNow ? 'Empirical sensor baseline' : `Horizon: +${step.minutesAhead} minutes`}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* SECTION 3: MODEL PARAMETERS & RECOMMENDATION */}
          <div>
            <Card className="p-5 h-full flex flex-col justify-between" elevated={true}>
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#D5E0E4] mb-4">
                  <div>
                    <h3 className="type-card-heading text-[#19323C]">
                      Model Parameters & Status
                    </h3>
                    <p className="type-metadata text-[#607780] mt-0.5">
                      Demo metadata (not from a real model)
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#176B87] bg-[#E8F2F6] px-2.5 py-1 rounded-[6px] border border-[#D5E0E4]">
                    Model: {prediction.modelUsed}
                  </span>
                </div>

                {/* Grid of Key Model Attributes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  {/* Model Used */}
                  <div className="p-3 rounded-[6px] bg-[#E8F0F2] border border-[#D5E0E4]">
                    <span className="text-[10px] text-[#8A98A8] block uppercase">Model Used</span>
                    <span className="font-bold text-[#19323C] text-sm mt-0.5 block">
                      {prediction.modelUsed}
                    </span>
                    <span className="text-[10px] text-[#607780]">Sequential Model</span>
                  </div>

                  {/* Prediction Confidence */}
                  <div className="p-3 rounded-[6px] bg-[#E8F0F2] border border-[#D5E0E4]">
                    <span className="text-[10px] text-[#8A98A8] block uppercase">Prediction Confidence</span>
                    <span className="font-bold text-[#19323C] text-sm mt-0.5 block">
                      {Math.round(prediction.confidence * 100)}%
                    </span>
                    <span className="text-[10px] text-[#27845A]">Confidence Score</span>
                  </div>

                  {/* Trend */}
                  <div className="p-3 rounded-[6px] bg-[#E8F0F2] border border-[#D5E0E4]">
                    <span className="text-[10px] text-[#8A98A8] block uppercase">Trend</span>
                    <span className={`font-bold text-sm mt-0.5 block ${prediction.trend === 'Worsening' || prediction.trend === 'Increasing' ? 'text-[#C94343]' : 'text-[#27845A]'}`}>
                      {prediction.trend}
                    </span>
                    <span className="text-[10px] text-[#607780]">Predicted Trajectory</span>
                  </div>

                  {/* Forecast Horizon */}
                  <div className="p-3 rounded-[6px] bg-[#E8F0F2] border border-[#D5E0E4]">
                    <span className="text-[10px] text-[#8A98A8] block uppercase">Forecast Horizon</span>
                    <span className="font-bold text-[#19323C] text-sm mt-0.5 block">
                      +{prediction.predictionHorizonMinutes} minutes
                    </span>
                    <span className="text-[10px] text-[#607780]">Lookahead Window</span>
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              <div className="mt-4 pt-3 border-t border-[#D5E0E4] flex items-start gap-3 bg-[#E8F0F2] p-3 rounded-[6px] border border-[#D5E0E4]">
                <Activity className="w-4 h-4 text-[#C47A13] shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-[#19323C] uppercase tracking-wide">
                    Recommendation:{' '}
                  </span>
                  <span className="text-[#19323C] font-medium">{prediction.recommendation}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* SECTION 4: DEMARCATED TREND CHART (OBSERVED VS PREDICTED) */}
          <section aria-labelledby="chart-section-heading">
            <PredictionTrendChart history={history} prediction={prediction} />
          </section>
        </>
      )}
    </div>
  );
}