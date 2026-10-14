import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { RecentTrendChart } from '../components/dashboard/RecentTrendChart';
import { DataNotice, ApiErrorNotice, HistoryMetaNote } from '../components/common/DataNotice';
import {
  getCurrentConditions,
  getHistoricalReadings,
  getPrediction,
  getDecisionSupport,
  isApiError,
  IS_MOCK_MODE,
} from '../services/api';
import {
  CurrentConditions,
  HistoryResult,
  AirQualityPrediction,
  DecisionSupport,
  AirQualityLevel,
} from '../types';
import {
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Users,
  Wind,
  Thermometer,
  Droplets,
  Activity,
  Fan,
} from 'lucide-react';

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

// Mock-mode only: styling for the demo forecast levels.
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

const formatRaw = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatOccupancy = (occupancy: CurrentConditions['occupancy']): string =>
  typeof occupancy === 'number'
    ? `${occupancy} ${occupancy === 1 ? 'person' : 'people'}`
    : occupancy;

const formatRecordedAt = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export function DashboardView() {
  const [conditions, setConditions] = useState<CurrentConditions | null>(null);
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [prediction, setPrediction] = useState<AirQualityPrediction | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [decisionSupport, setDecisionSupport] = useState<DecisionSupport | null>(null);


  // Fetch telemetry from API layer
  const loadDashboardData = useCallback(async () => {
    setIsRefreshing(true);
    const [cur, hist, pred, assessment] = await Promise.allSettled([
      getCurrentConditions(),
      getHistoricalReadings('24h'),
      getPrediction(),
      getDecisionSupport(),
    ]);

    if (hist.status === 'fulfilled') {
      setHistory(hist.value);
      setHistoryError(null);
    } else {
      console.error('Failed to load history:', hist.reason);
      setHistory(null);
      setHistoryError(hist.reason);
    }

    setPrediction(pred.status === 'fulfilled' ? pred.value : null);
    setDecisionSupport(assessment.status === 'fulfilled' ? assessment.value : null,
    );

    if (cur.status === 'fulfilled') {
      setConditions(cur.value);
      setLoadError(null);
      setLoadState('ready');
      setSecondsAgo(0);
    } else {
      setConditions(null);
      setLoadError(cur.reason);
      if (isApiError(cur.reason) && cur.reason.kind === 'empty') {
        setLoadState('empty');
      } else {
        console.error('Failed to load telemetry:', cur.reason);
        setLoadState('error');
      }
    }
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Seconds counter since last fetch
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (loadState === 'loading') {
    return (
      <div className="py-24 text-center">
        <p className="type-body text-[#607780] font-mono">Loading telemetry stream...</p>
      </div>
    );
  }

  const subtitle = IS_MOCK_MODE
    ? 'Demo data generated in the browser. It is not sensor data.'
    : conditions
    ? `Latest stored reading${conditions.location ? ` for ${conditions.location}` : ''}, recorded ${formatRecordedAt(conditions.timestamp)}.`
    : 'Latest stored sensor readings.';

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#D5E0E4]">
        <div>
          <h2 className="type-page-title text-[#19323C]">Dashboard</h2>
          <p className="type-body text-[#607780] mt-0.5">{subtitle}</p>
        </div>

        {/* Telemetry Refresh Status */}
        <div className="flex items-center gap-3">
          {loadState === 'ready' && (
            <div className="flex items-center gap-2 text-xs font-mono text-[#607780] bg-[#E8F0F2] px-3 py-1.5 rounded-[8px] border border-[#D5E0E4]">
              <span className="w-2 h-2 rounded-full bg-[#27845A]" />
              <span>Fetched {secondsAgo}s ago</span>
            </div>
          )}

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

      {loadState === 'ready' && conditions ? (
        <DashboardContent
          conditions={conditions}
          history={history}
          historyError={historyError}
          prediction={prediction}
          onRetry={loadDashboardData}
          decisionSupport={decisionSupport}
        />
      ) : (
        <ApiErrorNotice error={loadError} onRetry={loadDashboardData} />
      )}
    </div>
  );
}

interface DashboardContentProps {
  conditions: CurrentConditions;
  history: HistoryResult | null;
  historyError: unknown;
  prediction: AirQualityPrediction | null;
  decisionSupport: DecisionSupport | null;
  onRetry: () => void;
}

function DashboardContent({
  conditions,
  history,
  historyError,
  prediction,
  decisionSupport,
  onRetry,
}: DashboardContentProps) {
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

  // Mock-mode demo forecast values (prediction is always null in real mode)
  const currentLevelStyle = prediction ? levelStyleMap[prediction.currentLevel] : null;
  const tenMinuteStep = prediction?.forecast.find((f) => f.minutesAhead === 10);
  const predictedTenMinuteLevel: AirQualityLevel = tenMinuteStep
    ? tenMinuteStep.airQuality
    : prediction?.predictedAirQuality || 'High';
  const predictedLevelStyle = levelStyleMap[predictedTenMinuteLevel];
  const forecastConfidence = prediction
    ? Math.round((tenMinuteStep?.confidence ?? prediction.confidence) * 100)
    : 0;

  return (
    <>

      {decisionSupport && (
        <section aria-labelledby="assessment-heading">
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h3
                  id="assessment-heading"
                  className="type-card-heading text-[#19323C]"
                >
                  Indoor Comfort & Health-Aware Assessment
                </h3>
                <p className="type-metadata text-[#607780] mt-1">
                  Based on stored readings; this is a project assessment, not a
                  medical diagnosis.
                </p>
              </div>

              <span className="text-xs font-mono px-3 py-1.5 rounded-md border border-[#E7C98A] bg-[#FFF8E8] text-[#C47A13]">
                {decisionSupport.assessmentStatus.replaceAll('_', ' ').toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
              <div className="rounded-lg border border-[#D5E0E4] bg-[#E8F0F2] p-4">
                <p className="text-xs text-[#607780] uppercase tracking-wider">
                  Indoor comfort score
                </p>
                <p className="text-3xl font-semibold font-mono text-[#19323C] mt-2">
                  {decisionSupport.indoorComfortIndex == null
                    ? '—'
                    : `${decisionSupport.indoorComfortIndex}/100`}
                </p>
                <p className="text-sm text-[#607780] mt-1">
                  {decisionSupport.comfortCategory.replaceAll('_', ' ')}
                </p>
                {decisionSupport.comfortFactors.map((factor, index) => (
                  <p key={index} className="text-sm text-[#607780] mt-2">
                    {factor}
                  </p>
                ))}
              </div>

              <div className="rounded-lg border border-[#D5E0E4] p-4">
                <p className="text-xs text-[#607780] uppercase tracking-wider">
                  Respiratory risk
                </p>
                <p className="text-base font-semibold text-[#19323C] mt-2">
                  Not assessable with current sensors
                </p>
                <p className="text-sm text-[#607780] mt-2">
                  The uncalibrated MQ135 reading cannot establish respiratory risk,
                  pollutant concentration, or AQI.
                </p>
              </div>
            </div>

            {decisionSupport.alerts.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold text-[#19323C] mb-2">
                  Alerts
                </h4>
                <div className="space-y-2">
                  {decisionSupport.alerts.map((alert) => (
                    <div
                      key={alert.code}
                      className="rounded-lg border border-[#D5E0E4] p-3"
                    >
                      <p className="text-sm font-semibold text-[#19323C]">
                        {alert.title}
                      </p>
                      <p className="text-sm text-[#607780] mt-1">
                        {alert.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {decisionSupport.recommendations.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold text-[#19323C] mb-2">
                  Recommendations
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-sm text-[#607780]">
                  {decisionSupport.recommendations.map((recommendation, index) => (
                    <li key={index}>{recommendation}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-[#8A98A8] mt-5 pt-3 border-t border-[#D5E0E4]">
              The comfort score is a project-defined heuristic, not a validated
              medical or standards-compliant index.
            </p>
          </Card>
        </section>
      )}


      {/* 1. PRIMARY TELEMETRY CARDS (4 CARDS: Temperature, Humidity, Data Source, MQ135) */}
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
                <span className="text-[11px] font-mono text-[#8A98A8]">DS18B20</span>
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
                <span className="text-[11px] font-mono text-[#8A98A8]">DHT11</span>
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

          {/* 3. Data Source (which stored experiment this reading belongs to) */}
          <Card className="p-4 flex flex-col justify-between border-l-4 border-l-[#176B87]">
            <div>
              <div className="flex items-center justify-between text-[#607780] mb-2">
                <span className="type-card-heading text-[#607780] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#607780]" />
                  Data Source
                </span>
                <span className="text-[11px] font-mono text-[#8A98A8]">Latest</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#19323C] font-mono break-all">
                  {conditions.experimentId ?? 'Browser-generated demo'}
                </span>
                {conditions.isSynthetic && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-[#C47A13] bg-[#FFF8E8] border-[#E7C98A]">
                    SYNTHETIC
                  </span>
                )}
                {IS_MOCK_MODE && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-[#C47A13] bg-[#FFF8E8] border-[#E7C98A]">
                    MOCK
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 pt-2.5 border-t border-[#D5E0E4] text-[11px] text-[#607780] flex items-center justify-between">
              <span>Location</span>
              <span className="font-mono text-[#19323C]">{conditions.location ?? '—'}</span>
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
                  {formatRaw(conditions.mq135)}
                </span>
                <span className="text-xs font-mono text-[#607780]">raw units</span>
              </div>
            </div>
            <div className="mt-4 pt-2.5 border-t border-[#D5E0E4] text-[11px] text-[#8A98A8]">
              Raw sensor value (uncalibrated; not ppm, CO₂ or AQI)
            </div>
          </Card>
        </div>
      </section>

      {/* 5. FORECAST & 6. ENVIRONMENTAL CONTEXT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 5. Forecast (mock mode: demo forecast; real mode: unavailable) */}
        <div className="lg:col-span-2">
          {prediction && currentLevelStyle ? (
            <Card className="p-5 h-full flex flex-col justify-between" elevated={true}>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="type-card-heading text-[#19323C]">
                      Air Quality Forecast
                    </h3>
                    <p className="type-metadata text-[#607780] mt-0.5">
                      Demo projection over next 10-minute horizon (mock data)
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-[#C47A13] bg-[#FFF8E8] px-2.5 py-1 rounded-[6px] border border-[#E7C98A] font-semibold">
                    DEMO FORECAST
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
          ) : (
            <DataNotice variant="unavailable" title="Prediction unavailable" className="h-full">
              No prediction model has been trained and evaluated on held-out real sensor data yet, so no
              forecast is shown. The MQ135 value above is a raw, uncalibrated sensor reading.
            </DataNotice>
          )}
        </div>

        {/* 6. Environmental Context */}
        <div className="lg:col-span-1">
          <Card className="p-5 h-full flex flex-col justify-between">
            <div>
              <h3 className="type-card-heading text-[#19323C]">
                Environmental Context
              </h3>
              <p className="type-metadata text-[#607780] mt-0.5">
                Room conditions as recorded with this reading
              </p>

              <div className="space-y-3 mt-4">
                {/* Occupancy */}
                <div className="p-3 rounded-[8px] bg-[#E8F0F2] border border-[#D5E0E4]">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#607780] flex items-center gap-1.5 font-medium">
                      <Users className="w-3.5 h-3.5 text-[#607780]" />
                      Occupancy
                    </span>
                    <span className="text-[10px] font-mono text-[#8A98A8]">Recorded</span>
                  </div>
                  <div className="text-sm font-semibold text-[#19323C] font-mono">
                    {formatOccupancy(conditions.occupancy)}
                  </div>
                </div>

                {/* Ventilation */}
                <div className="p-3 rounded-[8px] bg-[#E8F0F2] border border-[#D5E0E4]">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#607780] flex items-center gap-1.5 font-medium">
                      <Wind className="w-3.5 h-3.5 text-[#607780]" />
                      Ventilation
                    </span>
                    <span className="text-[10px] font-mono text-[#8A98A8]">Recorded</span>
                  </div>
                  <div className="text-sm font-semibold text-[#19323C] font-mono capitalize">
                    {conditions.ventilation}
                  </div>
                </div>

                {/* Fan */}
                {conditions.fan && (
                  <div className="p-3 rounded-[8px] bg-[#E8F0F2] border border-[#D5E0E4]">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[#607780] flex items-center gap-1.5 font-medium">
                        <Fan className="w-3.5 h-3.5 text-[#607780]" />
                        Fan
                      </span>
                      <span className="text-[10px] font-mono text-[#8A98A8]">Recorded</span>
                    </div>
                    <div className="text-sm font-semibold text-[#19323C] font-mono capitalize">
                      {conditions.fan}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#D5E0E4] text-[11px] text-[#8A98A8] font-mono">
              Sensors: DS18B20 (Temp) · DHT11 (RH) · MQ135 (gas, raw)
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
                {history
                  ? `Stored readings, oldest first (${history.readings.length} plotted)`
                  : 'Stored readings, oldest first'}
              </p>
              <HistoryMetaNote meta={history?.meta} className="mt-1" />
            </div>

            <div className="text-xs font-mono text-[#8A98A8]">
              {IS_MOCK_MODE ? 'Buffer window: 24 Hours (mock)' : 'Window: last 24 h of stored data'}
            </div>
          </div>

          {historyError ? (
            <ApiErrorNotice error={historyError} onRetry={onRetry} />
          ) : history && history.readings.length === 0 ? (
            <DataNotice variant="empty" title="No readings in this window">
              No stored readings fall inside the selected window.
            </DataNotice>
          ) : (
            <RecentTrendChart data={history?.readings ?? []} />
          )}
        </Card>
      </section>
    </>
  );
}