import {
  CurrentConditions,
  HistoricalReading,
  AirQualityPrediction,
  ModelComparisonResult,
  SystemStatus,
  AirQualityLevel,
} from '../types';

/**
 * Project-defined preliminary classification thresholds for raw MQ135 sensor readings.
 * NOTE: These are experimental, project-defined thresholds for indoor laboratory monitoring.
 * They are NOT official EPA or regulatory AQI index values.
 * - < 250 sensor units: Low (baseline indoor air)
 * - 250 - 350 sensor units: Moderate (accumulating indoor air contaminants)
 * - > 350 sensor units: High (elevated concentration requiring ventilation)
 */
export const MQ135_THRESHOLDS = {
  MODERATE: 250,
  HIGH: 350,
} as const;

/**
 * Derives air-quality classification strictly from configured MQ135 thresholds:
 * below moderate threshold (250) -> Low
 * moderate range (250 - 350) -> Moderate
 * above high threshold (> 350) -> High
 */
export function classifyAirQuality(mq135Value: number): AirQualityLevel {
  if (mq135Value < MQ135_THRESHOLDS.MODERATE) return 'Low';
  if (mq135Value <= MQ135_THRESHOLDS.HIGH) return 'Moderate';
  return 'High';
}

/**
 * MOCK telemetry generator (demo data only, NOT sensor data) imitating an ESP32 +
 * DS18B20 + DHT11 + MQ135 stream.
 *
 * Simulates physical indoor environmental characteristics:
 * 1. Chronological timestamps strictly ordered.
 * 2. Temperature changes gradually (thermal inertia of indoor air).
 * 3. Humidity changes gradually (diffusion rate).
 * 4. MQ135 sensor units change gradually with smooth physical accumulation and ventilation decay,
 *    avoiding arbitrary random jumps.
 * 5. Uses continuous differential autoregression with physical decay.
 */
export function generateRealisticHistory(
  hours: number = 24,
  intervalMinutes: number = 15,
  referenceNow: number = Date.now()
): HistoricalReading[] {
  const totalPoints = Math.max(4, Math.floor((hours * 60) / intervalMinutes));
  const readings: HistoricalReading[] = [];

  // Start states (historical origin, e.g. 24h prior)
  // Baseline ambient classroom conditions: ~22°C, 50% RH, 140 sensor units
  let temp = 22.4;
  let hum = 49.2;
  let mq135 = 152.0;

  for (let i = totalPoints - 1; i >= 0; i--) {
    const timestampMs = referenceNow - i * intervalMinutes * 60 * 1000;
    const date = new Date(timestampMs);
    const hourOfDay = date.getHours() + date.getMinutes() / 60;

    // Daily occupancy & human metabolic emission profile
    // 08:30 - 12:00: Morning lab session (gradual rise in CO2/VOCs/heat)
    // 12:00 - 13:30: Lunch break (gradual clearing / low occupancy)
    // 13:30 - 17:30: Afternoon session (gradual accumulation)
    // 17:30 - 20:00: Evening study
    // Night: Clean baseline decay
    let targetOccupancy = 0.05;
    if (hourOfDay >= 8.5 && hourOfDay < 12.0) {
      // Smooth sigmoid-like build up
      const progress = (hourOfDay - 8.5) / 3.5;
      targetOccupancy = 0.2 + 0.65 * Math.sin(progress * Math.PI);
    } else if (hourOfDay >= 12.0 && hourOfDay < 13.5) {
      targetOccupancy = 0.25;
    } else if (hourOfDay >= 13.5 && hourOfDay < 17.5) {
      const progress = (hourOfDay - 13.5) / 4.0;
      targetOccupancy = 0.35 + 0.55 * Math.sin(progress * Math.PI);
    } else if (hourOfDay >= 17.5 && hourOfDay < 21.0) {
      targetOccupancy = 0.30;
    }

    // Physical targets
    const targetTemp = 21.8 + targetOccupancy * 5.8; // Range 21.8°C -> 27.6°C
    const targetHum = 48.0 + targetOccupancy * 16.5; // Range 48.0% -> 64.5%
    const targetGas = 135.0 + targetOccupancy * 215.0; // Range 135 -> 350 units

    // Gradual exponential smoothing simulating physical room inertia
    // Smooth, gradual delta step (no arbitrary random leaps)
    const tempRate = 0.08;
    const humRate = 0.07;
    const gasRate = 0.09;

    // Micro fluctuation: small continuous sensor jitter bounded to ±0.04°C, ±0.1% RH, ±0.8 units
    const microJitterTemp = (Math.sin(i * 0.45) * 0.03);
    const microJitterHum = (Math.cos(i * 0.38) * 0.06);
    const microJitterGas = (Math.sin(i * 0.52) * 0.6);

    temp = temp + (targetTemp - temp) * tempRate + microJitterTemp;
    hum = hum + (targetHum - hum) * humRate + microJitterHum;
    mq135 = mq135 + (targetGas - mq135) * gasRate + microJitterGas;

    const cleanTemp = Number(temp.toFixed(1));
    const cleanHum = Number(hum.toFixed(1));
    const cleanGas = Number(Math.round(mq135));

    readings.push({
      timestamp: date.toISOString(),
      temperature: cleanTemp,
      humidity: cleanHum,
      mq135: cleanGas,
    });
  }

  return readings;
}

/**
 * Shared in-memory telemetry state simulating an active backend telemetry cache.
 * Guarantees that:
 * 1. Latest historical reading === current conditions.
 * 2. Prediction input is derived strictly from current sensor state.
 * 3. Last update timestamp matches the latest packet.
 * 4. Demo forecast classifications use the project's mock-only MQ135 thresholds.
 */
class TelemetrySimulationEngine {
  private latestPacketTime: number = Date.now();
  private historyCache: HistoricalReading[] = [];
  private currentConditionsCache: CurrentConditions | null = null;
  private predictionCache: AirQualityPrediction | null = null;
  private lastGeneratedTime: number = 0;

  private refreshIfStale() {
    const now = Date.now();
    // Cache refresh interval: update timestamp realistically every few seconds if queried
    if (this.currentConditionsCache && now - this.lastGeneratedTime < 4000) {
      return;
    }

    this.latestPacketTime = now;
    this.lastGeneratedTime = now;

    // 1. Generate chronological 24h history ending at `now`
    this.historyCache = generateRealisticHistory(24, 15, now);

    // 2. The latest reading in history is the definitive reference for current state
    // Mock "current" moment with a fixed demo state
    // (gradual steady values: e.g. 27.4°C, 64.2% RH, 318 sensor units)
    const latestHistorical = this.historyCache[this.historyCache.length - 1];

    // Ensure exact consistency between current conditions and the latest historical reading
    const currentTemp = 27.4;
    const currentHum = 64.2;
    const currentMq135 = 318;

    // Synchronize latest historical reading with current state
    latestHistorical.timestamp = new Date(now).toISOString();
    latestHistorical.temperature = currentTemp;
    latestHistorical.humidity = currentHum;
    latestHistorical.mq135 = currentMq135;

    // Smooth previous historical point so there is no sudden jump leading into 27.4 / 64.2 / 318
    if (this.historyCache.length >= 2) {
      const prev = this.historyCache[this.historyCache.length - 2];
      prev.temperature = Number((currentTemp - 0.2).toFixed(1)); // 27.2
      prev.humidity = Number((currentHum - 0.4).toFixed(1)); // 63.8
      prev.mq135 = currentMq135 - 7; // 311
    }

    // 3. Current Conditions
    this.currentConditionsCache = {
      temperature: currentTemp,
      humidity: currentHum,
      mq135: currentMq135,
      timestamp: latestHistorical.timestamp,
      occupancy: 'Moderate',
      ventilation: 'Low',
      occupancyInferred: false,
      ventilationInferred: false,
      location: 'Demo data (mock)',
    };

    // 4. Prediction: strictly seeded from the current conditions
    // In low ventilation + moderate occupancy, the model projects gradual rise
    // Current (318, Moderate) -> +5m (332, Moderate) -> +10m (354, High) -> +15m (372, High)
    const p0 = currentMq135;
    const p5 = Math.round(p0 + 14); // 332 (Moderate)
    const p10 = Math.round(p0 + 36); // 354 (Crosses into High > 350)
    const p15 = Math.round(p0 + 54); // 372 (High)

    const aqi0 = classifyAirQuality(p0);
    const aqi5 = classifyAirQuality(p5);
    const aqi10 = classifyAirQuality(p10);
    const aqi15 = classifyAirQuality(p15);

    this.predictionCache = {
      currentLevel: aqi0,
      forecast: [
        {
          minutesAhead: 0,
          label: 'Current',
          airQuality: aqi0,
          predictedMq135: p0,
          confidence: 1.0,
        },
        {
          minutesAhead: 5,
          label: '+5 minutes',
          airQuality: aqi5,
          predictedMq135: p5,
          confidence: 0.94,
        },
        {
          minutesAhead: 10,
          label: '+10 minutes',
          airQuality: aqi10,
          predictedMq135: p10,
          confidence: 0.88,
        },
        {
          minutesAhead: 15,
          label: '+15 minutes',
          airQuality: aqi15,
          predictedMq135: p15,
          confidence: 0.82,
        },
      ],
      predictionHorizonMinutes: 15,
      confidence: 0.87,
      trend: 'Increasing',
      modelUsed: 'Transformer',
      recommendation: 'Improve ventilation. Open windows or increase HVAC intake to prevent contaminant accumulation.',

      // Backward-compatibility aliases
      predictedAirQuality: aqi10,
      horizonMinutes: 10,
      targetTime: new Date(now + 10 * 60 * 1000).toISOString(),
      timelineForecasts: [
        { minutesAhead: 0, label: 'Current', airQuality: aqi0 },
        { minutesAhead: 5, label: 'After 5 minutes', airQuality: aqi5 },
        { minutesAhead: 10, label: 'After 10 minutes', airQuality: aqi10 },
        { minutesAhead: 15, label: 'After 15 minutes', airQuality: aqi15 },
      ],
      multiHorizonForecasts: [
        { horizonMinutes: 5, predictedAirQuality: aqi5, confidence: 0.94, projectedMq135: p5 },
        { horizonMinutes: 10, predictedAirQuality: aqi10, confidence: 0.88, projectedMq135: p10 },
        { horizonMinutes: 15, predictedAirQuality: aqi15, confidence: 0.82, projectedMq135: p15 },
      ],
    };
  }

  public getCurrentConditions(): CurrentConditions {
    this.refreshIfStale();
    return { ...this.currentConditionsCache! };
  }

  public getHistoricalReadings(timeRange: '1h' | '6h' | '24h' | '7d' = '24h'): HistoricalReading[] {
    this.refreshIfStale();
    let hours = 24;
    let intervalMinutes = 15;

    switch (timeRange) {
      case '1h':
        hours = 1;
        intervalMinutes = 2; // 30 points
        break;
      case '6h':
        hours = 6;
        intervalMinutes = 5; // 72 points
        break;
      case '24h':
        hours = 24;
        intervalMinutes = 15; // 96 points
        break;
      case '7d':
        hours = 168;
        intervalMinutes = 60; // 168 points
        break;
    }

    // Generate smooth series ending at the identical current reading
    const series = generateRealisticHistory(hours, intervalMinutes, this.latestPacketTime);
    if (series.length > 0 && this.currentConditionsCache) {
      const last = series[series.length - 1];
      last.timestamp = this.currentConditionsCache.timestamp;
      last.temperature = this.currentConditionsCache.temperature;
      last.humidity = this.currentConditionsCache.humidity;
      last.mq135 = this.currentConditionsCache.mq135;

      if (series.length >= 2) {
        const prev = series[series.length - 2];
        prev.temperature = Number((this.currentConditionsCache.temperature - 0.2).toFixed(1));
        prev.humidity = Number((this.currentConditionsCache.humidity - 0.4).toFixed(1));
        prev.mq135 = this.currentConditionsCache.mq135 - 7;
      }
    }
    return series;
  }

  public getPrediction(): AirQualityPrediction {
    this.refreshIfStale();
    return { ...this.predictionCache! };
  }

  public getSystemStatus(): SystemStatus {
    this.refreshIfStale();
    return {
      dataStatus: 'receiving',
      esp32Connected: true,
      lastPacketTime: this.currentConditionsCache!.timestamp,
      samplingIntervalSeconds: 5,
      room: 'Demo data (mock)',
    };
  }
}

export const telemetryEngine = new TelemetrySimulationEngine();

export const mockCurrentConditions = telemetryEngine.getCurrentConditions();
export const mockHistoricalReadings = telemetryEngine.getHistoricalReadings('24h');
export const mockPrediction = telemetryEngine.getPrediction();
export const mockSystemStatus = telemetryEngine.getSystemStatus();

/**
 * 4. Model comparison metrics (LSTM, GRU, Transformer).
 * Clearly marked as Demo / Mock Results / Illustrative benchmark values.
 */
export const mockModelComparisons: ModelComparisonResult[] = [
  {
    modelName: 'Transformer',
    mae: 2.45,
    rmse: 3.52,
    accuracy: 0.954,
    f1Score: 0.951,
    status: 'Production Candidate',
    parametersCount: '42.6k params',
    inferenceLatencyMs: 6.2,
    notes: 'Demo / Mock Results: Multi-head self-attention; highest classification accuracy on hazard states.',
  },
  {
    modelName: 'GRU',
    mae: 2.38,
    rmse: 3.46,
    accuracy: 0.942,
    f1Score: 0.938,
    status: 'Evaluated',
    parametersCount: '14.8k params',
    inferenceLatencyMs: 2.8,
    notes: 'Demo / Mock Results: Gated recurrent unit; lowest continuous regression error on telemetry trajectory.',
  },
  {
    modelName: 'LSTM',
    mae: 2.94,
    rmse: 4.18,
    accuracy: 0.936,
    f1Score: 0.931,
    status: 'Baseline',
    parametersCount: '18.2k params',
    inferenceLatencyMs: 3.9,
    notes: 'Demo / Mock Results: Long short-term memory baseline; standard recurrent architecture benchmark.',
  },
];