import {
  CurrentConditions,
  HistoricalReading,
  HistoryMeta,
  HistoryResult,
  AirQualityPrediction,
  ModelComparisonResult,
  SystemStatus,
  TimeRange,
} from '../types';
import {
  telemetryEngine,
  mockModelComparisons,
} from '../data/mockData';

/**
 * Service Configuration & Environment Abstraction
 *
 * Architecture Flow:
 * ESP32 Hardware Node
 *       ↓  (DS18B20 temperature, DHT11 humidity, MQ135 raw gas reading)
 * FastAPI backend + SQLite
 *       ↓  (GET /api/telemetry/current, /api/telemetry/history, /api/system/status)
 * Frontend Service Layer (this client)
 *       ↓
 * React Page Views
 *
 * The frontend NEVER communicates directly with the ESP32.
 *
 * Environment (read by Vite at start-up; restart `npm run dev` after changing them):
 *   VITE_USE_MOCK=false   -> REAL mode (backend API). Any other value or unset -> MOCK mode.
 *   VITE_API_BASE_URL     -> URL prefix for API calls (default `/api`, handled by the Vite proxy).
 */
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '/api';
const RAW_MOCK_FLAG = (import.meta as any).env?.VITE_USE_MOCK;
const USE_MOCK = RAW_MOCK_FLAG !== 'false';

/** True when data comes from the in-browser mock generator instead of the backend. */
export const IS_MOCK_MODE: boolean = USE_MOCK;

// A typo such as "False" or "0" silently leaves mock mode on. Make that visible.
if (RAW_MOCK_FLAG !== undefined && RAW_MOCK_FLAG !== 'false' && RAW_MOCK_FLAG !== 'true') {
  console.warn(
    `[STAGRA] VITE_USE_MOCK="${RAW_MOCK_FLAG}" is not "false", so MOCK mode is active. ` +
      'Use exactly VITE_USE_MOCK=false for real backend data.',
  );
}

/**
 * Failure categories the UI can tell apart:
 *  - 'empty'        : backend answered, but no readings are stored yet (not an error).
 *  - 'network'      : the request never got a response (dev server unreachable).
 *  - 'http'         : the server answered with an error status (e.g. 500/502 when the
 *                     Vite proxy cannot reach FastAPI).
 *  - 'bad_response' : the server answered 2xx, but not with the JSON we expect
 *                     (e.g. the proxy is missing and the SPA's HTML came back).
 */
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

/** Narrow an unknown caught value to ApiError. */
export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

/**
 * Simulates network latency for the mock service layer.
 */
const simulateLatency = <T>(data: T, delayMs: number = 60): Promise<T> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delayMs);
  });
};

const hasDetailCode = (body: unknown, code: string): boolean => {
  if (typeof body !== 'object' || body === null) return false;
  const detail = (body as { detail?: unknown }).detail;
  return typeof detail === 'object' && detail !== null && (detail as { code?: unknown }).code === code;
};

/**
 * GET `${API_BASE_URL}${path}` and return the parsed JSON body, or throw an ApiError.
 * `what` is a short human description used in error messages.
 */
async function requestJson<T>(path: string, what: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ApiError('network', `Could not reach the server while loading ${what}.`);
  }

  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
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
      throw new ApiError('empty', 'No sensor readings have been stored yet.', 404);
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

/**
 * Single unified API Service Interface for the application.
 */
export interface IAirQualityApi {
  /**
   * 1. Fetches the latest stored reading.
   * Throws ApiError('empty') when the database has no readings yet (real mode).
   */
  getCurrentConditions(): Promise<CurrentConditions>;

  /**
   * 2. Fetches stored readings for a time window, oldest first, with `meta`
   * describing the window and any downsampling (`meta` is null in mock mode).
   */
  getHistoricalReadings(timeRange?: TimeRange): Promise<HistoryResult>;

  /**
   * 3. ML forecast. Mock mode: demo data. Real mode: null, because no prediction
   * endpoint exists until a model has been trained and evaluated on real data.
   */
  getPrediction(): Promise<AirQualityPrediction | null>;

  /**
   * 4. Model comparison. Mock mode: demo data. Real mode: null, because no
   * model-comparison endpoint exists until a model has been evaluated.
   */
  getModelComparison(): Promise<ModelComparisonResult[] | null>;

  /**
   * 5. Data-flow status derived from stored readings (always answers, even with no data).
   */
  getSystemStatus(): Promise<SystemStatus>;
}

/**
 * Unified API Client implementation.
 *
 * When USE_MOCK is true:
 *   Returns generated demo data without touching the network. It is NOT sensor data.
 * When USE_MOCK is false:
 *   Calls the FastAPI backend and never falls back to mock data.
 */
export const airQualityApi: IAirQualityApi = {
  /**
   * 1. Current sensor conditions
   * Endpoint: GET /api/telemetry/current
   */
  async getCurrentConditions(): Promise<CurrentConditions> {
    if (USE_MOCK) {
      return simulateLatency(telemetryEngine.getCurrentConditions());
    }
    return requestJson<CurrentConditions>('/telemetry/current', 'the latest reading');
  },

  /**
   * 2. Historical readings
   * Endpoint: GET /api/telemetry/history?range={1h|6h|24h|7d}&anchor=latest
   * `anchor=latest` counts the window back from the newest stored reading, so data
   * collected earlier still shows up; `meta.windowStart/windowEnd` state the real window.
   */
  async getHistoricalReadings(timeRange: TimeRange = '24h'): Promise<HistoryResult> {
    if (USE_MOCK) {
      return simulateLatency({
        readings: telemetryEngine.getHistoricalReadings(timeRange),
        meta: null,
      });
    }

    const body = await requestJson<{ readings?: unknown; meta?: unknown }>(
      `/telemetry/history?range=${encodeURIComponent(timeRange)}&anchor=latest`,
      'reading history',
    );
    if (!Array.isArray(body.readings)) {
      throw new ApiError('bad_response', 'The history response had no "readings" list.');
    }
    return {
      readings: body.readings as HistoricalReading[],
      meta: (body.meta ?? null) as HistoryMeta | null,
    };
  },

  /**
   * 3. Air quality prediction
   * Real mode: no endpoint exists yet, so no request is made and null is returned.
   */
  async getPrediction(): Promise<AirQualityPrediction | null> {
    if (USE_MOCK) {
      return simulateLatency(telemetryEngine.getPrediction());
    }
    return null;
  },

  /**
   * 4. Model comparison results
   * Real mode: no endpoint exists yet, so no request is made and null is returned.
   */
  async getModelComparison(): Promise<ModelComparisonResult[] | null> {
    if (USE_MOCK) {
      return simulateLatency(mockModelComparisons);
    }
    return null;
  },

  /**
   * 5. System status
   * Endpoint: GET /api/system/status
   */
  async getSystemStatus(): Promise<SystemStatus> {
    if (USE_MOCK) {
      return simulateLatency(telemetryEngine.getSystemStatus());
    }
    return requestJson<SystemStatus>('/system/status', 'system status');
  },
};

// Convenience direct function exports matching exact interface contracts
export const getCurrentConditions = () => airQualityApi.getCurrentConditions();
export const getHistoricalReadings = (timeRange?: TimeRange) => airQualityApi.getHistoricalReadings(timeRange);
export const getPrediction = () => airQualityApi.getPrediction();
export const getModelComparison = () => airQualityApi.getModelComparison();
export const getSystemStatus = () => airQualityApi.getSystemStatus();