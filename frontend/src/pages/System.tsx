import React from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import {
  Cpu,
  Database,
  BrainCircuit,
  Network,
  Beaker,
  CheckCircle2,
  CircleDashed,
  FlaskConical,
} from 'lucide-react';
import clsx from 'clsx';

export const System: React.FC = () => {
  const { systemHealth } = useTelemetry();

  if (!systemHealth) {
    return (
      <div className="p-8 text-center font-mono text-xs text-cyan-400">
        LOADING STAGRA SYSTEM STATUS...
      </div>
    );
  }

  const { futureSensors } = systemHealth;

  return (
    <div className="space-y-6 pb-12">

      {/* =====================================================
          SYSTEM HEADER
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5">

        <div className="flex items-start gap-3">

          <div className="p-2.5 rounded-lg bg-cyan-950/50 border border-cyan-800/60 text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">

              <h1 className="text-xl font-bold font-mono text-slate-100">
                STAGRA System
              </h1>

              <span className="px-2 py-0.5 rounded border border-cyan-700/50 bg-cyan-950/30 text-cyan-300 text-[9px] font-mono font-bold">
                TECHNICAL OVERVIEW
              </span>

            </div>

            <p className="text-xs text-slate-400 font-sans mt-1 max-w-3xl">
              Current prototype implementation and proposed research
              architecture for stagnant-water assessment.
            </p>
          </div>

        </div>

      </section>


      {/* =====================================================
          CURRENT HARDWARE
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5">

        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">

          <Cpu className="w-4 h-4 text-cyan-400" />

          <div>
            <h2 className="text-sm font-bold font-mono text-slate-100">
              Current Hardware
            </h2>

            <p className="text-[10px] text-slate-500 mt-0.5">
              Components currently represented by the prototype.
            </p>
          </div>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">

          <div className="p-4 rounded-lg bg-[#0d1624] border border-cyan-800/40">

            <div className="text-[9px] font-mono uppercase text-slate-500">
              Controller
            </div>

            <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
              ESP32
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Single physical prototype node.
            </p>

          </div>


          <div className="p-4 rounded-lg bg-[#0d1624] border border-cyan-800/40">

            <div className="text-[9px] font-mono uppercase text-slate-500">
              Temperature
            </div>

            <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
              DS18B20
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Direct water-temperature measurement.
            </p>

          </div>


          <div className="p-4 rounded-lg bg-[#0d1624] border border-teal-800/40">

            <div className="text-[9px] font-mono uppercase text-slate-500">
              Chemical Parameter
            </div>

            <div className="text-lg font-bold font-mono text-teal-300 mt-1">
              pH Probe
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Direct pH measurement of the water sample.
            </p>

          </div>

        </div>


        <div className="mt-4 p-3 rounded-lg bg-emerald-950/10 border border-emerald-900/40">

          <div className="flex items-center gap-2">

            <CheckCircle2 className="w-4 h-4 text-emerald-400" />

            <span className="text-[10px] font-mono font-bold text-emerald-300">
              CURRENT PHYSICAL SCOPE
            </span>

          </div>

          <p className="text-[10px] text-slate-400 font-sans mt-1">
            STAGRA currently represents one physical ESP32 prototype
            node measuring temperature and pH. Additional sensor types
            are not treated as live measurements.
          </p>

        </div>

      </section>


      {/* =====================================================
          SOFTWARE LAYERS
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5">

        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">

          <Database className="w-4 h-4 text-cyan-400" />

          <div>
            <h2 className="text-sm font-bold font-mono text-slate-100">
              Software Layers
            </h2>

            <p className="text-[10px] text-slate-500 mt-0.5">
              Logical layers used by the current prototype interface.
            </p>
          </div>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">

          <div className="p-4 rounded-lg bg-[#0d1624] border border-slate-800">

            <div className="text-[9px] font-mono uppercase text-slate-500">
              Presentation
            </div>

            <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
              STAGRA Frontend
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Monitoring, historical analysis, alerts and prediction
              visualization.
            </p>

          </div>


          <div className="p-4 rounded-lg bg-[#0d1624] border border-slate-800">

            <div className="text-[9px] font-mono uppercase text-slate-500">
              Data Processing
            </div>

            <div className="text-sm font-bold font-mono text-teal-300 mt-1">
              Backend / Processing Layer
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Receives telemetry, stores observations and prepares
              data for analytical processing.
            </p>

          </div>


          <div className="p-4 rounded-lg bg-[#0d1624] border border-slate-800">

            <div className="text-[9px] font-mono uppercase text-slate-500">
              Research Data
            </div>

            <div className="text-sm font-bold font-mono text-indigo-300 mt-1">
              Historical Time Series
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Temperature and pH observations used for temporal
              analysis and experimentation.
            </p>

          </div>

        </div>

      </section>


      {/* =====================================================
          PROPOSED TEMPORAL MODEL
          ===================================================== */}
      <section className="rounded-xl bg-[#090f19] border border-indigo-800/40 p-5">

        <div className="flex items-start justify-between gap-4">

          <div className="flex items-start gap-3">

            <div className="p-2 rounded-lg bg-indigo-950/30 border border-indigo-800/50">
              <BrainCircuit className="w-4 h-4 text-indigo-400" />
            </div>

            <div>

              <div className="flex flex-wrap items-center gap-2">

                <h2 className="text-sm font-bold font-mono text-slate-100">
                  Proposed Temporal Model
                </h2>

                <span className="px-2 py-0.5 rounded border border-indigo-700/50 bg-indigo-950/30 text-indigo-300 text-[9px] font-mono font-bold">
                  TRANSFORMER
                </span>

              </div>

              <p className="text-[10px] text-slate-400 mt-1 max-w-2xl">
                A proposed temporal model for learning relationships
                across sequential temperature and pH observations.
              </p>

            </div>

          </div>

          <span className="hidden sm:inline px-2 py-1 rounded border border-amber-800/50 bg-amber-950/20 text-amber-300 text-[9px] font-mono">
            PROPOSED / SIMULATED
          </span>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">

          <div className="p-3 rounded-lg bg-[#0c131f] border border-slate-800">

            <div className="text-[9px] uppercase font-mono text-slate-500">
              Input
            </div>

            <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
              Temporal Sensor Series
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Temperature + pH over time.
            </p>

          </div>


          <div className="p-3 rounded-lg bg-[#0c131f] border border-slate-800">

            <div className="text-[9px] uppercase font-mono text-slate-500">
              Model
            </div>

            <div className="text-sm font-bold font-mono text-indigo-300 mt-1">
              Temporal Transformer
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Proposed sequence-learning architecture.
            </p>

          </div>


          <div className="p-3 rounded-lg bg-[#0c131f] border border-slate-800">

            <div className="text-[9px] uppercase font-mono text-slate-500">
              Output
            </div>

            <div className="text-sm font-bold font-mono text-indigo-300 mt-1">
              Risk / Forecast
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Simulated degradation trajectory.
            </p>

          </div>

        </div>

      </section>


      {/* =====================================================
          FUTURE GNN
          ===================================================== */}
      <section className="rounded-xl bg-[#090f19] border border-slate-800 p-5">

        <div className="flex items-start gap-3">

          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
            <Network className="w-4 h-4 text-slate-400" />
          </div>

          <div>

            <div className="flex flex-wrap items-center gap-2">

              <h2 className="text-sm font-bold font-mono text-slate-200">
                Future Spatial Extension
              </h2>

              <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-slate-400 text-[9px] font-mono font-bold">
                PROPOSED GNN
              </span>

            </div>

            <p className="text-[10px] text-slate-500 mt-1 max-w-2xl">
              A future multi-node deployment could represent sampling
              locations as a graph and use a GNN to model spatial
              relationships between them.
            </p>

          </div>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">

          <div className="p-3 rounded-lg bg-[#0c131f] border border-slate-800">

            <div className="text-[9px] uppercase font-mono text-slate-500">
              Current
            </div>

            <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
              1 Node
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Single physical prototype.
            </p>

          </div>


          <div className="p-3 rounded-lg bg-[#0c131f] border border-slate-800">

            <div className="text-[9px] uppercase font-mono text-slate-500">
              Future Input
            </div>

            <div className="text-lg font-bold font-mono text-slate-300 mt-1">
              Multiple Nodes
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Additional sampling locations.
            </p>

          </div>


          <div className="p-3 rounded-lg bg-[#0c131f] border border-slate-800">

            <div className="text-[9px] uppercase font-mono text-slate-500">
              Proposed Method
            </div>

            <div className="text-lg font-bold font-mono text-slate-300 mt-1">
              GNN
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Spatial relationship modelling.
            </p>

          </div>

        </div>


        <div className="mt-3 px-3 py-2 rounded-lg bg-[#070c14] border border-slate-800 text-center text-[9px] font-mono text-slate-500">
          Future research architecture only. No multi-node physical
          deployment is currently claimed.
        </div>

      </section>


      {/* =====================================================
          FUTURE SENSOR EXPANSION
          ===================================================== */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-5">

        <div className="flex items-start gap-3 pb-4 border-b border-slate-800">

          <div className="p-2 rounded-lg bg-cyan-950/30 border border-cyan-800/50">
            <Beaker className="w-4 h-4 text-cyan-400" />
          </div>

          <div>

            <div className="flex flex-wrap items-center gap-2">

              <h2 className="text-sm font-bold font-mono text-slate-100">
                Future Sensor Expansion
              </h2>

              <span className="px-2 py-0.5 rounded border border-amber-700/40 bg-amber-950/20 text-amber-300 text-[9px] font-mono">
                ROADMAP
              </span>

            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Additional measurements planned for later experimental
              validation. They are not part of the current live prototype.
            </p>

          </div>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">

          {futureSensors.map((sensor) => (
            <div
              key={sensor.id}
              className="p-4 rounded-lg bg-[#0d1624] border border-slate-800"
            >

              <div className="flex items-start justify-between gap-3">

                <div>
                  <div className="text-[9px] font-mono uppercase text-slate-500">
                    Future Sensor
                  </div>

                  <h3 className="text-sm font-bold font-mono text-slate-200 mt-1">
                    {sensor.name}
                  </h3>

                  <div className="text-[10px] text-cyan-300 font-mono mt-1">
                    {sensor.symbol} · {sensor.unit}
                  </div>
                </div>

                <CircleDashed className="w-4 h-4 text-slate-600 shrink-0" />

              </div>


              <p className="text-[10px] text-slate-400 font-sans mt-3 leading-5">
                {sensor.scientificRationale}
              </p>


              <div className="mt-3 pt-3 border-t border-slate-800">

                <div className="flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-indigo-400" />

                  <span className="text-[9px] font-mono uppercase text-slate-500">
                    Planned Model Impact
                  </span>
                </div>

                <p className="text-[10px] text-slate-500 font-sans mt-1">
                  {sensor.expectedMlImpact}
                </p>

              </div>

            </div>
          ))}

        </div>

      </section>

    </div>
  );
};