import React, { useState, useEffect } from 'react';
import { RotateCcw, Sparkles, ArrowLeft, BookOpen, CheckSquare, UserPlus, X, Check } from 'lucide-react';
import {
  AttendanceRecord,
  Course,
  DB,
  getCanonicalStudentName,
  Instructor,
  normalizeTurkish,
  SessionType,
  slugifyTurkish,
  Student,
  UnlistedStudentReport,
} from '../data/database';
import {
  computeAbsentDifferenceSet,
  getWeekDateRangeLabel,
  isMelekYilmazInstructor,
  MELEK_YILMAZ_REASSURANCE_MESSAGE,
} from '../utils/enigmaLogic';

interface InstructorViewProps {
  instructor: Instructor;
  currentWeek: number;
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
  attendanceRecords: AttendanceRecord[];
  unlistedReports?: UnlistedStudentReport[];
  onSaveAttendance: (record: AttendanceRecord) => Promise<void>;
  onAddUnlistedStudent?: (report: UnlistedStudentReport) => Promise<void>;
  onRemoveUnlistedStudent?: (reportId: string) => Promise<void>;
  onDeleteCourseSession?: (courseId: string, weekNumber: number, sessionType: string) => Promise<void>;
  onBackToLogin: () => void;
}

const SESSION_OPTIONS: SessionType[] = [
  '1. ders',
  '2. ders',
  'ek dersler',
  'ders yapmadım',
];

export const InstructorView: React.FC<InstructorViewProps> = ({
  instructor,
  currentWeek,
  selectedWeek,
  onSelectWeek,
  attendanceRecords,
  unlistedReports = [],
  onSaveAttendance,
  onAddUnlistedStudent,
  onRemoveUnlistedStudent,
  onDeleteCourseSession,
  onBackToLogin,
}) => {
  const instructorCourses: Course[] = instructor.courseIds
    .map(id => DB.courses.find(c => c.id === id))
    .filter((c): c is Course => Boolean(c));

  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    instructorCourses[0]?.id || ''
  );
  const [selectedSession, setSelectedSession] = useState<SessionType | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced'>('synced');

  // Compact unlisted student bar states
  const [isUnlistedBarOpen, setIsUnlistedBarOpen] = useState(false);
  const [unlistedNameInput, setUnlistedNameInput] = useState('');
  const [unlistedFeedback, setUnlistedFeedback] = useState<{ type: 'error' | 'ok'; text: string } | null>(null);

  // Exclusive placebo save button state for Melek Yılmaz only
  const isMelekYilmaz = isMelekYilmazInstructor(instructor);
  const [melekSavePhase, setMelekSavePhase] = useState<'idle' | 'effect' | 'reassured'>('idle');
  const [melekBurstKey, setMelekBurstKey] = useState(0);

  const handleMelekPlaceboSave = () => {
    // Intentionally does NOT perform any save operation (saving is already automatic)
    setMelekBurstKey(prev => prev + 1);
    setMelekSavePhase('effect');
    window.setTimeout(() => {
      setMelekSavePhase('reassured');
    }, 650);
  };

  const activeCourse =
    instructorCourses.find(c => c.id === selectedCourseId) || instructorCourses[0];

  // Auto-select the latest recorded session for this course & week when entering or switching week/course
  useEffect(() => {
    if (!activeCourse) return;
    const courseWeekRecords = attendanceRecords
      .filter(r => r.courseId === activeCourse.id && r.weekNumber === selectedWeek)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (courseWeekRecords.length > 0) {
      setSelectedSession(prev => {
        if (prev && courseWeekRecords.some(r => r.sessionType === prev)) {
          return prev;
        }
        return courseWeekRecords[0].sessionType;
      });
    } else {
      setSelectedSession(null);
    }
  }, [activeCourse?.id, selectedWeek, attendanceRecords.length]);

  // Find current attendance record for (activeCourse, selectedWeek, selectedSession)
  const existingRecord = attendanceRecords.find(
    r =>
      r.courseId === activeCourse?.id &&
      r.weekNumber === selectedWeek &&
      (selectedSession ? r.sessionType === selectedSession : false)
  );

  // Also check if instructor marked "ders yapmadım" for this course & week
  const didNotHoldRecord = attendanceRecords.find(
    r =>
      r.courseId === activeCourse?.id &&
      r.weekNumber === selectedWeek &&
      r.didNotHoldClass
  );

  const courseStudents: Student[] = (activeCourse?.studentIds || [])
    .map(sid => DB.students.find(s => s.id === sid))
    .filter((s): s is Student => Boolean(s));

  const courseStudentIds = courseStudents.map(s => s.id);

  // Difference set (fark kümesi) stored in existingRecord.absentStudentIds
  const absentStudentIds = existingRecord
    ? existingRecord.absentStudentIds.filter(id => courseStudentIds.includes(id))
    : courseStudentIds;

  const presentStudentIds = courseStudentIds.filter(id => !absentStudentIds.includes(id));
  const absentStudents = courseStudents.filter(s => absentStudentIds.includes(s.id));

  // Unlisted / temporary students reported for this specific (course, week, session)
  const sessionUnlistedReports = unlistedReports.filter(
    r =>
      r.courseId === activeCourse?.id &&
      r.weekNumber === selectedWeek &&
      r.sessionType === selectedSession
  );

  const triggerSync = async (
    session: SessionType,
    newAbsentIds: string[],
    didNotHold: boolean
  ) => {
    if (!activeCourse) return;
    setSyncState('syncing');
    const sessionSlug =
      session === '1. ders'
        ? 's1'
        : session === '2. ders'
        ? 's2'
        : session === 'ek dersler'
        ? 'sek'
        : 'sno';

    const recordId = `${activeCourse.id}_w${selectedWeek}_${sessionSlug}`;
    const record: AttendanceRecord = {
      id: recordId,
      courseId: activeCourse.id,
      instructorId: instructor.id,
      weekNumber: selectedWeek,
      sessionType: session,
      absentStudentIds: newAbsentIds,
      didNotHoldClass: didNotHold,
      updatedAt: new Date().toISOString(),
    };
    await onSaveAttendance(record);
    setSyncState('synced');
  };

  const handleSelectSession = async (session: SessionType) => {
    setSelectedSession(session);
    if (session === 'ders yapmadım') {
      await triggerSync('ders yapmadım', [], true);
    } else {
      // If there's no record yet for this session, initialize with 0 present students
      // so the initial difference set (fark kümesi) is all courseStudentIds until instructor checks who is in class.
      const alreadyExists = attendanceRecords.some(
        r =>
          r.courseId === activeCourse?.id &&
          r.weekNumber === selectedWeek &&
          r.sessionType === session
      );
      if (!alreadyExists) {
        const initialDifferenceSet = computeAbsentDifferenceSet(courseStudentIds, []);
        await triggerSync(session, initialDifferenceSet, false);
      }
    }
  };

  const handleTogglePresent = async (studentId: string) => {
    if (!selectedSession || selectedSession === 'ders yapmadım') return;
    const isCurrentlyPresent = presentStudentIds.includes(studentId);
    const nextPresentIds = isCurrentlyPresent
      ? presentStudentIds.filter(id => id !== studentId)
      : [...presentStudentIds, studentId];

    const nextAbsentDifferenceSet = computeAbsentDifferenceSet(
      courseStudentIds,
      nextPresentIds
    );
    await triggerSync(selectedSession, nextAbsentDifferenceSet, false);
  };

  const handleMarkAllPresentOrClear = async () => {
    if (!selectedSession || selectedSession === 'ders yapmadım') return;
    const allPresent = presentStudentIds.length === courseStudentIds.length;
    const nextPresentIds = allPresent ? [] : [...courseStudentIds];
    const nextAbsentDifferenceSet = computeAbsentDifferenceSet(
      courseStudentIds,
      nextPresentIds
    );
    await triggerSync(selectedSession, nextAbsentDifferenceSet, false);
  };

  const handleAddUnlistedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourse || !selectedSession || selectedSession === 'ders yapmadım') return;

    const cleanName = getCanonicalStudentName(unlistedNameInput);
    const nameParts = cleanName.split(' ').filter(Boolean);
    if (nameParts.length < 2) {
      setUnlistedFeedback({
        type: 'error',
        text: 'lütfen öğrencinin tam adını (ad ve soyad) gir.',
      });
      return;
    }

    // Check if already in this course's registered student list
    const alreadyInCourse = courseStudents.find(
      s => getCanonicalStudentName(s.name) === cleanName || normalizeTurkish(s.name) === cleanName
    );
    if (alreadyInCourse) {
      if (!presentStudentIds.includes(alreadyInCourse.id)) {
        await handleTogglePresent(alreadyInCourse.id);
      }
      setUnlistedNameInput('');
      setUnlistedFeedback({
        type: 'ok',
        text: `${alreadyInCourse.name} zaten bu derste kayıtlı, derste olarak işaretlendi.`,
      });
      setTimeout(() => setUnlistedFeedback(null), 3500);
      return;
    }

    const sessionSlug =
      selectedSession === '1. ders'
        ? 's1'
        : selectedSession === '2. ders'
        ? 's2'
        : 'sek';
    const studentSlug = slugifyTurkish(cleanName);
    const reportId = `unlisted_${activeCourse.id}_w${selectedWeek}_${sessionSlug}_${studentSlug}`;

    const report: UnlistedStudentReport = {
      id: reportId,
      studentName: cleanName,
      courseId: activeCourse.id,
      instructorId: instructor.id,
      instructorName: instructor.name,
      weekNumber: selectedWeek,
      sessionType: selectedSession,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    if (onAddUnlistedStudent) {
      await onAddUnlistedStudent(report);
    }
    setUnlistedNameInput('');
    setIsUnlistedBarOpen(false);
    setUnlistedFeedback({
      type: 'ok',
      text: `${cleanName} liste dışı öğrenci olarak eklendi.`,
    });
    setTimeout(() => setUnlistedFeedback(null), 3500);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-4 pb-24 sm:py-8">
      {/* Top contextual header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-300/80 pb-4 sm:pb-5 mb-6 sm:mb-8">
        <div>
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-1.5 py-1 text-xs text-stone-500 hover:text-stone-900 transition-colors mb-1 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>farklı bir isimle giriş yap</span>
          </button>
          <h1 className="font-serif-art text-2xl sm:text-4xl text-stone-900 leading-tight">
            merhaba {instructor.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-600 mt-1.5">
            <span>{activeCourse?.title}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">
              {selectedWeek}. hafta ({getWeekDateRangeLabel(selectedWeek)})
            </span>
            {selectedWeek === currentWeek && (
              <>
                <span aria-hidden="true">·</span>
                <span>aktif hafta</span>
              </>
            )}
          </div>
        </div>

        {/* Auto-sync status & week selector */}
        <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-200/70">
          <div className="flex items-center gap-2 text-xs text-stone-600">
            <span>
              {syncState === 'syncing'
                ? 'otomatik eşzamanlanıyor...'
                : 'otomatik eşzamanlandı'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-stone-600">
            <label htmlFor="week-select" className="text-stone-500">
              hafta:
            </label>
            <select
              id="week-select"
              value={selectedWeek}
              onChange={e => onSelectWeek(Number(e.target.value))}
              className="rounded-lg border border-stone-300 bg-white/90 px-2.5 py-1.5 text-xs font-mono-num text-stone-800 focus:border-stone-600 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: Math.max(currentWeek + 2, 12) }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>
                  {w}. hafta {w === currentWeek ? '(bu hafta)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* If instructor teaches multiple courses (e.g. Rabia Kılbaş 5/a & 5/b sosyal), allow switching */}
      {instructorCourses.length > 1 && (
        <div className="mb-6">
          <p className="text-xs text-stone-500 mb-2">sınıf seçimi:</p>
          <div className="flex flex-wrap gap-2">
            {instructorCourses.map(course => (
              <button
                key={course.id}
                type="button"
                onClick={() => {
                  setSelectedCourseId(course.id);
                  setSelectedSession(null);
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  course.id === activeCourse?.id
                    ? 'bg-stone-900 text-stone-100 shadow-sm'
                    : 'border border-stone-300 bg-white/80 text-stone-700 hover:bg-white'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>{course.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Four session options: 1. ders, 2. ders, ek dersler, ders yapmadım */}
      <div className="mb-6 sm:mb-8">
        <p className="text-sm text-stone-700 mb-3">
          bu hafta hangi dersin yoklamasını giriyorsun?
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {SESSION_OPTIONS.map(session => {
            const isSelected = selectedSession === session;
            const hasSavedRecord = attendanceRecords.some(
              r =>
                r.courseId === activeCourse?.id &&
                r.weekNumber === selectedWeek &&
                r.sessionType === session
            );

            return (
              <button
                key={session}
                type="button"
                onClick={() => handleSelectSession(session)}
                className={`flex flex-col items-start justify-between rounded-xl border p-3.5 sm:p-4 text-left transition-all active:scale-[0.98] cursor-pointer ${
                  isSelected
                    ? 'border-stone-900 bg-stone-900 text-stone-100 shadow-sm'
                    : 'border-stone-300/90 bg-white/85 text-stone-800 hover:border-stone-500 hover:bg-white'
                }`}
              >
                <span className="font-serif-art text-lg sm:text-xl font-medium leading-snug">
                  {session}
                </span>
                <span
                  className={`mt-1.5 sm:mt-2 text-[11px] ${
                    isSelected ? 'text-stone-300' : 'text-stone-500'
                  }`}
                >
                  {hasSavedRecord ? 'kayıt girildi' : 'seçmek için dokun'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Exclusive Placebo Save Button & Reassurance Effect for Melek Yılmaz Only */}
      {isMelekYilmaz && (
        <div className="mb-6 sm:mb-8">
          <div
            key={melekBurstKey}
            className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all duration-500 ${
              melekSavePhase === 'effect'
                ? 'border-amber-500/80 bg-gradient-to-r from-amber-50/95 via-emerald-50/95 to-amber-50/95 shadow-lg scale-[1.01]'
                : melekSavePhase === 'reassured'
                ? 'border-emerald-500/70 bg-gradient-to-r from-emerald-50/90 via-[#f8f5ec] to-emerald-50/90 shadow-sm'
                : 'border-stone-300/90 bg-white/90'
            }`}
          >
            {/* Shimmer sweep effect when clicked */}
            {melekSavePhase !== 'idle' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-amber-200/60 to-transparent animate-melek-shimmer"
              />
            )}

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-amber-300">
                  {melekSavePhase !== 'idle' && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-xl border-2 border-amber-400 animate-melek-ring"
                    />
                  )}
                  <Sparkles
                    className={`h-5 w-5 transition-transform duration-500 ${
                      melekSavePhase === 'effect'
                        ? 'scale-125 rotate-45 text-amber-300'
                        : melekSavePhase === 'reassured'
                        ? 'text-emerald-300 animate-melek-pop'
                        : 'text-stone-200'
                    }`}
                  />
                </div>
                <div>
                  {melekSavePhase === 'effect' ? (
                    <p className="font-serif-art text-lg sm:text-xl font-medium text-stone-900 animate-pulse">
                      ✨ yoklaman mühürleniyor... ✨
                    </p>
                  ) : melekSavePhase === 'reassured' ? (
                    <p
                      data-testid="melek-reassurance-text"
                      className="font-serif-art text-lg sm:text-2xl font-medium text-emerald-950 animate-melek-text leading-snug"
                    >
                      aklın sakın orada kalmasın melek, yoklaman kayıt altında, iyi dersler
                    </p>
                  ) : (
                    <div>
                      <p className="font-serif-art text-lg sm:text-xl font-medium text-stone-900">
                        için rahat etsin diye özel kaydet butonu
                      </p>
                      <p className="text-xs text-stone-500">
                        yoklaman zaten anlık kaydediliyor ama emin olmak istersen dokunabilirsin
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative self-start sm:self-auto shrink-0">
                {melekSavePhase === 'effect' && (
                  <>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-xl border-2 border-emerald-500 animate-melek-ring"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-2 -left-2 text-sm animate-melek-pop"
                    >
                      ✨
                    </span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-2 -right-2 text-sm animate-melek-pop"
                    >
                      🌟
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleMelekPlaceboSave}
                  className={`relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-medium transition-all active:scale-95 cursor-pointer ${
                    melekSavePhase === 'effect'
                      ? 'bg-emerald-700 text-white shadow-md scale-105'
                      : melekSavePhase === 'reassured'
                      ? 'bg-emerald-900 text-emerald-50 hover:bg-emerald-800 shadow-sm'
                      : 'bg-stone-900 text-stone-100 hover:bg-stone-800 shadow-sm'
                  }`}
                >
                  {melekSavePhase === 'reassured' ? (
                    <Check className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-amber-300" />
                  )}
                  <span>kaydet</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Content Area */}
      {selectedSession === 'ders yapmadım' || (didNotHoldRecord && !selectedSession) ? (
        <div className="rounded-2xl border border-stone-300/80 bg-white/85 p-6 sm:p-8 text-center">
          <p className="font-serif-art text-xl sm:text-2xl text-stone-900 mb-2">
            bu hafta için "ders yapmadım" olarak kaydedildi.
          </p>
          <p className="text-xs text-stone-600 mb-4">
            değişiklik otomatik olarak sisteme işlendi. sayfayı doğrudan kapatabilir veya yukarıdan başka bir ders seçebilirsin.
          </p>
          {onDeleteCourseSession && activeCourse && (
            <button
              type="button"
              onClick={async () => {
                await onDeleteCourseSession(activeCourse.id, selectedWeek, 'ders yapmadım');
                setSelectedSession(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-600 hover:border-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>bu kaydı sıfırla (hiç girilmemiş yap)</span>
            </button>
          )}
        </div>
      ) : selectedSession ? (
        <div>
          <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h2 className="font-serif-art text-2xl sm:text-3xl text-stone-900">
                derse gelmeyen eşekler 🫏
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                kimler derste? onların kutucuğuna dokun
              </p>
            </div>
            {onDeleteCourseSession && activeCourse && (
              <button
                type="button"
                onClick={async () => {
                  await onDeleteCourseSession(activeCourse.id, selectedWeek, selectedSession);
                  setSelectedSession(null);
                }}
                className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-stone-300 bg-white/80 px-3 py-1.5 text-xs text-stone-600 hover:border-stone-500 hover:text-stone-900 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>bu dersin yoklamasını sıfırla</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
            {/* Left Column: Registered Students with Checkboxes (Checking = Present) */}
            <div className="lg:col-span-7 rounded-2xl border border-stone-300/80 bg-white/90 p-3.5 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3 mb-2">
                <span className="text-xs font-medium text-stone-600">
                  derse kayıtlı öğrenciler ({courseStudents.length})
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleMarkAllPresentOrClear}
                    className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900 underline underline-offset-2 cursor-pointer"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>
                      {presentStudentIds.length === courseStudents.length
                        ? 'tüm işaretleri kaldır'
                        : 'tümünü derste işaretle'}
                    </span>
                  </button>
                  <span className="text-xs text-stone-500 font-mono-num">
                    gelen: {presentStudentIds.length} · gelmeyen: {absentStudents.length}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-stone-200/70">
                {courseStudents.map((student, index) => {
                  const isPresent = presentStudentIds.includes(student.id);
                  return (
                    <label
                      key={student.id}
                      className={`flex items-center justify-between gap-3 py-3 sm:py-2.5 px-2.5 rounded-xl transition-colors cursor-pointer select-none ${
                        isPresent
                          ? 'bg-emerald-50/70 text-stone-900'
                          : 'hover:bg-stone-100/70 active:bg-stone-200/50 text-stone-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isPresent}
                          onChange={() => handleTogglePresent(student.id)}
                          aria-label={`${student.name} derste olarak işaretle`}
                          className="h-5 w-5 sm:h-4 sm:w-4 shrink-0 rounded border-stone-400 text-stone-900 focus:ring-stone-700 cursor-pointer"
                        />
                        <span className="font-mono-num text-xs text-stone-400 w-5 shrink-0">
                          {index + 1}.
                        </span>
                        <span className={`text-sm truncate ${isPresent ? 'font-medium text-stone-900' : 'text-stone-600'}`}>
                          {student.name}
                        </span>
                      </div>

                      <span
                        className={`text-xs whitespace-nowrap shrink-0 ${
                          isPresent ? 'text-emerald-800 font-medium' : 'text-stone-400'
                        }`}
                      >
                        {isPresent ? 'derste' : 'gelmedi 🫏'}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Compact Bar: Listede Olmayan Öğrenci Ekle (between attendance list and absent list) */}
              <div className="mt-3 pt-2.5 border-t border-stone-200/80">
                <div className="rounded-xl border border-stone-300/80 bg-[#faf8f4]/90 px-3 py-2">
                  {!isUnlistedBarOpen ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUnlistedBarOpen(true);
                          setUnlistedFeedback(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-2.5 py-1 text-[11px] font-medium text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
                      >
                        <UserPlus className="h-3 w-3" />
                        <span>listede olmayan öğrenci ekle</span>
                      </button>
                      <span className="text-[11px] text-stone-500">
                        lütfen öğrencinin tam adını gir
                      </span>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleAddUnlistedSubmit}
                      className="flex flex-col sm:flex-row sm:items-center gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          autoComplete="off"
                          value={unlistedNameInput}
                          onChange={e => {
                            setUnlistedNameInput(e.target.value);
                            if (unlistedFeedback) setUnlistedFeedback(null);
                          }}
                          placeholder="lütfen öğrencinin tam adını gir (ad soyad)..."
                          className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-800 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
                        <span className="text-[10px] text-stone-500 sm:hidden">
                          lütfen öğrencinin tam adını gir
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-medium text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
                          >
                            <UserPlus className="h-3 w-3" />
                            <span>ekle</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsUnlistedBarOpen(false);
                              setUnlistedNameInput('');
                              setUnlistedFeedback(null);
                            }}
                            aria-label="kapat"
                            className="inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white p-1.5 text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {unlistedFeedback && (
                    <p
                      className={`mt-1.5 text-[11px] flex items-center gap-1 ${
                        unlistedFeedback.type === 'error' ? 'text-rose-700' : 'text-emerald-800'
                      }`}
                    >
                      {unlistedFeedback.type === 'ok' && <Check className="h-3 w-3 shrink-0" />}
                      <span>{unlistedFeedback.text}</span>
                    </p>
                  )}

                  {sessionUnlistedReports.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-stone-200/70 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-stone-500">bu derste eklenen liste dışı:</span>
                      {sessionUnlistedReports.map(rep => (
                        <span
                          key={rep.id}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/90 px-2 py-0.5 text-[11px] text-emerald-900"
                        >
                          <span className="font-medium">{rep.studentName}</span>
                          <span className="text-[10px] text-emerald-700">
                            ({rep.status === 'temporary' ? 'geçici' : rep.status === 'enrolled' ? 'kaydedildi' : 'derste'})
                          </span>
                          {onRemoveUnlistedStudent && rep.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => onRemoveUnlistedStudent(rep.id)}
                              title="kaldır"
                              className="ml-0.5 text-stone-400 hover:text-rose-700 cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Absent Students List (Difference Set - Click to mark present) */}
            <div
              id="absent-list-section"
              className="lg:col-span-5 rounded-2xl border border-stone-300/80 bg-[#f3efe6]/95 p-4 sm:p-5 lg:sticky lg:top-6"
            >
              <div className="flex items-center justify-between border-b border-stone-300/70 pb-3 mb-3">
                <span className="text-xs font-medium text-stone-800">
                  gelmeyenler listesi · fark kümesi ({absentStudents.length})
                </span>
                <span className="text-[11px] text-stone-500">
                  derste işaretlemek için dokun
                </span>
              </div>

              {absentStudents.length === 0 ? (
                <div className="py-8 sm:py-10 text-center">
                  <Sparkles className="h-5 w-5 text-stone-400 mx-auto mb-2" />
                  <p className="text-xs text-stone-500">
                    harika, sınıftaki herkes derste olarak işaretlendi!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {absentStudents.map(student => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => handleTogglePresent(student.id)}
                      aria-label={`${student.name} isimli öğrenciyi derste olarak işaretle`}
                      className="w-full flex items-center justify-between gap-3 rounded-xl border border-stone-300 bg-white px-3.5 py-3 sm:py-2.5 text-left text-sm text-stone-800 hover:border-stone-500 hover:bg-stone-50 active:scale-[0.99] transition-all cursor-pointer group"
                    >
                      <span className="font-medium truncate">
                        {student.name} <span className="ml-1">🫏</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-stone-500 group-hover:text-stone-900 whitespace-nowrap shrink-0">
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>geri getir</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 sm:p-10 text-center">
          <p className="text-sm text-stone-600">
            yoklama listesini açmak için yukarıdaki dört seçenekten birini (1. ders, 2. ders, ek dersler veya ders yapmadım) seç.
          </p>
        </div>
      )}
    </div>
  );
};
