import {
  CurrentConditions,
  HistoricalReading,
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
 *       ↓  (DHT22 & MQ135 sensor telemetry packet)
 * Backend Ingestion & Inference API (e.g., Express / FastAPI)
 *       ↓  (REST endpoints /api/telemetry/*, /api/prediction/*, /api/models/*, /api/system/*)
 * Frontend Service Layer (this client)
 *       ↓
 * React Page Views (Dashboard, Analytics, Prediction, Model Comparison)
 *
 * The frontend NEVER communicates directly with the ESP32.
 * Set `VITE_API_BASE_URL` in environment when connecting to the real backend.
 * Set `VITE_USE_MOCK=false` to switch off the mock service and use real REST API calls.
 */
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '/api';
const USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK !== 'false';

/**
 * Simulates network latency for the mock service layer.
 */
const simulateLatency = <T>(data: T, delayMs: number = 60): Promise<T> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delayMs);
  });
};

/**
 * Single unified API Service Interface for the application.
 */
export interface IAirQualityApi {
  /**
   * 1. Fetches current sensor conditions.
   * Returns temperature, humidity, mq135, airQuality, timestamp, occupancy, ventilation.
   */
  getCurrentConditions(): Promise<CurrentConditions>;

  /**
   * 2. Fetches historical sensor readings across selectable time windows.
   * Returns array of: timestamp, temperature, humidity, mq135, airQuality.
   */
  getHistoricalReadings(timeRange?: TimeRange): Promise<HistoricalReading[]>;

  /**
   * 3. Fetches ML model forecast.
   * Returns currentLevel, forecast, predictionHorizonMinutes, confidence, trend, modelUsed, recommendation.
   */
  getPrediction(): Promise<AirQualityPrediction>;

  /**
   * 4. Fetches research/experimental model comparison results.
   * Returns array of: modelName, mae, rmse, accuracy, f1Score, status.
   */
  getModelComparison(): Promise<ModelComparisonResult[]>;

  /**
   * 5. Fetches system and hardware health status.
   * Returns esp32Connected, lastPacketTime, sensorStatus.
   */
  getSystemStatus(): Promise<SystemStatus>;
}

/**
 * Unified API Client implementation.
 *
 * When USE_MOCK is true:
 *   Returns high-fidelity mock datasets from the service layer without touching the network.
 * When USE_MOCK is false:
 *   Calls the real REST endpoints served by the Backend API.
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

    const response = await fetch(`${API_BASE_URL}/telemetry/current`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`[API Error] Failed to fetch current conditions: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * 2. Historical readings
   * Endpoint: GET /api/telemetry/history?range={1h|6h|24h|7d}
   */
  async getHistoricalReadings(timeRange: TimeRange = '24h'): Promise<HistoricalReading[]> {
    if (USE_MOCK) {
      return simulateLatency(telemetryEngine.getHistoricalReadings(timeRange));
    }

    const response = await fetch(`${API_BASE_URL}/telemetry/history?range=${encodeURIComponent(timeRange)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`[API Error] Failed to fetch historical readings: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * 3. Air quality prediction
   * Endpoint: GET /api/prediction/latest
   */
  async getPrediction(): Promise<AirQualityPrediction> {
    if (USE_MOCK) {
      return simulateLatency(telemetryEngine.getPrediction());
    }

    const response = await fetch(`${API_BASE_URL}/prediction/latest`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`[API Error] Failed to fetch prediction: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * 4. Model comparison results
   * Endpoint: GET /api/models/comparison
   */
  async getModelComparison(): Promise<ModelComparisonResult[]> {
    if (USE_MOCK) {
      return simulateLatency(mockModelComparisons);
    }

    const response = await fetch(`${API_BASE_URL}/models/comparison`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`[API Error] Failed to fetch model comparison results: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * 5. System status
   * Endpoint: GET /api/system/status
   */
  async getSystemStatus(): Promise<SystemStatus> {
    if (USE_MOCK) {
      return simulateLatency(telemetryEngine.getSystemStatus());
    }

    const response = await fetch(`${API_BASE_URL}/system/status`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`[API Error] Failed to fetch system status: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },
};

// Convenience direct function exports matching exact interface contracts
export const getCurrentConditions = () => airQualityApi.getCurrentConditions();
export const getHistoricalReadings = (timeRange?: TimeRange) => airQualityApi.getHistoricalReadings(timeRange);
export const getPrediction = () => airQualityApi.getPrediction();
export const getModelComparison = () => airQualityApi.getModelComparison();
export const getSystemStatus = () => airQualityApi.getSystemStatus();
