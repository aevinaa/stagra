/**
 * Mock-mode only. The backend defines no validated air-quality categories, so live
 * telemetry types below carry no classification. Used by the demo prediction types.
 */
export type AirQualityLevel = 'Low' | 'Moderate' | 'High';

/** Mock-mode labels. The real backend reports occupancy as an integer people count. */
export type OccupancyLevel = 'Vacant' | 'Low' | 'Moderate' | 'High';

/** Mock-mode labels. The real backend reports ventilation as 'open' or 'closed'. */
export type VentilationStatus = 'Off' | 'Natural' | 'Low' | 'Moderate' | 'High';

export type PredictionTrend = 'Increasing' | 'Improving' | 'Stable' | 'Worsening';

export type TimeRange = '1h' | '6h' | '24h' | '7d';

/**
 * 1. Current sensor conditions (GET /api/telemetry/current).
 * Hardware: ESP32 node; temperature from a DS18B20, humidity from a DHT11,
 * gas level from an MQ135. Values are exactly as stored by the backend.
 * There is deliberately no air-quality classification, AQI, CO2 or ppm field.
 */
export interface CurrentConditions {
  temperature: number; // degrees Celsius (DS18B20)
  humidity: number; // percent relative humidity (DHT11)
  mq135: number; // RAW MQ135 sensor value (uncalibrated: not ppm, CO2 or AQI)
  timestamp: string; // ISO 8601, UTC
  occupancy: number | OccupancyLevel; // real API: people count (integer)
  ventilation: 'open' | 'closed' | VentilationStatus; // real API: 'open' | 'closed'
  fan?: 'on' | 'off';
  ac?: 'on' | 'off' | null;
  occupancyInferred?: boolean; // real API: always false (values are as recorded)
  ventilationInferred?: boolean; // real API: always false
  experimentId?: string;
  location?: string;
  readingId?: number;
  isSynthetic?: boolean; // true when experimentId starts with 'SYNTH-'
}

/**
 * Single step in the prediction horizon / timeline forecast (mock mode only).
 */
export interface ForecastStep {
  minutesAhead: number; // 0, 5, 10, 15
  label: string; // e.g. "Current", "After 5 minutes", "After 10 minutes", "After 15 minutes"
  airQuality: AirQualityLevel; // 'Low' | 'Moderate' | 'High'
  predictedMq135?: number; // projected sensor reading
  confidence?: number; // optional step-level confidence
}

/**
 * 2. Prediction payload (mock mode only).
 * No backend prediction endpoint exists yet; in real mode the API layer returns null.
 */
export interface AirQualityPrediction {
  currentLevel: AirQualityLevel; // Current starting classification
  forecast: ForecastStep[]; // Timeline forecast steps (0m, +5m, +10m, +15m)
  predictionHorizonMinutes: number; // Total forecast horizon (e.g. 10 or 15 minutes)
  confidence: number; // Prediction confidence (e.g. 0.87 for 87%)
  trend: PredictionTrend; // Trajectory: 'Increasing' | 'Improving' | 'Stable' | 'Worsening'
  modelUsed: string; // Name of model/algorithm producing forecast
  recommendation: string; // Actionable HVAC or ventilation recommendation

  // Compatibility aliases supporting existing component views
  predictedAirQuality?: AirQualityLevel; // alias for the target forecast level
  horizonMinutes?: number; // alias for predictionHorizonMinutes
  targetTime?: string; // ISO timestamp corresponding to forecast target
  timelineForecasts?: ForecastStep[]; // alias for forecast
  multiHorizonForecasts?: {
    horizonMinutes: number;
    predictedAirQuality: AirQualityLevel;
    confidence: number;
    projectedMq135: number;
  }[];
}

/**
 * 3. One stored reading from GET /api/telemetry/history (never averaged or invented).
 */
export interface HistoricalReading {
  timestamp: string; // ISO 8601, UTC
  temperature: number; // degrees Celsius (DS18B20)
  humidity: number; // percent relative humidity (DHT11)
  mq135: number; // RAW MQ135 sensor value (uncalibrated)
  experimentId?: string;
  isSynthetic?: boolean;
}

/**
 * Describes what a history query matched and how the result was reduced.
 * Mirrors `HistoryMeta` in the backend (app/ui_schemas.py).
 */
export interface HistoryMeta {
  order: 'ascending';
  count: number; // readings returned
  sourceCount: number; // stored readings that matched the filters
  maxPoints: number;
  downsampled: boolean;
  method: 'none' | 'min_max_per_group';
  groupSize?: number | null;
  note: string;
  experimentId?: string | null;
  range?: string | null;
  anchor?: 'now' | 'latest' | null;
  windowStart?: string | null; // ISO 8601 UTC; null = no lower bound
  windowEnd?: string | null; // ISO 8601 UTC; null = no upper bound
}

/**
 * What `getHistoricalReadings` resolves to. `meta` is null in mock mode.
 */
export interface HistoryResult {
  readings: HistoricalReading[];
  meta: HistoryMeta | null;
}

/**
 * 4. Model benchmark and comparison metrics (mock mode only).
 * No backend model-comparison endpoint exists yet; in real mode the API layer returns null.
 */
export interface ModelComparisonResult {
  modelName: string;
  mae: number; // Mean Absolute Error
  rmse: number; // Root Mean Square Error
  accuracy: number; // Classification accuracy (0.0 to 1.0 or percentage)
  f1Score?: number; // Optional F1 Score
  status: 'Evaluated' | 'Production Candidate' | 'Baseline' | 'Benchmarked';
  parametersCount?: string; // Parameter count / model size
  inferenceLatencyMs?: number; // Edge/backend inference latency
  notes?: string;
}

// Backward-compatible alias for existing views
export type ModelComparisonMetric = ModelComparisonResult;

/**
 * Data-flow state reported by GET /api/system/status.
 * Derived only from stored readings and the server clock; not a verified device link.
 */
export type DataStatus = 'no_data' | 'receiving' | 'stale' | 'clock_skew';

/**
 * 5. System status (GET /api/system/status).
 * `esp32Connected` is true only when dataStatus is 'receiving', i.e. a reading with a
 * plausible timestamp was stored recently. There is no per-sensor health information.
 */
export interface SystemStatus {
  dataStatus: DataStatus;
  esp32Connected: boolean;
  lastPacketTime: string | null; // ISO 8601 UTC; null when nothing is stored
  lastReadingAgeSeconds?: number | null;
  staleAfterSeconds?: number;
  staleAfterSource?: 'env' | 'inferred_interval' | 'default';
  samplingIntervalSeconds?: number | null; // inferred from stored data, may be null
  room?: string | null; // location of the newest reading
  latestExperimentId?: string | null;
  latestExperimentIsSynthetic?: boolean | null;
  serverTime?: string;
}

/**
 * Summary telemetry envelope for high-level monitoring views.
 */
export interface TelemetrySummary {
  current: CurrentConditions;
  prediction: AirQualityPrediction;
  system: SystemStatus;
  historyCount: number;
  averageMq135Past24h: number;
  peakMq135Past24h: number;
}

// Re-export navigation types
export * from './navigation';