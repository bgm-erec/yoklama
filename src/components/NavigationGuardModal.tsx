import React from 'react';
import { Loader2, AlertCircle, WifiOff, RotateCcw, LogOut, X } from 'lucide-react';
import { WriteQueueSnapshot } from '../utils/writeQueue';

interface NavigationGuardModalProps {
  isOpen: boolean;
  snapshot: WriteQueueSnapshot;
  onRetry: () => void;
  onForceExit: () => void;
  onCancel: () => void;
}

export const NavigationGuardModal: React.FC<NavigationGuardModalProps> = ({
  isOpen,
  snapshot,
  onRetry,
  onForceExit,
  onCancel,
}) => {
  if (!isOpen) return null;

  const isError = snapshot.phase === 'error';
  const isOffline = snapshot.phase === 'offline' || !snapshot.isOnline;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-guard-title"
      data-testid="navigation-guard-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 backdrop-blur-[2px] p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-stone-300 bg-[#faf8f4] p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            {isError ? (
              <AlertCircle className="h-5 w-5 text-rose-700 shrink-0" />
            ) : isOffline ? (
              <WifiOff className="h-5 w-5 text-amber-700 shrink-0" />
            ) : (
              <Loader2 className="h-5 w-5 text-stone-800 animate-spin shrink-0" />
            )}
            <h2
              id="nav-guard-title"
              className="font-serif-art text-2xl text-stone-900 leading-tight"
            >
              {isError
                ? 'kayıt tamamlanamadı'
                : isOffline
                ? 'bağlantı yok, bağlanınca kaydedilecek'
                : 'kaydediliyor, lütfen bekle'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="pencereyi kapat ve ekranda kal"
            className="rounded-lg border border-stone-300 bg-white p-1.5 text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-stone-600 leading-relaxed mb-5">
          {isError
            ? 'son değişiklik sunucuya kaydedilirken bir hata oluştu. tekrar deneyebilir veya son değişikliği iptal ederek yine de çıkabilirsin.'
            : isOffline
            ? 'şu anda internet bağlantısı yok. yaptığın değişiklik cihazın kalıcı önbelleğine alındı ve bağlantı geldiğinde otomatik gönderilecek.'
            : 'yoklama değişikliklerin sunucuya yazılıyor. kayıt onaylandığı anda işlemin otomatik olarak devam edecek.'}
        </p>

        {(isError || isOffline) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              ekranda kal
            </button>
            <button
              type="button"
              onClick={onRetry}
              data-testid="nav-guard-retry"
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-medium text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>tekrar dene</span>
            </button>
            <button
              type="button"
              onClick={onForceExit}
              data-testid="nav-guard-force-exit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-xs font-medium text-white hover:bg-rose-800 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>yine de çık</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
