import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useTelemetry } from '../context/TelemetryContext';
import { DirectVsModelBadge } from '../components/common/DirectVsModelBadge';
import {
  BrainCircuit,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';

export const Predictions: React.FC = () => {
  const { latestModel, latestReading, activeNode, nodes } = useTelemetry();
  const [selectedHorizon, setSelectedHorizon] = useState<48 | 24 | 12>(48);

  if (!latestModel || !activeNode) {
    return (
      <div className="p-8 text-center font-mono text-xs text-teal-400">
        COMPUTING TRANSFORMER & GNN TEMPORAL/SPATIAL GRAPH FORECASTS...
      </div>
    );
  }

  const { transformerForecast, gnnSpatialNodes, gnnSpatialEdges, featureImportance, riskScore, modelConfidence, degradationProgression } = latestModel;

  const forecastData = [
    {
      hourLabel: 'NOW',
      predictedRiskScore: riskScore,
      confidenceLower: riskScore,
      confidenceUpper: riskScore,
      forecastTemp: latestReading?.temperature || 0,
      forecastPh: latestReading?.ph || 0,
      riskClass: latestModel.degradationRisk,
    },
    ...transformerForecast
      .filter((f) => f.hoursAhead <= selectedHorizon)
      .map((item) => ({
      hourLabel: `+${item.hoursAhead}h`,
      predictedRiskScore: item.predictedRiskScore,
      confidenceLower: item.confidenceLower,
      confidenceUpper: item.confidenceUpper,
      forecastTemp: item.forecastTemp,
      forecastPh: item.forecastPh,
      riskClass: item.growthRiskClass,
      })),
  ];

  return (
    <div className="flex flex-col space-y-8 pb-12">
      
      {/* Top Banner */}
      <div className="order-1 p-5 rounded-2xl bg-gradient-to-r from-[#0d1726] via-[#09111c] to-[#070c14] border border-teal-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-teal-950/80 border border-teal-600/50 text-teal-400">
              <BrainCircuit className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold font-mono text-slate-100">
                STAGRA Prediction &amp; Analysis
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                Model-based assessment of stagnation tendency and future degradation from temporal water-quality patterns.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-[#070c14] border border-slate-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>PROPOSED MODEL <strong className="text-emerald-300">SIMULATED OUTPUT</strong></span>
          </div>
          <DirectVsModelBadge type="PREDICTED" variant="minimal" />
        </div>
      </div>

      {/* Primary degradation assessment */}
      <section className="order-2 rounded-xl bg-[#0a101b] border border-teal-500/40 p-6 shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[10px] text-teal-300 font-mono font-bold tracking-wider">DEGRADATION RISK</div>
            <div className="text-4xl font-bold font-mono text-slate-100 mt-1">{riskScore} <span className="text-lg text-slate-400">/ 100</span></div>
            <p className="text-xs text-slate-400 font-sans mt-2">Estimated from temporal changes in measured temperature and pH.</p>
          </div>
          <div className="grid grid-cols-3 gap-5 font-mono text-xs">
            <div><div className="text-slate-500 text-[10px]">RISK LEVEL</div><div className="text-amber-300 font-bold mt-1">{latestModel.degradationRisk}</div></div>
            <div><div className="text-slate-500 text-[10px]">CONFIDENCE</div><div className="text-cyan-300 font-bold mt-1">{modelConfidence}%</div></div>
            <div><div className="text-slate-500 text-[10px]">STATUS</div><div className="text-emerald-300 font-bold mt-1">SIMULATED OUTPUT</div></div>
          </div>
        </div>
      </section>

      {/* SECTION 1: TRANSFORMER TEMPORAL DEGRADATION FORECAST */}
      <section className="order-3 rounded-xl bg-[#0a101b] border border-slate-800 p-6 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-teal-950/70 border border-teal-700/50 text-teal-300 font-mono text-[10px] font-bold">
                PROPOSED TRANSFORMER MODEL
              </span>
              <h3 className="font-mono font-bold text-sm text-slate-100">
                48-Hour Degradation Risk Forecast
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Estimated progression from temporal changes in measured temperature and pH. Simulated model output.
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
              Estimated from temporal risk progression.
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase">PREDICTED pH SHIFT</div>
            <div className="text-lg font-bold text-cyan-300 mt-1">
              Δ {((forecastData[forecastData.length - 1]?.forecastPh || latestReading?.ph || 0) - (latestReading?.ph || 0)).toFixed(2)} pH
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              Net hydrogen ion deviation over forecast horizon.
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase">PREDICTED TEMPERATURE CHANGE</div>
            <div className="text-lg font-bold text-cyan-300 mt-1">
              {((forecastData[forecastData.length - 1]?.forecastTemp || latestReading?.temperature || 0) - (latestReading?.temperature || 0)).toFixed(1)} °C
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              Estimated change across the selected forecast horizon.
            </div>
          </div>
        </div>
      </section>

      {/* Aquatic growth suitability */}
      <section className="order-5 rounded-xl bg-[#0a101b] border border-slate-800 p-6 shadow-lg space-y-4">
        <div className="pb-3 border-b border-slate-800">
          <h3 className="font-mono font-bold text-sm text-slate-100">AQUATIC GROWTH SUITABILITY</h3>
          <p className="text-xs text-slate-400 font-sans mt-0.5">Estimated environmental suitability from simulated model output.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">
            <div className="font-bold text-slate-200">General aquatic vegetation</div>
            <div className="text-2xl text-teal-300 font-bold mt-2">{degradationProgression.bacterialGrowthIndexEst}/100</div>
            <div className="text-slate-400 mt-1">Estimated environmental suitability</div>
            <div className="flex justify-between mt-3 text-[10px]"><span>Confidence</span><span className="text-cyan-300">{modelConfidence}%</span></div>
            <div className="text-emerald-300 mt-1">Compatibility: model-estimated</div>
          </div>
        </div>
      </section>

      {/* SECTION 2: PROPOSED MULTI-NODE SPATIAL EXTENSION */}
<section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg space-y-4">
  <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-slate-800">
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/50 text-emerald-300 font-mono text-[10px] font-bold">
          PROPOSED GNN
        </span>

        <h3 className="font-mono font-bold text-sm text-slate-100">
          Multi-Node Spatial Extension
        </h3>
      </div>

      <p className="text-xs text-slate-400 font-sans mt-1 max-w-2xl">
        Future graph-based analysis for relationships between multiple
        water-sampling locations.
      </p>
    </div>

    <span className="text-[10px] font-mono text-amber-300 border border-amber-700/40 bg-amber-950/20 px-2 py-1 rounded">
      FUTURE RESEARCH
    </span>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div className="p-4 rounded-lg bg-[#0d1624] border border-cyan-700/30">
      <div className="text-[10px] text-slate-400 font-mono uppercase">
        Current Deployment
      </div>

      <div className="mt-2 text-lg font-bold font-mono text-cyan-300">
        1 Node
      </div>

      <div className="mt-1 text-[11px] text-slate-400">
        One physical ESP32 prototype monitoring node.
      </div>
    </div>

    <div className="p-4 rounded-lg bg-[#0d1624] border border-slate-800">
      <div className="text-[10px] text-slate-400 font-mono uppercase">
        Future Extension
      </div>

      <div className="mt-2 text-lg font-bold font-mono text-teal-300">
        Multiple Nodes
      </div>

      <div className="mt-1 text-[11px] text-slate-400">
        Additional sampling locations can form a spatial graph.
      </div>
    </div>

    <div className="p-4 rounded-lg bg-[#0d1624] border border-slate-800">
      <div className="text-[10px] text-slate-400 font-mono uppercase">
        Proposed Method
      </div>

      <div className="mt-2 text-lg font-bold font-mono text-emerald-300">
        GNN
      </div>

      <div className="mt-1 text-[11px] text-slate-400">
        Learns relationships between connected sampling locations.
      </div>
    </div>
  </div>

  <div className="p-3 rounded-lg bg-[#070d16] border border-slate-800 font-mono text-xs">
    <div className="flex flex-wrap items-center justify-center gap-2 text-slate-300">
      <span className="px-2.5 py-1 rounded border border-slate-700 bg-[#0d1624]">
        Sampling Nodes
      </span>

      <span className="text-teal-400">→</span>

      <span className="px-2.5 py-1 rounded border border-slate-700 bg-[#0d1624]">
        Graph Construction
      </span>

      <span className="text-teal-400">→</span>

      <span className="px-2.5 py-1 rounded border border-emerald-700/50 bg-emerald-950/20 text-emerald-300">
        Proposed GNN
      </span>
    </div>

    <div className="mt-2 text-center text-[10px] text-slate-500">
      Illustrative future architecture — not current physical deployment.
    </div>
  </div>
</section>

      {/* Simulated model contribution */}
      <section className="order-6 rounded-xl bg-[#0a101b] border border-slate-800 p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-mono font-bold text-sm text-slate-100">
              SIMULATED MODEL CONTRIBUTION
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Illustrative contribution weights — simulated. These are not learned scientific feature-importance measurements.
            </p>
          </div>
          <span className="text-xs font-mono text-teal-400">
            Proposed temporal model
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

      {/* Model status */}
      <section className="order-8 rounded-xl bg-[#0a101b] border border-slate-800 p-6 shadow-lg">
        <h3 className="font-mono font-bold text-sm text-slate-100 mb-4">MODEL STATUS</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800"><div className="text-slate-500 text-[10px]">TEMPORAL MODEL</div><div className="text-teal-300 font-bold mt-1">Proposed Transformer</div></div>
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800"><div className="text-slate-500 text-[10px]">SPATIAL MODEL</div><div className="text-teal-300 font-bold mt-1">Proposed GNN</div></div>
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800"><div className="text-slate-500 text-[10px]">DATA</div><div className="text-amber-300 font-bold mt-1">Simulated</div></div>
          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800"><div className="text-slate-500 text-[10px]">INFERENCE</div><div className="text-amber-300 font-bold mt-1">Prototype / Simulated</div></div>
        </div>
      </section>

    </div>
  );
};
