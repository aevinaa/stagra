import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { RecentTrendChart } from '../components/dashboard/RecentTrendChart';
import { DataNotice, ApiErrorNotice, HistoryMetaNote } from '../components/common/DataNotice';
import {
  getCurrentConditions,
  getHistoricalReadings,
  getPrediction,
  getDecisionSupport,
  getRawSensorForecast,
  isApiError,
  IS_MOCK_MODE,
} from '../services/api';
import type { RawSensorForecast } from '../services/api';
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
  Thermometer,
  Droplets,
  Activity,
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

const formatRecordedAt = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

function ForecastInterpretation() {
  return (
    <div className="mt-4 border-t border-[#D5E0E4] pt-4">
      <div className="mb-3">
        <h4 className="type-card-heading text-[#19323C]">
          What Does the MQ135 Forecast Mean?
        </h4>
        <p className="type-metadata mt-1 text-[#607780]">
          How to interpret the estimated raw sensor response
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[8px] border border-[#D5E0E4] bg-[#E8F0F2] p-3">
          <p className="font-semibold text-[#19323C]">
            If the estimate increases
          </p>
          <p className="mt-1 text-sm text-[#607780]">
            The sensor is expected to produce a higher raw response than its
            recent level. This is a change in the sensor signal, not a direct
            measurement of pollution.
          </p>
        </div>

        <div className="rounded-[8px] border border-[#D5E0E4] bg-[#E8F0F2] p-3">
          <p className="font-semibold text-[#19323C]">
            If the estimate decreases
          </p>
          <p className="mt-1 text-sm text-[#607780]">
            The sensor response is expected to fall. That does not by itself
            prove that the room is safer or that a particular pollutant has
            decreased.
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-[#607780]">
        The persistence estimate assumes the next reading will remain near the
        latest value. The linear-trend estimate extends the recent trend forward;
        sudden changes can make either estimate inaccurate.
      </p>

      <p className="mt-3 border-t border-[#D5E0E4] pt-3 text-xs text-[#8A98A8]">
        MQ135 raw readings are uncalibrated sensor units. They do not identify a
        specific gas and are not equivalent to ppm, CO₂ concentration, official
        AQI, or a validated health-risk measure.
      </p>
    </div>
  );
}

export function DashboardView() {
  const [conditions, setConditions] = useState<CurrentConditions | null>(null);
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [prediction, setPrediction] = useState<AirQualityPrediction | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [decisionSupport, setDecisionSupport] =
    useState<DecisionSupport | null>(null);
  const [rawForecast, setRawForecast] =
    useState<RawSensorForecast | null>(null);

  // Fetch telemetry from API layer.
  const loadDashboardData = useCallback(async () => {
    setIsRefreshing(true);

    const [cur, hist, pred, assessment, forecast] = await Promise.allSettled([
      getCurrentConditions(),
      getHistoricalReadings('24h'),
      getPrediction(),
      getDecisionSupport(),
      getRawSensorForecast(),
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
    setDecisionSupport(
      assessment.status === 'fulfilled' ? assessment.value : null
    );
    setRawForecast(forecast.status === 'fulfilled' ? forecast.value : null);

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

  // Seconds counter since last fetch.
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (loadState === 'loading') {
    return (
      <div className="py-24 text-center">
        <p className="type-body font-mono text-[#607780]">
          Loading telemetry stream...
        </p>
      </div>
    );
  }

  const subtitle = IS_MOCK_MODE
    ? 'Demo data generated in the browser. It is not sensor data.'
    : conditions
      ? `Latest stored reading${
          conditions.location ? ` for ${conditions.location}` : ''
        }, recorded ${formatRecordedAt(conditions.timestamp)}.`
      : 'Latest stored sensor readings.';

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-3 border-b border-[#D5E0E4] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="type-page-title text-[#19323C]">Dashboard</h2>
          <p className="type-body mt-0.5 text-[#607780]">{subtitle}</p>
        </div>

        {/* Telemetry Refresh Status */}
        <div className="flex items-center gap-3">
          {loadState === 'ready' && (
            <div className="flex items-center gap-2 rounded-[8px] border border-[#D5E0E4] bg-[#E8F0F2] px-3 py-1.5 text-xs font-mono text-[#607780]">
              <span className="h-2 w-2 rounded-full bg-[#27845A]" />
              <span>Fetched {secondsAgo}s ago</span>
            </div>
          )}

          <button
            onClick={loadDashboardData}
            disabled={isRefreshing}
            className="cursor-pointer rounded-[8px] border border-[#D5E0E4] bg-[#FAFCFC] p-1.5 text-[#607780] transition-colors hover:bg-[#E8F0F2] hover:text-[#19323C] disabled:opacity-50"
            title="Refresh telemetry"
            aria-label="Refresh telemetry"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                isRefreshing ? 'animate-spin text-[#176B87]' : ''
              }`}
            />
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
          rawForecast={rawForecast}
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
  rawForecast: RawSensorForecast | null;
  onRetry: () => void;
}

function DashboardContent({
  conditions,
  history,
  historyError,
  prediction,
  decisionSupport,
  rawForecast,
  onRetry,
}: DashboardContentProps) {
  // Temperature target: 20.0–25.0 °C.
  const tempAssessment =
    conditions.temperature < 20.0
      ? { label: 'Below Target', colorClass: 'text-[#176B87]' }
      : conditions.temperature <= 25.0
        ? { label: 'Nominal', colorClass: 'text-[#27845A]' }
        : { label: 'Above Target', colorClass: 'text-[#C47A13]' };

  // Humidity target: 30.0–60.0 % RH.
  const humAssessment =
    conditions.humidity < 30.0
      ? { label: 'Below Target', colorClass: 'text-[#C47A13]' }
      : conditions.humidity <= 60.0
        ? { label: 'Nominal', colorClass: 'text-[#27845A]' }
        : { label: 'Above Target', colorClass: 'text-[#C47A13]' };

  // Mock-mode demo forecast values.
  const currentLevelStyle = prediction
    ? levelStyleMap[prediction.currentLevel]
    : null;

  const tenMinuteStep = prediction?.forecast.find(
    (f) => f.minutesAhead === 10
  );

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3
                  id="assessment-heading"
                  className="type-card-heading text-[#19323C]"
                >
                  Indoor Comfort & Health-Aware Assessment
                </h3>
                <p className="type-metadata mt-1 text-[#607780]">
                  Based on stored readings; this is a project assessment, not a
                  medical diagnosis.
                </p>
              </div>

              <span className="rounded-md border border-[#E7C98A] bg-[#FFF8E8] px-3 py-1.5 text-xs font-mono text-[#C47A13]">
                {decisionSupport.assessmentStatus
                  .replaceAll('_', ' ')
                  .toUpperCase()}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[#D5E0E4] bg-[#E8F0F2] p-4">
                <p className="text-xs uppercase tracking-wider text-[#607780]">
                  Indoor comfort score
                </p>
                <p className="mt-2 text-3xl font-semibold font-mono text-[#19323C]">
                  {decisionSupport.indoorComfortIndex == null
                    ? '—'
                    : `${decisionSupport.indoorComfortIndex}/100`}
                </p>
                <p className="mt-1 text-sm text-[#607780]">
                  {decisionSupport.comfortCategory.replaceAll('_', ' ')}
                </p>

                {decisionSupport.comfortFactors.map((factor, index) => (
                  <p key={index} className="mt-2 text-sm text-[#607780]">
                    {factor}
                  </p>
                ))}
              </div>

              <div className="rounded-lg border border-[#D5E0E4] p-4">
                <p className="text-xs uppercase tracking-wider text-[#607780]">
                  Respiratory risk
                </p>
                <p className="mt-2 text-base font-semibold text-[#19323C]">
                  Not assessable with current sensors
                </p>
                <p className="mt-2 text-sm text-[#607780]">
                  The uncalibrated MQ135 reading cannot establish respiratory
                  risk, pollutant concentration, or AQI.
                </p>
              </div>
            </div>

            {decisionSupport.alerts.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 text-sm font-semibold text-[#19323C]">
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
                      <p className="mt-1 text-sm text-[#607780]">
                        {alert.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {decisionSupport.recommendations.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 text-sm font-semibold text-[#19323C]">
                  Recommendations
                </h4>

                <ul className="list-disc space-y-1 pl-5 text-sm text-[#607780]">
                  {decisionSupport.recommendations.map(
                    (recommendation, index) => (
                      <li key={index}>{recommendation}</li>
                    )
                  )}
                </ul>
              </div>
            )}

            <p className="mt-5 border-t border-[#D5E0E4] pt-3 text-xs text-[#8A98A8]">
              The comfort score is a project-defined heuristic, not a validated
              medical or standards-compliant index.
            </p>
          </Card>
        </section>
      )}

      {/* PRIMARY TELEMETRY CARDS */}
      <section aria-labelledby="primary-telemetry-heading">
        <h3 id="primary-telemetry-heading" className="sr-only">
          Primary Telemetry
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Temperature */}
          <Card className="flex flex-col justify-between p-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-[#607780]">
                <span className="type-card-heading flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#607780]">
                  <Thermometer className="h-3.5 w-3.5 text-[#607780]" />
                  Temperature
                </span>
                <span className="text-[11px] font-mono text-[#8A98A8]">
                  DS18B20
                </span>
              </div>

              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[28px] font-semibold leading-none font-mono tabular-nums text-[#19323C]">
                  {conditions.temperature.toFixed(1)}
                </span>
                <span className="text-sm font-mono text-[#607780]">°C</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[#D5E0E4] pt-2.5 text-[11px] text-[#607780]">
              <span>Target: 20.0–25.0 °C</span>
              <span
                className={`${tempAssessment.colorClass} font-mono font-medium`}
              >
                {tempAssessment.label}
              </span>
            </div>
          </Card>

          {/* Humidity */}
          <Card className="flex flex-col justify-between p-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-[#607780]">
                <span className="type-card-heading flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#607780]">
                  <Droplets className="h-3.5 w-3.5 text-[#607780]" />
                  Humidity
                </span>
                <span className="text-[11px] font-mono text-[#8A98A8]">
                  DHT11
                </span>
              </div>

              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[28px] font-semibold leading-none font-mono tabular-nums text-[#19323C]">
                  {conditions.humidity.toFixed(1)}
                </span>
                <span className="text-sm font-mono text-[#607780]">% RH</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[#D5E0E4] pt-2.5 text-[11px] text-[#607780]">
              <span>Target: 30.0–60.0 % RH</span>
              <span
                className={`${humAssessment.colorClass} font-mono font-medium`}
              >
                {humAssessment.label}
              </span>
            </div>
          </Card>

          {/* Data Source */}
          <Card className="flex flex-col justify-between border-l-4 border-l-[#176B87] p-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-[#607780]">
                <span className="type-card-heading flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#607780]">
                  <Activity className="h-3.5 w-3.5 text-[#607780]" />
                  Data Source
                </span>
                <span className="text-[11px] font-mono text-[#8A98A8]">
                  Latest
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="break-all text-sm font-semibold font-mono text-[#19323C]">
                  {conditions.experimentId ?? 'Browser-generated demo'}
                </span>

                {conditions.isSynthetic && (
                  <span className="rounded border border-[#E7C98A] bg-[#FFF8E8] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#C47A13]">
                    SYNTHETIC
                  </span>
                )}

                {IS_MOCK_MODE && (
                  <span className="rounded border border-[#E7C98A] bg-[#FFF8E8] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#C47A13]">
                    MOCK
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[#D5E0E4] pt-2.5 text-[11px] text-[#607780]">
              <span>Location</span>
              <span className="font-mono text-[#19323C]">
                {conditions.location ?? '—'}
              </span>
            </div>
          </Card>

          {/* MQ135 Reading */}
          <Card className="flex flex-col justify-between p-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-[#607780]">
                <span className="type-card-heading text-[11px] uppercase tracking-wider text-[#607780]">
                  MQ135 Reading
                </span>
                <span className="text-[11px] font-mono text-[#8A98A8]">
                  Gas Sensor
                </span>
              </div>

              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[28px] font-semibold leading-none font-mono tabular-nums text-[#19323C]">
                  {formatRaw(conditions.mq135)}
                </span>
                <span className="text-xs font-mono text-[#607780]">
                  raw units
                </span>
              </div>
            </div>

            <div className="mt-4 border-t border-[#D5E0E4] pt-2.5 text-[11px] text-[#8A98A8]">
              Raw sensor value (uncalibrated; not ppm, CO₂ or AQI)
            </div>
          </Card>
        </div>
      </section>

      {/* FORECAST WITH EXPLANATORY TEXT INSIDE THE SAME CARD */}
      <div className="space-y-4">
        <div>
          {prediction && currentLevelStyle ? (
            <Card className="flex flex-col p-5" elevated={true}>
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="type-card-heading text-[#19323C]">
                      Air Quality Forecast
                    </h3>
                    <p className="type-metadata mt-0.5 text-[#607780]">
                      Demo projection over next 10-minute horizon (mock data)
                    </p>
                  </div>

                  <span className="rounded-[6px] border border-[#E7C98A] bg-[#FFF8E8] px-2.5 py-1 text-[11px] font-mono font-semibold text-[#C47A13]">
                    DEMO FORECAST
                  </span>
                </div>

                {/* Current to predicted level */}
                <div className="flex flex-col justify-between gap-4 rounded-[8px] border border-[#D5E0E4] bg-[#E8F0F2] p-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <div className="text-center sm:text-left">
                      <span className="block text-[10px] uppercase tracking-wider font-mono text-[#8A98A8]">
                        Current
                      </span>
                      <span
                        className={`mt-1 inline-block rounded-[5px] border px-3 py-1 text-sm font-bold font-mono ${currentLevelStyle.bg} ${currentLevelStyle.text} ${currentLevelStyle.border}`}
                      >
                        {currentLevelStyle.label}
                      </span>
                    </div>

                    <ArrowRight className="mx-2 hidden h-5 w-5 shrink-0 text-[#8A98A8] sm:block" />

                    <div className="text-center sm:text-left">
                      <span className="block text-[10px] uppercase tracking-wider font-mono text-[#8A98A8]">
                        +10m Predicted Air-Quality Level
                      </span>
                      <span
                        className={`mt-1 inline-block rounded-[5px] border px-3 py-1 text-sm font-bold font-mono ${predictedLevelStyle.bg} ${predictedLevelStyle.text} ${predictedLevelStyle.border}`}
                      >
                        {predictedLevelStyle.label}
                      </span>
                    </div>
                  </div>

                  {/* Forecast metadata */}
                  <div className="space-y-1.5 border-t border-[#D5E0E4] pt-2 text-xs font-mono sm:border-l sm:border-t-0 sm:py-0 sm:pl-4">
                    <div className="flex items-center justify-between gap-4 sm:justify-start">
                      <span className="text-[#8A98A8]">Forecast Horizon:</span>
                      <span className="font-semibold text-[#19323C]">
                        +10 minutes
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-start">
                      <span className="text-[#8A98A8]">Confidence:</span>
                      <span className="font-semibold text-[#19323C]">
                        {forecastConfidence}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-start">
                      <span className="text-[#8A98A8]">Trend:</span>
                      <span
                        className={`font-semibold ${
                          prediction.trend === 'Worsening' ||
                          prediction.trend === 'Increasing'
                            ? 'text-[#C94343]'
                            : 'text-[#27845A]'
                        }`}
                      >
                        {prediction.trend}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-start">
                      <span className="text-[#8A98A8]">Model Used:</span>
                      <span className="font-semibold text-[#176B87]">
                        {prediction.modelUsed}
                      </span>
                    </div>
                  </div>
                </div>

                <ForecastInterpretation />
              </div>

              {/* Recommendation */}
              <div className="mt-4 flex items-start gap-2.5 border-t border-[#D5E0E4] pt-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#C47A13]" />
                <div className="text-xs">
                  <span className="font-semibold text-[#19323C]">
                    Recommendation:{' '}
                  </span>
                  <span className="text-[#607780]">
                    {prediction.recommendation}
                  </span>
                </div>
              </div>
            </Card>
          ) : rawForecast &&
            (rawForecast.status === 'ok' || rawForecast.status === 'stale') &&
            (typeof rawForecast.persistence_forecast === 'number' ||
              typeof rawForecast.linear_trend_forecast === 'number') ? (
            <Card className="flex flex-col p-5">
              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="type-card-heading text-[#19323C]">
                      Real MQ135 Sensor Forecast
                    </h3>
                    <p className="type-metadata mt-1 text-[#607780]">
                      {rawForecast.forecast_horizon_seconds ?? 60}-second forecast · raw sensor units
                    </p>
                  </div>

                  <span
                    className={`self-start rounded-[6px] border px-2.5 py-1 text-[11px] font-mono font-semibold ${
                      rawForecast.status === 'stale'
                        ? 'border-[#E7C98A] bg-[#FFF8E8] text-[#C47A13]'
                        : 'border-[#D5E0E4] bg-[#EEF8F2] text-[#27845A]'
                    }`}
                  >
                    {rawForecast.status === 'stale' ? 'STALE DATA' : 'LIVE DATA'}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[8px] border border-[#D5E0E4] bg-[#E8F0F2] p-4">
                    <p className="type-metadata text-[#607780]">
                      Persistence estimate
                    </p>
                    <p className="mt-1 text-2xl font-semibold font-mono text-[#19323C]">
                      {typeof rawForecast.persistence_forecast === 'number'
                        ? formatRaw(rawForecast.persistence_forecast)
                        : '—'}
                    </p>
                  </div>

                  <div className="rounded-[8px] border border-[#D5E0E4] bg-[#E8F0F2] p-4">
                    <p className="type-metadata text-[#607780]">
                      Linear-trend estimate
                    </p>
                    <p className="mt-1 text-2xl font-semibold font-mono text-[#19323C]">
                      {typeof rawForecast.linear_trend_forecast === 'number'
                        ? formatRaw(rawForecast.linear_trend_forecast)
                        : '—'}
                    </p>
                  </div>
                </div>

                <p className="type-metadata mt-4 text-[#607780]">
                  Based on {rawForecast.lookback_readings ?? 'available'} readings
                  from experiment {rawForecast.experiment_id ?? '—'}. Latest
                  reading age:{' '}
                  {typeof rawForecast.data_age_seconds === 'number'
                    ? `${Math.round(rawForecast.data_age_seconds)} seconds`
                    : 'unknown'}.
                </p>

                <ForecastInterpretation />
              </div>

              <p className="mt-4 border-t border-[#D5E0E4] pt-3 text-xs text-[#607780]">
                These estimates forecast the raw MQ135 sensor response, not AQI,
                ppm, or pollutant concentration. The sensor is uncalibrated; this
                is not a validated health-risk prediction.
                {rawForecast.status === 'stale'
                  ? ' The latest reading is stale, so do not treat this as a live forecast.'
                  : ''}
              </p>
            </Card>
          ) : (
            <DataNotice
              variant="unavailable"
              title="Real sensor forecast unavailable"
            >
              {rawForecast?.message ??
                'No usable raw MQ135 forecast is available yet. Check that the backend is running and that enough readings have been stored.'}{' '}
              The MQ135 value is a raw, uncalibrated sensor reading, not AQI or
              pollutant concentration.
            </DataNotice>
          )}
        </div>
      </div>

      {/* RECENT SENSOR TREND */}
      <section aria-labelledby="sensor-trend-heading">
        <Card className="p-5">
          <div className="mb-4 flex flex-col gap-2 border-b border-[#D5E0E4] pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3
                id="sensor-trend-heading"
                className="type-card-heading text-[#19323C]"
              >
                Recent Sensor Trend
              </h3>
              <p className="type-metadata mt-0.5 text-[#607780]">
                {history
                  ? `Stored readings, oldest first (${history.readings.length} plotted)`
                  : 'Stored readings, oldest first'}
              </p>
              <HistoryMetaNote meta={history?.meta} className="mt-1" />
            </div>

            <div className="text-xs font-mono text-[#8A98A8]">
              {IS_MOCK_MODE
                ? 'Buffer window: 24 Hours (mock)'
                : 'Window: last 24 h of stored data'}
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