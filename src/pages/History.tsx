import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useTelemetry } from '../context/TelemetryContext';
import { DirectVsModelBadge } from '../components/common/DirectVsModelBadge';
import { ExportModal } from '../components/common/ExportModal';
import {
  Download,
  BarChart3,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { formatChartLabelIST, formatDateTimeTableIST } from '../utils/dateUtils';
import clsx from 'clsx';

export const History: React.FC = () => {
  const {
    historicalReadings,
    historicalModels,
    historicalStats,
    historyFilter,
    setHistoryFilter,
    isLoadingHistory,
  } = useTelemetry();

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chart' | 'table'>('chart');
  const [tablePage, setTablePage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const [selectedParameter, setSelectedParameter] = useState<'temperature' | 'ph' | 'risk'>('temperature');

  useEffect(() => {
    setHistoryFilter((previous) => (previous.nodeId === 'node-01' ? previous : { ...previous, nodeId: 'node-01' }));
  }, [setHistoryFilter]);

  const timeRanges: Array<'1h' | '6h' | '24h' | '7d' | '30d'> = ['1h', '6h', '24h', '7d', '30d'];

  // Combined chart dataset
  const combinedData = historicalReadings.map((reading, idx) => {
    const model = historicalModels[idx] || historicalModels[historicalModels.length - 1];
    const label = formatChartLabelIST(reading.timestamp, historyFilter.timeRange);
    const formattedTimestampIST = formatDateTimeTableIST(reading.timestamp);

    return {
      label,
      fullTimestamp: reading.timestamp,
      formattedTimestampIST,
      temperature: reading.temperature,
      ph: reading.ph,
      riskScore: model?.riskScore || 0,
      condition: model?.waterCondition || 'Nominal',
      confidence: model?.modelConfidence || 92,
    };
  });

  // Filtered table data
  const filteredTableData = combinedData.filter((d) => {
    if (!tableSearch) return true;
    const query = tableSearch.toLowerCase();
    return (
      d.formattedTimestampIST.toLowerCase().includes(query) ||
      d.fullTimestamp.toLowerCase().includes(query) ||
      d.condition.toLowerCase().includes(query)
    );
  });

  const itemsPerPage = 12;
  const totalPages = Math.ceil(filteredTableData.length / itemsPerPage);
  const paginatedData = filteredTableData.slice((tablePage - 1) * itemsPerPage, tablePage * itemsPerPage);
  const summaryStats = historicalStats.filter(
    (stat) => stat.parameter === 'temperature' || stat.parameter === 'ph' || stat.parameter === 'riskScore'
  );
  const trendFor = (parameter: 'temperature' | 'ph') => {
    if (combinedData.length < 2) return 'STABLE';
    const first = combinedData[0][parameter];
    const last = combinedData[combinedData.length - 1][parameter];
    const change = last - first;
    const threshold = parameter === 'temperature' ? 0.15 : 0.03;
    return change > threshold ? 'INCREASING' : change < -threshold ? 'DECREASING' : 'STABLE';
  };
  const chartConfig = {
    temperature: { dataKey: 'temperature', title: 'Temperature Trend', category: 'MEASURED', unit: '°C', color: '#06b6d4' },
    ph: { dataKey: 'ph', title: 'pH Trend', category: 'MEASURED', unit: 'pH', color: '#14b8a6' },
    risk: { dataKey: 'riskScore', title: 'Degradation Risk Trend', category: 'DERIVED', unit: '/100', color: '#10b981' },
  }[selectedParameter];

  return (
    <div className="space-y-6 pb-12">
      
      {/* History Header & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[#0a101b] border border-slate-800">
        <div>
          <h2 className="text-xl font-bold font-mono text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            Historical Telemetry &amp; Longitudinal Analysis
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Temporal records of measured Temperature and pH with derived degradation assessment and predicted confidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-lg bg-[#0d1624] border border-slate-700 font-mono text-xs">
            <span className="text-cyan-300 font-bold">STG-PROTO-01</span>
            <span className="text-slate-400 ml-2">Prototype Monitoring Node</span>
          </div>

          {/* Time range filters */}
          <div className="flex items-center rounded-lg bg-[#0d1624] p-0.5 border border-slate-700 font-mono text-xs">
            {timeRanges.map((range) => (
              <button
                key={range}
                onClick={() => setHistoryFilter((prev) => ({ ...prev, timeRange: range }))}
                className={clsx(
                  'px-2.5 py-1 rounded transition-colors',
                  historyFilter.timeRange === range
                    ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-600/50 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {range}
              </button>
            ))}
          </div>

          {/* Export button */}
          <button
            onClick={() => setExportModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Data</span>
          </button>
        </div>
      </div>

      {/* Statistical Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryStats.map((stat) => {
          const isTemp = stat.parameter === 'temperature';
          const isPh = stat.parameter === 'ph';
          const isRisk = stat.parameter === 'riskScore';

          const title = isTemp ? 'Temperature' : isPh ? 'pH' : 'Degradation Risk';
          const badgeType = isRisk ? 'DERIVED' : 'MEASURED';
          const categoryLabel = isRisk ? 'DERIVED' : 'MEASURED';

          return (
            <div key={stat.parameter} className="p-4 rounded-xl bg-[#0a101b] border border-slate-800 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">
                    {categoryLabel}
                  </span>
                  <h4 className="font-mono font-bold text-sm text-slate-100">{title}</h4>
                </div>
                <DirectVsModelBadge type={badgeType} variant="minimal" />
              </div>

              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-bold text-slate-100">{stat.current}</span>
                <span className="text-xs text-slate-400">{stat.unit}</span>
              </div>

              <div className="grid grid-cols-4 gap-1 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400">
                <div>
                  <span className="text-slate-400 block">MIN</span>
                  <span className="text-slate-200 font-semibold">{stat.min}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">MEAN</span>
                  <span className="text-cyan-300 font-semibold">{stat.mean}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">MAX</span>
                  <span className="text-slate-200 font-semibold">{stat.max}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">σ DEV</span>
                  <span className="text-teal-300 font-semibold">{stat.stdDev}</span>
                </div>
              </div>
              {isTemp || isPh ? (
                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] font-mono">
                  <span className="text-slate-400">TREND</span>
                  <span className="text-cyan-300 font-semibold">{trendFor(isTemp ? 'temperature' : 'ph')}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Main View Toggle: Chart vs Raw Table */}
      <div className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('chart')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors',
                activeTab === 'chart'
                  ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Parameter Trend Chart</span>
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors',
                activeTab === 'table'
                  ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Raw Ingestion Table</span>
            </button>
          </div>

          {activeTab === 'chart' && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400 text-[11px]">Parameter:</span>
              <button
                onClick={() => setSelectedParameter('temperature')}
                className={clsx(
                  'px-2 py-0.5 rounded border transition-colors',
                  selectedParameter === 'temperature' ? 'bg-cyan-950/60 text-cyan-300 border-cyan-600/60' : 'text-slate-400 border-slate-800'
                )}
              >
                Temperature
              </button>
              <button
                onClick={() => setSelectedParameter('ph')}
                className={clsx(
                  'px-2 py-0.5 rounded border transition-colors',
                  selectedParameter === 'ph' ? 'bg-teal-950/60 text-teal-300 border-teal-600/60' : 'text-slate-400 border-slate-800'
                )}
              >
                pH
              </button>
              <button
                onClick={() => setSelectedParameter('risk')}
                className={clsx(
                  'px-2 py-0.5 rounded border transition-colors',
                  selectedParameter === 'risk' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/60' : 'text-slate-400 border-slate-800'
                )}
              >
                Risk
              </button>
            </div>
          )}
        </div>

        {/* Tab 1: Chart View */}
        {activeTab === 'chart' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between font-mono">
              <div>
                <h3 className="text-sm font-bold text-slate-100">{chartConfig.title}</h3>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">{chartConfig.category}</span>
              </div>
              <span className="text-[11px] text-slate-400">Y-axis: {chartConfig.unit}</span>
            </div>
            <div className="h-80 w-full font-mono text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={combinedData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    domain={selectedParameter === 'risk' ? [0, 100] : ['auto', 'auto']}
                    label={{ value: chartConfig.unit, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-[#0b1320] border border-slate-700 p-3 rounded-lg shadow-2xl font-mono text-xs space-y-1.5">
                            <div className="text-slate-400 text-[10px] pb-1 border-b border-slate-800">
                              Frame Time: {label}
                            </div>
                            {payload.map((entry: any) => (
                              <div key={entry.name} className="flex items-center justify-between gap-4">
                                <span style={{ color: entry.color }} className="font-semibold">{entry.name}:</span>
                                <span className="font-bold text-slate-100">{entry.value} {chartConfig.unit}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />

                  <Line
                    type="monotone"
                    dataKey={chartConfig.dataKey}
                    name={chartConfig.title.replace(' Trend', '')}
                    stroke={chartConfig.color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800">
              <span>Timeframe: <strong className="text-slate-200">{historyFilter.timeRange.toUpperCase()} Interval</strong></span>
              <span>Total Points in Cache: <strong className="text-cyan-300">{combinedData.length}</strong></span>
            </div>
          </div>
        )}

        {/* Tab 2: Raw Telemetry Data Table */}
        {activeTab === 'table' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="relative max-w-xs w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter timestamp or condition..."
                  value={tableSearch}
                  onChange={(e) => {
                    setTableSearch(e.target.value);
                    setTablePage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0d1624] border border-slate-700 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="text-xs font-mono text-slate-400">
                Showing {(tablePage - 1) * itemsPerPage + 1} - {Math.min(tablePage * itemsPerPage, filteredTableData.length)} of {filteredTableData.length} entries
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-[#090e17] text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-3">Timestamp (IST)</th>
                    <th className="p-3 text-cyan-300">Temp [MEASURED]</th>
                    <th className="p-3 text-cyan-300">pH [MEASURED]</th>
                    <th className="p-3 text-teal-300">Risk Score [DERIVED]</th>
                    <th className="p-3 text-teal-300">Condition [DERIVED]</th>
                    <th className="p-3 text-right text-indigo-300">Confidence [PREDICTED]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-[#0a101b]">
                  {paginatedData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 text-slate-300 text-[11px] font-medium">{row.formattedTimestampIST}</td>
                      <td className="p-3 text-cyan-300 font-semibold">{row.temperature.toFixed(2)} °C</td>
                      <td className="p-3 text-teal-300 font-semibold">{row.ph.toFixed(2)}</td>
                      <td className="p-3">
                        <span className="font-bold text-emerald-300">{row.riskScore}</span>
                        <span className="text-[10px] text-slate-400">/100</span>
                      </td>
                      <td className="p-3 text-slate-200">{row.condition}</td>
                      <td className="p-3 text-right text-emerald-400 font-semibold">{row.confidence}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                disabled={tablePage === 1}
                className="px-3 py-1 rounded bg-[#0d1624] border border-slate-700 text-slate-300 disabled:opacity-40 text-xs font-mono flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>

              <span className="text-xs font-mono text-slate-400">
                Page {tablePage} of {totalPages || 1}
              </span>

              <button
                onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                disabled={tablePage >= totalPages}
                className="px-3 py-1 rounded bg-[#0d1624] border border-slate-700 text-slate-300 disabled:opacity-40 text-xs font-mono flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        readings={historicalReadings}
        models={historicalModels}
        nodeName="Prototype Monitoring Node (STG-PROTO-01)"
      />

    </div>
  );
};
