import React, { useState, useEffect, useCallback } from 'react';
import { getHistoricalReadings, IS_MOCK_MODE } from '../services/api';
import { HistoryResult, TimeRange } from '../types';
import { ScientificSeriesChart } from '../components/analytics/ScientificSeriesChart';
import { DataNotice, ApiErrorNotice, HistoryMetaNote } from '../components/common/DataNotice';
import { RefreshCw, Database } from 'lucide-react';

export function AnalyticsView() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (range: TimeRange) => {
    setIsRefreshing(true);
    try {
      const records = await getHistoricalReadings(range);
      setResult(records);
      setError(null);
    } catch (err) {
      console.error('Failed to load historical analytics telemetry:', err);
      setResult(null);
      setError(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(timeRange);
  }, [timeRange, loadData]);

  const handleRangeChange = (newRange: TimeRange) => {
    setTimeRange(newRange);
  };

  const getTimeRangeLabel = (range: TimeRange) => {
    switch (range) {
      case '1h':
        return IS_MOCK_MODE ? 'Past 1 Hour' : 'Last 1 Hour of Stored Data';
      case '6h':
        return IS_MOCK_MODE ? 'Past 6 Hours' : 'Last 6 Hours of Stored Data';
      case '24h':
        return IS_MOCK_MODE ? 'Past 24 Hours' : 'Last 24 Hours of Stored Data';
      default:
        return 'Selected Window';
    }
  };

  const data = result?.readings ?? [];

  return (
    <div className="space-y-6">
      {/* 1. PAGE HEADER & TIME RANGE SELECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#D5E0E4]">
        <div>
          <h2 className="type-page-title text-[#19323C]">Analytics</h2>
          <p className="type-body text-[#607780] mt-0.5">
            Historical environmental analysis answering what the indoor environment has been doing over time.
          </p>
        </div>

        {/* Time-Range Selector: 1 hour, 6 hours, 24 hours */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1 p-1 bg-[#E8F0F2] rounded-[8px] border border-[#D5E0E4]"
            role="group"
            aria-label="Historical Time Range Filter"
          >
            <button
              onClick={() => handleRangeChange('1h')}
              className={`px-3 py-1.5 text-xs rounded-[6px] transition-colors cursor-pointer ${
                timeRange === '1h'
                  ? 'bg-[#FAFCFC] text-[#176B87] shadow-subtle font-semibold border border-[#D5E0E4]'
                  : 'text-[#607780] hover:text-[#19323C] font-medium border border-transparent'
              }`}
            >
              1 hour
            </button>
            <button
              onClick={() => handleRangeChange('6h')}
              className={`px-3 py-1.5 text-xs rounded-[6px] transition-colors cursor-pointer ${
                timeRange === '6h'
                  ? 'bg-[#FAFCFC] text-[#176B87] shadow-subtle font-semibold border border-[#D5E0E4]'
                  : 'text-[#607780] hover:text-[#19323C] font-medium border border-transparent'
              }`}
            >
              6 hours
            </button>
            <button
              onClick={() => handleRangeChange('24h')}
              className={`px-3 py-1.5 text-xs rounded-[6px] transition-colors cursor-pointer ${
                timeRange === '24h'
                  ? 'bg-[#FAFCFC] text-[#176B87] shadow-subtle font-semibold border border-[#D5E0E4]'
                  : 'text-[#607780] hover:text-[#19323C] font-medium border border-transparent'
              }`}
            >
              24 hours
            </button>
          </div>

          <button
            onClick={() => loadData(timeRange)}
            disabled={isRefreshing}
            className="p-2 rounded-[8px] border border-[#D5E0E4] bg-[#FAFCFC] hover:bg-[#E8F0F2] text-[#607780] hover:text-[#19323C] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh historical dataset"
            aria-label="Refresh historical dataset"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#176B87]' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. SCIENTIFIC CONTEXT BANNER */}
      <div className="p-3.5 rounded-[8px] bg-[#E8F0F2] border border-[#D5E0E4] text-xs text-[#607780] flex items-start gap-2.5 shadow-subtle">
        <Database className="w-4 h-4 text-[#167C80] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div>
            <span className="font-semibold text-[#19323C]">
              Historical Telemetry ({getTimeRangeLabel(timeRange)}):{' '}
            </span>
            {IS_MOCK_MODE
              ? 'Demo data generated in the browser; it is not sensor data. '
              : 'Stored readings, oldest first. '}
            MQ135 values are raw, uncalibrated sensor readings (not ppm, CO₂ or AQI), and no air-quality
            classification is applied.
          </div>
          <HistoryMetaNote meta={result?.meta} />
        </div>
      </div>

      {isLoading ? (
        <div className="py-24 text-center">
          <p className="type-body text-[#607780] font-mono">Loading telemetry time series...</p>
        </div>
      ) : error ? (
        <ApiErrorNotice error={error} onRetry={() => loadData(timeRange)} />
      ) : data.length === 0 ? (
        <DataNotice variant="empty" title="No readings in this window">
          No stored readings were found for the selected window. If the database is empty, readings will
          appear here once the ESP32 has posted data to the backend.
        </DataNotice>
      ) : (
        <div className="space-y-6">
          {/* 1. TEMPERATURE OVER TIME */}
          <section aria-labelledby="chart-temp-title">
            <ScientificSeriesChart
              title="Temperature Over Time"
              sensorLabel="DS18B20 Temperature Sensor"
              metricKey="temperature"
              unit="°C"
              strokeColor="#176B87"
              data={data}
            />
          </section>

          {/* 2. HUMIDITY OVER TIME */}
          <section aria-labelledby="chart-hum-title">
            <ScientificSeriesChart
              title="Humidity Over Time"
              sensorLabel="DHT11 Humidity Sensor"
              metricKey="humidity"
              unit="% RH"
              strokeColor="#167C80"
              data={data}
            />
          </section>

          {/* 3. MQ135 SENSOR READINGS OVER TIME */}
          <section aria-labelledby="chart-mq135-title">
            <ScientificSeriesChart
              title="MQ135 Readings Over Time"
              sensorLabel="MQ135 Gas Sensor (raw)"
              metricKey="mq135"
              unit="raw units"
              strokeColor="#C47A13"
              data={data}
            />
          </section>
        </div>
      )}
    </div>
  );
}