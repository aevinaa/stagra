import React from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import {
  Cpu,
  Database,
  BrainCircuit,
  Radio,
  Server,
  Activity,
  Layers,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Compass,
  ArrowUpRight,
  Info,
  Beaker,
} from 'lucide-react';
import clsx from 'clsx';

export const System: React.FC = () => {
  const { systemHealth, nodes, dataSourceMode, setDataSourceMode } = useTelemetry();

  if (!systemHealth) {
    return (
      <div className="p-8 text-center font-mono text-xs text-cyan-400">
        LOADING SYSTEM HARDWARE TELEMETRY...
      </div>
    );
  }

  const { futureSensors } = systemHealth;

  return (
    <div className="space-y-8 pb-12">
      
      {/* System Overview Banner */}
      <div className="p-5 rounded-2xl bg-[#0a101b] border border-cyan-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-600/50 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold font-mono text-slate-100">
                System Health &amp; Hardware Telemetry
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                ESP32 distributed nodes, backend ingestion latency, model inference status &amp; sensor expansion
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-[#070c14] border border-slate-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Hardware: <strong className="text-emerald-300">1 Prototype Node Active</strong></span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#070c14] border border-slate-800">
            <span>Model: <strong className="text-cyan-300">Proposed Architecture</strong></span>
          </div>
        </div>
      </div>

      {/* SECTION 1: END-TO-END PIPELINE HEALTH TILES */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          End-to-End Architectural Pipeline Telemetry
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
          
          {/* Tile 1: ESP32 Hardware Cluster */}
          <div className="p-4 rounded-xl bg-[#0a101b] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px] uppercase">STAGE 1-3</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-[10px] font-bold">
                PROTOTYPE ACTIVE
              </span>
            </div>
            <h4 className="font-bold text-slate-100 text-sm">ESP32 Node &amp; Sensors</h4>
            <div className="text-[11px] text-slate-400 space-y-1 pt-1">
              <div>Hardware Nodes: <strong className="text-slate-200">1 Prototype Node</strong></div>
              <div>Simulated Test: <strong className="text-slate-200">4 Nodes</strong></div>
              <div>Physical Sensors: <strong className="text-cyan-300">Temp, pH, TDS</strong></div>
            </div>
          </div>

          {/* Tile 2: Backend API Ingestion */}
          <div className="p-4 rounded-xl bg-[#0a101b] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px] uppercase">STAGE 4</span>
              <span className="px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 text-[10px] font-bold">
                API INTERFACE
              </span>
            </div>
            <h4 className="font-bold text-slate-100 text-sm">Backend Ingestion API</h4>
            <div className="text-[11px] text-slate-400 space-y-1 pt-1">
              <div>Transport: <strong className="text-slate-200">REST / HTTP JSON</strong></div>
              <div>Data Stream: <strong className="text-amber-300">{dataSourceMode}</strong></div>
              <div>Sampling Tick: <strong className="text-cyan-300">5.0 seconds</strong></div>
            </div>
          </div>

          {/* Tile 3: Historical Time-Series DB */}
          <div className="p-4 rounded-xl bg-[#0a101b] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px] uppercase">STAGE 5-6</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-[10px] font-bold">
                SIMULATED DATA
              </span>
            </div>
            <h4 className="font-bold text-slate-100 text-sm">Historical DB &amp; Preprocessor</h4>
            <div className="text-[11px] text-slate-400 space-y-1 pt-1">
              <div>Architecture: <strong className="text-slate-200">Time-Series Store</strong></div>
              <div>Preprocessing: <strong className="text-teal-300">Moving Avg + Norm</strong></div>
              <div>Data Mode: <strong className="text-slate-200">Simulated Data</strong></div>
            </div>
          </div>

          {/* Tile 4: Neural Prediction Ensemble */}
          <div className="p-4 rounded-xl bg-[#0a101b] border border-teal-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-teal-400 text-[10px] uppercase">STAGE 7-8</span>
              <span className="px-1.5 py-0.2 rounded bg-teal-950/80 text-teal-300 border border-teal-700/60 text-[10px] font-bold">
                PROPOSED MODEL
              </span>
            </div>
            <h4 className="font-bold text-teal-200 text-sm">Proposed Transformer + GNN</h4>
            <div className="text-[11px] text-slate-400 space-y-1 pt-1">
              <div>Temporal Model: <strong className="text-slate-200">Proposed Transformer</strong></div>
              <div>Spatial Model: <strong className="text-slate-200">Proposed GNN</strong></div>
              <div>Status: <strong className="text-emerald-300">Simulated Inference</strong></div>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 2: SAMPLING NODE HARDWARE REGISTERS TABLE */}
      <section className="rounded-xl bg-[#0a101b] border border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-mono font-bold text-sm text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              ESP32 Prototype &amp; Simulated Nodes Registry
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Node configuration, simulated coordinates, sensor interfaces (Temp, pH, TDS), and prototype hardware status
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Hardware: Espressif ESP32-WROOM-32D (Prototype)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#090e17] text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3">Station Node</th>
                <th className="p-3">Type</th>
                <th className="p-3">Water Body Class</th>
                <th className="p-3">MAC Address</th>
                <th className="p-3">Firmware</th>
                <th className="p-3">Sampling Rate</th>
                <th className="p-3">Battery</th>
                <th className="p-3 text-right">RSSI Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-[#0a101b]">
              {nodes.map((node) => (
                <tr key={node.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-3 font-semibold text-cyan-300">
                    <div className="flex items-center gap-2">
                      <span className={clsx('w-2 h-2 rounded-full', node.isPrototypeHardware ? 'bg-emerald-400' : 'bg-cyan-400')} />
                      <span>{node.name}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded text-[10px] font-bold',
                      node.isPrototypeHardware
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                        : 'bg-slate-800/80 text-slate-300 border border-slate-700/50'
                    )}>
                      {node.isPrototypeHardware ? 'PROTOTYPE NODE' : 'SIMULATED DATA'}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300">{node.waterBodyType}</td>
                  <td className="p-3 text-slate-400 font-mono text-[11px]">{node.esp32Mac}</td>
                  <td className="p-3 text-teal-300 font-mono text-[11px]">{node.firmwareVersion}</td>
                  <td className="p-3 text-slate-300">{node.samplingIntervalSec}s</td>
                  <td className="p-3 text-emerald-400 font-semibold">{node.batteryLevelPct}%</td>
                  <td className="p-3 text-right text-slate-300">{node.signalRssi} dBm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3: FUTURE SENSOR EXPANSION ROADMAP */}
      {/* Explicitly fulfilling requirement: DO and Turbidity are NOT live sensors, only shown in roadmap */}
      <section className="rounded-xl bg-[#0a101b] border border-cyan-500/30 p-6 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Beaker className="w-5 h-5 text-cyan-400" />
              <h3 className="font-mono font-bold text-base text-slate-100">
                Future Sensor Hardware Expansion Roadmap
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Targeted sensor extensions for subsequent research phases. Note: <strong>DO and Turbidity are NOT fabricated as live measurements</strong> in the current hardware stage.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-600/50 font-mono text-[10px] font-bold uppercase">
            Phase II &amp; III Roadmap
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          {futureSensors.map((sensor) => (
            <div
              key={sensor.id}
              className="p-5 rounded-xl bg-[#0d1624] border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 text-[10px] font-bold uppercase">
                    {sensor.symbol}
                  </span>
                  <span className="text-[10px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-700/50">
                    {sensor.targetPhase}
                  </span>
                </div>

                <h4 className="font-bold text-slate-100 text-sm mt-3">{sensor.name}</h4>
                <div className="text-[11px] text-cyan-400/90 mt-0.5">
                  Unit: <span className="font-semibold text-slate-200">{sensor.unit}</span> • Interface: <span className="text-slate-200">{sensor.interfaceProtocol}</span>
                </div>

                <p className="text-[11px] text-slate-300 font-sans mt-2.5 leading-relaxed">
                  {sensor.scientificRationale}
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-800 text-[11px]">
                <div className="p-2.5 rounded bg-[#090e17] border border-slate-800">
                  <span className="text-teal-400 font-semibold block text-[10px] uppercase">
                    Expected ML Model Impact:
                  </span>
                  <span className="text-slate-300 font-sans text-[11px]">{sensor.expectedMlImpact}</span>
                </div>

                <div className="text-[10px] text-slate-400 font-sans">
                  <strong>Hardware Note:</strong> {sensor.hardwareNotes}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
};
