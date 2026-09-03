import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  SamplingNode,
  DirectSensorReading,
  ModelDerivedData,
  Alert,
  SystemHealthState,
  SimulationScenario,
  DataSourceType,
  HistoricalStats,
  TelemetryFilter,
} from '../types';
import { telemetryService } from '../services/telemetryService';

interface TelemetryContextType {
  // Nodes
  nodes: SamplingNode[];
  activeNode: SamplingNode | null;
  activeNodeId: string;
  setActiveNodeId: (nodeId: string) => void;

  // Real-time Telemetry
  latestReading: DirectSensorReading | null;
  latestModel: ModelDerivedData | null;
  allReadings: Record<string, DirectSensorReading>;
  allModels: Record<string, ModelDerivedData>;

  // Historical Telemetry
  historicalReadings: DirectSensorReading[];
  historicalModels: ModelDerivedData[];
  historicalStats: HistoricalStats[];
  historyFilter: TelemetryFilter;
  setHistoryFilter: React.Dispatch<React.SetStateAction<TelemetryFilter>>;
  isLoadingHistory: boolean;

  // Alerts
  alerts: Alert[];
  unreadAlertsCount: number;
  acknowledgeAlert: (alertId: string) => void;
  acknowledgeAllAlerts: () => void;

  // System & Data Source
  systemHealth: SystemHealthState | null;
  dataSourceMode: DataSourceType;
  setDataSourceMode: (mode: DataSourceType) => void;
  activeScenario: SimulationScenario;
  setActiveScenario: (scenario: SimulationScenario) => void;

  // Streaming State
  isLiveStreaming: boolean;
  setIsLiveStreaming: (streaming: boolean) => void;
  lastUpdated: Date;
  triggerManualSample: () => void;
}

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export const TelemetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [nodes, setNodes] = useState<SamplingNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string>('node-01');

  const [allReadings, setAllReadings] = useState<Record<string, DirectSensorReading>>({});
  const [allModels, setAllModels] = useState<Record<string, ModelDerivedData>>({});
  const [latestReading, setLatestReading] = useState<DirectSensorReading | null>(null);
  const [latestModel, setLatestModel] = useState<ModelDerivedData | null>(null);

  const [historicalReadings, setHistoricalReadings] = useState<DirectSensorReading[]>([]);
  const [historicalModels, setHistoricalModels] = useState<ModelDerivedData[]>([]);
  const [historicalStats, setHistoricalStats] = useState<HistoricalStats[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  const [historyFilter, setHistoryFilter] = useState<TelemetryFilter>({
    nodeId: 'node-01',
    timeRange: '24h',
  });

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealthState | null>(null);
  const [dataSourceMode, setDataSourceModeState] = useState<DataSourceType>('SIMULATED DATA');
  const [activeScenario, setActiveScenarioState] = useState<SimulationScenario>('BASELINE_STABLE');
  const [isLiveStreaming, setIsLiveStreaming] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const activeNode = nodes.find((n) => n.id === activeNodeId) || nodes[0] || null;

  // Initialize nodes
  useEffect(() => {
    async function initNodes() {
      const nodeList = await telemetryService.getNodes();
      setNodes(nodeList);
      if (nodeList.length > 0 && !activeNodeId) {
        setActiveNodeId(nodeList[0].id);
      }
    }
    initNodes();
  }, [activeNodeId]);

  // Handle data source toggle
  const setDataSourceMode = useCallback((mode: DataSourceType) => {
    setDataSourceModeState(mode);
    telemetryService.setDataSource(mode);
  }, []);

  // Handle scenario switch
  const setActiveScenario = useCallback((scenario: SimulationScenario) => {
    setActiveScenarioState(scenario);
    telemetryService.setScenario(scenario);
  }, []);

  // Poll / Sample function
  const sampleTelemetry = useCallback(async () => {
    if (nodes.length === 0) return;

    const newReadings: Record<string, DirectSensorReading> = {};
    const newModels: Record<string, ModelDerivedData> = {};

    for (const node of nodes) {
      const reading = await telemetryService.getLatestDirectReading(node.id);
      const model = await telemetryService.getLatestModelDerived(reading);
      newReadings[node.id] = reading;
      newModels[node.id] = model;
    }

    setAllReadings(newReadings);
    setAllModels(newModels);

    const activeR = newReadings[activeNodeId] || newReadings[nodes[0].id];
    const activeM = newModels[activeNodeId] || newModels[nodes[0].id];

    if (activeR) setLatestReading(activeR);
    if (activeM) setLatestModel(activeM);

    // Refresh Alerts
    const generatedAlerts = await telemetryService.getAlerts(newReadings, newModels);
    setAlerts((prev) => {
      // Preserve acknowledged state for alerts with matching IDs
      return generatedAlerts.map((newAlt) => {
        const existing = prev.find((p) => p.id === newAlt.id);
        if (existing && existing.acknowledged) {
          return { ...newAlt, acknowledged: true, acknowledgedAt: existing.acknowledgedAt };
        }
        return newAlt;
      });
    });

    // Refresh System Health
    const health = await telemetryService.getSystemHealth();
    setSystemHealth(health);
    setLastUpdated(new Date());
  }, [nodes, activeNodeId]);

  // Manual Trigger
  const triggerManualSample = useCallback(() => {
    sampleTelemetry();
  }, [sampleTelemetry]);

  // Initial and reactive telemetry sample
  useEffect(() => {
    if (nodes.length > 0) {
      sampleTelemetry();
    }
  }, [nodes, activeScenario, dataSourceMode, sampleTelemetry]);

  // Live streaming interval (every 5 seconds)
  useEffect(() => {
    if (!isLiveStreaming) return;
    const interval = setInterval(() => {
      sampleTelemetry();
    }, 5000);
    return () => clearInterval(interval);
  }, [isLiveStreaming, sampleTelemetry]);

  // Fetch historical data when activeNode or historyFilter changes
  useEffect(() => {
    async function loadHistory() {
      if (!activeNodeId) return;
      setIsLoadingHistory(true);
      try {
        const data = await telemetryService.getHistoricalData(historyFilter.nodeId || activeNodeId, historyFilter.timeRange);
        setHistoricalReadings(data.readings);
        setHistoricalModels(data.modelMetrics);
        setHistoricalStats(data.stats);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    loadHistory();
  }, [activeNodeId, historyFilter, activeScenario]);

  // Alert Actions
  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((alt) =>
        alt.id === alertId ? { ...alt, acknowledged: true, acknowledgedAt: new Date().toISOString() } : alt
      )
    );
  }, []);

  const acknowledgeAllAlerts = useCallback(() => {
    const now = new Date().toISOString();
    setAlerts((prev) => prev.map((alt) => ({ ...alt, acknowledged: true, acknowledgedAt: now })));
  }, []);

  const unreadAlertsCount = alerts.filter((a) => !a.acknowledged && a.severity !== 'INFO').length;

  return (
    <TelemetryContext.Provider
      value={{
        nodes,
        activeNode,
        activeNodeId,
        setActiveNodeId,
        latestReading,
        latestModel,
        allReadings,
        allModels,
        historicalReadings,
        historicalModels,
        historicalStats,
        historyFilter,
        setHistoryFilter,
        isLoadingHistory,
        alerts,
        unreadAlertsCount,
        acknowledgeAlert,
        acknowledgeAllAlerts,
        systemHealth,
        dataSourceMode,
        setDataSourceMode,
        activeScenario,
        setActiveScenario,
        isLiveStreaming,
        setIsLiveStreaming,
        lastUpdated,
        triggerManualSample,
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  return context;
};
