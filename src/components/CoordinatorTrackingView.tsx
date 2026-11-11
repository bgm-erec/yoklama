import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Calendar, RefreshCw } from 'lucide-react';
import {
  CoordinatorAssignmentRecord,
  Instructor,
  normalizeName,
} from '../data/database';
import { TOTAL_TERM_WEEKS } from '../config/academicConfig';
import {
  cleanCoordinatorNames,
  getWeekWeekendDates,
  isUnassignedBosInstructor,
} from '../utils/enigmaLogic';

interface CoordinatorTrackingViewProps {
  currentWeek: number;
  instructors: Instructor[];
  assignments: CoordinatorAssignmentRecord[];
  onSaveCoordinator: (
    weekNumber: number,
    day: 'saturday' | 'sunday',
    names: (string | null)[],
    options?: { debounced?: boolean }
  ) => Promise<void>;
  onBack?: () => void;
}

interface LocalDayState {
  slot0: string;
  slot1: string;
}

export const CoordinatorTrackingView: React.FC<CoordinatorTrackingViewProps> = ({
  currentWeek,
  instructors,
  assignments,
  onSaveCoordinator,
  onBack,
}) => {
  const currentWeekRef = useRef<HTMLTableRowElement | null>(null);
  const totalWeeks = Math.max(currentWeek, TOTAL_TERM_WEEKS);
  const weeks = useMemo(
    () => Array.from({ length: totalWeeks }, (_, i) => i + 1),
    [totalWeeks]
  );

  // Map of assignments by weekNumber
  const assignmentMap = useMemo(() => {
    const map = new Map<number, CoordinatorAssignmentRecord>();
    for (const record of assignments) {
      map.set(record.weekNumber, record);
    }
    return map;
  }, [assignments]);

  // Local draft state for responsive typing and instant feedback
  const [localDrafts, setLocalDrafts] = useState<
    Record<number, { saturday: LocalDayState; sunday: LocalDayState }>
  >({});

  // Tracks which week & day currently has a write error
  const [failedSlots, setFailedSlots] = useState<Set<string>>(new Set());
  const [savingSlots, setSavingSlots] = useState<Set<string>>(new Set());

  // Keep local drafts synchronized with Firestore updates when not actively typing
  useEffect(() => {
    setLocalDrafts(prev => {
      const next: Record<
        number,
        { saturday: LocalDayState; sunday: LocalDayState }
      > = { ...prev };
      for (const w of weeks) {
        const rec = assignmentMap.get(w);
        const sat0 = rec?.saturday?.[0] || '';
        const sat1 = rec?.saturday?.[1] || '';
        const sun0 = rec?.sunday?.[0] || '';
        const sun1 = rec?.sunday?.[1] || '';

        if (!next[w]) {
          next[w] = {
            saturday: { slot0: sat0, slot1: sat1 },
            sunday: { slot0: sun0, slot1: sun1 },
          };
        } else {
          // If remote record changed and differs from local draft when not focused, sync it
          next[w] = {
            saturday: {
              slot0: next[w].saturday.slot0 !== '' ? next[w].saturday.slot0 : sat0,
              slot1: next[w].saturday.slot1 !== '' ? next[w].saturday.slot1 : sat1,
            },
            sunday: {
              slot0: next[w].sunday.slot0 !== '' ? next[w].sunday.slot0 : sun0,
              slot1: next[w].sunday.slot1 !== '' ? next[w].sunday.slot1 : sun1,
            },
          };
        }
      }
      return next;
    });
  }, [assignmentMap, weeks]);

  // Auto-scroll to current week on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentWeekRef.current) {
        currentWeekRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Sorted list of real instructor names for autocomplete suggestions
  const instructorSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const inst of instructors) {
      if (!isUnassignedBosInstructor(inst.name)) {
        names.add(inst.name);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [instructors]);

  const handleInputChange = (
    weekNumber: number,
    day: 'saturday' | 'sunday',
    slotIndex: 0 | 1,
    value: string
  ) => {
    const slotKey = `${weekNumber}_${day}`;
    setFailedSlots(prev => {
      if (prev.has(slotKey)) {
        const copy = new Set(prev);
        copy.delete(slotKey);
        return copy;
      }
      return prev;
    });

    const currentWeekDraft = localDrafts[weekNumber] || {
      saturday: { slot0: '', slot1: '' },
      sunday: { slot0: '', slot1: '' },
    };

    const nextDayState: LocalDayState = {
      ...currentWeekDraft[day],
      [slotIndex === 0 ? 'slot0' : 'slot1']: value,
    };

    setLocalDrafts(prev => ({
      ...prev,
      [weekNumber]: {
        ...currentWeekDraft,
        [day]: nextDayState,
      },
    }));

    // Trigger debounced write through common write queue
    triggerSave(weekNumber, day, nextDayState, true);
  };

  const handleInputBlur = (
    weekNumber: number,
    day: 'saturday' | 'sunday'
  ) => {
    const currentWeekDraft = localDrafts[weekNumber]?.[day] || {
      slot0: '',
      slot1: '',
    };
    // Flush write immediately on blur
    triggerSave(weekNumber, day, currentWeekDraft, false);
  };

  const triggerSave = async (
    weekNumber: number,
    day: 'saturday' | 'sunday',
    dayState: LocalDayState,
    debounced: boolean
  ) => {
    const slotKey = `${weekNumber}_${day}`;
    const cleanNames = cleanCoordinatorNames([
      dayState.slot0,
      dayState.slot1,
    ]);

    setSavingSlots(prev => new Set(prev).add(slotKey));
    try {
      await onSaveCoordinator(weekNumber, day, cleanNames, { debounced });
      setFailedSlots(prev => {
        if (!prev.has(slotKey)) return prev;
        const copy = new Set(prev);
        copy.delete(slotKey);
        return copy;
      });
    } catch {
      setFailedSlots(prev => new Set(prev).add(slotKey));
    } finally {
      setSavingSlots(prev => {
        if (!prev.has(slotKey)) return prev;
        const copy = new Set(prev);
        copy.delete(slotKey);
        return copy;
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Suggestions datalist shared by all coordinator inputs */}
      <datalist id="coordinator-instructor-suggestions">
        {instructorSuggestions.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {onBack && (
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white/90 px-3 py-1.5 text-xs text-stone-700 hover:border-stone-700 hover:text-stone-950 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>sibelius menüsüne dön</span>
          </button>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-stone-300/90 bg-white/85 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-stone-100">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif-art text-xl sm:text-2xl text-stone-900 leading-tight">
              koordinatör takip
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              hafta sonu (cumartesi & pazar) nöbetçi koordinatör listesi · otomatik kaydedilir
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-stone-100/80 px-3 py-1 text-xs text-stone-700 font-mono-num">
            aktif hafta: <strong>{currentWeek}. hafta</strong>
          </span>
        </div>
      </div>

      {/* Responsive Table Container: Prevents entire page from blowing out on mobile */}
      <div className="w-full max-w-full overflow-hidden rounded-2xl border border-stone-300/90 bg-white/95 shadow-sm">
        <div className="w-full overflow-x-auto touch-pan-x">
          <table className="w-full min-w-[700px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-[#f7f5f0] text-xs font-semibold text-stone-700">
                <th className="w-28 py-3.5 px-4 font-serif-art">Hafta</th>
                <th className="py-3.5 px-4 font-serif-art">
                  Cumartesi <span className="font-sans font-normal text-stone-500">(2 kişi)</span>
                </th>
                <th className="py-3.5 px-4 font-serif-art">
                  Pazar <span className="font-sans font-normal text-stone-500">(2 kişi)</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/80">
              {weeks.map(weekNum => {
                const dates = getWeekWeekendDates(weekNum);
                const isCurrent = weekNum === currentWeek;
                const isPast = weekNum < currentWeek;

                const weekDraft = localDrafts[weekNum] || {
                  saturday: {
                    slot0: assignmentMap.get(weekNum)?.saturday?.[0] || '',
                    slot1: assignmentMap.get(weekNum)?.saturday?.[1] || '',
                  },
                  sunday: {
                    slot0: assignmentMap.get(weekNum)?.sunday?.[0] || '',
                    slot1: assignmentMap.get(weekNum)?.sunday?.[1] || '',
                  },
                };

                // Duplicate checks using centralized normalizeName
                const sat0Norm = normalizeName(weekDraft.saturday.slot0);
                const sat1Norm = normalizeName(weekDraft.saturday.slot1);
                const isSatDuplicate =
                  Boolean(sat0Norm) && Boolean(sat1Norm) && sat0Norm === sat1Norm;

                const sun0Norm = normalizeName(weekDraft.sunday.slot0);
                const sun1Norm = normalizeName(weekDraft.sunday.slot1);
                const isSunDuplicate =
                  Boolean(sun0Norm) && Boolean(sun1Norm) && sun0Norm === sun1Norm;

                const satSlotKey = `${weekNum}_saturday`;
                const sunSlotKey = `${weekNum}_sunday`;
                const isSatFailed = failedSlots.has(satSlotKey);
                const isSunFailed = failedSlots.has(sunSlotKey);

                return (
                  <tr
                    key={weekNum}
                    ref={isCurrent ? currentWeekRef : undefined}
                    id={`coordinator-week-${weekNum}`}
                    className={`transition-colors ${
                      isCurrent
                        ? 'bg-amber-50/70 border-l-4 border-l-stone-900 font-medium'
                        : isPast
                        ? 'bg-stone-50/40 text-stone-600 opacity-75 hover:opacity-100'
                        : 'hover:bg-stone-50/80'
                    }`}
                  >
                    {/* Column 1: Hafta */}
                    <td className="py-4 px-4 align-top whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono-num font-medium text-stone-900 text-sm">
                          {weekNum}. hafta
                        </span>
                        {isCurrent ? (
                          <span className="inline-block w-fit rounded-md bg-stone-900 px-2 py-0.5 text-[10px] font-medium text-stone-100">
                            bu hafta
                          </span>
                        ) : isPast ? (
                          <span className="text-[11px] text-stone-400 italic">
                            tamamlandı
                          </span>
                        ) : (
                          <span className="text-[11px] text-stone-400">
                            gelecek hafta
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Column 2: Cumartesi (tarih) */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-stone-500 font-mono-num">
                          <span>{dates.saturdayFormatted}</span>
                          {isSatFailed && (
                            <button
                              type="button"
                              onClick={() =>
                                triggerSave(
                                  weekNum,
                                  'saturday',
                                  weekDraft.saturday,
                                  false
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 hover:text-rose-900 cursor-pointer"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>tekrar dene</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            list="coordinator-instructor-suggestions"
                            value={weekDraft.saturday.slot0}
                            onChange={e =>
                              handleInputChange(
                                weekNum,
                                'saturday',
                                0,
                                e.target.value
                              )
                            }
                            onBlur={() => handleInputBlur(weekNum, 'saturday')}
                            placeholder="henüz atanmadı"
                            className={`w-full rounded-xl border px-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 placeholder:italic focus:outline-none transition-colors ${
                              isSatFailed
                                ? 'border-rose-500 bg-rose-50/60 focus:border-rose-700'
                                : isSatDuplicate
                                ? 'border-amber-400 bg-amber-50/50 focus:border-amber-600'
                                : 'border-stone-300 bg-white focus:border-stone-800'
                            }`}
                          />

                          <input
                            type="text"
                            list="coordinator-instructor-suggestions"
                            value={weekDraft.saturday.slot1}
                            onChange={e =>
                              handleInputChange(
                                weekNum,
                                'saturday',
                                1,
                                e.target.value
                              )
                            }
                            onBlur={() => handleInputBlur(weekNum, 'saturday')}
                            placeholder="henüz atanmadı"
                            className={`w-full rounded-xl border px-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 placeholder:italic focus:outline-none transition-colors ${
                              isSatFailed
                                ? 'border-rose-500 bg-rose-50/60 focus:border-rose-700'
                                : isSatDuplicate
                                ? 'border-amber-400 bg-amber-50/50 focus:border-amber-600'
                                : 'border-stone-300 bg-white focus:border-stone-800'
                            }`}
                          />
                        </div>

                        {isSatDuplicate && (
                          <div className="flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50/80 rounded-md px-2 py-0.5 border border-amber-200">
                            <AlertCircle className="h-3 w-3 shrink-0 text-amber-700" />
                            <span>aynı kişi cumartesi günü için iki kez yazıldı</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Column 3: Pazar (tarih) */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-stone-500 font-mono-num">
                          <span>{dates.sundayFormatted}</span>
                          {isSunFailed && (
                            <button
                              type="button"
                              onClick={() =>
                                triggerSave(
                                  weekNum,
                                  'sunday',
                                  weekDraft.sunday,
                                  false
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 hover:text-rose-900 cursor-pointer"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>tekrar dene</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            list="coordinator-instructor-suggestions"
                            value={weekDraft.sunday.slot0}
                            onChange={e =>
                              handleInputChange(
                                weekNum,
                                'sunday',
                                0,
                                e.target.value
                              )
                            }
                            onBlur={() => handleInputBlur(weekNum, 'sunday')}
                            placeholder="henüz atanmadı"
                            className={`w-full rounded-xl border px-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 placeholder:italic focus:outline-none transition-colors ${
                              isSunFailed
                                ? 'border-rose-500 bg-rose-50/60 focus:border-rose-700'
                                : isSunDuplicate
                                ? 'border-amber-400 bg-amber-50/50 focus:border-amber-600'
                                : 'border-stone-300 bg-white focus:border-stone-800'
                            }`}
                          />

                          <input
                            type="text"
                            list="coordinator-instructor-suggestions"
                            value={weekDraft.sunday.slot1}
                            onChange={e =>
                              handleInputChange(
                                weekNum,
                                'sunday',
                                1,
                                e.target.value
                              )
                            }
                            onBlur={() => handleInputBlur(weekNum, 'sunday')}
                            placeholder="henüz atanmadı"
                            className={`w-full rounded-xl border px-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 placeholder:italic focus:outline-none transition-colors ${
                              isSunFailed
                                ? 'border-rose-500 bg-rose-50/60 focus:border-rose-700'
                                : isSunDuplicate
                                ? 'border-amber-400 bg-amber-50/50 focus:border-amber-600'
                                : 'border-stone-300 bg-white focus:border-stone-800'
                            }`}
                          />
                        </div>

                        {isSunDuplicate && (
                          <div className="flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50/80 rounded-md px-2 py-0.5 border border-amber-200">
                            <AlertCircle className="h-3 w-3 shrink-0 text-amber-700" />
                            <span>aynı kişi pazar günü için iki kez yazıldı</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
