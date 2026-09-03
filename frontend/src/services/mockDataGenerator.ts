import {
  SamplingNode,
  DirectSensorReading,
  ModelDerivedData,
  Alert,
  FutureSensorSpec,
  SystemHealthState,
  SimulationScenario,
  WaterConditionClassification,
  RiskLevel,
  TransformerTemporalPoint,
  CombinedTelemetry,
  HistoricalStats,
  GnnSpatialNode,
  GnnSpatialEdge,
} from '../types';

export const RESEARCH_NODES: SamplingNode[] = [
  {
    id: 'node-01',
    code: 'STG-PROTO-01',
    name: 'Prototype Node 01 (Retention Pond Alpha)',
    locationDescription:
      'Campus Stormwater Retention Pond - Physical ESP32 Hardware Prototype',
    isPrototypeHardware: true,
    waterBodyType: 'Stormwater Retention Pond',
    coordinates: {
      lat: 12.9716,
      lng: 79.1585,
      elevationMeters: 214,
    },
    gridPosition: {
      x: 50,
      y: 50,
    },
    active: true,
    lastSeen: new Date().toISOString(),
    esp32Mac: '24:6F:28:B1:3C:90',
    firmwareVersion: 'ESP32-STAGRA-v2.4.1 (Prototype)',
    samplingIntervalSec: 5,
    batteryLevelPct: 94,
    signalRssi: -62,
  },
];

export const FUTURE_SENSOR_EXPANSION_SPECS: FutureSensorSpec[] = [
  {
    id: 'spec-do',
    name: 'Galvanic Dissolved Oxygen Probe',
    symbol: 'DO',
    unit: 'mg/L (or % sat)',
    interfaceProtocol: 'Analog 0-3.3V / ADC',
    status: 'PROTOTYPE_BENCH_TESTING',
    targetPhase: 'Phase II Hardware Spin',
    scientificRationale:
      'Direct measurement of in-situ dissolved oxygen concentration. Future integration will enable physical validation of degradation models and stagnant water trends.',
    expectedMlImpact:
      'Planned future sensor expansion to validate degradation trends and biological stagnation predictions.',
    hardwareNotes: 'Requires periodic membrane calibration and temperature compensation calibration circuit (PT100/NTC thermistor).',
  },
  {
    id: 'spec-turbidity',
    name: 'Nephelometric Optical Turbidity Sensor',
    symbol: 'Turbidity',
    unit: 'NTU (Nephelometric Turbidity Units)',
    interfaceProtocol: 'UART / Modbus',
    status: 'HARDWARE_ROADMAP',
    targetPhase: 'Phase II Hardware Spin',
    scientificRationale:
      'Quantifies suspended organic particulate matter, micro-algal biomass scattering, and colloidal clay sedimentation in standing water bodies.',
    expectedMlImpact:
      'Planned future expansion for sediment transport and algal bloom vector clustering.',
    hardwareNotes: 'Optical IR 850nm emitter/phototransistor receiver. High sensitivity to biofouling; requires anti-biofouling wiper or pulsed duty-cycle.',
  },
  {
    id: 'spec-ise-nitrate',
    name: 'Ion-Selective Electrode (Nitrate NO3- / Ammonia NH4+)',
    symbol: 'NO3- / NH4+',
    unit: 'mg/L',
    interfaceProtocol: 'I2C / SPI',
    status: 'FUTURE_EXPANSION_PLANNED',
    targetPhase: 'Phase III Field Pilot',
    scientificRationale:
      'Nutrient eutrophication tracking. Elevated nitrates act as biological catalysts for runaway cyanobacterial growth in stagnant reservoirs.',
    expectedMlImpact: 'Enables precise eutrophication risk modeling in agricultural runoff nodes.',
    hardwareNotes: 'High impedance amplifier frontend required; consumable ionophore membrane.',
  },
];

// Scenario offsets
interface ScenarioModifiers {
  tempOffset: number;
  phOffset: number;
  riskBoost: number;
  conditionOverride?: WaterConditionClassification;
}

function getScenarioModifiers(scenario: SimulationScenario): ScenarioModifiers {
  switch (scenario) {
    case 'SUMMER_HEATWAVE':
      return {
        tempOffset: 6.8,
        phOffset: 0.6,
        riskBoost: 32,
      };
    case 'ALGAL_BLOOM_SURGE':
      return {
        tempOffset: 4.2,
        phOffset: 1.4, // Photosynthesis increases pH during bloom
        riskBoost: 48,
        conditionOverride: 'Advanced Stagnation / Organic Accumulation',
      };
    case 'ACID_RUNOFF_EVENT':
      return {
        tempOffset: -1.2,
        phOffset: -2.3, // pH drops to acidic levels
        riskBoost: 52,
        conditionOverride: 'Critical Stagnant Degradation',
      };
    case 'POST_RAIN_FLUSH':
      return {
        tempOffset: -3.5,
        phOffset: -0.4,
        riskBoost: -25,
        conditionOverride: 'Optimal / Fresh',
      };
    case 'BASELINE_STABLE':
    default:
      return {
        tempOffset: 0,
        phOffset: 0,
        riskBoost: 0,
      };
  }
}

/**
 * Generates base node telemetry based on node characteristics
 */
function getBaseNodeValues(
  nodeId: string
): { temp: number; ph: number; baseRisk: number } {
  switch (nodeId) {
    case 'node-01':
      return {
        temp: 27.4,
        ph: 7.65,
        baseRisk: 24,
      };

    default:
      return {
        temp: 26.5,
        ph: 7.4,
        baseRisk: 20,
      };
  }
}

export function generateDirectSensorReading(
  nodeId: string,
  scenario: SimulationScenario = 'BASELINE_STABLE',
  jitter: boolean = true
): DirectSensorReading {
  const base = getBaseNodeValues(nodeId);
  const mod = getScenarioModifiers(scenario);

  const noise = (scale: number) =>
    jitter ? (Math.random() - 0.5) * scale : 0;

  const rawTemp = base.temp + mod.tempOffset + noise(0.4);
  const rawPh = base.ph + mod.phOffset + noise(0.08);

  const temperature = Math.max(
    10,
    Math.min(48, Number(rawTemp.toFixed(2)))
  );

  const ph = Math.max(
    4.0,
    Math.min(10.5, Number(rawPh.toFixed(2)))
  );

  return {
    id: `rdg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    nodeId,
    timestamp: new Date().toISOString(),
    temperature,
    ph,
    batteryVoltage: Number(
      (3.7 + Math.random() * 0.4).toFixed(2)
    ),
    signalStrengthDbm: -60 - Math.floor(Math.random() * 18),
  };
}

export function calculateModelDerivedData(
  reading: DirectSensorReading,
  scenario: SimulationScenario = 'BASELINE_STABLE'
): ModelDerivedData {
  const mod = getScenarioModifiers(scenario);
  const base = getBaseNodeValues(reading.nodeId);

  /*
   * Current prototype model:
   * Temperature + pH + temporal progression
   *
   * This is a deterministic simulation surrogate for the
   * future Transformer model. It is NOT a trained ML model.
   */
  let calculatedRisk = base.baseRisk + mod.riskBoost;

  // Temperature contribution
  if (reading.temperature > 30) {
    calculatedRisk += (reading.temperature - 30) * 4.5;
  } else if (reading.temperature > 26) {
    calculatedRisk += (reading.temperature - 26) * 2.2;
  }

  // pH deviation contribution
  const phDeviation = Math.abs(reading.ph - 7.3);
  calculatedRisk += phDeviation * 14;

  const riskScore = Math.max(
    4,
    Math.min(98, Math.round(calculatedRisk))
  );

  let degradationRisk: RiskLevel = 'LOW';
  let waterCondition: WaterConditionClassification = 'Optimal / Fresh';

  if (riskScore >= 75) {
    degradationRisk = 'CRITICAL';
    waterCondition = 'Critical Stagnant Degradation';
  } else if (riskScore >= 55) {
    degradationRisk = 'ELEVATED';
    waterCondition = 'Advanced Stagnation / Organic Accumulation';
  } else if (riskScore >= 35) {
    degradationRisk = 'MODERATE';
    waterCondition = 'Moderate Bio-Load';
  } else if (riskScore >= 20) {
    degradationRisk = 'LOW';
    waterCondition = 'Early Stagnation';
  }

  if (mod.conditionOverride) {
    waterCondition = mod.conditionOverride;
  }

  // Clearly simulated confidence for prototype UI.
  const modelConfidence = Number(
    (92 + (Math.random() * 4 - 2)).toFixed(1)
  );

  const timeToCriticalHours =
    riskScore >= 80
      ? Number((1.5 + Math.random() * 2).toFixed(1))
      : riskScore >= 60
      ? Number((6.5 + Math.random() * 4).toFixed(1))
      : riskScore >= 40
      ? Number((18 + Math.random() * 8).toFixed(1))
      : Number((48 + Math.random() * 24).toFixed(1));

  const growthSuitabilityIndexEst = Math.min(
    100,
    Math.round(
      riskScore * 0.9 +
        (reading.temperature > 28 ? 5 : 0)
    )
  );

  const degradationTrend =
    riskScore >= 75
      ? 'SEVERE_STAGNATION'
      : riskScore >= 55
      ? 'ACCELERATED_DEGRADATION'
      : riskScore >= 35
      ? 'MODERATE_DEGRADATION'
      : 'STABLE';

  const forecastHours = [3, 6, 12, 18, 24, 36, 48];
  const now = new Date();

  const transformerForecast: TransformerTemporalPoint[] =
    forecastHours.map((hours) => {
      const forecastTime = new Date(
        now.getTime() + hours * 3600 * 1000
      ).toISOString();

      const driftFactor =
        (hours / 48) * (riskScore > 50 ? 12 : -3);

      const predictedRisk = Math.max(
        5,
        Math.min(
          99,
          Math.round(
            riskScore +
              driftFactor +
              (Math.random() * 4 - 2)
          )
        )
      );

      let growthRiskClass: RiskLevel = 'LOW';

      if (predictedRisk >= 75) {
        growthRiskClass = 'CRITICAL';
      } else if (predictedRisk >= 55) {
        growthRiskClass = 'ELEVATED';
      } else if (predictedRisk >= 35) {
        growthRiskClass = 'MODERATE';
      }

      return {
        timestamp: forecastTime,
        hoursAhead: hours,
        predictedRiskScore: predictedRisk,
        confidenceLower: Math.max(
          0,
          predictedRisk - Math.round(3 + hours * 0.15)
        ),
        confidenceUpper: Math.min(
          100,
          predictedRisk + Math.round(3 + hours * 0.15)
        ),
        forecastTemp: Number(
          (
            reading.temperature +
            (hours / 48) *
              (mod.tempOffset > 0 ? 1.8 : 0.4)
          ).toFixed(1)
        ),
        forecastPh: Number(
          (
            reading.ph +
            (hours / 48) *
              (riskScore > 50 ? 0.4 : -0.1)
          ).toFixed(2)
        ),
        growthRiskClass,
      };
    });

  /*
   * GNN is deliberately dormant in the current single-node prototype.
   * The future multi-node research extension can populate these arrays.
   */
  const gnnSpatialNodes: GnnSpatialNode[] = [];
  const gnnSpatialEdges: GnnSpatialEdge[] = [];

  const featureImportance = [
    {
      feature: 'Temperature Trend',
      weight: 42,
      description:
        'Illustrative simulated contribution from measured temperature changes over time.',
      trend:
        reading.temperature > 28
          ? 'INCREASING'
          : 'STABLE',
    },
    {
      feature: 'pH Drift',
      weight: 33,
      description:
        'Illustrative simulated contribution from measured pH movement across the temporal window.',
      trend:
        Math.abs(reading.ph - 7.4) > 0.8
          ? 'DECREASING'
          : 'STABLE',
    },
    {
      feature: 'Temporal Pattern',
      weight: 25,
      trend: 'STABLE',
      description:
        'Illustrative contribution from the recent time-series shape and direction.',
    },
  ] as const;

  return {
    nodeId: reading.nodeId,
    timestamp: reading.timestamp,
    waterCondition,
    degradationRisk,
    riskScore,
    modelConfidence,

    degradationProgression: {
      currentStage:
        riskScore >= 75
          ? 'Phase 4: Critical Stagnant Water Degradation'
          : riskScore >= 55
          ? 'Phase 3: Elevated Stagnation'
          : riskScore >= 35
          ? 'Phase 2: Environmental Change'
          : 'Phase 1: Initial Stagnation',

      stageProgressPct: Math.min(
        100,
        Math.round((riskScore % 25) * 4)
      ),

      timeToCriticalHours,
      bacterialGrowthIndexEst: growthSuitabilityIndexEst,
      decayRatePerHour: Number(
        (0.4 + (riskScore / 100) * 2.1).toFixed(2)
      ),

      oxygenDepletionTrend: degradationTrend,
    },

    transformerForecast,
    gnnSpatialNodes,
    gnnSpatialEdges,
    featureImportance: [...featureImportance],
  };
}

export function generateHistoricalTimeSeries(
  nodeId: string,
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d' | 'all' = '24h',
  scenario: SimulationScenario = 'BASELINE_STABLE'
): { readings: DirectSensorReading[]; modelMetrics: ModelDerivedData[] } {
  const pointsCount =
    timeRange === '1h' ? 24 :
    timeRange === '6h' ? 36 :
    timeRange === '24h' ? 48 :
    timeRange === '7d' ? 56 :
    timeRange === '30d' ? 60 : 72;

  const totalMinutes =
    timeRange === '1h' ? 60 :
    timeRange === '6h' ? 360 :
    timeRange === '24h' ? 1440 :
    timeRange === '7d' ? 10080 :
    timeRange === '30d' ? 43200 : 43200;

  const stepMinutes = totalMinutes / pointsCount;
  const now = new Date();
  const base = getBaseNodeValues(nodeId);
  const mod = getScenarioModifiers(scenario);

  const readings: DirectSensorReading[] = [];
  const modelMetrics: ModelDerivedData[] = [];

  for (let i = pointsCount - 1; i >= 0; i--) {
    const pointTime = new Date(now.getTime() - i * stepMinutes * 60 * 1000);
    const progressRatio = (pointsCount - 1 - i) / pointsCount; // 0 to 1

    // Diurnal temperature cycle + trend
    const hourOfDay = pointTime.getHours();
    const diurnalTemp = Math.sin(((hourOfDay - 8) / 24) * 2 * Math.PI) * 2.2;
    const scenarioTempDrift = mod.tempOffset * progressRatio;
    const tempNoise = (Math.random() - 0.5) * 0.35;

    const temp = Math.max(14, Math.min(42, Number((base.temp + diurnalTemp + scenarioTempDrift + tempNoise).toFixed(2))));

    // pH cycle (rises slightly in sunlight/day, drifts based on scenario)
    const diurnalPh = Math.sin(((hourOfDay - 12) / 24) * 2 * Math.PI) * 0.25;
    const scenarioPhDrift = mod.phOffset * progressRatio;
    const phNoise = (Math.random() - 0.5) * 0.06;
    const ph = Math.max(4.5, Math.min(9.8, Number((base.ph + diurnalPh + scenarioPhDrift + phNoise).toFixed(2))));


    const reading: DirectSensorReading = {
      id: `hist-${nodeId}-${i}`,
      nodeId,
      timestamp: pointTime.toISOString(),
      temperature: temp,
      ph,
      batteryVoltage: Number((3.9 - (i / pointsCount) * 0.2 + (Math.random() * 0.05)).toFixed(2)),
      signalStrengthDbm: -63 + Math.floor(Math.random() * 8),
    };

    const model = calculateModelDerivedData(reading, scenario);
    readings.push(reading);
    modelMetrics.push(model);
  }

  return { readings, modelMetrics };
}

export function generateAlerts(
  activeReadings: Record<string, DirectSensorReading>,
  activeModels: Record<string, ModelDerivedData>
): Alert[] {
  const alerts: Alert[] = [];

  Object.keys(activeReadings).forEach((nodeId) => {
    const reading = activeReadings[nodeId];
    const model = activeModels[nodeId];
    const node = RESEARCH_NODES.find((n) => n.id === nodeId);
    const nodeName = node?.name || nodeId;

    // MEASURED SENSOR: High Temperature Alert
    if (reading && reading.temperature >= 31.0) {
      alerts.push({
        id: `alt-temp-${nodeId}`,
        nodeId,
        nodeName,
        timestamp: reading.timestamp,
        severity: reading.temperature >= 33.5 ? 'CRITICAL' : 'WARNING',
        title: `Measured Sensor: High Water Temperature (${reading.temperature.toFixed(1)}°C)`,
        message: `Direct temperature sensor reading exceeded standard baseline (>31.0°C). Elevated environmental growth suitability and stagnation tendency anticipated.`,
        metricType: 'TEMPERATURE',
        category: 'MEASURED',
        directOrModel: 'MEASURED',
        thresholdValue: '> 31.0 °C',
        actualValue: `${reading.temperature.toFixed(2)} °C`,
        acknowledged: false,
        scientificImpact: 'Thermal energy increases kinetic reaction rates and elevates stagnant environmental growth suitability.',
      });
    }

    // MEASURED SENSOR: pH Extremes
    if (reading && (reading.ph < 6.5 || reading.ph > 8.5)) {
      alerts.push({
        id: `alt-ph-${nodeId}`,
        nodeId,
        nodeName,
        timestamp: reading.timestamp,
        severity: reading.ph < 5.8 || reading.ph > 9.2 ? 'CRITICAL' : 'WARNING',
        title: `Measured Sensor: pH Boundary Deviation (${reading.ph.toFixed(2)})`,
        message: `Direct pH probe recorded value outside normal neutral window (6.50 - 8.50).`,
        metricType: 'PH',
        category: 'MEASURED',
        directOrModel: 'MEASURED',
        thresholdValue: '6.50 - 8.50 pH',
        actualValue: `${reading.ph.toFixed(2)} pH`,
        acknowledged: false,
        scientificImpact: 'Indicates potential chemical runoff drift or biological photosynthetic/metabolic activity in stagnant water.',
      });
    }

    // DERIVED & PREDICTED: Degradation Risk Alert
    if (model && model.riskScore >= 70) {
      alerts.push({
        id: `alt-model-risk-${nodeId}`,
        nodeId,
        nodeName,
        timestamp: model.timestamp,
        severity: model.riskScore >= 85 ? 'CRITICAL' : 'WARNING',
        title: `Derived Condition: ${model.waterCondition.toUpperCase()} (Score: ${model.riskScore}/100)`,
        message: `Calculated multi-parameter condition index indicates elevated degradation risk. ML Trajectory estimated critical window: ${model.degradationProgression.timeToCriticalHours} hrs.`,
        metricType: 'RISK_SCORE',
        category: 'DERIVED',
        directOrModel: 'DERIVED',
        thresholdValue: 'Risk Score > 70',
        actualValue: `${model.riskScore} / 100 (${model.degradationRisk})`,
        acknowledged: false,
        scientificImpact: 'Calculated kinetic drift indicates accelerating environmental stagnation and growth suitability.',
      });
    }
  });

  // Add standard baseline telemetry info alert if list is small
  if (alerts.length === 0) {
    alerts.push({
      id: 'alt-info-baseline',
      nodeId: 'node-01',
      nodeName: 'Prototype Node 01 (Retention Pond Alpha)',
      timestamp: new Date().toISOString(),
      severity: 'INFO',
      title: 'Measured Sensor: Prototype Telemetry Nominal',
      message: 'Physical sensor streams (Temp, pH) and derived condition models operating within nominal ranges.',
      metricType: 'COMMUNICATION',
      category: 'MEASURED',
      directOrModel: 'MEASURED',
      thresholdValue: 'Nominal Range',
      actualValue: 'Stable Baseline',
      acknowledged: true,
      scientificImpact: 'Continuous prototype sampling active on the single physical monitoring node.',
    });
  }

  return alerts;
}

export function generateSystemHealth(dataSource: 'SIMULATED DATA' | 'ESP32 LIVE'): SystemHealthState {
  return {
    esp32NodeStatus: 'ALL_ONLINE',
    esp32ActiveNodesCount: 1, // 1 Prototype Hardware Node Active
    esp32TotalNodesCount: RESEARCH_NODES.length, // 1 Prototype Node + 4 Simulated Nodes
    backendApiStatus: dataSource === 'ESP32 LIVE' ? 'CONNECTED' : 'SIMULATED_PROXY',
    backendLatencyMs: dataSource === 'ESP32 LIVE' ? 42 : 8,
    historicalDatabaseStatus: 'HEALTHY',
    dataPreprocessingStatus: 'ACTIVE',
    transformerServiceStatus: 'ACTIVE_INFERENCE',
    gnnServiceStatus: 'ACTIVE_INFERENCE',
    predictionLayerStatus: 'OPERATIONAL',
    lastModelInferenceTimestamp: new Date().toISOString(),
    inferenceTimeMs: 0,
    dataSourceMode: dataSource,
    futureSensors: FUTURE_SENSOR_EXPANSION_SPECS,
  };
}

export function computeHistoricalStats(readings: DirectSensorReading[], models: ModelDerivedData[]): HistoricalStats[] {
  if (readings.length === 0) return [];

  const temps = readings.map((r) => r.temperature);
  const phs = readings.map((r) => r.ph);
  const risks = models.map((m) => m.riskScore);

  const calc = (arr: number[], param: 'temperature' | 'ph'  | 'riskScore', unit: string): HistoricalStats => {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const sum = arr.reduce((a, b) => a + b, 0);
    const mean = Number((sum / arr.length).toFixed(2));
    const variance = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / arr.length;
    const stdDev = Number(Math.sqrt(variance).toFixed(2));
    const current = arr[arr.length - 1];

    return { parameter: param, min, max, mean, stdDev, current, unit };
  };

  return [
    calc(temps, 'temperature', '°C'),
    calc(phs, 'ph', 'pH'),
    calc(risks, 'riskScore', '/100'),
  ];
}
