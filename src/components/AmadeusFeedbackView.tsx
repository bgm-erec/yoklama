import React, { useState } from 'react';
import { ArrowLeft, MessageSquare, Trash2, RotateCcw } from 'lucide-react';
import { FeedbackItem, normalizeTurkish } from '../data/database';

interface AmadeusFeedbackViewProps {
  feedbacks: FeedbackItem[];
  onDeleteFeedback?: (feedbackId: string) => Promise<void>;
  onClearAllFeedbacks?: () => Promise<void>;
  canUndoFeedbackReset?: boolean;
  onUndoFeedbackReset?: () => Promise<void>;
  onBackToLogin: () => void;
}

export const AmadeusFeedbackView: React.FC<AmadeusFeedbackViewProps> = ({
  feedbacks,
  onDeleteFeedback,
  onClearAllFeedbacks,
  canUndoFeedbackReset,
  onUndoFeedbackReset,
  onBackToLogin,
}) => {
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const activeFeedbacks = feedbacks.filter(f => !f.deletedAt);
  const isConfirmValid = normalizeTurkish(confirmText) === 'sıfırla' || normalizeTurkish(confirmText) === 'sifirla';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-4 pb-24 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-300/80 pb-4 sm:pb-5 mb-6 sm:mb-8">
        <div>
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-1.5 py-1 text-xs text-stone-500 hover:text-stone-900 transition-colors mb-1 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>ana sayfaya dön</span>
          </button>
          <h1 className="font-serif-art text-3xl sm:text-4xl text-stone-900">
            amadeus · anonim feedback arşivi
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            gönderilen tüm anonim geri bildirimler ({activeFeedbacks.length})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canUndoFeedbackReset && onUndoFeedbackReset && (
            <button
              type="button"
              onClick={onUndoFeedbackReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>son silme işlemini geri al</span>
            </button>
          )}

          {activeFeedbacks.length > 0 && onClearAllFeedbacks && (
            <div>
              {!confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClearAll(true);
                    setConfirmText('');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white/85 px-4 py-2 text-xs font-medium text-stone-700 hover:border-rose-700 hover:text-rose-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>tüm feedbackleri temizle</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2">
                  <label htmlFor="amadeus-reset-confirm" className="text-xs text-rose-900">
                    onay için <strong>SIFIRLA</strong> yaz:
                  </label>
                  <input
                    id="amadeus-reset-confirm"
                    type="text"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="SIFIRLA"
                    className="w-24 rounded-lg border border-rose-300 bg-white px-2 py-1 text-xs text-stone-900 focus:border-rose-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!isConfirmValid}
                    onClick={async () => {
                      await onClearAllFeedbacks();
                      setConfirmClearAll(false);
                      setConfirmText('');
                    }}
                    className="rounded-lg bg-rose-700 px-3 py-1 text-xs font-medium text-white hover:bg-rose-800 disabled:opacity-40 cursor-pointer"
                  >
                    yedekle ve sil
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmClearAll(false);
                      setConfirmText('');
                    }}
                    className="rounded-lg px-2 py-1 text-xs text-stone-600 hover:text-stone-900 cursor-pointer"
                  >
                    vazgeç
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {activeFeedbacks.length === 0 ? (
        <div className="rounded-2xl border border-stone-300/80 bg-white/80 p-12 text-center">
          <MessageSquare className="h-6 w-6 text-stone-400 mx-auto mb-2" />
          <p className="text-sm text-stone-600">
            henüz bırakılmış bir anonim feedback bulunmuyor.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeFeedbacks.map((fb, index) => {
            const dateObj = new Date(fb.createdAt);
            const formattedDate = isNaN(dateObj.getTime())
              ? ''
              : dateObj.toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                });

            return (
              <div
                key={fb.id || index}
                className="flex flex-col justify-between rounded-2xl border border-stone-300/90 bg-white/90 p-5 shadow-xs group"
              >
                <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap break-words">
                  {fb.message}
                </p>
                <div className="mt-4 pt-3 border-t border-stone-200/70 flex items-center justify-between text-[11px] text-stone-400 font-mono-num">
                  <span>anonim #{activeFeedbacks.length - index}</span>
                  <div className="flex items-center gap-2">
                    <span>{formattedDate}</span>
                    {fb.id && onDeleteFeedback && (
                      <button
                        type="button"
                        onClick={() => onDeleteFeedback(fb.id!)}
                        aria-label="bu feedback kaydını sil"
                        className="p-1 text-stone-400 hover:text-rose-700 transition-colors cursor-pointer"
                        title="sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
