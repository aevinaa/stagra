import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { RecentTrendChart } from '../components/dashboard/RecentTrendChart';
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
import { RefreshCw, ArrowRight, AlertTriangle, Users, Wind, Thermometer, Droplets, Activity } from 'lucide-react';

export function DashboardView() {
  const [conditions, setConditions] = useState<CurrentConditions | null>(null);
  const [history, setHistory] = useState<HistoricalReading[]>([]);
  const [prediction, setPrediction] = useState<AirQualityPrediction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch telemetry from API layer
  const loadDashboardData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cur, hist, pred] = await Promise.all([
        getCurrentConditions(),
        getHistoricalReadings('24h'),
        getPrediction(),
      ]);
      setConditions(cur);
      setHistory(hist);
      setPrediction(pred);
      setSecondsAgo(0);
    } catch (err) {
      console.error('Failed to load telemetry:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Seconds counter since last update
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading || !conditions || !prediction) {
    return (
      <div className="py-24 text-center">
        <p className="type-body text-[#607780] font-mono">Loading telemetry stream...</p>
      </div>
    );
  }

  // Air Quality Level style map with updated design tokens
  const levelStyleMap: Record<
    AirQualityLevel,
    { bg: string; text: string; border: string; label: string }
  > = {
    Low: {
      bg: 'bg-[#EEF8F2]',
      text: 'text-[#27845A]',
      border: 'border-[#D5E0E4]',
      label: 'Low',
    },
    Moderate: {
      bg: 'bg-[#FFF8E8]',
      text: 'text-[#C47A13]',
      border: 'border-[#D5E0E4]',
      label: 'Moderate',
    },
    High: {
      bg: 'bg-[#FDF0F0]',
      text: 'text-[#C94343]',
      border: 'border-[#D5E0E4]',
      label: 'High',
    },
  };

  const currentLevelStyle = levelStyleMap[conditions.airQuality];

  // 10-minute forecast step
  const tenMinuteStep = prediction.forecast.find((f) => f.minutesAhead === 10);
  const predictedTenMinuteLevel: AirQualityLevel = tenMinuteStep
    ? tenMinuteStep.airQuality
    : prediction.predictedAirQuality || 'High';
  const predictedLevelStyle = levelStyleMap[predictedTenMinuteLevel];

  // Temperature baseline assessment (Displayed Target: 20.0–25.0 °C)
  // Ensures consistency: values outside the target band are NOT labelled Nominal
  const tempAssessment =
    conditions.temperature < 20.0
      ? { label: 'Below Target', colorClass: 'text-[#176B87]' }
      : conditions.temperature <= 25.0
      ? { label: 'Nominal', colorClass: 'text-[#27845A]' }
      : { label: 'Above Target', colorClass: 'text-[#C47A13]' };

  // Humidity comfort assessment (Displayed Target Band: 30.0–60.0 % RH)
  // Ensures consistency: values outside the comfort band are NOT labelled Nominal
  const humAssessment =
    conditions.humidity < 30.0
      ? { label: 'Below Target', colorClass: 'text-[#C47A13]' }
      : conditions.humidity <= 60.0
      ? { label: 'Nominal', colorClass: 'text-[#27845A]' }
      : { label: 'Above Target', colorClass: 'text-[#C47A13]' };

  // 10-minute forecast confidence
  const forecastConfidence = Math.round(
    (tenMinuteStep?.confidence ?? prediction.confidence) * 100
  );

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#D5E0E4]">
        <div>
          <h2 className="type-page-title text-[#19323C]">Dashboard</h2>
          <p className="type-body text-[#607780] mt-0.5">
            Real-time telemetry and environmental assessment for Room 204.
          </p>
        </div>

        {/* Telemetry Refresh Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-[#607780] bg-[#E8F0F2] px-3 py-1.5 rounded-[8px] border border-[#D5E0E4]">
            <span className="w-2 h-2 rounded-full bg-[#27845A]" />
            <span>Updated {secondsAgo}s ago</span>
          </div>

          <button
            onClick={loadDashboardData}
            disabled={isRefreshing}
            className="p-1.5 rounded-[8px] border border-[#D5E0E4] bg-[#FAFCFC] hover:bg-[#E8F0F2] text-[#607780] hover:text-[#19323C] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh telemetry"
            aria-label="Refresh telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#176B87]' : ''}`} />
          </button>
        </div>
      </div>

      {/* 1. PRIMARY TELEMETRY CARDS (4 CARDS: Temperature, Humidity, Air Quality Level, MQ135) */}
      <section aria-labelledby="primary-telemetry-heading">
        <h3 id="primary-telemetry-heading" className="sr-only">
          Primary Telemetry
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Current Temperature */}
          <Card className="p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[#607780] mb-2">
                <span className="type-card-heading text-[#607780] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-[#607780]" />
                  Temperature
                </span>
                <span className="text-[11px] font-mono text-[#8A98A8]">DHT22</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-[28px] font-semibold text-[#19323C] font-mono tabular-nums leading-none">
                  {conditions.temperature.toFixed(1)}
                </span>
                <span className="text-sm font-mono text-[#607780]">°C</span>
              </div>
            </div>
            <div className="mt-4 pt-2.5 border-t border-[#D5E0E4] text-[11px] text-[#607780] flex items-center justify-between">
              <span>Target: 20.0–25.0 °C</span>
              <span className={`${tempAssessment.colorClass} font-mono font-medium`}>
                {tempAssessment.label}
              </span>
            </div>
          </Card>

          {/* 2. Current Humidity */}
          <Card className="p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[#607780] mb-2">
                <span className="type-card-heading text-[#607780] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-[#607780]" />
                  Humidity
                </span>
                <span className="text-[11px] font-mono text-[#8A98A8]">DHT22</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-[28px] font-semibold text-[#19323C] font-mono tabular-nums leading-none">
                  {conditions.humidity.toFixed(1)}
                </span>
                <span className="text-sm font-mono text-[#607780]">% RH</span>
              </div>
            </div>
            <div className="mt-4 pt-2.5 border-t border-[#D5E0E4] text-[11px] text-[#607780] flex items-center justify-between">
              <span>Target: 30.0–60.0 % RH</span>
              <span className={`${humAssessment.colorClass} font-mono font-medium`}>
                {humAssessment.label}
              </span>
            </div>
          </Card>

          {/* 3. Current Air Quality Level */}
          <Card className="p-4 flex flex-col justify-between border-l-4 border-l-[#C47A13]">
            <div>
              <div className="flex items-center justify-between text-[#607780] mb-2">
                <span className="type-card-heading text-[#607780] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#607780]" />
                  Air Quality Level
                </span>
                <span className="text-[11px] font-mono text-[#8A98A8]">Current</span>
              </div>
              <div className="mt-1">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-[5px] text-base font-bold border font-mono ${currentLevelStyle.bg} ${currentLevelStyle.text} ${currentLevelStyle.border}`}
                >
                  {currentLevelStyle.label}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-2.5 border-t border-[#D5E0E4] text-[11px] text-[#607780] flex items-center justify-between">
              <span>Threshold Range</span>
              <span className="font-mono text-[#C47A13]">250–350 units</span>
            </div>
          </Card>

          {/* 4. MQ135 Reading */}
          <Card className="p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[#607780] mb-2">
                <span className="type-card-heading text-[#607780] uppercase tracking-wider text-[11px]">
                  MQ135 Reading
                </span>
                <span className="text-[11px] font-mono text-[#8A98A8]">Gas Sensor</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-[28px] font-semibold text-[#19323C] font-mono tabular-nums leading-none">
                  {Math.round(conditions.mq135)}
                </span>
                <span className="text-xs font-mono text-[#607780]">sensor units</span>
              </div>
            </div>
            <div className="mt-4 pt-2.5 border-t border-[#D5E0E4] text-[11px] text-[#8A98A8]">
              Raw ADC sensor units (uncalibrated)
            </div>
          </Card>
        </div>
      </section>

      {/* 5. FORECAST & 6. ENVIRONMENTAL CONTEXT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 5. Air Quality Forecast (Current → +10 minutes) */}
        <div className="lg:col-span-2">
          <Card className="p-5 h-full flex flex-col justify-between" elevated={true}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="type-card-heading text-[#19323C]">
                    Air Quality Forecast
                  </h3>
                  <p className="type-metadata text-[#607780] mt-0.5">
                    Model inference projection over next 10-minute horizon
                  </p>
                </div>
                <span className="text-[11px] font-mono text-[#176B87] bg-[#E8F2F6] px-2.5 py-1 rounded-[6px] border border-[#D5E0E4]">
                  Model: {prediction.modelUsed}
                </span>
              </div>

              {/* Current → Predicted Level Step Visualization */}
              <div className="p-4 rounded-[8px] bg-[#E8F0F2] border border-[#D5E0E4] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="text-center sm:text-left">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-[#8A98A8] block">
                      Current
                    </span>
                    <span
                      className={`inline-block mt-1 px-3 py-1 rounded-[5px] text-sm font-bold border font-mono ${currentLevelStyle.bg} ${currentLevelStyle.text} ${currentLevelStyle.border}`}
                    >
                      {currentLevelStyle.label}
                    </span>
                  </div>

                  <ArrowRight className="w-5 h-5 text-[#8A98A8] shrink-0 mx-2 hidden sm:block" />

                  <div className="text-center sm:text-left">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-[#8A98A8] block">
                      +10m Predicted Air-Quality Level
                    </span>
                    <span
                      className={`inline-block mt-1 px-3 py-1 rounded-[5px] text-sm font-bold border font-mono ${predictedLevelStyle.bg} ${predictedLevelStyle.text} ${predictedLevelStyle.border}`}
                    >
                      {predictedLevelStyle.label}
                    </span>
                  </div>
                </div>

                {/* Horizon, Confidence, Trend, Model Indicators */}
                <div className="border-t sm:border-t-0 sm:border-l border-[#D5E0E4] pt-2 sm:pt-0 sm:pl-4 text-xs font-mono space-y-1.5">
                  <div className="flex items-center justify-between sm:justify-start gap-4">
                    <span className="text-[#8A98A8]">Forecast Horizon:</span>
                    <span className="text-[#19323C] font-semibold">+10 minutes</span>
                  </div>
                  <div className="flex items-center justify-between sm:justify-start gap-4">
                    <span className="text-[#8A98A8]">Confidence:</span>
                    <span className="text-[#19323C] font-semibold">{forecastConfidence}%</span>
                  </div>
                  <div className="flex items-center justify-between sm:justify-start gap-4">
                    <span className="text-[#8A98A8]">Trend:</span>
                    <span className={`font-semibold ${prediction.trend === 'Worsening' || prediction.trend === 'Increasing' ? 'text-[#C94343]' : 'text-[#27845A]'}`}>
                      {prediction.trend}
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:justify-start gap-4">
                    <span className="text-[#8A98A8]">Model Used:</span>
                    <span className="text-[#176B87] font-semibold">{prediction.modelUsed}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Concise Recommendation based on prediction */}
            <div className="mt-4 pt-3 border-t border-[#D5E0E4] flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#C47A13] shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-[#19323C]">Recommendation: </span>
                <span className="text-[#607780]">{prediction.recommendation}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* 6. Environmental Context */}
        <div className="lg:col-span-1">
          <Card className="p-5 h-full flex flex-col justify-between">
            <div>
              <h3 className="type-card-heading text-[#19323C]">
                Environmental Context
              </h3>
              <p className="type-metadata text-[#607780] mt-0.5">
                Physical room operational parameters
              </p>

              <div className="space-y-3 mt-4">
                {/* Occupancy */}
                <div className="p-3 rounded-[8px] bg-[#E8F0F2] border border-[#D5E0E4]">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#607780] flex items-center gap-1.5 font-medium">
                      <Users className="w-3.5 h-3.5 text-[#607780]" />
                      Occupancy
                    </span>
                    <span className="text-[10px] font-mono text-[#8A98A8]">
                      {conditions.occupancyInferred ? (
                        <span className="text-[#176B87] font-medium">Inferred</span>
                      ) : (
                        <span>Reported</span>
                      )}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[#19323C] font-mono">
                    {conditions.occupancy}
                  </div>
                </div>

                {/* Ventilation */}
                <div className="p-3 rounded-[8px] bg-[#E8F0F2] border border-[#D5E0E4]">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#607780] flex items-center gap-1.5 font-medium">
                      <Wind className="w-3.5 h-3.5 text-[#607780]" />
                      Ventilation
                    </span>
                    <span className="text-[10px] font-mono text-[#8A98A8]">
                      {conditions.ventilationInferred ? (
                        <span className="text-[#176B87] font-medium">Inferred</span>
                      ) : (
                        <span>Reported</span>
                      )}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[#19323C] font-mono">
                    {conditions.ventilation}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#D5E0E4] text-[11px] text-[#8A98A8] font-mono">
              Sensors: DHT22 (Temp/RH) · MQ135 (Air)
            </div>
          </Card>
        </div>
      </div>

      {/* 7. RECENT SENSOR TREND (CHART) */}
      <section aria-labelledby="sensor-trend-heading">
        <Card className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-[#D5E0E4]">
            <div>
              <h3 id="sensor-trend-heading" className="type-card-heading text-[#19323C]">
                Recent Sensor Trend
              </h3>
              <p className="type-metadata text-[#607780] mt-0.5">
                Continuous telemetry plotted from historical data buffer ({history.length} samples)
              </p>
            </div>

            <div className="text-xs font-mono text-[#8A98A8]">
              Buffer window: 24 Hours
            </div>
          </div>

          <RecentTrendChart data={history} />
        </Card>
      </section>
    </div>
  );
}
