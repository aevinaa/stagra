import React, { useMemo, useState } from 'react';
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
  ShieldCheck,
  Network,
  AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';

type ForecastHorizon = 12 | 24 | 48;

export const Predictions: React.FC = () => {
  const {
    latestModel,
    latestReading,
    activeNode,
  } = useTelemetry();

  const [selectedHorizon, setSelectedHorizon] =
    useState<ForecastHorizon>(48);

  if (!latestModel || !activeNode) {
    return (
      <div className="p-8 text-center font-mono text-xs text-teal-400">
        COMPUTING SIMULATED PREDICTION OUTPUT...
      </div>
    );
  }

  const {
    transformerForecast,
    riskScore,
    modelConfidence,
    degradationProgression,
    featureImportance,
  } = latestModel;

  /* =========================================================
     FORECAST DATA
     ========================================================= */

  const forecastData = useMemo(() => {
    const nowPoint = {
      hourLabel: 'NOW',
      predictedRiskScore: riskScore,
      confidenceLower: riskScore,
      confidenceUpper: riskScore,
      forecastTemp: latestReading?.temperature ?? 0,
      forecastPh: latestReading?.ph ?? 0,
    };

    const futurePoints = transformerForecast
      .filter(
        (point) =>
          point.hoursAhead <= selectedHorizon
      )
      .map((point) => ({
        hourLabel: `+${point.hoursAhead}h`,
        predictedRiskScore: point.predictedRiskScore,
        confidenceLower: point.confidenceLower,
        confidenceUpper: point.confidenceUpper,
        forecastTemp: point.forecastTemp,
        forecastPh: point.forecastPh,
      }));

    return [nowPoint, ...futurePoints];
  }, [
    transformerForecast,
    selectedHorizon,
    riskScore,
    latestReading,
  ]);

  const finalForecast =
    forecastData[forecastData.length - 1] ?? {
      predictedRiskScore: riskScore,
      forecastTemp: latestReading?.temperature ?? 0,
      forecastPh: latestReading?.ph ?? 0,
    };

  const forecast24 =
    forecastData.find(
      (point) => point.hourLabel === '+24h'
    ) ?? finalForecast;

  const predictedPhShift = (
    finalForecast.forecastPh -
    (latestReading?.ph ?? finalForecast.forecastPh)
  ).toFixed(2);

  const predictedTemperatureChange = (
    finalForecast.forecastTemp -
    (latestReading?.temperature ??
      finalForecast.forecastTemp)
  ).toFixed(1);

  const growthSuitability = Math.min(
    100,
    Math.max(
      0,
      degradationProgression?.bacterialGrowthIndexEst ?? 0
    )
  );

  const getRiskTheme = (score: number) => {
    if (score >= 75) {
      return {
        text: 'text-rose-400',
        bg: 'bg-rose-950/30',
        border: 'border-rose-700/50',
        label: 'CRITICAL',
      };
    }

    if (score >= 55) {
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-950/30',
        border: 'border-amber-700/50',
        label: 'ELEVATED',
      };
    }

    if (score >= 35) {
      return {
        text: 'text-yellow-400',
        bg: 'bg-yellow-950/30',
        border: 'border-yellow-700/40',
        label: 'MODERATE',
      };
    }

    return {
      text: 'text-emerald-400',
      bg: 'bg-emerald-950/30',
      border: 'border-emerald-700/40',
      label: 'LOW',
    };
  };

  const riskTheme = getRiskTheme(
    finalForecast.predictedRiskScore
  );

  return (
    <div className="space-y-6 pb-12">

      {/* =====================================================
          HEADER
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-indigo-800/40 p-5 shadow-lg">

        <div className="flex flex-wrap items-center justify-between gap-4">

          <div className="flex items-start gap-3">

            <div className="p-2.5 rounded-lg bg-indigo-950/50 border border-indigo-700/50 text-indigo-400">
              <BrainCircuit className="w-5 h-5" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">

                <h1 className="text-lg sm:text-xl font-bold font-mono text-slate-100">
                  STAGRA Prediction &amp; Analysis
                </h1>

                <DirectVsModelBadge
                  type="PREDICTED"
                  variant="minimal"
                />

              </div>

              <p className="text-xs text-slate-400 font-sans mt-1 max-w-2xl">
                Simulated assessment of stagnation tendency and
                future degradation based on temporal changes in
                measured temperature and pH.
              </p>
            </div>

          </div>


          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-700/50 bg-indigo-950/20">

            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />

            <span className="text-[10px] font-mono font-bold text-indigo-300">
              PROPOSED MODEL
            </span>

            <span className="text-[10px] font-mono text-slate-500">
              · SIMULATED
            </span>

          </div>

        </div>

      </section>


      {/* =====================================================
          PRIMARY RISK SUMMARY
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-teal-800/50 p-5 shadow-lg">

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">

          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-teal-300">
              Simulated Degradation Risk
            </div>

            <div className="flex items-baseline gap-2 mt-1">

              <span className="text-4xl font-extrabold font-mono text-slate-100">
                {riskScore}
              </span>

              <span className="text-lg font-mono text-slate-500">
                / 100
              </span>

            </div>

            <p className="text-xs text-slate-400 mt-2 max-w-lg">
              Derived from the current temporal behaviour of
              measured temperature and pH.
            </p>
          </div>


          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">

            <div>
              <div className="text-[9px] font-mono uppercase text-slate-500">
                Risk Level
              </div>

              <div className={clsx(
                'text-sm font-bold font-mono mt-1',
                riskTheme.text
              )}>
                {latestModel.degradationRisk}
              </div>
            </div>


            <div>
              <div className="text-[9px] font-mono uppercase text-slate-500">
                Confidence
              </div>

              <div className="text-sm font-bold font-mono text-indigo-300 mt-1">
                {modelConfidence}%
              </div>

              <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                SIMULATED
              </div>
            </div>


            <div>
              <div className="text-[9px] font-mono uppercase text-slate-500">
                Output Status
              </div>

              <div className="text-sm font-bold font-mono text-emerald-300 mt-1">
                SIMULATED
              </div>
            </div>

          </div>

        </div>


        {/* Confidence clarification */}
        <div className="mt-4 pt-3 border-t border-slate-800">
          <p className="text-[10px] leading-5 text-slate-500 font-sans">
            The displayed confidence is a simulated model-output
            value for prototype demonstration. It does not represent
            validated predictive accuracy or field performance.
          </p>
        </div>

      </section>


      {/* =====================================================
          FORECAST
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg">

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">

          <div>
            <div className="flex items-center gap-2">

              <span className="px-2 py-0.5 rounded bg-indigo-950/50 border border-indigo-700/50 text-indigo-300 text-[9px] font-mono font-bold">
                PROPOSED TRANSFORMER
              </span>

              <h2 className="text-sm font-bold font-mono text-slate-100">
                Forward Degradation Forecast
              </h2>

            </div>

            <p className="text-[11px] text-slate-400 mt-1">
              Simulated temporal projection from the current measured
              temperature and pH time series.
            </p>
          </div>


          <div className="flex items-center rounded-lg bg-[#0d1624] p-1 border border-slate-800 font-mono text-[10px]">

            <span className="px-2 text-slate-500">
              Horizon
            </span>

            {[12, 24, 48].map((hours) => (
              <button
                key={hours}
                onClick={() =>
                  setSelectedHorizon(
                    hours as ForecastHorizon
                  )
                }
                className={clsx(
                  'px-2.5 py-1.5 rounded transition-colors',
                  selectedHorizon === hours
                    ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                +{hours}h
              </button>
            ))}

          </div>

        </div>


        {/* Simulated forecast notice */}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/15 p-3">

          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />

          <p className="text-[10px] leading-5 text-amber-200/80">
            Forecast values are simulated for prototype and research
            interface testing. They should not be interpreted as
            validated environmental predictions.
          </p>

        </div>


        {/* Chart */}
        <div className="h-72 mt-5">

          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={forecastData}
              margin={{
                top: 10,
                right: 20,
                left: -15,
                bottom: 0,
              }}
            >

              <defs>
                <linearGradient
                  id="predictionRiskGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="#6366f1"
                    stopOpacity={0.30}
                  />

                  <stop
                    offset="95%"
                    stopColor="#6366f1"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>


              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                vertical={false}
              />


              <XAxis
                dataKey="hourLabel"
                stroke="#64748b"
                tick={{
                  fontSize: 9,
                  fill: '#94a3b8',
                }}
                tickLine={{
                  stroke: '#334155',
                }}
              />


              <YAxis
                domain={[0, 100]}
                stroke="#64748b"
                tick={{
                  fontSize: 9,
                  fill: '#94a3b8',
                }}
                tickLine={{
                  stroke: '#334155',
                }}
              />


              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }

                  const point = payload[0].payload;

                  return (
                    <div className="bg-[#0b1320] border border-indigo-700/50 p-3 rounded-lg shadow-xl font-mono text-xs min-w-[205px]">

                      <div className="text-indigo-300 font-bold text-[10px]">
                        FORECAST · {label}
                      </div>

                      <div className="mt-2">
                        <span className="text-slate-500 text-[9px]">
                          RISK SCORE
                        </span>

                        <div className="text-lg font-bold text-indigo-300">
                          {point.predictedRiskScore} / 100
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800">

                        <div>
                          <div className="text-[9px] text-slate-500">
                            TEMPERATURE
                          </div>

                          <div className="text-cyan-300">
                            {point.forecastTemp} °C
                          </div>
                        </div>

                        <div>
                          <div className="text-[9px] text-slate-500">
                            pH
                          </div>

                          <div className="text-teal-300">
                            {point.forecastPh}
                          </div>
                        </div>

                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-800 text-[9px] text-slate-500">
                        Simulated forecast output
                      </div>

                    </div>
                  );
                }}
              />


              <Area
                type="monotone"
                dataKey="predictedRiskScore"
                stroke="#6366f1"
                strokeWidth={2.5}
                fill="url(#predictionRiskGradient)"
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  fill: '#0a101b',
                }}
              />

            </AreaChart>
          </ResponsiveContainer>

        </div>


        {/* Forecast summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-800">

          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">

            <div className="text-[9px] text-slate-500 font-mono uppercase">
              Projected 24h Risk
            </div>

            <div className="text-lg font-bold font-mono text-indigo-300 mt-1">
              {forecast24.predictedRiskScore} / 100
            </div>

            <p className="text-[9px] text-slate-500 mt-1">
              Simulated temporal projection.
            </p>

          </div>


          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">

            <div className="text-[9px] text-slate-500 font-mono uppercase">
              Predicted pH Shift
            </div>

            <div className="text-lg font-bold font-mono text-teal-300 mt-1">
              Δ {predictedPhShift} pH
            </div>

            <p className="text-[9px] text-slate-500 mt-1">
              Simulated change across the selected horizon.
            </p>

          </div>


          <div className="p-3 rounded-lg bg-[#0d1624] border border-slate-800">

            <div className="text-[9px] text-slate-500 font-mono uppercase">
              Predicted Temperature Change
            </div>

            <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
              {predictedTemperatureChange} °C
            </div>

            <p className="text-[9px] text-slate-500 mt-1">
              Simulated change across the selected horizon.
            </p>

          </div>

        </div>

      </section>


      {/* =====================================================
          AQUATIC GROWTH SUITABILITY
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg">

        <div className="flex items-start gap-3 pb-4 border-b border-slate-800">

          <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-800/50">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>

          <div>
            <div className="flex items-center gap-2">

              <h2 className="text-sm font-bold font-mono text-slate-100">
                Aquatic Growth Suitability
              </h2>

              <DirectVsModelBadge
                type="PREDICTED"
                variant="minimal"
              />

            </div>

            <p className="text-[11px] text-slate-400 mt-1">
              Simulated environmental suitability estimate based on
              the available measured parameters.
            </p>
          </div>

        </div>


        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">

          <div className="p-4 rounded-lg bg-[#0d1624] border border-emerald-800/30">

            <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
              General Aquatic Vegetation
            </div>

            <div className="text-3xl font-bold font-mono text-emerald-300 mt-2">
              {growthSuitability}/100
            </div>

            <div className="mt-2 h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full"
                style={{
                  width: `${growthSuitability}%`,
                }}
              />
            </div>

            <div className="flex justify-between mt-2 text-[9px] font-mono text-slate-500">
              <span>LOW</span>
              <span>MODEL ESTIMATE</span>
              <span>HIGH</span>
            </div>

          </div>


          <div className="lg:col-span-2 p-4 rounded-lg bg-amber-950/10 border border-amber-900/40">

            <div className="flex items-start gap-2">

              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />

              <div>

                <div className="text-[10px] font-mono font-bold text-amber-300 uppercase">
                  Interpretation Notice
                </div>

                <p className="text-[10px] leading-5 text-slate-400 mt-1">
                  This score is a simulated environmental suitability
                  estimate. It does not identify a specific algae,
                  plant, or microbial species and does not guarantee
                  that an organism will grow in the sampled water.
                  Species-level assessment would require additional
                  environmental and biological measurements.
                </p>

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          PROPOSED GNN — SECONDARY
          ===================================================== */}
      <section className="rounded-xl bg-[#090f19] border border-slate-800 p-5">

        <div className="flex items-start justify-between gap-4">

          <div className="flex items-start gap-3">

            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
              <Network className="w-4 h-4 text-slate-400" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">

                <h2 className="text-sm font-bold font-mono text-slate-200">
                  Future Spatial Extension
                </h2>

                <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-slate-400 text-[9px] font-mono">
                  PROPOSED GNN
                </span>

              </div>

              <p className="text-[10px] text-slate-500 mt-1 max-w-2xl">
                A future graph-based model could represent relationships
                between multiple sampling locations once additional
                physical nodes are available.
              </p>
            </div>

          </div>

          <span className="hidden sm:inline px-2 py-1 rounded border border-slate-700 bg-slate-900 text-slate-500 text-[9px] font-mono">
            FUTURE RESEARCH
          </span>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">

          <div className="p-3 rounded-lg bg-[#0c131e] border border-slate-800">
            <div className="text-[9px] font-mono uppercase text-slate-500">
              Current Deployment
            </div>

            <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
              1 Node
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Single physical ESP32 prototype.
            </p>
          </div>


          <div className="p-3 rounded-lg bg-[#0c131e] border border-slate-800">
            <div className="text-[9px] font-mono uppercase text-slate-500">
              Future Input
            </div>

            <div className="text-lg font-bold font-mono text-slate-300 mt-1">
              Multiple Nodes
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Additional sampling locations.
            </p>
          </div>


          <div className="p-3 rounded-lg bg-[#0c131e] border border-slate-800">
            <div className="text-[9px] font-mono uppercase text-slate-500">
              Proposed Method
            </div>

            <div className="text-lg font-bold font-mono text-slate-300 mt-1">
              Graph Neural Network
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Future spatial relationship modelling.
            </p>
          </div>

        </div>


        <div className="mt-3 p-2.5 rounded-lg bg-[#070c14] border border-slate-800 text-center text-[9px] font-mono text-slate-500">
          Illustrative architecture only — not current physical
          deployment or learned spatial weights.
        </div>

      </section>


      {/* =====================================================
          SIMULATED MODEL CONTRIBUTION
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg">

        <div className="pb-4 border-b border-slate-800">

          <div className="flex items-center justify-between gap-3">

            <div>
              <h2 className="text-sm font-bold font-mono text-slate-100">
                Simulated Model Contribution
              </h2>

              <p className="text-[10px] text-slate-500 mt-1">
                Illustrative contribution weights for interface testing;
                these are not learned scientific feature-importance values.
              </p>
            </div>

            <span className="text-[10px] font-mono text-indigo-400">
              PROPOSED TEMPORAL MODEL
            </span>

          </div>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">

          {featureImportance
            .filter(
              (feature) =>
                !feature.feature
                  .toLowerCase()
                  .includes('tds')
            )
            .map((feature) => (
              <div
                key={feature.feature}
                className="p-3 rounded-lg bg-[#0d1624] border border-slate-800"
              >

                <div className="flex items-center justify-between gap-3">

                  <span className="text-[11px] font-mono font-bold text-slate-300">
                    {feature.feature}
                  </span>

                  <span className="text-[11px] font-mono font-bold text-cyan-300">
                    {feature.weight}%
                  </span>

                </div>


                <div className="mt-2 h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">

                  <div
                    className="h-full rounded-full bg-cyan-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, feature.weight)
                      )}%`,
                    }}
                  />

                </div>


                <p className="text-[10px] text-slate-500 mt-2 leading-5">
                  {feature.description}
                </p>

              </div>
            ))}

        </div>

      </section>


      {/* =====================================================
          MODEL STATUS
          ===================================================== */}
      <section className="rounded-xl bg-[#090f19] border border-slate-800 p-5">

        <div className="flex items-center gap-2 mb-4">

          <BrainCircuit className="w-4 h-4 text-indigo-400" />

          <h2 className="text-sm font-bold font-mono text-slate-100">
            Model Status
          </h2>

        </div>


        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          <div className="p-3 rounded-lg bg-[#0c131e] border border-slate-800">
            <div className="text-[9px] font-mono uppercase text-slate-500">
              Temporal Model
            </div>

            <div className="text-sm font-bold font-mono text-indigo-300 mt-1">
              Proposed Transformer
            </div>
          </div>


          <div className="p-3 rounded-lg bg-[#0c131e] border border-slate-800">
            <div className="text-[9px] font-mono uppercase text-slate-500">
              Spatial Model
            </div>

            <div className="text-sm font-bold font-mono text-slate-400 mt-1">
              Proposed GNN
            </div>
          </div>


          <div className="p-3 rounded-lg bg-[#0c131e] border border-slate-800">
            <div className="text-[9px] font-mono uppercase text-slate-500">
              Data
            </div>

            <div className="text-sm font-bold font-mono text-amber-300 mt-1">
              Simulated
            </div>
          </div>


          <div className="p-3 rounded-lg bg-[#0c131e] border border-slate-800">
            <div className="text-[9px] font-mono uppercase text-slate-500">
              Validation
            </div>

            <div className="text-sm font-bold font-mono text-slate-400 mt-1">
              Not Yet Validated
            </div>
          </div>

        </div>

      </section>

    </div>
  );
};