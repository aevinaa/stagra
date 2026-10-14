
import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { DataNotice, ApiErrorNotice } from '../components/common/DataNotice';
import {
  getCurrentConditions,
  getHistoricalReadings,
  getPrediction,
  getRawSensorForecast,
} from '../services/api';
import type {
  CurrentConditions,
  HistoricalReading,
  AirQualityPrediction,
} from '../types';
import { PredictionTrendChart } from '../components/prediction/PredictionTrendChart';
import { RefreshCw, Activity } from 'lucide-react';
import type { RawSensorForecast } from '../services/api';

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

export function PredictionView() {
  const [conditions, setConditions] = useState<CurrentConditions | null>(null);
  const [prediction, setPrediction] = useState<AirQualityPrediction | null>(null);
  const [history, setHistory] = useState<HistoricalReading[]>([]);
  const [rawForecast, setRawForecast] = useState<RawSensorForecast | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const forecastPromise = getRawSensorForecast().catch((error) => {
        console.error('Raw sensor forecast request failed:', error);
        return null;
      });

      const predictionPromise = getPrediction().catch(() => null);

      const conditionsPromise = getCurrentConditions().catch(() => null);

      const historyPromise = getHistoricalReadings('6h').catch(() => null);

      const [forecast, pred, cur, hist] = await Promise.all([
        forecastPromise,
        predictionPromise,
        conditionsPromise,
        historyPromise,
      ]);

      setRawForecast(forecast);
      setPrediction(pred);
      setConditions(cur);
      setHistory(hist?.readings ?? []);
      setLoadError(null);

      if (cur || forecast || pred) {
        setLoadState('ready');
      } else {
        setLoadState('unavailable');
      }
    } catch (error) {
      console.error('Failed to load prediction page:', error);
      setLoadError(error);
      setLoadState('error');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const formatValue = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value)
      ? value.toFixed(2)
      : '—';

  const ageLabel = (seconds: number | undefined) => {
    if (seconds === undefined || !Number.isFinite(seconds)) return 'Unknown';

    if (seconds < 60) return `${Math.round(seconds)} seconds`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;

    return `${(seconds / 3600).toFixed(1)} hours`;
  };

  const isForecastStale = rawForecast?.status === 'stale';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#D5E0E4]">
        <div>
          <h2 className="type-page-title text-[#19323C]">Prediction</h2>
          <p className="type-body text-[#607780] mt-1">
            Real sensor trend estimates and separately labelled demo predictions.
          </p>
        </div>

        <button
          onClick={() => void loadData()}
          disabled={isRefreshing}
          className="self-start p-2 rounded-lg border border-[#D5E0E4] hover:bg-[#E8F0F2] disabled:opacity-50"
          title="Refresh forecast"
          aria-label="Refresh forecast"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {loadState === 'loading' && (
        <p className="text-sm text-[#607780]">Loading sensor data and forecasts...</p>
      )}

      {loadState === 'error' && (
        <ApiErrorNotice error={loadError} onRetry={() => void loadData()} />
      )}

      {loadState === 'unavailable' && (
        <DataNotice variant="unavailable" title="Sensor forecast unavailable">
          No current sensor reading or forecast could be loaded. Check that the
          backend is running and has stored readings.
        </DataNotice>
      )}

      {/* Real backend forecast: raw MQ135 units, not AQI */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D5E0E4] pb-2">
          <h3 className="text-xs uppercase font-mono tracking-wider font-bold text-[#19323C]">
            Real MQ135 Sensor Forecast
          </h3>

          <span className="text-xs font-mono px-2 py-1 rounded border border-[#D5E0E4] bg-[#E8F2F6] text-[#176B87]">
            Backend forecast
          </span>
        </div>

        {!rawForecast ? (
          <DataNotice variant="unavailable" title="No real forecast available">
            The forecast endpoint did not return usable data. Check the backend
            endpoint and browser console. Demo predictions, if present below,
            are separate from this result.
          </DataNotice>
        ) : (
          <>
            {isForecastStale && (
              <DataNotice variant="unavailable" title="Sensor data is stale">
                The latest stored reading is approximately{' '}
                {ageLabel(rawForecast.data_age_seconds)} old. These forecast
                values describe an estimate based on old data, not current
                environmental conditions.
              </DataNotice>
            )}

            {rawForecast.status === 'no_data' && (
              <DataNotice variant="unavailable" title="No stored sensor data">
                The backend has no sensor readings to forecast from.
              </DataNotice>
            )}

            {rawForecast.status === 'insufficient_history' && (
              <DataNotice variant="unavailable" title="Not enough history">
                More sensor readings are needed to calculate the trend.
              </DataNotice>
            )}

            {rawForecast.status === 'invalid_data' && (
              <DataNotice variant="unavailable" title="Invalid sensor data">
                The backend could not calculate a reliable forecast from the
                available readings.
              </DataNotice>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-xs uppercase font-mono text-[#607780]">
                  Latest MQ135 reading
                </p>
                <p className="text-2xl font-mono font-bold text-[#19323C] mt-2">
                  {formatValue(conditions?.mq135)}
                </p>
                <p className="text-xs text-[#607780] mt-2">
                  Raw sensor units · uncalibrated
                </p>
              </Card>

              <Card className="p-4">
                <p className="text-xs uppercase font-mono text-[#607780]">
                  Persistence estimate
                </p>
                <p className="text-2xl font-mono font-bold text-[#19323C] mt-2">
                  {formatValue(rawForecast.persistence_forecast)}
                </p>
                <p className="text-xs text-[#607780] mt-2">
                  Assumes the reading stays near its latest value
                </p>
              </Card>

              <Card className="p-4">
                <p className="text-xs uppercase font-mono text-[#607780]">
                  Linear trend estimate
                </p>
                <p className="text-2xl font-mono font-bold text-[#19323C] mt-2">
                  {formatValue(rawForecast.linear_trend_forecast)}
                </p>
                <p className="text-xs text-[#607780] mt-2">
                  Trend-based estimate in raw sensor units
                </p>
              </Card>
            </div>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-[#176B87]" />
                <h4 className="font-semibold text-[#19323C]">
                  Forecast metadata
                </h4>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[#607780]">Status</dt>
                  <dd className="font-mono font-semibold text-[#19323C]">
                    {rawForecast.status}
                  </dd>
                </div>

                <div>
                  <dt className="text-[#607780]">Experiment</dt>
                  <dd className="font-mono text-[#19323C]">
                    {rawForecast.experiment_id ?? '—'}
                  </dd>
                </div>

                <div>
                  <dt className="text-[#607780]">Data age</dt>
                  <dd className="font-mono text-[#19323C]">
                    {ageLabel(rawForecast.data_age_seconds)}
                  </dd>
                </div>

                <div>
                  <dt className="text-[#607780]">Forecast horizon</dt>
                  <dd className="font-mono text-[#19323C]">
                    {rawForecast.forecast_horizon_seconds != null
                      ? `${rawForecast.forecast_horizon_seconds} seconds`
                      : '—'}
                  </dd>
                </div>

                <div>
                  <dt className="text-[#607780]">Readings used</dt>
                  <dd className="font-mono text-[#19323C]">
                    {rawForecast.lookback_readings ?? '—'}
                  </dd>
                </div>

                <div>
                  <dt className="text-[#607780]">Trend rate</dt>
                  <dd className="font-mono text-[#19323C]">
                    {formatValue(rawForecast.trend_per_minute)} raw units/min
                  </dd>
                </div>
              </dl>

              {rawForecast.message && (
                <p className="mt-3 text-sm text-[#607780]">
                  {rawForecast.message}
                </p>
              )}

              <p className="mt-4 pt-3 border-t border-[#D5E0E4] text-xs text-[#607780]">
                These estimates are not AQI or gas concentration measurements.
                The MQ135 reading is uncalibrated, and this trend estimate is
                not a validated health-risk prediction.
              </p>
            </Card>
          </>
        )}
      </section>

      {/* Current conditions */}
      {conditions && (
        <section className="space-y-3">
          <h3 className="text-xs uppercase font-mono tracking-wider font-bold text-[#19323C] border-b border-[#D5E0E4] pb-2">
            Current Stored Conditions
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-xs uppercase font-mono text-[#607780]">Temperature</p>
              <p className="text-2xl font-mono font-bold text-[#19323C] mt-2">
                {conditions.temperature.toFixed(1)} °C
              </p>
            </Card>

            <Card className="p-4">
              <p className="text-xs uppercase font-mono text-[#607780]">Humidity</p>
              <p className="text-2xl font-mono font-bold text-[#19323C] mt-2">
                {conditions.humidity.toFixed(1)}%
              </p>
            </Card>

            <Card className="p-4">
              <p className="text-xs uppercase font-mono text-[#607780]">Experiment</p>
              <p className="text-lg font-mono font-bold text-[#19323C] mt-2 break-all">
                {conditions.experimentId ?? '—'}
              </p>
            </Card>
          </div>
        </section>
      )}

      {/* Existing prediction is shown only when the API supplies one */}
      {prediction && (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D5E0E4] pb-2">
              <h3 className="text-xs uppercase font-mono tracking-wider font-bold text-[#19323C]">
                Demo Prediction
              </h3>
              <span className="text-xs font-mono px-2 py-1 rounded border border-[#D5E0E4] bg-[#FFF8E8] text-[#C47A13]">
                Mock data · not a trained model
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {prediction.forecast.map((step) => (
                <Card key={step.minutesAhead} className="p-4">
                  <p className="text-xs font-mono text-[#607780]">
                    {step.label ||
                      (step.minutesAhead === 0
                        ? 'Current'
                        : `+${step.minutesAhead} minutes`)}
                  </p>
                  <p className="text-lg font-bold text-[#19323C] mt-2">
                    {step.airQuality}
                  </p>
                  <p className="text-xs text-[#607780] mt-2">
                    Demo level · mock data
                  </p>
                  <p className="text-sm font-mono text-[#19323C] mt-2">
                    MQ135: {formatValue(step.predictedMq135)} raw units
                  </p>
                </Card>
              ))}
            </div>
          </section>

          <Card className="p-5">
            <h3 className="font-semibold text-[#19323C]">Demo Model Metadata</h3>
            <p className="text-sm text-[#607780] mt-2">
              Model: {prediction.modelUsed} · Confidence:{' '}
              {Math.round(prediction.confidence * 100)}% · Horizon:{' '}
              {prediction.predictionHorizonMinutes} minutes
            </p>
            <p className="text-sm text-[#607780] mt-2">
              These values belong to the existing demo prediction and are not
              confidence estimates for the real sensor forecast.
            </p>
            <p className="text-sm text-[#19323C] mt-3">
              Recommendation: {prediction.recommendation}
            </p>
          </Card>

          <PredictionTrendChart history={history} prediction={prediction} />
        </>
      )}
    </div>
  );
}
