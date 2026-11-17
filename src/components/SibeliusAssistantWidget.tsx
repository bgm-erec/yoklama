import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  EyeOff,
} from 'lucide-react';
import {
  AttendanceRecord,
  Course,
  Instructor,
  Student,
  UnlistedStudentReport,
} from '../data/database';
import {
  buildSibeliusQuerySnapshot,
  ENABLE_SIBELIUS_CHATBOT,
} from '../utils/sibeliusChatbotLogic';

interface SibeliusAssistantWidgetProps {
  currentWeek: number;
  students: Student[];
  courses: Course[];
  instructors: Instructor[];
  attendanceRecords: AttendanceRecord[];
  unlistedReports: UnlistedStudentReport[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
}

const STORAGE_HIDDEN_KEY = 'bach_sibelius_assistant_hidden';
const STORAGE_EXPANDED_KEY = 'bach_sibelius_assistant_expanded';

const QUICK_QUESTIONS = [
  'çevrim içinde kaç öğrenci var?',
  'yüz yüzede kaç öğrenci var?',
  'en çok devamsızlık yapan öğrenciler kimler?',
  'bu hafta yoklama girmeyen eğitmenler kimler?',
];

export const SibeliusAssistantWidget: React.FC<SibeliusAssistantWidgetProps> = ({
  currentWeek,
  students,
  courses,
  instructors,
  attendanceRecords,
  unlistedReports,
}) => {
  const [isHidden, setIsHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_HIDDEN_KEY) === '1';
  });

  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_EXPANDED_KEY) === '1';
  });

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_HIDDEN_KEY, isHidden ? '1' : '0');
  }, [isHidden]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_EXPANDED_KEY, isExpanded ? '1' : '0');
  }, [isExpanded]);

  useEffect(() => {
    if (isExpanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, isExpanded]);

  if (!ENABLE_SIBELIUS_CHATBOT) {
    return null;
  }

  const handleAsk = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsExpanded(true);
    setIsLoading(true);

    try {
      const snapshot = buildSibeliusQuerySnapshot(trimmed, {
        currentWeek,
        students,
        courses,
        instructors,
        attendanceRecords,
        unlistedReports,
      });

      const response = await fetch('/api/sibelius-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          snapshot,
        }),
      });

      const data = (await response.json()) as { answer?: string; error?: string };

      if (!response.ok || data.error) {
        setMessages(prev => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: 'assistant',
            text: data.error || 'Yanıt alınamadı, lütfen tekrar deneyin.',
            isError: true,
          },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: 'assistant',
            text: data.answer || 'Yanıt bulunamadı.',
          },
        ]);
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : 'Sunucu bağlantısı kurulamadı.';
      setMessages(prev => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: `Bağlantı hatası: ${errMsg}`,
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isHidden) {
    return (
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          data-testid="sibelius-assistant-restore-btn"
          onClick={() => {
            setIsHidden(false);
            setIsExpanded(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300/90 bg-white/80 px-3 py-1.5 text-xs text-stone-600 hover:border-stone-700 hover:text-stone-900 transition-colors cursor-pointer"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>soru asistanını göster</span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Sibelius soru asistanı"
      data-testid="sibelius-assistant-widget"
      className="mb-6 rounded-2xl border border-stone-300/90 bg-white/90 overflow-hidden transition-all"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#faf8f4]/80 border-b border-stone-200/80">
        <button
          type="button"
          data-testid="sibelius-assistant-toggle-btn"
          onClick={() => setIsExpanded(prev => !prev)}
          aria-expanded={isExpanded}
          className="flex flex-1 items-center gap-2.5 text-left cursor-pointer"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-stone-100">
            <MessageSquare className="h-3.5 w-3.5" />
          </div>
          <div>
            <span className="font-serif-art text-lg text-stone-900 leading-none">
              sibelius soru asistanı
            </span>
            <span className="hidden sm:inline-block ml-2.5 text-xs text-stone-500">
              · öğrenci sayısı, devamsızlık ve ders durumu için hızlı sorgu
            </span>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              data-testid="sibelius-assistant-clear-btn"
              onClick={() => setMessages([])}
              title="Sohbet geçmişini temizle"
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] text-stone-600 hover:border-stone-400 hover:text-stone-900 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>temizle</span>
            </button>
          )}

          <button
            type="button"
            data-testid="sibelius-assistant-hide-btn"
            onClick={() => {
              setIsHidden(true);
              setIsExpanded(false);
            }}
            title="Asistanı panelden gizle"
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] text-stone-500 hover:border-stone-400 hover:text-stone-800 transition-colors cursor-pointer"
          >
            <EyeOff className="h-3 w-3" />
            <span>gizle</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            aria-label={isExpanded ? 'Asistanı daralt' : 'Asistanı genişlet'}
            className="p-1 text-stone-500 hover:text-stone-900 cursor-pointer"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Body */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* Quick Question Suggestions */}
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                type="button"
                disabled={isLoading}
                onClick={() => void handleAsk(q)}
                className="rounded-lg border border-stone-200/90 bg-[#faf8f4] px-2.5 py-1 text-[11px] text-stone-700 hover:border-stone-600 hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Messages History */}
          {messages.length > 0 && (
            <div
              data-testid="sibelius-assistant-messages"
              className="max-h-60 overflow-y-auto space-y-2 rounded-xl border border-stone-200/80 bg-[#faf8f4]/70 p-3 text-xs"
            >
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-xl px-3 py-2 leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-stone-900 text-stone-100'
                        : msg.isError
                        ? 'border border-rose-300 bg-rose-50 text-rose-900'
                        : 'border border-stone-200 bg-white text-stone-800'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-500">
                    yanıtlanıyor...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={e => {
              e.preventDefault();
              void handleAsk(input);
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor="sibelius-assistant-input" className="sr-only">
              Sibelius soru asistanına soru sor
            </label>
            <input
              id="sibelius-assistant-input"
              data-testid="sibelius-assistant-input"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder='örn. "çevrim içinde kaç öğrenci var?" veya "beren apaydın kaç kez gelmemiş?"'
              disabled={isLoading}
              className="flex-1 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-800 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              data-testid="sibelius-assistant-submit-btn"
              disabled={!input.trim() || isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-medium text-stone-100 hover:bg-stone-800 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span>sor</span>
            </button>
          </form>
        </div>
      )}
    </section>
  );
};
