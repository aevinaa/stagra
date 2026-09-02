import React from 'react';
import {
  Waves,
  Cpu,
  BrainCircuit,
  Database,
  LineChart,
  ArrowRight,
  ShieldCheck,
  Thermometer,
  Droplet,
  Gauge,
  Activity,
  Layers,
  Sparkles,
  ChevronRight,
  Network,
  Radio,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTelemetry } from '../context/TelemetryContext';
import { DirectVsModelBadge } from '../components/common/DirectVsModelBadge';
import { StatusPill } from '../components/common/StatusPill';

export const Home: React.FC = () => {
  const { nodes, latestReading, latestModel, activeNode } = useTelemetry();

  return (
    <div className="space-y-10 pb-12">
      
      {/* Research Hero Section */}
      <section className="relative rounded-2xl bg-gradient-to-b from-[#0e1726] to-[#080d16] border border-cyan-500/30 p-6 sm:p-10 shadow-2xl overflow-hidden bg-grid-scientific">
        <div className="relative z-10 max-w-4xl space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-600/50 font-mono text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              University Embedded Systems Research
            </span>
            <span className="px-2.5 py-1 rounded-full bg-teal-950/80 text-teal-300 border border-teal-600/50 font-mono text-xs font-semibold">
              IoT Stagnant Water Prediction
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-100 tracking-tight font-mono">
            STAGRA
          </h1>
          <p className="text-lg sm:text-xl text-cyan-300/90 font-medium">
            Stagnant Water Assessment and Growth Risk Analysis
          </p>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-3xl">
            An end-to-end IoT monitoring and degradation prediction platform. 
            STAGRA acquires real-time physical telemetry (<strong>Temperature, pH, TDS</strong>) via prototype ESP32 microcontroller 
            and evaluates stagnant water growth risk using a proposed model architecture of temporal <strong>Transformers</strong> and spatial <strong>Graph Neural Networks (GNNs)</strong>.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-3">
            <Link
              to="/dashboard"
              className="px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)]"
            >
              <span>Launch Telemetry Console</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              to="/predictions"
              className="px-5 py-2.5 rounded-lg bg-[#0d1624] hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs flex items-center gap-2 transition-colors"
            >
              <BrainCircuit className="w-4 h-4 text-teal-400" />
              <span>Explore ML Predictions</span>
            </Link>

            <Link
              to="/system"
              className="px-5 py-2.5 rounded-lg bg-[#0d1624] hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs flex items-center gap-2 transition-colors"
            >
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>System & Hardware Pipeline</span>
            </Link>
          </div>
        </div>
      </section>

      {/* System Architecture Flow Diagram */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold font-mono text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              System Architecture & Dataflow Pipeline
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Strict isolation: Sensor hardware → Centralized backend ingestion → Neural prediction models → Analytical frontend
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 hidden sm:block">
            9-Stage Ingestion Pipeline
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-2 font-mono text-xs">
          
          {/* Stage 1 */}
          <div className="p-3 rounded-xl bg-[#0a101b] border border-cyan-800/50 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-cyan-400 font-bold uppercase">01. INGESTION</div>
              <div className="font-bold text-slate-100 mt-1">Water Sample</div>
              <p className="text-[10px] text-slate-400 font-sans mt-1">
                Standing stormwater, drainage sump, or retention pond.
              </p>
            </div>
            <div className="text-[10px] text-cyan-400/80 pt-2 border-t border-slate-800 mt-2">
              In-situ Sample
            </div>
          </div>

          {/* Stage 2 */}
          <div className="p-3 rounded-xl bg-[#0a101b] border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.1)] flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-cyan-400 font-bold uppercase">02. TRANSDUCTION</div>
              <div className="font-bold text-cyan-300 mt-1">Temp + pH + TDS</div>
              <p className="text-[10px] text-slate-400 font-sans mt-1">
                Direct physical sensors only. DO/Turbidity in Phase II.
              </p>
            </div>
            <div className="text-[10px] text-cyan-400 pt-2 border-t border-slate-800 mt-2 font-semibold">
              DIRECT SENSOR
            </div>
          </div>

          {/* Stage 3 */}
          <div className="p-3 rounded-xl bg-[#0a101b] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">03. EMBEDDED</div>
              <div className="font-bold text-slate-100 mt-1">ESP32 Node</div>
              <p className="text-[10px] text-slate-400 font-sans mt-1">
                Digitization, 1-Wire parsing, ADC conditioning, WiFi/LoRa.
              </p>
            </div>
            <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800 mt-2">
              5s Sampling Tick
            </div>
          </div>

          {/* Stage 4 */}
          <div className="p-3 rounded-xl bg-[#0a101b] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">04. INGRESS</div>
              <div className="font-bold text-slate-100 mt-1">Backend API</div>
              <p className="text-[10px] text-slate-400 font-sans mt-1">
                REST / WebSocket ingestion endpoints with payload validation.
              </p>
            </div>
            <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800 mt-2">
              REST JSON
            </div>
          </div>

          {/* Stage 5 */}
          <div className="p-3 rounded-xl bg-[#0a101b] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">05. PERSISTENCE</div>
              <div className="font-bold text-slate-100 mt-1">Historical DB</div>
              <p className="text-[10px] text-slate-400 font-sans mt-1">
                Time-series storage for longitudinal research analysis.
              </p>
            </div>
            <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800 mt-2">
              TimescaleDB
            </div>
          </div>

          {/* Stage 6 */}
          <div className="p-3 rounded-xl bg-[#0a101b] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">06. PIPELINE</div>
              <div className="font-bold text-slate-100 mt-1">Preprocessing</div>
              <p className="text-[10px] text-slate-400 font-sans mt-1">
                Moving average filtering, outlier clipping, normalization.
              </p>
            </div>
            <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800 mt-2">
              Feature Matrix
            </div>
          </div>

          {/* Stage 7 */}
          <div className="p-3 rounded-xl bg-[#0a101b] border border-teal-500/40 shadow-[0_0_10px_rgba(20,184,166,0.15)] flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-teal-400 font-bold uppercase">07. PROPOSED AI</div>
              <div className="font-bold text-teal-300 mt-1">Transformer + GNN</div>
              <p className="text-[10px] text-slate-400 font-sans mt-1">
                Transformer (Temporal) &amp; GNN (Spatial graph) architecture.
              </p>
            </div>
            <div className="text-[10px] text-teal-300 pt-2 border-t border-slate-800 mt-2 font-semibold">
              Proposed Model
            </div>
          </div>

          {/* Stage 8 */}
          <div className="p-3 rounded-xl bg-[#0a101b] border border-teal-800/50 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-teal-400 font-bold uppercase">08. INFERENCE</div>
              <div className="font-bold text-slate-100 mt-1">Prediction Layer</div>
              <p className="text-[10px] text-slate-400 font-sans mt-1">
                Degradation risk score (0-100), condition classification.
              </p>
            </div>
            <div className="text-[10px] text-teal-400/80 pt-2 border-t border-slate-800 mt-2">
              SIMULATED OUTPUT
            </div>
          </div>

          {/* Stage 9 */}
          <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.2)] flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-cyan-300 font-bold uppercase">09. INTERFACE</div>
              <div className="font-bold text-cyan-200 mt-1">STAGRA Frontend</div>
              <p className="text-[10px] text-slate-300 font-sans mt-1">
                Scientific console distinguishing direct vs derived data.
              </p>
            </div>
            <div className="text-[10px] text-cyan-300 pt-2 border-t border-cyan-800 mt-2 font-bold">
              Current App
            </div>
          </div>

        </div>
      </section>

      {/* Sensor & Data Category Taxonomy Primer: MEASURED, DERIVED, PREDICTED */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold font-mono text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              Three-Category Data Architecture
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Strict scientific classification separating direct physical hardware measurements, deterministic calculations, and ML forecasts
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <DirectVsModelBadge type="MEASURED" variant="minimal" />
            <DirectVsModelBadge type="DERIVED" variant="minimal" />
            <DirectVsModelBadge type="PREDICTED" variant="minimal" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* CATEGORY 1: MEASURED */}
          <div className="rounded-xl bg-[#0a101b] border border-cyan-800/60 p-5 space-y-4 flex flex-col justify-between shadow-lg">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold block">
                    CATEGORY 1
                  </span>
                  <h3 className="text-base font-bold font-mono text-slate-100">
                    MEASURED
                  </h3>
                </div>
                <DirectVsModelBadge type="MEASURED" variant="minimal" />
              </div>

              <p className="text-xs text-slate-400 font-sans">
                Actual physical sensor telemetry captured directly from electronic probes by the ESP32 sampling node:
              </p>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="p-3 rounded-lg bg-[#0d1624] border border-cyan-950/80 space-y-1">
                  <div className="flex items-center justify-between text-cyan-300 font-bold">
                    <span className="flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5" /> Temperature (°C)</span>
                    <span className="text-[10px] text-cyan-400 font-normal">DS18B20</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Controls thermal reaction kinetics and water column temperature stratification.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0d1624] border border-cyan-950/80 space-y-1">
                  <div className="flex items-center justify-between text-cyan-300 font-bold">
                    <span className="flex items-center gap-1.5"><Droplet className="w-3.5 h-3.5" /> pH Level (pH)</span>
                    <span className="text-[10px] text-cyan-400 font-normal">E-201-C</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Measures hydrogen-ion activity; indicates potential chemical drift or biological activity.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0d1624] border border-cyan-950/80 space-y-1">
                  <div className="flex items-center justify-between text-cyan-300 font-bold">
                    <span className="flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" /> TDS (ppm)</span>
                    <span className="text-[10px] text-cyan-400 font-normal">Induction Probe</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Total Dissolved Solids reflecting mineral accumulation and evaporative stagnation.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-[10px] font-mono text-cyan-400 pt-3 border-t border-slate-800 flex items-center justify-between">
              <span>Origin: Hardware ADC &amp; 1-Wire</span>
              <span className="font-bold">Zero Estimation</span>
            </div>
          </div>

          {/* CATEGORY 2: DERIVED */}
          <div className="rounded-xl bg-[#0a101b] border border-teal-800/60 p-5 space-y-4 flex flex-col justify-between shadow-lg">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-teal-400 font-bold block">
                    CATEGORY 2
                  </span>
                  <h3 className="text-base font-bold font-mono text-slate-100">
                    DERIVED
                  </h3>
                </div>
                <DirectVsModelBadge type="DERIVED" variant="minimal" />
              </div>

              <p className="text-xs text-slate-400 font-sans">
                Deterministic calculations, condition classifications, and statistical summaries computed from measured data:
              </p>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="p-3 rounded-lg bg-[#0d1624] border border-teal-950/80 space-y-1">
                  <div className="flex items-center justify-between text-teal-300 font-bold">
                    <span>Water Condition State</span>
                    <span className="text-[10px] text-teal-400 font-normal">Classification</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Multi-parameter matrix: Optimal, Early Stagnation, Bio-Load, Critical Stagnation.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0d1624] border border-teal-950/80 space-y-1">
                  <div className="flex items-center justify-between text-teal-300 font-bold">
                    <span>Degradation Risk Score</span>
                    <span className="text-[10px] text-teal-400 font-normal">0 - 100 Index</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Weighted synthetic severity calculated from physical drift rates and threshold excursions.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0d1624] border border-teal-950/80 space-y-1">
                  <div className="flex items-center justify-between text-teal-300 font-bold">
                    <span>Statistical Summaries</span>
                    <span className="text-[10px] text-teal-400 font-normal">Min / Mean / σ Dev</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Temporal window rolling averages, standard deviation, and estimated stagnation progression trends.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-[10px] font-mono text-teal-400 pt-3 border-t border-slate-800 flex items-center justify-between">
              <span>Origin: Mathematical Transforms</span>
              <span className="font-bold">Calculated Deterministic</span>
            </div>
          </div>

          {/* CATEGORY 3: PREDICTED */}
          <div className="rounded-xl bg-[#0a101b] border border-indigo-800/60 p-5 space-y-4 flex flex-col justify-between shadow-lg">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-bold block">
                    CATEGORY 3
                  </span>
                  <h3 className="text-base font-bold font-mono text-slate-100">
                    PREDICTED
                  </h3>
                </div>
                <DirectVsModelBadge type="PREDICTED" variant="minimal" />
              </div>

              <p className="text-xs text-slate-400 font-sans">
                Forward projections and spatial propagation generated by the proposed ML system:
              </p>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="p-3 rounded-lg bg-[#0d1624] border border-indigo-950/80 space-y-1">
                  <div className="flex items-center justify-between text-indigo-300 font-bold">
                    <span>48h Forward Degradation</span>
                    <span className="text-[10px] text-indigo-400 font-normal">Transformer</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Multi-head temporal self-attention modeling future time-to-critical degradation.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0d1624] border border-indigo-950/80 space-y-1">
                  <div className="flex items-center justify-between text-indigo-300 font-bold">
                    <span>Spatial Risk Propagation</span>
                    <span className="text-[10px] text-indigo-400 font-normal">Graph Neural Net</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Hydraulic connectivity edges predicting tributary contamination cascade.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0d1624] border border-indigo-950/80 space-y-1">
                  <div className="flex items-center justify-between text-indigo-300 font-bold">
                    <span>Aquatic Growth Suitability</span>
                    <span className="text-[10px] text-indigo-400 font-normal">ML Confidence</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Estimates ecological stress and mosquito/algal breeding risk profiles.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-[10px] font-mono text-indigo-400 pt-3 border-t border-slate-800 flex items-center justify-between">
              <span>Origin: Proposed ML Architecture</span>
              <span className="font-bold">Simulated Output</span>
            </div>
          </div>

        </div>
      </section>

      {/* Sampling Nodes Quick Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold font-mono text-slate-100 flex items-center gap-2">
              <Network className="w-5 h-5 text-cyan-400" />
              Research Sampling Nodes (Prototype &amp; Simulated)
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Prototype ESP32 hardware station and simulated test nodes across university water retention bodies
            </p>
          </div>
          <Link
            to="/dashboard"
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
          >
            <span>View All Live Telemetry</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
          {nodes.map((node) => (
            <Link
              key={node.id}
              to="/dashboard"
              className="p-4 rounded-xl bg-[#0a101b] border border-slate-800 hover:border-cyan-500/50 transition-all group flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-cyan-400 font-bold uppercase">{node.code}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <h4 className="font-bold text-slate-100 text-xs mt-1 group-hover:text-cyan-300 transition-colors">
                  {node.name}
                </h4>
                <div className="text-[10px] text-slate-400 font-sans mt-1">
                  {node.waterBodyType}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Batt: {node.batteryLevelPct}%</span>
                <span className="text-cyan-400 group-hover:underline">Open Console →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
};
