import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useTelemetry } from '../context/TelemetryContext';
import { DirectVsModelBadge } from '../components/common/DirectVsModelBadge';
import { ExportModal } from '../components/common/ExportModal';
import {
  BarChart3,
  Download,
  Thermometer,
  Droplet,
  TrendingUp,
  Table as TableIcon,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { formatShortTimeIST } from '../utils/dateUtils';

type HistoryMetric = 'temperature' | 'ph' | 'risk';

export const History: React.FC = () => {
  const {
    nodes,
    activeNode,
    activeNodeId,
    setActiveNodeId,
    historicalReadings,
    historicalModels,
    historicalStats,
    historyFilter,
    setHistoryFilter,
    isLoadingHistory,
  } = useTelemetry();

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] =
    useState<HistoryMetric>('temperature');
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);

  const timeRanges: Array<
    '1h' | '6h' | '24h' | '7d' | '30d'
  > = ['1h', '6h', '24h', '7d', '30d'];

  /* =========================================================
     CHART DATA
     ========================================================= */

  const chartData = useMemo(() => {
    return historicalReadings.map((reading, index) => {
      const model =
        historicalModels[index] ||
        historicalModels[historicalModels.length - 1];

      return {
        timestamp: reading.timestamp,
        label: formatShortTimeIST(reading.timestamp),
        temperature: reading.temperature,
        ph: reading.ph,
        riskScore: model?.riskScore ?? 0,
        condition:
          model?.waterCondition ?? 'Not classified',
        confidence:
          model?.modelConfidence ?? null,
      };
    });
  }, [historicalReadings, historicalModels]);

  /* =========================================================
     TABLE DATA
     ========================================================= */

  const filteredTableData = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();

    if (!query) return chartData;

    return chartData.filter((item) => {
      return (
        item.timestamp.toLowerCase().includes(query) ||
        item.condition.toLowerCase().includes(query)
      );
    });
  }, [chartData, tableSearch]);

  const itemsPerPage = 12;

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredTableData.length / itemsPerPage
    )
  );

  const safeTablePage = Math.min(
    tablePage,
    totalPages
  );

  const paginatedData = filteredTableData.slice(
    (safeTablePage - 1) * itemsPerPage,
    safeTablePage * itemsPerPage
  );

  /* =========================================================
     METRIC CONFIG
     ========================================================= */

  const metricConfig = useMemo(() => {
    switch (selectedMetric) {
      case 'ph':
        return {
          key: 'ph' as const,
          title: 'pH Trend',
          subtitle:
            'Measured pH variation across the selected historical window.',
          unit: 'pH',
          stroke: '#14b8a6',
          domain: [5, 9.5] as [number, number],
          referenceValue: 8.5,
          referenceLabel: 'Upper reference 8.5',
          badge: 'MEASURED' as const,
          icon: Droplet,
        };

      case 'risk':
        return {
          key: 'riskScore' as const,
          title: 'Degradation Risk Trend',
          subtitle:
            'Derived degradation risk across the selected historical window.',
          unit: '/ 100',
          stroke: '#10b981',
          domain: [0, 100] as [number, number],
          referenceValue: 70,
          referenceLabel: 'Critical reference 70',
          badge: 'DERIVED' as const,
          icon: TrendingUp,
        };

      case 'temperature':
      default:
        return {
          key: 'temperature' as const,
          title: 'Temperature Trend',
          subtitle:
            'Measured water temperature across the selected historical window.',
          unit: '°C',
          stroke: '#06b6d4',
          domain: ['dataMin - 1', 'dataMax + 1'] as [
            string,
            string
          ],
          referenceValue: 30,
          referenceLabel: 'Caution 30°C',
          badge: 'MEASURED' as const,
          icon: Thermometer,
        };
    }
  }, [selectedMetric]);

  const MetricIcon = metricConfig.icon;

  /* =========================================================
     STATISTICS
     ========================================================= */

  const getStat = (
    parameter: 'temperature' | 'ph' | 'riskScore'
  ) => {
    return historicalStats.find(
      (stat) => stat.parameter === parameter
    );
  };

  const temperatureStats = getStat('temperature');
  const phStats = getStat('ph');
  const riskStats = getStat('riskScore');

  return (
    <div className="space-y-6 pb-12">

      {/* =====================================================
          HEADER
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-4">

        <div className="flex flex-wrap items-center justify-between gap-4">

          <div>
            <div className="flex items-center gap-2">

              <BarChart3 className="w-5 h-5 text-cyan-400" />

              <h1 className="text-xl font-bold font-mono text-slate-100">
                Historical Telemetry
              </h1>

              <span className="px-2 py-0.5 rounded border border-cyan-700/50 bg-cyan-950/30 text-cyan-300 text-[9px] font-mono">
                RESEARCH DATA
              </span>

            </div>

            <p className="text-xs text-slate-400 mt-1">
              Longitudinal analysis of measured temperature and pH with
              derived degradation assessment.
            </p>
          </div>


          <button
            onClick={() => setExportModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-[#0d1624] hover:border-cyan-700/60 hover:text-cyan-300 text-slate-300 font-mono text-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Data
          </button>

        </div>


        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-800">

          {/* Prototype node */}
          <div className="flex items-center gap-2">

            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Node
            </span>

            <select
              value={historyFilter.nodeId || activeNodeId}
              onChange={(event) => {
                const nodeId = event.target.value;

                setActiveNodeId(nodeId);

                setHistoryFilter((previous) => ({
                  ...previous,
                  nodeId,
                }));

                setTablePage(1);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#0d1624] border border-slate-700 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              {nodes.map((node) => (
                <option
                  key={node.id}
                  value={node.id}
                >
                  {node.code}
                </option>
              ))}
            </select>

            <span className="hidden sm:inline text-[10px] font-mono text-slate-500">
              {activeNode?.name || 'STG-PROTO-01'}
            </span>

          </div>


          {/* Time range */}
          <div className="flex items-center rounded-lg bg-[#0d1624] p-0.5 border border-slate-700 font-mono text-xs">

            {timeRanges.map((range) => (
              <button
                key={range}
                onClick={() => {
                  setHistoryFilter((previous) => ({
                    ...previous,
                    timeRange: range,
                  }));

                  setTablePage(1);
                }}
                className={clsx(
                  'px-2.5 py-1 rounded transition-colors',
                  historyFilter.timeRange === range
                    ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-600/50'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {range}
              </button>
            ))}

          </div>

        </div>

      </section>


      {/* =====================================================
          SUMMARY STATISTICS
          ===================================================== */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Temperature */}
        <div className="rounded-xl bg-[#0a101b] border border-cyan-900/40 p-4">

          <div className="flex items-center justify-between">

            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Temperature
              </span>
            </div>

            <DirectVsModelBadge
              type="MEASURED"
              variant="minimal"
            />

          </div>


          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-cyan-300">
              {temperatureStats?.current?.toFixed(1) ?? '--'}
            </span>

            <span className="text-xs font-mono text-slate-500 ml-1">
              °C
            </span>
          </div>


          <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] font-mono">

            <div>
              <div className="text-slate-500">MIN</div>
              <div className="text-slate-200 mt-0.5">
                {temperatureStats?.min?.toFixed(1) ?? '--'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">MEAN</div>
              <div className="text-slate-200 mt-0.5">
                {temperatureStats?.mean?.toFixed(1) ?? '--'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">MAX</div>
              <div className="text-slate-200 mt-0.5">
                {temperatureStats?.max?.toFixed(1) ?? '--'}
              </div>
            </div>

          </div>

        </div>


        {/* pH */}
        <div className="rounded-xl bg-[#0a101b] border border-teal-900/40 p-4">

          <div className="flex items-center justify-between">

            <div className="flex items-center gap-2">
              <Droplet className="w-4 h-4 text-teal-400" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                pH
              </span>
            </div>

            <DirectVsModelBadge
              type="MEASURED"
              variant="minimal"
            />

          </div>


          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-teal-300">
              {phStats?.current?.toFixed(2) ?? '--'}
            </span>

            <span className="text-xs font-mono text-slate-500 ml-1">
              pH
            </span>
          </div>


          <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] font-mono">

            <div>
              <div className="text-slate-500">MIN</div>
              <div className="text-slate-200 mt-0.5">
                {phStats?.min?.toFixed(2) ?? '--'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">MEAN</div>
              <div className="text-slate-200 mt-0.5">
                {phStats?.mean?.toFixed(2) ?? '--'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">MAX</div>
              <div className="text-slate-200 mt-0.5">
                {phStats?.max?.toFixed(2) ?? '--'}
              </div>
            </div>

          </div>

        </div>


        {/* Risk */}
        <div className="rounded-xl bg-[#0a101b] border border-emerald-900/40 p-4">

          <div className="flex items-center justify-between">

            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />

              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Degradation Risk
              </span>
            </div>

            <DirectVsModelBadge
              type="DERIVED"
              variant="minimal"
            />

          </div>


          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-emerald-300">
              {riskStats?.current?.toFixed(0) ?? '--'}
            </span>

            <span className="text-xs font-mono text-slate-500 ml-1">
              / 100
            </span>
          </div>


          <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] font-mono">

            <div>
              <div className="text-slate-500">MIN</div>
              <div className="text-slate-200 mt-0.5">
                {riskStats?.min?.toFixed(0) ?? '--'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">MEAN</div>
              <div className="text-slate-200 mt-0.5">
                {riskStats?.mean?.toFixed(0) ?? '--'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">MAX</div>
              <div className="text-slate-200 mt-0.5">
                {riskStats?.max?.toFixed(0) ?? '--'}
              </div>
            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          SINGLE PARAMETER CHART
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg">

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-800">

          <div>
            <div className="flex items-center gap-2">

              <MetricIcon className="w-4 h-4 text-cyan-400" />

              <h2 className="font-mono font-bold text-sm text-slate-100">
                {metricConfig.title}
              </h2>

              <DirectVsModelBadge
                type={metricConfig.badge}
                variant="minimal"
              />

            </div>

            <p className="text-[11px] text-slate-400 mt-1">
              {metricConfig.subtitle}
            </p>
          </div>


          <div className="flex items-center rounded-lg bg-[#0d1624] p-1 border border-slate-800 gap-1 font-mono text-[10px]">

            <button
              onClick={() => setSelectedMetric('temperature')}
              className={clsx(
                'px-2.5 py-1.5 rounded transition-colors',
                selectedMetric === 'temperature'
                  ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              Temperature
            </button>

            <button
              onClick={() => setSelectedMetric('ph')}
              className={clsx(
                'px-2.5 py-1.5 rounded transition-colors',
                selectedMetric === 'ph'
                  ? 'bg-teal-950/80 text-teal-300 font-bold border border-teal-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              pH
            </button>

            <button
              onClick={() => setSelectedMetric('risk')}
              className={clsx(
                'px-2.5 py-1.5 rounded transition-colors',
                selectedMetric === 'risk'
                  ? 'bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              Risk
            </button>

          </div>

        </div>


        <div className="h-72 mt-4">

          {isLoadingHistory || chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center rounded-lg border border-dashed border-slate-800 text-xs font-mono text-slate-500">
              {isLoadingHistory
                ? 'LOADING HISTORICAL TELEMETRY...'
                : 'NO HISTORICAL TELEMETRY AVAILABLE'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{
                  top: 10,
                  right: 20,
                  left: -10,
                  bottom: 0,
                }}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />

                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  tick={{
                    fontSize: 9,
                    fill: '#94a3b8',
                  }}
                  tickLine={{
                    stroke: '#334155',
                  }}
                  minTickGap={30}
                />

                <YAxis
                  stroke="#64748b"
                  tick={{
                    fontSize: 9,
                    fill: '#94a3b8',
                  }}
                  tickLine={{
                    stroke: '#334155',
                  }}
                  domain={metricConfig.domain as any}
                />

                <Tooltip
                  cursor={{
                    stroke: '#475569',
                    strokeDasharray: '3 3',
                  }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) {
                      return null;
                    }

                    const data = payload[0].payload;

                    return (
                      <div className="bg-[#0b1320] border border-slate-700 p-3 rounded-lg shadow-xl font-mono text-xs min-w-[190px]">

                        <div className="text-[9px] text-slate-500 uppercase">
                          Timestamp
                        </div>

                        <div className="text-[10px] text-slate-300 mt-0.5">
                          {formatShortTimeIST(data.timestamp)} IST
                        </div>

                        <div className="text-[9px] text-slate-500 uppercase mt-2">
                          {metricConfig.title}
                        </div>

                        <div
                          className="text-lg font-bold mt-0.5"
                          style={{
                            color: metricConfig.stroke,
                          }}
                        >
                          {data[metricConfig.key]}{' '}
                          <span className="text-[10px] text-slate-500">
                            {metricConfig.unit}
                          </span>
                        </div>

                        {metricConfig.key === 'riskScore' &&
                          data.confidence !== null && (
                            <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                              Simulated confidence:{' '}
                              <strong className="text-emerald-300">
                                {data.confidence}%
                              </strong>
                            </div>
                          )}

                      </div>
                    );
                  }}
                />

                <ReferenceLine
                  y={metricConfig.referenceValue}
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  label={{
                    value: metricConfig.referenceLabel,
                    position: 'insideTopRight',
                    fill: '#64748b',
                    fontSize: 9,
                  }}
                />

                <Line
                  type="monotone"
                  dataKey={metricConfig.key}
                  stroke={metricConfig.stroke}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    strokeWidth: 2,
                    fill: '#0a101b',
                  }}
                  isAnimationActive={true}
                />

              </LineChart>
            </ResponsiveContainer>
          )}

        </div>


        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-800 text-[10px] font-mono">

          <span className="flex items-center gap-1.5 text-slate-400">

            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: metricConfig.stroke,
              }}
            />

            {metricConfig.title}

          </span>

          <span className="text-slate-500">
            {chartData.length} observations · IST
          </span>

        </div>

      </section>


      {/* =====================================================
          RAW TELEMETRY TABLE
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 overflow-hidden">

        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">

          <div className="flex items-center gap-2">
            <TableIcon className="w-4 h-4 text-cyan-400" />

            <h2 className="font-mono font-bold text-sm text-slate-100">
              Raw Telemetry
            </h2>

            <span className="text-[10px] text-slate-500 font-mono">
              {filteredTableData.length} records
            </span>
          </div>


          <div className="relative">

            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />

            <input
              type="text"
              value={tableSearch}
              onChange={(event) => {
                setTableSearch(event.target.value);
                setTablePage(1);
              }}
              placeholder="Search records..."
              className="w-48 sm:w-64 pl-8 pr-3 py-1.5 rounded-lg bg-[#0d1624] border border-slate-700 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
            />

          </div>

        </div>


        <div className="overflow-x-auto">

          <table className="w-full text-left border-collapse">

            <thead>
              <tr className="bg-[#0d1624] text-[9px] font-mono uppercase tracking-wider text-slate-500 border-b border-slate-800">

                <th className="px-4 py-2.5">Timestamp (IST)</th>

                <th className="px-4 py-2.5">
                  Temperature
                  <span className="ml-1 text-cyan-500">
                    [MEASURED]
                  </span>
                </th>

                <th className="px-4 py-2.5">
                  pH
                  <span className="ml-1 text-cyan-500">
                    [MEASURED]
                  </span>
                </th>

                <th className="px-4 py-2.5">
                  Risk
                  <span className="ml-1 text-teal-500">
                    [DERIVED]
                  </span>
                </th>

                <th className="px-4 py-2.5">
                  Condition
                </th>

                <th className="px-4 py-2.5">
                  Confidence
                  <span className="ml-1 text-indigo-500">
                    [PREDICTED]
                  </span>
                </th>

              </tr>
            </thead>


            <tbody className="divide-y divide-slate-800/70">

              {paginatedData.map((item) => (
                <tr
                  key={item.timestamp}
                  className="text-[10px] font-mono text-slate-300 hover:bg-[#0d1624]/70 transition-colors"
                >

                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                    {formatShortTimeIST(item.timestamp)} IST
                  </td>

                  <td className="px-4 py-2.5 text-cyan-300">
                    {item.temperature.toFixed(2)} °C
                  </td>

                  <td className="px-4 py-2.5 text-teal-300">
                    {item.ph.toFixed(2)}
                  </td>

                  <td className="px-4 py-2.5 text-emerald-300">
                    {item.riskScore.toFixed(0)} / 100
                  </td>

                  <td className="px-4 py-2.5 text-slate-300">
                    {item.condition}
                  </td>

                  <td className="px-4 py-2.5 text-indigo-300">
                    {item.confidence !== null
                      ? `${item.confidence}%`
                      : '--'}
                  </td>

                </tr>
              ))}


              {paginatedData.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-xs font-mono text-slate-500"
                  >
                    No records match the current search.
                  </td>
                </tr>
              )}

            </tbody>

          </table>

        </div>


        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 text-[10px] font-mono">

          <span className="text-slate-500">
            Page {safeTablePage} of {totalPages}
          </span>

          <div className="flex items-center gap-1">

            <button
              disabled={safeTablePage <= 1}
              onClick={() =>
                setTablePage((page) =>
                  Math.max(1, page - 1)
                )
              }
              className="p-1.5 rounded border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              disabled={safeTablePage >= totalPages}
              onClick={() =>
                setTablePage((page) =>
                  Math.min(totalPages, page + 1)
                )
              }
              className="p-1.5 rounded border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

          </div>

        </div>

      </section>

    </div>
  );
};