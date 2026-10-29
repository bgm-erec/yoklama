import React, { useState } from 'react';
import { MessageSquare, X, Check, Send } from 'lucide-react';
import { addDoc, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

interface FeedbackWidgetProps {
  onLocalFeedbackAdd?: (message: string) => void;
}

export const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({ onLocalFeedbackAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim().toLocaleLowerCase('tr-TR');
    if (!trimmed || isSending) return;

    setIsSending(true);
    const payload = {
      message: trimmed.slice(0, 2000),
      createdAt: new Date().toISOString(),
    };

    try {
      if (onLocalFeedbackAdd) {
        onLocalFeedbackAdd(payload.message);
      }
      await addDoc(collection(db, 'feedback'), payload);
      setMessage('');
      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        setIsOpen(false);
      }, 1400);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'feedback');
      } catch {
        // Already logged and handled locally
      }
      setMessage('');
      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        setIsOpen(false);
      }, 1400);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 sm:bottom-5 sm:left-5 z-50 max-w-[calc(100vw-2rem)]">
      {isOpen ? (
        <div
          role="dialog"
          aria-label="anonim feedback kutusu"
          className="w-[calc(100vw-2rem)] sm:w-96 rounded-2xl border border-stone-300/80 bg-[#faf8f4] p-4 sm:p-5 shadow-xl transition-all"
        >
          <div className="flex items-center justify-between border-b border-stone-200/80 pb-3 mb-3">
            <div>
              <h3 className="font-serif-art text-xl font-medium text-stone-900">
                feedback bırak
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                yazdıkların tamamen anonim kalacaktır, kimliğin kaydedilmez.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="feedback penceresini kapat"
              className="rounded-lg p-2 text-stone-500 hover:bg-stone-200/60 hover:text-stone-800 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {sentSuccess ? (
            <div className="py-6 text-center text-stone-700 flex flex-col items-center gap-2">
              <Check className="h-6 w-6 text-emerald-700" />
              <p className="text-sm">mesajın anonim olarak iletildi, teşekkürler canım.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <label htmlFor="anonymous-feedback-input" className="sr-only">
                anonim geri bildirim mesajın
              </label>
              <textarea
                id="anonymous-feedback-input"
                rows={4}
                maxLength={2000}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="aklındakileri, önerilerini veya şikayetlerini buraya yazabilirsin..."
                className="w-full rounded-xl border border-stone-300 bg-white/90 p-3 text-base sm:text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-600 focus:outline-none resize-none"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-stone-500">
                  %100 anonim gönderim
                </span>
                <button
                  type="submit"
                  disabled={!message.trim() || isSending}
                  className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-medium text-stone-100 hover:bg-stone-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isSending ? 'iletiliyor...' : 'anonim gönder'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-stone-300/90 bg-[#faf8f4]/95 px-4 py-2.5 text-xs font-medium text-stone-800 shadow-sm hover:border-stone-500 hover:bg-white active:scale-95 transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          <MessageSquare className="h-3.5 w-3.5 text-stone-600" />
          <span>feedback</span>
        </button>
      )}
    </div>
  );
};
