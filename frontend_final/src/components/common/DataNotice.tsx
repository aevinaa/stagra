import React from 'react';
import { AlertTriangle, Inbox, Info, RefreshCw } from 'lucide-react';
import { isApiError } from '../../services/api';
import { HistoryMeta } from '../../types';

type NoticeVariant = 'empty' | 'error' | 'unavailable';

interface DataNoticeProps {
  variant: NoticeVariant;
  title: string;
  children?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}

const VARIANT_STYLES: Record<NoticeVariant, { box: string; icon: string }> = {
  empty: { box: 'bg-[#E8F0F2] border-[#D5E0E4]', icon: 'text-[#176B87]' },
  error: { box: 'bg-[#FDF0F0] border-[#E9C4C4]', icon: 'text-[#C94343]' },
  unavailable: { box: 'bg-[#FFF8E8] border-[#E7C98A]', icon: 'text-[#C47A13]' },
};

/**
 * A neutral notice box used for "no data yet", "request failed" and
 * "not available yet" states. It never shows data.
 */
export function DataNotice({ variant, title, children, onRetry, className = '' }: DataNoticeProps) {
  const style = VARIANT_STYLES[variant];
  const Icon = variant === 'error' ? AlertTriangle : variant === 'empty' ? Inbox : Info;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-[10px] border p-5 flex items-start gap-3 ${style.box} ${className}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${style.icon}`} />
      <div className="space-y-1.5 min-w-0">
        <h3 className="text-sm font-semibold text-[#19323C]">{title}</h3>
        {children && <div className="text-xs text-[#607780] leading-relaxed">{children}</div>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-[6px] bg-[#FAFCFC] border border-[#D5E0E4] text-[#19323C] hover:bg-[#E8F0F2] cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

interface ApiErrorNoticeProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

/**
 * Turns an error thrown by the API layer into the right notice:
 *  - ApiError 'empty'        -> "No readings yet" (not an error)
 *  - ApiError 'network'      -> cannot reach the dev server
 *  - ApiError 'http'         -> the backend answered with an error (or the proxy could not reach it)
 *  - ApiError 'bad_response' -> the answer was not JSON
 */
export function ApiErrorNotice({ error, onRetry, className = '' }: ApiErrorNoticeProps) {
  if (isApiError(error)) {
    switch (error.kind) {
      case 'empty':
        return (
          <DataNotice variant="empty" title="No sensor readings stored yet" onRetry={onRetry} className={className}>
            The backend is running, but its database has no readings. Readings will appear here once the
            ESP32 has posted data to the backend.
          </DataNotice>
        );
      case 'network':
        return (
          <DataNotice variant="error" title="Cannot reach the dashboard server" onRetry={onRetry} className={className}>
            {error.message} Check that <span className="font-mono">npm run dev</span> is still running, then retry.
          </DataNotice>
        );
      case 'http':
        return (
          <DataNotice variant="error" title="The backend returned an error" onRetry={onRetry} className={className}>
            {error.message} Check that the FastAPI backend is running at{' '}
            <span className="font-mono">http://127.0.0.1:8000</span>, then retry.
          </DataNotice>
        );
      case 'bad_response':
        return (
          <DataNotice variant="error" title="Unexpected response from the server" onRetry={onRetry} className={className}>
            {error.message}
          </DataNotice>
        );
    }
  }
  return (
    <DataNotice variant="error" title="Something went wrong" onRetry={onRetry} className={className}>
      The data could not be loaded. See the browser console for details.
    </DataNotice>
  );
}

const formatWindowTime = (iso: string | null | undefined, whenMissing: string): string => {
  if (!iso) return whenMissing;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

/**
 * One-line description of what a history query covered, including a downsampling
 * notice. Renders nothing when there is no `meta` (mock mode) or nothing was stored.
 */
export function HistoryMetaNote({ meta, className = '' }: { meta: HistoryMeta | null | undefined; className?: string }) {
  if (!meta || (meta.count === 0 && meta.sourceCount === 0)) return null;
  return (
    <div className={`text-[11px] font-mono text-[#607780] space-y-0.5 ${className}`}>
      <div>
        Window: {formatWindowTime(meta.windowStart, 'earliest')} → {formatWindowTime(meta.windowEnd, 'latest')} ·{' '}
        {meta.count} of {meta.sourceCount} stored readings shown
      </div>
      {meta.downsampled && <div className="text-[#C47A13]">Downsampled: {meta.note}</div>}
    </div>
  );
}