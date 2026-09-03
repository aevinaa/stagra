import React, { useState } from 'react';
import { Radio, Play, Pause, RefreshCw, Cpu, ChevronDown, Check, Info } from 'lucide-react';
import { useTelemetry } from '../../context/TelemetryContext';
import { SimulationScenario, DataSourceType } from '../../types';
import clsx from 'clsx';

export const DataSourceBanner: React.FC = () => {
  const {
    dataSourceMode,
    setDataSourceMode,
    activeScenario,
    setActiveScenario,
    isLiveStreaming,
    setIsLiveStreaming,
    triggerManualSample,
  } = useTelemetry();

  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const [hardwareModalOpen, setHardwareModalOpen] = useState(false);

  const scenarios: { id: SimulationScenario; label: string; desc: string; iconColor: string }[] = [
    {
      id: 'BASELINE_STABLE',
      label: 'Baseline Nominal',
      desc: 'Ambient conditions (Temp ~27°C, pH ~7.6, TDS ~340ppm)',
      iconColor: 'bg-emerald-400',
    },
    {
      id: 'SUMMER_HEATWAVE',
      label: 'Summer Heatwave',
      desc: 'Thermal spike (+6.8°C), elevated environmental stagnation & growth suitability',
      iconColor: 'bg-amber-400',
    },
    {
      id: 'ALGAL_BLOOM_SURGE',
      label: 'Algal Bloom Surge',
      desc: 'Severe biological proliferation (pH +1.4, TDS +240ppm)',
      iconColor: 'bg-rose-400',
    },
    {
      id: 'ACID_RUNOFF_EVENT',
      label: 'Acid Runoff Event',
      desc: 'Contaminant inflow (pH drops to ~5.4, TDS +310ppm)',
      iconColor: 'bg-rose-500',
    },
    {
      id: 'FERTILIZER_TDS_SPIKE',
      label: 'Agricultural TDS Inflow',
      desc: 'High ionic conductivity surge (TDS +450ppm)',
      iconColor: 'bg-yellow-400',
    },
    {
      id: 'POST_RAIN_FLUSH',
      label: 'Post-Rain Dilution',
      desc: 'Freshwater inflow, temperature & TDS dilution',
      iconColor: 'bg-cyan-400',
    },
  ];

  return (
    <div className="bg-[#080d16] border-b border-slate-800/80 px-4 py-1.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
        
        {/* Left: Clean Data Source Indicator & Mode Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#0d1624] border border-slate-800">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Source:</span>
            <span
              className={clsx(
                'text-[10px] font-bold',
                dataSourceMode === 'SIMULATED DATA' ? 'text-amber-300' : 'text-emerald-300'
              )}
            >
              {dataSourceMode}
            </span>
          </div>

          <div className="inline-flex rounded border border-slate-800 bg-[#090f1a] p-0.5 text-[10px]">
            <button
              onClick={() => setDataSourceMode('SIMULATED DATA')}
              className={clsx(
                'px-2 py-0.5 rounded transition-colors',
                dataSourceMode === 'SIMULATED DATA'
                  ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-700/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              Simulated
            </button>
            <button
              onClick={() => {
                setDataSourceMode('ESP32 LIVE');
                setHardwareModalOpen(true);
              }}
              className={clsx(
                'px-2 py-0.5 rounded transition-colors flex items-center gap-1',
                dataSourceMode === 'ESP32 LIVE'
                  ? 'bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Cpu className="w-2.5 h-2.5 text-emerald-400" />
              ESP32 Live
            </button>
          </div>
        </div>

        {/* Right: Compact Scenario Selector & Playback */}
        <div className="flex items-center gap-2">
          {/* Scenario Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setScenarioMenuOpen(!scenarioMenuOpen)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0d1624] border border-slate-800 hover:border-slate-700 text-slate-200 text-[10px] transition-colors"
            >
              <span className="text-slate-400">Profile:</span>
              <span className="text-cyan-300 font-semibold">
                {scenarios.find((s) => s.id === activeScenario)?.label}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
            </button>

            {scenarioMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setScenarioMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-64 rounded-lg bg-[#0e1726] border border-slate-700 shadow-2xl z-50 p-1">
                  <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    Simulation Profiles
                  </div>
                  <div className="py-0.5 space-y-0.5">
                    {scenarios.map((sc) => {
                      const isSelected = sc.id === activeScenario;
                      return (
                        <button
                          key={sc.id}
                          onClick={() => {
                            setActiveScenario(sc.id);
                            setScenarioMenuOpen(false);
                          }}
                          className={clsx(
                            'w-full text-left px-2 py-1.5 rounded transition-colors flex items-start gap-2 text-xs',
                            isSelected
                              ? 'bg-cyan-950/70 border border-cyan-800/60 text-cyan-200'
                              : 'hover:bg-slate-800/60 text-slate-300'
                          )}
                        >
                          <span className={clsx('w-1.5 h-1.5 rounded-full mt-1 shrink-0', sc.iconColor)} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[11px] flex items-center justify-between">
                              <span className="truncate">{sc.label}</span>
                              {isSelected && <Check className="w-3 h-3 text-cyan-400 shrink-0" />}
                            </div>
                            <div className="text-[9px] text-slate-400 truncate">
                              {sc.desc}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Stream Pause/Resume Toggle */}
          <button
            onClick={() => setIsLiveStreaming(!isLiveStreaming)}
            className={clsx(
              'flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] transition-colors',
              isLiveStreaming
                ? 'bg-teal-950/70 text-teal-300 border-teal-700/50 hover:bg-teal-900/60'
                : 'bg-amber-950/70 text-amber-300 border-amber-700/50 hover:bg-amber-900/60'
            )}
            title={isLiveStreaming ? 'Pause continuous 5s sampling' : 'Resume live stream'}
          >
            {isLiveStreaming ? (
              <>
                <Pause className="w-2.5 h-2.5" />
                <span>Streaming</span>
              </>
            ) : (
              <>
                <Play className="w-2.5 h-2.5 text-amber-400" />
                <span>Paused</span>
              </>
            )}
          </button>

          {/* Immediate Sample Trigger */}
          <button
            onClick={triggerManualSample}
            className="p-1 rounded bg-[#0d1624] border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 transition-colors"
            title="Trigger single sample tick"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

     {/* Hardware info modal */}
{hardwareModalOpen && (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-[#0c1421] border border-cyan-500/40 rounded-xl max-w-lg w-full p-5 shadow-2xl">
      <div className="flex items-start justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="font-mono font-bold text-slate-100 text-sm">
              ESP32 Hardware Bridge
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              STAGRA Prototype Hardware Interface
            </p>
          </div>
        </div>

        <button
          onClick={() => setHardwareModalOpen(false)}
          className="text-slate-400 hover:text-slate-200 text-sm font-mono"
          aria-label="Close hardware information"
        >
          ✕
        </button>
      </div>

      <div className="py-4 space-y-4 text-xs text-slate-300 leading-relaxed font-sans">
        <div className="p-3 rounded-lg bg-[#080d17] border border-slate-800">
          <div className="text-cyan-300 font-semibold uppercase tracking-wider mb-2">
            Current Prototype
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div>
              Monitoring Node:{' '}
              <strong className="text-slate-100">
                STG-PROTO-01
              </strong>
            </div>

            <div>
              Controller:{' '}
              <strong className="text-slate-100">
                ESP32
              </strong>
            </div>

            <div>
              Sensors:{' '}
              <strong className="text-cyan-300">
                Temperature + pH
              </strong>
            </div>

            <div>
              Data Source:{' '}
              <strong className="text-amber-300">
                {dataSourceMode}
              </strong>
            </div>
          </div>
        </div>

        <p>
          The frontend does <strong>The frontend does NOT communicate directly with the ESP32.</strong>{' '}
          Sensor readings are collected by the ESP32 prototype and are intended
          to be transferred to the backend API for storage, processing, and
          model analysis before being displayed by STAGRA.
        </p>

        <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/40 text-amber-200 text-[11px] flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />

          <div>
            The current frontend uses{' '}
            <strong>simulated telemetry</strong> during development.
            When the ESP32 backend integration is ready, the same interface
            can consume the live sensor stream through the API layer.
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-3 border-t border-slate-800">
        <button
          onClick={() => setHardwareModalOpen(false)}
          className="px-4 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold font-mono text-xs transition-colors"
        >
          Acknowledged
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
};