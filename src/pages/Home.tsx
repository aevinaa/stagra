import React from 'react';
import {
  Cpu,
  ArrowRight,
  Sparkles,
  Thermometer,
  Droplet,
  Network,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DirectVsModelBadge } from '../components/common/DirectVsModelBadge';

export const Home: React.FC = () => {
  return (
    <div className="space-y-10 pb-12">

      {/* =========================================================
          STAGRA HERO
          ========================================================= */}
      <section className="relative overflow-hidden rounded-2xl border border-cyan-800/50 bg-[#080e18]">

        {/* Subtle technical grid */}
        <div
          className="absolute inset-0 opacity-[0.18] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(34, 211, 238, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(34, 211, 238, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '42px 42px',
          }}
        />

        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <div className="max-w-4xl">

            {/* Context labels */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className="px-3 py-1 rounded-full border border-cyan-700/60 bg-cyan-950/50 text-cyan-300 text-[10px] font-mono font-semibold tracking-wider">
                UNIVERSITY EMBEDDED SYSTEMS RESEARCH
              </span>

              <span className="px-3 py-1 rounded-full border border-teal-700/50 bg-teal-950/30 text-teal-300 text-[10px] font-mono font-semibold tracking-wider">
                IoT WATER MONITORING
              </span>
            </div>

            {/* Brand */}
            <div className="mb-3">
              <h1 className="text-5xl sm:text-6xl font-mono font-extrabold tracking-[0.12em] text-slate-100">
                STAGRA
              </h1>

              <p className="mt-2 text-lg sm:text-xl font-sans font-medium text-cyan-300">
                Stagnant Water Assessment and Growth Risk Analysis
              </p>
            </div>

            {/* Description */}
            <p className="max-w-3xl text-sm sm:text-base leading-7 text-slate-300">
              A prototype environmental monitoring system that collects{' '}
              <strong className="text-slate-100">
                temperature and pH
              </strong>{' '}
              measurements from a water sample and analyzes their temporal
              behaviour to estimate stagnation and degradation risk.
            </p>

            <p className="max-w-3xl mt-3 text-xs sm:text-sm leading-6 text-slate-400">
              The current implementation uses a single ESP32 prototype node
              with simulated telemetry. The proposed research direction
              extends the system toward temporal Transformer analysis and
              future multi-node graph-based modelling.
            </p>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 mt-7">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.15)]"
              >
                Open Monitoring Console
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                to="/predictions"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-700 bg-[#0d1624] hover:border-cyan-700/60 hover:bg-[#111d2c] text-slate-200 font-mono text-xs font-semibold transition-all"
              >
                Explore Predictions
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </Link>

              <Link
                to="/system"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-700 bg-transparent hover:border-slate-500 text-slate-300 font-mono text-xs font-semibold transition-all"
              >
                View System
                <Cpu className="w-4 h-4 text-slate-400" />
              </Link>
            </div>

          </div>
        </div>
      </section>


      {/* =========================================================
          STAGRA DATA LAYERS
          ========================================================= */}
      <section className="space-y-4">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold font-mono text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              STAGRA Data Layers
            </h2>

            <p className="text-xs text-slate-400 font-sans mt-0.5">
              How physical measurements become derived assessments and model predictions.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <DirectVsModelBadge type="MEASURED" variant="minimal" />
            <DirectVsModelBadge type="DERIVED" variant="minimal" />
            <DirectVsModelBadge type="PREDICTED" variant="minimal" />
          </div>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* =====================================================
              CATEGORY 1: MEASURED
              ===================================================== */}
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

                <DirectVsModelBadge
                  type="MEASURED"
                  variant="minimal"
                />
              </div>


              <p className="text-xs text-slate-400 font-sans">
                Physical sensor telemetry captured directly from the
                prototype ESP32 monitoring node.
              </p>


              <div className="space-y-2.5 font-mono text-xs">

                {/* Temperature */}
                <div className="p-3 rounded-lg bg-[#0d1624] border border-cyan-950/80 space-y-1">
                  <div className="flex items-center justify-between text-cyan-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Thermometer className="w-3.5 h-3.5" />
                      Temperature (°C)
                    </span>

                    <span className="text-[10px] text-cyan-400 font-normal">
                      DS18B20
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans">
                    Measures water temperature and captures thermal changes
                    relevant to environmental stagnation behaviour.
                  </p>
                </div>


                {/* pH */}
                <div className="p-3 rounded-lg bg-[#0d1624] border border-cyan-950/80 space-y-1">
                  <div className="flex items-center justify-between text-cyan-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Droplet className="w-3.5 h-3.5" />
                      pH Level
                    </span>

                    <span className="text-[10px] text-cyan-400 font-normal">
                      pH Probe
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans">
                    Measures hydrogen-ion activity and captures changes in
                    the chemical condition of the water sample.
                  </p>
                </div>

              </div>
            </div>


            <div className="text-[10px] font-mono text-cyan-400 pt-3 border-t border-slate-800 flex items-center justify-between">
              <span>Origin: Physical Sensors</span>
              <span className="font-bold">Direct Measurement</span>
            </div>

          </div>


          {/* =====================================================
              CATEGORY 2: DERIVED
              ===================================================== */}
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

                <DirectVsModelBadge
                  type="DERIVED"
                  variant="minimal"
                />
              </div>


              <p className="text-xs text-slate-400 font-sans">
                Calculations and assessments derived from the measured
                temperature and pH time series.
              </p>


              <div className="space-y-2.5 font-mono text-xs">

                {/* Water condition */}
                <div className="p-3 rounded-lg bg-[#0d1624] border border-teal-950/80 space-y-1">
                  <div className="flex items-center justify-between text-teal-300 font-bold">
                    <span>Water Condition State</span>

                    <span className="text-[10px] text-teal-400 font-normal">
                      Classification
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans">
                    Classifies the current environmental condition using
                    measured parameter behaviour and configured thresholds.
                  </p>
                </div>


                {/* Risk score */}
                <div className="p-3 rounded-lg bg-[#0d1624] border border-teal-950/80 space-y-1">
                  <div className="flex items-center justify-between text-teal-300 font-bold">
                    <span>Degradation Risk Score</span>

                    <span className="text-[10px] text-teal-400 font-normal">
                      0 - 100 Index
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans">
                    A derived index representing estimated stagnation and
                    degradation tendency from observed parameter changes.
                  </p>
                </div>


                {/* Statistics */}
                <div className="p-3 rounded-lg bg-[#0d1624] border border-teal-950/80 space-y-1">
                  <div className="flex items-center justify-between text-teal-300 font-bold">
                    <span>Statistical Summaries</span>

                    <span className="text-[10px] text-teal-400 font-normal">
                      Min / Mean / Max
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans">
                    Temporal statistics and trends calculated from
                    historical measurements.
                  </p>
                </div>

              </div>
            </div>


            <div className="text-[10px] font-mono text-teal-400 pt-3 border-t border-slate-800 flex items-center justify-between">
              <span>Origin: Calculated</span>
              <span className="font-bold">Derived Data</span>
            </div>

          </div>


          {/* =====================================================
              CATEGORY 3: PREDICTED
              ===================================================== */}
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

                <DirectVsModelBadge
                  type="PREDICTED"
                  variant="minimal"
                />
              </div>


              <p className="text-xs text-slate-400 font-sans">
                Forward estimates generated by the proposed temporal model
                from the measured time series.
              </p>


              <div className="space-y-2.5 font-mono text-xs">

                {/* Forecast */}
                <div className="p-3 rounded-lg bg-[#0d1624] border border-indigo-950/80 space-y-1">
                  <div className="flex items-center justify-between text-indigo-300 font-bold">
                    <span>48h Degradation Forecast</span>

                    <span className="text-[10px] text-indigo-400 font-normal">
                      Transformer
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans">
                    Estimates future degradation tendency from temporal
                    patterns in temperature and pH.
                  </p>
                </div>


                {/* Future GNN */}
                <div className="p-3 rounded-lg bg-[#0d1624] border border-indigo-950/80 space-y-1">
                  <div className="flex items-center justify-between text-indigo-300 font-bold">
                    <span>Multi-Node Spatial Extension</span>

                    <span className="text-[10px] text-indigo-400 font-normal">
                      Proposed GNN
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans">
                    Future graph-based analysis for relationships between
                    multiple water-sampling locations.
                  </p>
                </div>


                {/* Growth suitability */}
                <div className="p-3 rounded-lg bg-[#0d1624] border border-indigo-950/80 space-y-1">
                  <div className="flex items-center justify-between text-indigo-300 font-bold">
                    <span>Aquatic Growth Suitability</span>

                    <span className="text-[10px] text-indigo-400 font-normal">
                      Model Estimate
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans">
                    Provides an estimated environmental suitability indicator
                    based on the available measured parameters.
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


      {/* =========================================================
          CURRENT PROTOTYPE
          ========================================================= */}
      <section className="space-y-4">

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-mono text-slate-100 flex items-center gap-2">
              <Network className="w-5 h-5 text-cyan-400" />
              Current Prototype
            </h2>

            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Single ESP32 monitoring node used for the current prototype implementation.
            </p>
          </div>

          <Link
            to="/dashboard"
            className="hidden sm:flex text-xs font-mono text-cyan-400 hover:text-cyan-300 items-center gap-1 transition-colors"
          >
            <span>Open Monitoring Console</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>


        <div className="rounded-xl border border-cyan-800/40 bg-[#0b1320] p-5">

          <div className="flex flex-wrap items-start justify-between gap-4">

            <div>
              <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                Prototype Node
              </div>

              <h3 className="mt-1 text-lg font-bold font-mono text-slate-100">
                STG-PROTO-01
              </h3>

              <p className="mt-1 text-xs text-slate-400">
                Single ESP32 monitoring node
              </p>
            </div>

            <span className="px-2 py-1 rounded border border-emerald-700/50 bg-emerald-950/30 text-emerald-300 text-[10px] font-mono font-bold">
              PROTOTYPE
            </span>

          </div>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">

            <div className="rounded-lg border border-slate-800 bg-[#080e18] p-3">
              <div className="text-[10px] font-mono text-slate-500 uppercase">
                Measurements
              </div>

              <div className="mt-1 text-sm font-mono font-semibold text-cyan-300">
                Temperature + pH
              </div>
            </div>


            <div className="rounded-lg border border-slate-800 bg-[#080e18] p-3">
              <div className="text-[10px] font-mono text-slate-500 uppercase">
                Data Mode
              </div>

              <div className="mt-1 text-sm font-mono font-semibold text-amber-300">
                Simulated Development Data
              </div>
            </div>

          </div>
        </div>
      </section>


      {/* =========================================================
          FUTURE RESEARCH
          ========================================================= */}
      <section className="rounded-xl border border-slate-800 bg-[#0a101b] p-5">

        <div className="flex flex-wrap items-center justify-between gap-4">

          <div>
            <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
              Future Research
            </div>

            <h2 className="mt-1 text-lg font-bold font-mono text-slate-100">
              Sensor &amp; Model Expansion
            </h2>

            <p className="mt-1 text-xs text-slate-400 max-w-2xl">
              Planned extensions include dissolved oxygen, turbidity, and
              multi-node spatial modelling for expanded experimental validation.
            </p>
          </div>


          <Link
            to="/system"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:border-cyan-700/60 text-cyan-300 font-mono text-[10px] font-semibold transition-colors"
          >
            Research Roadmap
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

        </div>

      </section>
      
    </div>
  );
};