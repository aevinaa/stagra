
import {
  CurrentConditions,
  HistoricalReading,
  HistoryMeta,
  HistoryResult,
  AirQualityPrediction,
  ModelComparisonResult,
  SystemStatus,
  TimeRange,
  DecisionSupport,
} from '../types';

import { telemetryEngine, mockModelComparisons } from '../data/mockData';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '/api';
const RAW_MOCK_FLAG = (import.meta as any).env?.VITE_USE_MOCK;
const USE_MOCK = RAW_MOCK_FLAG !== 'false';

export const IS_MOCK_MODE: boolean = USE_MOCK;

if (
  RAW_MOCK_FLAG !== undefined &&
  RAW_MOCK_FLAG !== 'false' &&
  RAW_MOCK_FLAG !== 'true'
) {
  console.warn(
    `[STAGRA] VITE_USE_MOCK="${RAW_MOCK_FLAG}" is not "false", so MOCK mode is active. ` +
      'Use exactly VITE_USE_MOCK=false for real backend data.',
  );
}

export type ApiErrorKind = 'empty' | 'network' | 'http' | 'bad_response';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export const isApiError = (err: unknown): err is ApiError =>
  err instanceof ApiError;

const simulateLatency = <T>(
  data: T,
  delayMs: number = 60,
): Promise<T> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(data), delayMs);
  });

const hasDetailCode = (body: unknown, code: string): boolean => {
  if (typeof body !== 'object' || body === null) return false;

  const detail = (body as { detail?: unknown }).detail;

  return (
    typeof detail === 'object' &&
    detail !== null &&
    (detail as { code?: unknown }).code === code
  );
};

async function requestJson<T>(path: string, what: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ApiError(
      'network',
      `Could not reach the server while loading ${what}.`,
    );
  }

  const isJson = (response.headers.get('content-type') ?? '').includes(
    'application/json',
  );

  let body: unknown = null;

  if (isJson) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    if (response.status === 404 && hasDetailCode(body, 'no_readings')) {
      throw new ApiError(
        'empty',
        'No sensor readings have been stored yet.',
        404,
      );
    }

    throw new ApiError(
      'http',
      `The server returned HTTP ${response.status} while loading ${what}.`,
      response.status,
    );
  }

  if (!isJson || body === null || typeof body !== 'object') {
    throw new ApiError(
      'bad_response',
      `The server did not return JSON while loading ${what}. ` +
        'Check that the Vite dev server proxy and the FastAPI backend are running.',
      response.status,
    );
  }

  return body as T;
}

export interface RawSensorForecast {
  status:
    | 'ok'
    | 'stale'
    | 'no_data'
    | 'insufficient_history'
    | 'invalid_data';
  experiment_id?: string;
  latest_reading_at?: string;
  data_age_seconds?: number;
  forecast_horizon_seconds?: number;
  lookback_readings?: number;
  target?: string;
  unit?: string;
  persistence_forecast?: number | null;
  linear_trend_forecast?: number | null;
  trend_per_minute?: number;
  message?: string;
}

export interface IAirQualityApi {
  getCurrentConditions(): Promise<CurrentConditions>;
  getHistoricalReadings(timeRange?: TimeRange): Promise<HistoryResult>;
  getPrediction(): Promise<AirQualityPrediction | null>;
  getModelComparison(): Promise<ModelComparisonResult[] | null>;
  getSystemStatus(): Promise<SystemStatus>;
  getRawSensorForecast(): Promise<RawSensorForecast | null>;
  getDecisionSupport(): Promise<DecisionSupport | null>;
}

export const airQualityApi: IAirQualityApi = {
  async getCurrentConditions(): Promise<CurrentConditions> {
    if (USE_MOCK) {
      return simulateLatency(telemetryEngine.getCurrentConditions());
    }

    return requestJson<CurrentConditions>(
      '/telemetry/current',
      'the latest reading',
    );
  },

  async getHistoricalReadings(
    timeRange: TimeRange = '24h',
  ): Promise<HistoryResult> {
    if (USE_MOCK) {
      return simulateLatency({
        readings: telemetryEngine.getHistoricalReadings(timeRange),
        meta: null,
      });
    }

    const body = await requestJson<{
      readings?: unknown;
      meta?: unknown;
    }>(
      `/telemetry/history?range=${encodeURIComponent(timeRange)}&anchor=latest`,
      'reading history',
    );

    if (!Array.isArray(body.readings)) {
      throw new ApiError(
        'bad_response',
        'The history response had no "readings" list.',
      );
    }

    return {
      readings: body.readings as HistoricalReading[],
      meta: (body.meta ?? null) as HistoryMeta | null,
    };
  },

  async getPrediction(): Promise<AirQualityPrediction | null> {
    if (USE_MOCK) {
      return simulateLatency(telemetryEngine.getPrediction());
    }

    return null;
  },

  async getModelComparison(): Promise<ModelComparisonResult[] | null> {
    if (USE_MOCK) {
      return simulateLatency(mockModelComparisons);
    }

    try {
      const result = await requestJson<{
        status: string;
        target: string;
        unit: string;
        forecast_horizon_seconds: number;
        lookback_seconds: number;
        evaluation_experiment: string;
        evaluation_note: string;
        models: {
          model_name: string;
          mae: number;
          rmse: number;
        }[];
      }>('/models/comparison', 'model comparison');

      return result.models.map(
        (model) =>
          ({
            modelName: model.model_name,
            mae: model.mae,
            rmse: model.rmse,
            accuracy: null,
            f1Score: null,
            status: 'evaluated',
            parametersCount: null,
            inferenceLatencyMs: null,
          }) as unknown as ModelComparisonResult,
      );
    } catch (error) {
      console.error('Failed to fetch model comparison:', error);
      return null;
    }
  },

  async getSystemStatus(): Promise<SystemStatus> {
    if (USE_MOCK) {
      return simulateLatency(telemetryEngine.getSystemStatus());
    }

    return requestJson<SystemStatus>('/system/status', 'system status');
  },

  async getRawSensorForecast(): Promise<RawSensorForecast | null> {
    if (USE_MOCK) {
      return null;
    }

    try {
      return await requestJson<RawSensorForecast>(
        '/forecast/current',
        'raw sensor forecast',
      );
    } catch (error) {
      console.error('Failed to fetch raw sensor forecast:', error);
      return null;
    }
  },

  async getDecisionSupport(): Promise<DecisionSupport | null> {
    if (USE_MOCK) {
      return null;
    }

    try {
      return await requestJson<DecisionSupport>(
        '/decision-support/current',
        'health-aware assessment',
      );
    } catch (error) {
      console.error('Failed to fetch decision support:', error);
      return null;
    }
  },
};

export const getCurrentConditions = () =>
  airQualityApi.getCurrentConditions();

export const getHistoricalReadings = (timeRange?: TimeRange) =>
  airQualityApi.getHistoricalReadings(timeRange);

export const getPrediction = () => airQualityApi.getPrediction();

export const getModelComparison = () => airQualityApi.getModelComparison();

export const getSystemStatus = () => airQualityApi.getSystemStatus();

export const getRawSensorForecast = () =>
  airQualityApi.getRawSensorForecast();

export const getDecisionSupport = () =>
  airQualityApi.getDecisionSupport();
