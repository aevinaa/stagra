import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import { StatusPill } from '../components/common/StatusPill';
import {
  BrainCircuit,
  Network,
  Sparkles,
  TrendingUp,
  Activity,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  Info,
} from 'lucide-react';
import clsx from 'clsx';

export const Predictions: React.FC = () => {
  const { latestModel, activeNode, nodes, setActiveNodeId } = useTelemetry();
  const [selectedHorizon, setSelectedHorizon] = useState<48 | 24 | 12>(48);

  if (!latestModel || !activeNode) {
    return (
      <div className="p-8 text-center font-mono text-xs text-teal-400">
        COMPUTING TRANSFORMER & GNN TEMPORAL/SPATIAL GRAPH FORECASTS...
      </div>
    );
  }

  const { transformerForecast, gnnSpatialNodes, gnnSpatialEdges, featureImportance, riskScore, modelConfidence } = latestModel;

  const forecastData = transformerForecast
    .filter((f) => f.hoursAhead <= selectedHorizon)
    .map((item) => ({
      hourLabel: `+${item.hoursAhead}h`,
      predictedRiskScore: item.predictedRiskScore,
      confidenceLower: item.confidenceLower,
      confidenceUpper: item.confidenceUpper,
      forecastTemp: item.forecastTemp,
      forecastPh: item.forecastPh,
      forecastTds: item.forecastTds,
      riskClass: item.growthRiskClass,
    }));

  return (
    <div className="space-y-8 pb-12">
      
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#0d1726] via-[#09111c] to-[#070c14] border border-teal-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-teal-950/80 border border-teal-600/50 text-teal-400">
              <BrainCircuit className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold font-mono text-slate-100">
                Proposed Transformer &amp; GNN Prediction Architecture
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                Predictive degradation modeling simulation for node <strong className="text-teal-300 font-mono">{activeNode.name}</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-[#070c14] border border-slate-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Proposed Model Target: <strong className="text-emerald-300">{modelConfidence}%</strong></span>
          </div>
          <DirectVsModelBadge type="PREDICTED" variant="minimal" />
        </div>
      </div>

      {/* SECTION 1: TRANSFORMER TEMPORAL DEGRADATION FORECAST */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-6 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-teal-950/70 border border-teal-700/50 text-teal-300 font-mono text-[10px] font-bold">
                PROPOSED TRANSFORMER MODEL
              </span>
              <h3 className="font-mono font-bold text-sm text-slate-100">
                48-Hour Forward Degradation Risk Trajectory (Simulated Output)
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Proposed temporal multi-head self-attention architecture capturing thermal kinetics, pH drift, and TDS evaporative concentration
            </p>
          </div>

          {/* Horizon Selector */}
          <div className="flex items-center rounded-lg bg-[#0d1624] p-0.5 border border-slate-800 font-mono text-xs">
            <span className="text-slate-400 px-2 text-[11px]">Horizon:</span>
            {[12, 24, 48].map((h) => (
              <button
                key={h}
                onClick={() => setSelectedHorizon(h as any)}
                className={clsx(
                  'px-2.5 py-1 rounded transition-colors',
                  selectedHorizon === h
                    ? 'bg-teal-950/80 text-teal-300 font-bold border border-teal-600/50 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                +{h} Hours
              </button>
            ))}
          </div>
        </div>

        {/* Forecast Chart Canvas */}
        <div className="h-72 w-full font-mono text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forecastData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="predictedRiskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="hourLabel" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#0b1320] border border-teal-700/60 p-3 rounded-lg shadow-xl font-mono text-xs space-y-1.5">
                        <div className="text-teal-400 text-[11px] font-bold border-b border-slate-800 pb-1">
                          Forecast Horizon: {label}
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-300">Predicted Risk:</span>
                          <span className="text-emerald-300 font-bold">{data.predictedRiskScore} / 100</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Confidence Interval: [{data.confidenceLower} - {data.confidenceUpper}]
                        </div>
                        <div className="pt-1 border-t border-slate-800 text-[10px] grid grid-cols-3 gap-2 text-slate-300">
                          <div>Temp: <strong className="text-cyan-300">{data.forecastTemp}°C</strong></div>
                          <div>pH: <strong className="text-teal-300">{data.forecastPh}</strong></div>
                          <div>TDS: <strong className="text-sky-300">{data.forecastTds}ppm</strong></div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="predictedRiskScore"
                name="Predicted Degradation Risk"
                stroke="#14b8a6"
                strokeWidth={2.5}
                fill="url(#predictedRiskGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Forecast Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800 font-mono text-xs">
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase">PROJECTED 24H PEAK RISK</div>
            <div className="text-lg font-bold text-teal-300 mt-1">
              {forecastData.find((f) => f.hourLabel === '+24h')?.predictedRiskScore || riskScore} / 100
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              Transformer anticipates thermal incubation acceleration.
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase">PREDICTED STAGNANT PH SHIFT</div>
            <div className="text-lg font-bold text-cyan-300 mt-1">
              Δ {((forecastData[forecastData.length - 1]?.forecastPh || 7.4) - (activeNode.id === 'node-01' ? 7.65 : 7.2)).toFixed(2)} pH
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              Net hydrogen ion deviation over forecast horizon.
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase">ESTIMATED EVAPORATIVE TDS DRIFT</div>
            <div className="text-lg font-bold text-sky-300 mt-1">
              +{(forecastData[forecastData.length - 1]?.forecastTds || 400) - (forecastData[0]?.forecastTds || 340)} ppm
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              Dissolved solid ionic accumulation in stagnant basin.
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: GNN SPATIAL RELATIONAL NETWORK GRAPH */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-6 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/50 text-emerald-300 font-mono text-[10px] font-bold">
                PROPOSED GRAPH NEURAL NETWORK (GNN)
              </span>
              <h3 className="font-mono font-bold text-sm text-slate-100">
                Spatial Hydraulic Relational Topology &amp; Risk Propagation (Simulated)
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Proposed message-passing GNN architecture modeling simulated seepage, runoff channels, and biological degradation spread between nodes
            </p>
          </div>

          <span className="text-[11px] font-mono text-slate-400">
            1 Prototype + 4 Simulated Nodes • 5 Relational Edges
          </span>
        </div>

        {/* Spatial Graph Diagram */}
        <div className="relative rounded-xl bg-[#070d16] border border-slate-800/80 p-6 min-h-[340px] flex items-center justify-center overflow-hidden">
          
          {/* Spatial Node Map (Interactive network visualization) */}
          <div className="w-full max-w-2xl h-72 relative">
            
            {/* SVG Connecting Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {gnnSpatialEdges.map((edge, idx) => {
                const src = nodes.find((n) => n.id === edge.sourceNodeId);
                const tgt = nodes.find((n) => n.id === edge.targetNodeId);
                if (!src || !tgt) return null;

                const isHigh = edge.propagationRisk === 'HIGH';
                const strokeColor = isHigh ? '#f43f5e' : edge.propagationRisk === 'MEDIUM' ? '#f59e0b' : '#0ea5e9';

                return (
                  <g key={idx}>
                    <line
                      x1={`${src.gridPosition.x}%`}
                      y1={`${src.gridPosition.y}%`}
                      x2={`${tgt.gridPosition.x}%`}
                      y2={`${tgt.gridPosition.y}%`}
                      stroke={strokeColor}
                      strokeWidth={edge.couplingWeight * 3 + 1}
                      strokeDasharray={edge.flowDirection === 'STAGNANT_SEEPAGE' ? '4 4' : undefined}
                      opacity={0.6}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Rendered Nodes on Grid */}
            {gnnSpatialNodes.map((gNode) => {
              const baseNode = nodes.find((n) => n.id === gNode.nodeId);
              if (!baseNode) return null;
              const isSelected = gNode.nodeId === activeNode.id;

              return (
                <div
                  key={gNode.nodeId}
                  onClick={() => setActiveNodeId(gNode.nodeId)}
                  style={{
                    left: `${baseNode.gridPosition.x}%`,
                    top: `${baseNode.gridPosition.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className={clsx(
                    'absolute p-2.5 rounded-xl border font-mono text-xs cursor-pointer transition-all shadow-xl flex flex-col items-center gap-1 z-10',
                    isSelected
                      ? 'bg-cyan-950/90 border-cyan-400 scale-110 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                      : 'bg-[#0d1624] border-slate-700 hover:border-cyan-500/60'
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={clsx(
                        'w-2 h-2 rounded-full',
                        gNode.riskLevel === 'CRITICAL'
                          ? 'bg-rose-500 animate-ping'
                          : gNode.riskLevel === 'ELEVATED'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      )}
                    />
                    <span className="font-bold text-[11px] text-slate-100">{baseNode.code}</span>
                  </div>

                  <div className="text-[10px] text-slate-300 font-semibold">
                    Risk: <span className="text-teal-300">{gNode.riskScore}/100</span>
                  </div>

                  <div className="text-[9px] text-slate-400 truncate max-w-[100px]">
                    {baseNode.waterBodyType.split(' ')[0]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* GNN Relational Edge Weights Table */}
        <div className="p-4 rounded-lg bg-[#0d1624] border border-slate-800 font-mono text-xs space-y-2">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
            GNN ESTIMATED SPATIAL COUPLING WEIGHTS &amp; SEEPAGE VECTORS (PROPOSED MODEL)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]">
            {gnnSpatialEdges.map((e, idx) => (
              <div key={idx} className="p-2 rounded bg-[#090e17] border border-slate-800 flex items-center justify-between">
                <span className="text-slate-300">
                  {e.sourceNodeId} → {e.targetNodeId}
                </span>
                <span className="text-cyan-300 font-bold">
                  Weight: {e.couplingWeight}
                </span>
                <span className={clsx('text-[10px] px-1 rounded', e.propagationRisk === 'HIGH' ? 'text-rose-300 bg-rose-950/60' : 'text-slate-400')}>
                  {e.propagationRisk}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3: FEATURE IMPORTANCE / MODEL EXPLAINABILITY */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-mono font-bold text-sm text-slate-100">
              Model Feature Importance &amp; Biological Contribution Weights
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Shapley / Attention attribution values indicating parameter influence on stagnant water degradation
            </p>
          </div>
          <span className="text-xs font-mono text-teal-400">
            Transformer Attention Attribution
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          {featureImportance.map((feat) => (
            <div key={feat.feature} className="p-4 rounded-xl bg-[#0d1624] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">{feat.feature}</span>
                <span className="text-teal-300 font-bold">{feat.weight}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full rounded-full bg-[#080d16] border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full"
                  style={{ width: `${feat.weight}%` }}
                />
              </div>

              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
};
