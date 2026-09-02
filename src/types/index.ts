/**
 * STAGRA - Stagnant Water Assessment and Growth Risk Analysis
 * Type Definitions
 */

export type WaterConditionClassification =
  | 'Optimal / Fresh'
  | 'Early Stagnation'
  | 'Moderate Bio-Load'
  | 'Advanced Stagnation / Organic Accumulation'
  | 'Critical Stagnant Degradation';

export type RiskLevel = 'LOW' | 'MODERATE' | 'ELEVATED' | 'CRITICAL';

export type DataSourceType = 'SIMULATED DATA' | 'ESP32 LIVE';

export interface SamplingNode {
  id: string;
  name: string;
  code: string;
  locationDescription: string;
  isPrototypeHardware?: boolean;
  waterBodyType: 'Stormwater Retention Pond' | 'Drainage Sump' | 'Irrigation Canal' | 'Culvert Stagnation Basin' | 'Rainwater Storage Reservoir';
  coordinates: {
    lat: number;
    lng: number;
    elevationMeters: number;
  };
  gridPosition: {
    x: number; // percentage in spatial diagram (0-100)
    y: number;
  };
  active: boolean;
  lastSeen: string;
  esp32Mac: string;
  firmwareVersion: string;
  samplingIntervalSec: number;
  batteryLevelPct: number;
  signalRssi: number; // dBm
}

export interface DirectSensorReading {
  id: string;
  nodeId: string;
  timestamp: string;

  /** Direct sensor: Temperature in Celsius (°C) */
  temperature: number;

  /** Direct sensor: pH value (0.00 - 14.00) */
  ph: number;

  // Hardware status telemetry
  batteryVoltage: number;
  signalStrengthDbm: number;
}

export interface DegradationProgression {
  currentStage: string;
  stageProgressPct: number;
  timeToCriticalHours: number;
  /** Estimated environmental suitability index for microbial growth (0 - 100 model estimate) */
  bacterialGrowthIndexEst: number;
  decayRatePerHour: number;
  /** Estimated stagnation and degradation progression trajectory */
  oxygenDepletionTrend: 'STABLE' | 'MODERATE_DEGRADATION' | 'ACCELERATED_DEGRADATION' | 'SEVERE_STAGNATION';
}

export interface TransformerTemporalPoint {
  timestamp: string;
  hoursAhead: number;
  predictedRiskScore: number;
  confidenceLower: number;
  confidenceUpper: number;
  forecastTemp: number;
  forecastPh: number;
  growthRiskClass: RiskLevel;
}

export interface GnnSpatialNode {
  nodeId: string;
  nodeName: string;
  riskScore: number;
  riskLevel: RiskLevel;
  waterCondition: WaterConditionClassification;
  influenceWeight: number; // 0 - 1
  isSourceRisk: boolean;
  stagnationProbability: number;
}

export interface GnnSpatialEdge {
  sourceNodeId: string;
  targetNodeId: string;
  flowDirection: 'UNIDIRECTIONAL' | 'BIDIRECTIONAL' | 'STAGNANT_SEEPAGE';
  spatialDistanceMeters: number;
  couplingWeight: number; // edge weight learned by GNN (0 - 1)
  propagationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ModelDerivedData {
  nodeId: string;
  timestamp: string;
  waterCondition: WaterConditionClassification;
  degradationRisk: RiskLevel;
  riskScore: number; // 0 - 100
  modelConfidence: number; // 0 - 100 (%)
  degradationProgression: DegradationProgression;
  transformerForecast: TransformerTemporalPoint[];
  gnnSpatialNodes: GnnSpatialNode[];
  gnnSpatialEdges: GnnSpatialEdge[];
  featureImportance: {
    feature: string;
    weight: number;
    description: string;
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  }[];
}

export interface CombinedTelemetry {
  directSensor: DirectSensorReading;
  modelDerived: ModelDerivedData;
  node: SamplingNode;
  dataSource: DataSourceType;
}

export type DataCategory = 'MEASURED' | 'DERIVED' | 'PREDICTED';

export interface Alert {
  id: string;
  nodeId: string;
  nodeName: string;
  timestamp: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  metricType: 'TEMPERATURE' | 'PH' | 'RISK_SCORE' | 'BATTERY' | 'COMMUNICATION';
  category?: DataCategory;
  directOrModel: 'MEASURED' | 'DERIVED' | 'PREDICTED' | 'DIRECT SENSOR' | 'MODEL-DERIVED';
  thresholdValue: string;
  actualValue: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  scientificImpact: string;
}

export interface FutureSensorSpec {
  id: string;
  name: string;
  symbol: string;
  unit: string;
  interfaceProtocol: 'UART / Modbus' | 'Analog 0-3.3V / ADC' | 'I2C / SPI' | 'Optical ISE';
  status: 'FUTURE_EXPANSION_PLANNED' | 'PROTOTYPE_BENCH_TESTING' | 'HARDWARE_ROADMAP';
  targetPhase: 'Phase II Hardware Spin' | 'Phase III Field Pilot';
  scientificRationale: string;
  expectedMlImpact: string;
  hardwareNotes: string;
}

export interface SystemHealthState {
  esp32NodeStatus: 'ALL_ONLINE' | 'PARTIAL_OFFLINE' | 'DEGRADED';
  esp32ActiveNodesCount: number;
  esp32TotalNodesCount: number;
  backendApiStatus: 'CONNECTED' | 'SIMULATED_PROXY' | 'DISCONNECTED';
  backendLatencyMs: number;
  historicalDatabaseStatus: 'HEALTHY' | 'SYNCING';
  dataPreprocessingStatus: 'ACTIVE' | 'STANDBY';
  transformerServiceStatus: 'ACTIVE_INFERENCE' | 'RETRAINING';
  gnnServiceStatus: 'ACTIVE_INFERENCE' | 'CONVERGING';
  predictionLayerStatus: 'OPERATIONAL' | 'DEGRADED';
  lastModelInferenceTimestamp: string;
  inferenceTimeMs: number;
  dataSourceMode: DataSourceType;
  futureSensors: FutureSensorSpec[];
}

export interface TelemetryFilter {
  nodeId: string;
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d' | 'all';
  dateFrom?: string;
  dateTo?: string;
}

export interface HistoricalStats {
  parameter: 'temperature' | 'ph' | 'riskScore';
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  current: number;
  unit: string;
}

export type SimulationScenario =
  | 'BASELINE_STABLE'
  | 'SUMMER_HEATWAVE'
  | 'ALGAL_BLOOM_SURGE'
  | 'ACID_RUNOFF_EVENT'
  | 'POST_RAIN_FLUSH';
