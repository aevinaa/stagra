/**
 * STAGRA Telemetry & Prediction Service Layer
 * Abstracted interface supporting both local mock data generation and future production REST API endpoints.
 */

import { apiClient } from './apiClient';
import {
  SamplingNode,
  DirectSensorReading,
  ModelDerivedData,
  Alert,
  SystemHealthState,
  SimulationScenario,
  DataSourceType,
  HistoricalStats,
} from '../types';
import {
  RESEARCH_NODES,
  generateDirectSensorReading,
  calculateModelDerivedData,
  generateHistoricalTimeSeries,
  generateAlerts,
  generateSystemHealth,
  computeHistoricalStats,
  FUTURE_SENSOR_EXPANSION_SPECS,
} from './mockDataGenerator';

// Runtime configuration switch: when true, uses local scientific simulator; when false, routes to real backend
let useMockData = true;
let currentDataSource: DataSourceType = 'SIMULATED DATA';
let currentScenario: SimulationScenario = 'BASELINE_STABLE';

export const telemetryService = {
  /**
   * Set data source mode (SIMULATED DATA vs ESP32 LIVE)
   */
  setDataSource(source: DataSourceType) {
    currentDataSource = source;
    useMockData = source === 'SIMULATED DATA';
  },

  getDataSource(): DataSourceType {
    return currentDataSource;
  },

  /**
   * Set simulation scenario for scientific modeling tests
   */
  setScenario(scenario: SimulationScenario) {
    currentScenario = scenario;
  },

  getScenario(): SimulationScenario {
    return currentScenario;
  },

  /**
   * Fetch all registered research sampling nodes
   */
  async getNodes(): Promise<SamplingNode[]> {
    if (useMockData) {
      return Promise.resolve([...RESEARCH_NODES]);
    }
    try {
      const res = await apiClient.get<SamplingNode[]>('/nodes');
      return res.data;
    } catch {
      return [...RESEARCH_NODES];
    }
  },

  /**
   * Fetch latest direct physical sensor reading for a node
   */
  async getLatestDirectReading(nodeId: string): Promise<DirectSensorReading> {
    if (useMockData) {
      return Promise.resolve(generateDirectSensorReading(nodeId, currentScenario, true));
    }
    try {
      const res = await apiClient.get<DirectSensorReading>(`/telemetry/direct/${nodeId}`);
      return res.data;
    } catch {
      return generateDirectSensorReading(nodeId, currentScenario, true);
    }
  },

  /**
   * Fetch latest model-derived data (Water condition, degradation risk, progression, confidence, Transformer & GNN outputs)
   */
  async getLatestModelDerived(reading: DirectSensorReading): Promise<ModelDerivedData> {
    if (useMockData) {
      return Promise.resolve(calculateModelDerivedData(reading, currentScenario));
    }
    try {
      const res = await apiClient.get<ModelDerivedData>(`/telemetry/model-derived/${reading.nodeId}`);
      return res.data;
    } catch {
      return calculateModelDerivedData(reading, currentScenario);
    }
  },

  /**
   * Fetch historical time series for sensor readings & ML metrics
   */
  async getHistoricalData(
    nodeId: string,
    timeRange: '1h' | '6h' | '24h' | '7d' | '30d' | 'all' = '24h'
  ): Promise<{
    readings: DirectSensorReading[];
    modelMetrics: ModelDerivedData[];
    stats: HistoricalStats[];
  }> {
    if (useMockData) {
      const { readings, modelMetrics } = generateHistoricalTimeSeries(nodeId, timeRange, currentScenario);
      const stats = computeHistoricalStats(readings, modelMetrics);
      return Promise.resolve({ readings, modelMetrics, stats });
    }
    try {
      const res = await apiClient.get<{
        readings: DirectSensorReading[];
        modelMetrics: ModelDerivedData[];
      }>(`/telemetry/history/${nodeId}`, { params: { range: timeRange } });
      const stats = computeHistoricalStats(res.data.readings, res.data.modelMetrics);
      return { ...res.data, stats };
    } catch {
      const { readings, modelMetrics } = generateHistoricalTimeSeries(nodeId, timeRange, currentScenario);
      const stats = computeHistoricalStats(readings, modelMetrics);
      return { readings, modelMetrics, stats };
    }
  },

  /**
   * Fetch system alerts
   */
  async getAlerts(
    readings: Record<string, DirectSensorReading>,
    models: Record<string, ModelDerivedData>
  ): Promise<Alert[]> {
    if (useMockData) {
      return Promise.resolve(generateAlerts(readings, models));
    }
    try {
      const res = await apiClient.get<Alert[]>('/alerts');
      return res.data;
    } catch {
      return generateAlerts(readings, models);
    }
  },

  /**
   * Fetch overall system pipeline health
   */
  async getSystemHealth(): Promise<SystemHealthState> {
    if (useMockData) {
      return Promise.resolve(generateSystemHealth(currentDataSource));
    }
    try {
      const res = await apiClient.get<SystemHealthState>('/system/health');
      return res.data;
    } catch {
      return generateSystemHealth(currentDataSource);
    }
  },

  /**
   * Fetch future sensor roadmap specifications
   */
  getFutureSensorRoadmap() {
    return FUTURE_SENSOR_EXPANSION_SPECS;
  },
};
