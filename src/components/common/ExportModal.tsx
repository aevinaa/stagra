import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileCode, Check, X } from 'lucide-react';
import { DirectSensorReading, ModelDerivedData } from '../../types';
import { formatDateTimeTableIST, formatDateTimeIST } from '../../utils/dateUtils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  readings: DirectSensorReading[];
  models: ModelDerivedData[];
  nodeName: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  readings,
  models,
  nodeName,
}) => {
  const [exportFormat, setExportFormat] = useState<'CSV' | 'JSON'>('CSV');
  const [downloaded, setDownloaded] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    let content = '';
    let filename = '';
    let mimeType = '';

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');

    if (exportFormat === 'CSV') {
      const headers = [
        'Timestamp_IST',
        'ISO_Timestamp',
        'Node_ID',
        'Direct_Temperature_Celsius',
        'Direct_pH',
        'Direct_TDS_ppm',
        'Direct_Battery_V',
        'Direct_RSSI_dBm',
        'Model_Water_Condition',
        'Model_Degradation_Risk',
        'Model_Risk_Score',
        'Model_Confidence_Pct',
        'Model_Estimated_TimeToCritical_Hrs',
        'Model_GrowthSuitabilityIndex_Est',
        'Data_Source',
      ].join(',');

      const rows = readings.map((r, idx) => {
        const m = models[idx] || models[models.length - 1];
        return [
          `"${formatDateTimeTableIST(r.timestamp)}"`,
          r.timestamp,
          r.nodeId,
          r.temperature,
          r.ph,
          r.tds,
          r.batteryVoltage,
          r.signalStrengthDbm,
          `"${m?.waterCondition || 'N/A'}"`,
          m?.degradationRisk || 'N/A',
          m?.riskScore || 'N/A',
          m?.modelConfidence || 'N/A',
          m?.degradationProgression?.timeToCriticalHours || 'N/A',
          m?.degradationProgression?.bacterialGrowthIndexEst || 'N/A',
          '"RESEARCH TELEMETRY"',
        ].join(',');
      });

      content = [headers, ...rows].join('\n');
      filename = `STAGRA_Research_Telemetry_${(nodeName || 'Node').replace(/\s+/g, '_')}_${timestampStr}.csv`;
      mimeType = 'text/csv;charset=utf-8;';
    } else {
      const exportObject = {
        project: 'STAGRA - Stagnant Water Assessment and Growth Risk Analysis',
        exportTimestampIST: formatDateTimeIST(new Date()),
        exportTimestampISO: new Date().toISOString(),
        node: nodeName || 'Node',
        totalRecords: readings.length,
        dataSource: 'RESEARCH TELEMETRY',
        sensorTelemetry: readings.map((r, idx) => ({
          timestampIST: formatDateTimeTableIST(r.timestamp),
          directSensor: r,
          modelDerived: models[idx] || null,
        })),
      };

      content = JSON.stringify(exportObject, null, 2);
      filename = `STAGRA_Research_Telemetry_${(nodeName || 'Node').replace(/\s+/g, '_')}_${timestampStr}.json`;
      mimeType = 'application/json;charset=utf-8;';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloaded(true);
    setTimeout(() => {
      setDownloaded(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0d1522] border border-cyan-500/40 rounded-xl max-w-md w-full p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" />
            <h3 className="font-mono font-bold text-slate-100 text-sm">Export Research Telemetry</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-4 text-xs font-mono">
          <div className="p-3 rounded-lg bg-[#090e17] border border-slate-800 space-y-1">
            <div className="text-slate-400">Target Node:</div>
            <div className="text-cyan-300 font-semibold">{nodeName}</div>
            <div className="text-slate-400 text-[11px]">
              Records in buffer: <span className="text-slate-200">{readings.length} data frames</span>
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-[11px] block mb-2">SELECT EXPORT FORMAT</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat('CSV')}
                className={`p-3 rounded-lg border text-left transition-colors flex items-center gap-2.5 ${
                  exportFormat === 'CSV'
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200'
                    : 'bg-[#090e17] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
                <div>
                  <div className="font-bold">CSV Format</div>
                  <div className="text-[10px] text-slate-400">Excel, R, Python Pandas</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('JSON')}
                className={`p-3 rounded-lg border text-left transition-colors flex items-center gap-2.5 ${
                  exportFormat === 'JSON'
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200'
                    : 'bg-[#090e17] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-5 h-5 text-teal-400" />
                <div>
                  <div className="font-bold">JSON Schema</div>
                  <div className="text-[10px] text-slate-400">Transformer & GNN pipelines</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={readings.length === 0}
            className="px-4 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold font-mono text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {downloaded ? (
              <>
                <Check className="w-4 h-4" />
                Export Complete
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download Telemetry Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
