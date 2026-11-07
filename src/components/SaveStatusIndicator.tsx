import React from 'react';
import { Loader2, Check, AlertCircle, WifiOff, RotateCcw } from 'lucide-react';
import { WriteQueueSnapshot } from '../utils/writeQueue';

interface SaveStatusIndicatorProps {
  snapshot: WriteQueueSnapshot;
  onRetry: () => void;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  snapshot,
  onRetry,
}) => {
  const { phase, lastErrorMessage } = snapshot;

  const announcementText =
    phase === 'saving'
      ? 'kaydediliyor'
      : phase === 'syncing_startup'
      ? 'bekleyen kayıtlar gönderiliyor'
      : phase === 'saved'
      ? 'kaydedildi'
      : phase === 'offline'
      ? 'bağlantı yok, bağlanınca kaydedilecek'
      : phase === 'error'
      ? 'kaydedilemedi'
      : '';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="save-status-indicator"
      data-phase={phase}
      className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 max-w-[calc(100vw-2rem)] pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pointer-events-none"
    >
      {phase === 'hidden' ? (
        <span className="sr-only">{announcementText}</span>
      ) : (
        <div
          className={`pointer-events-auto inline-flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs font-medium shadow-lg backdrop-blur-xs transition-all duration-200 ${
            phase === 'saving' || phase === 'syncing_startup'
              ? 'border-stone-300 bg-[#faf8f4]/95 text-stone-800'
              : phase === 'saved'
              ? 'border-emerald-300 bg-emerald-50/95 text-emerald-900'
              : phase === 'offline'
              ? 'border-amber-300 bg-amber-50/95 text-amber-950'
              : 'border-rose-300 bg-rose-50/95 text-rose-950'
          }`}
        >
          {(phase === 'saving' || phase === 'syncing_startup') && (
            <>
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin text-stone-700"
                aria-hidden="true"
              />
              <span>
                {phase === 'syncing_startup'
                  ? 'bekleyen kayıtlar gönderiliyor'
                  : 'kaydediliyor'}
              </span>
            </>
          )}

          {phase === 'saved' && (
            <>
              <Check
                className="h-4 w-4 shrink-0 text-emerald-700"
                aria-hidden="true"
              />
              <span>kaydedildi</span>
            </>
          )}

          {phase === 'offline' && (
            <>
              <WifiOff
                className="h-4 w-4 shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <span>bağlantı yok, bağlanınca kaydedilecek</span>
            </>
          )}

          {phase === 'error' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <AlertCircle
                  className="h-4 w-4 shrink-0 text-rose-700"
                  aria-hidden="true"
                />
                <span title={lastErrorMessage || undefined}>kaydedilemedi</span>
              </div>
              <button
                type="button"
                onClick={onRetry}
                data-testid="save-retry-button"
                className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rose-800 active:scale-95 transition-all cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>tekrar dene</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
