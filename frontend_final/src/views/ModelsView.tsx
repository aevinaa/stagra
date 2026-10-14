import React, { useEffect, useState } from 'react';
import { getModelComparison, IS_MOCK_MODE } from '../services/api';
import type { ModelComparisonResult } from '../types';

export function ModelsView() {
  const [models, setModels] = useState<ModelComparisonResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModelData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getModelComparison();
      setModels(result ?? []);
      if (result === null) {
        setError('Model comparison results could not be loaded. Check that the backend is running.');
      }
    } catch (err) {
      console.error('Failed to load model comparison:', err);
      setError('Unable to load model comparison results.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchModelData();
  }, []);

  if (isLoading) {
    return (
      <div className="py-24 text-center">
        <p className="type-body text-[#607780] font-mono">Loading model comparison…</p>
      </div>
    );
  }

  const isRealResults = !IS_MOCK_MODE;
  const validModels = models.filter(
    (model) => Number.isFinite(model.mae) && Number.isFinite(model.rmse),
  );
  const bestByMae = [...validModels].sort((a, b) => a.mae - b.mae)[0];

  return (
    <div className="space-y-6">
      <header className="pb-3 border-b border-[#D5E0E4]">
        <h2 className="type-page-title text-[#19323C]">Model Comparison</h2>
        <p className="type-body text-[#607780] mt-1">
          Compare forecasting methods using error on raw MQ135 sensor readings.
        </p>
      </header>

      {isRealResults ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">Exploratory evaluation — not a final benchmark</h3>
          <p className="mt-1">
            These are measured exploratory results for a 60-second forecast of raw MQ135 sensor
            units, using a 180-second lookback on experiment HW-005. HW-005 also informed
            forecast-horizon and lookback selection, so it is not an untouched final test set.
            The values are not AQI or pollutant concentrations.
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-[#D5E0E4] bg-[#E8F2F6] p-4 text-sm text-[#176B87]">
          <h3 className="font-semibold">Demo / Mock Results</h3>
          <p className="mt-1">
            These illustrative values are generated demo data, not measured model performance.
          </p>
        </section>
      )}

      {error ? (
        <div className="rounded-lg border border-[#D5E0E4] bg-[#FAFCFC] p-6 text-center">
          <p className="text-sm text-[#C94343]">{error}</p>
          <button
            type="button"
            onClick={() => void fetchModelData()}
            className="mt-3 rounded-md border border-[#D5E0E4] px-4 py-2 text-sm text-[#19323C] hover:bg-[#E8F0F2]"
          >
            Retry
          </button>
        </div>
      ) : validModels.length === 0 ? (
        <div className="rounded-lg border border-[#D5E0E4] bg-[#FAFCFC] p-6 text-sm text-[#607780]">
          No model evaluation results are available.
        </div>
      ) : (
        <>
          {isRealResults && bestByMae && (
            <section className="rounded-xl border border-[#D5E0E4] border-l-4 border-l-[#176B87] bg-[#FAFCFC] p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#176B87]">
                Lowest exploratory MAE
              </p>
              <h3 className="mt-1 text-xl font-bold text-[#19323C]">{bestByMae.modelName}</h3>
              <p className="mt-2 text-sm text-[#607780]">
                MAE {bestByMae.mae.toFixed(3)} raw sensor units · RMSE {bestByMae.rmse.toFixed(3)} raw sensor units.
                Lower values indicate smaller prediction errors on this evaluation.
              </p>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-[#D5E0E4] bg-white">
            <div className="border-b border-[#D5E0E4] p-4">
              <h3 className="font-semibold text-[#19323C]">
                {isRealResults ? 'Measured exploratory results' : 'Illustrative benchmark matrix'}
              </h3>
              <p className="mt-1 text-xs text-[#607780]">
                {validModels.length} {validModels.length === 1 ? 'method' : 'methods'} · Regression metrics
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#E8F0F2] text-xs uppercase tracking-wide text-[#607780]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Method</th>
                    <th scope="col" className="px-4 py-3 text-right">MAE ↓</th>
                    <th scope="col" className="px-4 py-3 text-right">RMSE ↓</th>
                    {!isRealResults && (
                      <>
                        <th scope="col" className="px-4 py-3 text-right">Accuracy</th>
                        <th scope="col" className="px-4 py-3 text-right">F1 Score</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E0E4]">
                  {validModels.map((model) => (
                    <tr key={model.modelName} className="hover:bg-[#F7FAFB]">
                      <th scope="row" className="px-4 py-3 font-medium text-[#19323C]">
                        {model.modelName}
                        {isRealResults && model === bestByMae && (
                          <span className="ml-2 rounded border border-[#D5E0E4] bg-[#E8F2F6] px-2 py-0.5 text-[10px] font-mono text-[#176B87]">
                            Lowest MAE
                          </span>
                        )}
                      </th>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[#19323C]">
                        {model.mae.toFixed(3)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[#19323C]">
                        {model.rmse.toFixed(3)}
                      </td>
                      {!isRealResults && (
                        <>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-[#19323C]">
                            {Number.isFinite(model.accuracy) ? `${(model.accuracy * 100).toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-[#19323C]">
                            {model.f1Score != null && Number.isFinite(model.f1Score) ? model.f1Score.toFixed(3) : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {isRealResults && (
            <section className="rounded-lg border border-[#D5E0E4] bg-[#FAFCFC] p-4 text-sm text-[#607780]">
              <h3 className="font-semibold text-[#19323C]">How to interpret these metrics</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><strong>MAE</strong> is the average absolute prediction error.</li>
                <li><strong>RMSE</strong> penalizes larger errors more strongly than MAE.</li>
                <li>Both values are in raw MQ135 sensor units; they are not AQI values.</li>
                <li>Only the measured Persistence and Linear Trend results are shown here. No classification accuracy or F1 score was measured for this comparison.</li>
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default ModelsView;
