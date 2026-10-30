import React, { useState } from 'react';
import { ArrowLeft, MessageSquare, Trash2 } from 'lucide-react';
import { FeedbackItem } from '../data/database';

interface AmadeusFeedbackViewProps {
  feedbacks: FeedbackItem[];
  onDeleteFeedback?: (feedbackId: string) => Promise<void>;
  onClearAllFeedbacks?: () => Promise<void>;
  onBackToLogin: () => void;
}

export const AmadeusFeedbackView: React.FC<AmadeusFeedbackViewProps> = ({
  feedbacks,
  onDeleteFeedback,
  onClearAllFeedbacks,
  onBackToLogin,
}) => {
  const [confirmClearAll, setConfirmClearAll] = useState(false);

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
            gönderilen tüm anonim geri bildirimler ({feedbacks.length})
          </p>
        </div>

        {feedbacks.length > 0 && onClearAllFeedbacks && (
          <div>
            {!confirmClearAll ? (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white/85 px-4 py-2 text-xs font-medium text-stone-700 hover:border-rose-700 hover:text-rose-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>tüm feedbackleri temizle</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5">
                <span className="text-xs text-rose-900">tümü silinsin mi?</span>
                <button
                  type="button"
                  onClick={async () => {
                    await onClearAllFeedbacks();
                    setConfirmClearAll(false);
                  }}
                  className="rounded-lg bg-rose-700 px-3 py-1 text-xs font-medium text-white hover:bg-rose-800 cursor-pointer"
                >
                  evet, sil
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="rounded-lg px-2 py-1 text-xs text-stone-600 hover:text-stone-900 cursor-pointer"
                >
                  vazgeç
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {feedbacks.length === 0 ? (
        <div className="rounded-2xl border border-stone-300/80 bg-white/80 p-12 text-center">
          <MessageSquare className="h-6 w-6 text-stone-400 mx-auto mb-2" />
          <p className="text-sm text-stone-600">
            henüz bırakılmış bir anonim feedback bulunmuyor.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {feedbacks.map((fb, index) => {
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
                  <span>anonim #{feedbacks.length - index}</span>
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
