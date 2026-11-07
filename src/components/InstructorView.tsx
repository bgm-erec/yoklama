import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCcw,
  Sparkles,
  ArrowLeft,
  BookOpen,
  CheckSquare,
  UserPlus,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';
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
  buildAttendanceDocId,
  computeAbsentDifferenceSet,
  ExitAttendanceChoice,
  getWeekDateRangeLabel,
  resolveExitPromptDecision,
  shouldPromptEmptyExit,
} from '../utils/enigmaLogic';

export interface AttendanceConflictNotice {
  docId: string;
  courseId: string;
  weekNumber: number;
  sessionType: SessionType;
  serverRecord: AttendanceRecord;
  localAttemptRecord: AttendanceRecord;
}

interface InstructorViewProps {
  instructor: Instructor;
  currentWeek: number;
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
  onActiveCourseChange?: (courseId: string) => void;
  attendanceRecords: AttendanceRecord[];
  unlistedReports?: UnlistedStudentReport[];
  onSaveAttendance: (
    record: AttendanceRecord,
    options?: {
      debounced?: boolean;
      previousRecord?: AttendanceRecord | null;
      forceOverwriteVersion?: number;
    }
  ) => Promise<void>;
  onAddUnlistedStudent?: (report: UnlistedStudentReport) => Promise<void>;
  onRemoveUnlistedStudent?: (reportId: string) => Promise<void>;
  onDeleteCourseSession?: (
    courseId: string,
    weekNumber: number,
    sessionType: string
  ) => Promise<void>;
  onBackToLogin: () => void;
  onGuardedNavigate: (action: () => void) => void;
  conflictNotice?: AttendanceConflictNotice | null;
  onResolveConflict?: (resolution: 'accept_server' | 'force_local') => void;
  exitRequestCounter?: number;
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
  onActiveCourseChange,
  attendanceRecords,
  unlistedReports = [],
  onSaveAttendance,
  onAddUnlistedStudent,
  onRemoveUnlistedStudent,
  onDeleteCourseSession,
  onBackToLogin,
  onGuardedNavigate,
  conflictNotice,
  onResolveConflict,
  exitRequestCounter = 0,
}) => {
  const instructorCourses: Course[] = instructor.courseIds
    .map(id => DB.courses.find(c => c.id === id))
    .filter((c): c is Course => Boolean(c));

  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    instructorCourses[0]?.id || ''
  );
  const [selectedSession, setSelectedSession] = useState<SessionType | null>(null);

  // Exit prompt modal state when instructor leaves without taking attendance / clicking any student
  const [pendingExitAction, setPendingExitAction] = useState<(() => void) | null>(null);
  const [confirmedZeroSessions, setConfirmedZeroSessions] = useState<string[]>([]);

  // Compact unlisted student bar states
  const [isUnlistedBarOpen, setIsUnlistedBarOpen] = useState(false);
  const [unlistedNameInput, setUnlistedNameInput] = useState('');
  const [unlistedFeedback, setUnlistedFeedback] = useState<{
    type: 'error' | 'ok';
    text: string;
  } | null>(null);

  const activeCourse =
    instructorCourses.find(c => c.id === selectedCourseId) || instructorCourses[0];

  useEffect(() => {
    if (activeCourse?.id && onActiveCourseChange) {
      onActiveCourseChange(activeCourse.id);
    }
  }, [activeCourse?.id, onActiveCourseChange]);

  const activeAttendanceRecords = attendanceRecords.filter(r => !r.deletedAt);
  const activeUnlistedReports = unlistedReports.filter(r => !r.deletedAt);

  const courseWeekRecords = activeCourse
    ? activeAttendanceRecords
        .filter(r => r.courseId === activeCourse.id && r.weekNumber === selectedWeek)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];

  const autoSelectedKeyRef = useRef<string>('');

  // Auto-select the latest recorded session for this course & week when entering or switching week/course
  useEffect(() => {
    if (!activeCourse) return;
    const contextKey = `${activeCourse.id}_w${selectedWeek}`;
    if (courseWeekRecords.length > 0) {
      autoSelectedKeyRef.current = contextKey;
      setSelectedSession(prev => {
        if (prev && courseWeekRecords.some(r => r.sessionType === prev)) {
          return prev;
        }
        return courseWeekRecords[0].sessionType;
      });
    } else {
      autoSelectedKeyRef.current = '';
      setSelectedSession(null);
    }
  }, [activeCourse?.id, selectedWeek]);

  // If attendance records arrive asynchronously from Firestore while no session is selected yet, select latest once
  useEffect(() => {
    if (!activeCourse) return;
    const contextKey = `${activeCourse.id}_w${selectedWeek}`;
    if (
      courseWeekRecords.length > 0 &&
      selectedSession === null &&
      autoSelectedKeyRef.current !== contextKey
    ) {
      autoSelectedKeyRef.current = contextKey;
      setSelectedSession(courseWeekRecords[0].sessionType);
    }
  }, [activeCourse?.id, selectedWeek, courseWeekRecords.length, selectedSession]);

  // Find current attendance record for (activeCourse, selectedWeek, selectedSession)
  const existingRecord = activeAttendanceRecords.find(
    r =>
      r.courseId === activeCourse?.id &&
      r.weekNumber === selectedWeek &&
      (selectedSession ? r.sessionType === selectedSession : false)
  );

  // Also check if instructor marked "ders yapmadım" for this course & week
  const didNotHoldRecord = activeAttendanceRecords.find(
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
  const sessionUnlistedReports = activeUnlistedReports.filter(
    r =>
      r.courseId === activeCourse?.id &&
      r.weekNumber === selectedWeek &&
      r.sessionType === selectedSession
  );

  const currentSessionConfirmKey =
    activeCourse && selectedSession
      ? `${activeCourse.id}_w${selectedWeek}_${selectedSession}`
      : '';

  const hasExplicitZeroConfirmation = Boolean(
    currentSessionConfirmKey && confirmedZeroSessions.includes(currentSessionConfirmKey)
  );

  const triggerSync = async (
    session: SessionType,
    newAbsentIds: string[],
    didNotHold: boolean,
    debounced: boolean
  ) => {
    if (!activeCourse) return;
    const recordId =
      existingRecord?.id ||
      buildAttendanceDocId(activeCourse.id, selectedWeek, session);

    const record: AttendanceRecord = {
      id: recordId,
      courseId: activeCourse.id,
      instructorId: instructor.id,
      weekNumber: selectedWeek,
      sessionType: session,
      absentStudentIds: newAbsentIds,
      didNotHoldClass: didNotHold,
      updatedAt: new Date().toISOString(),
      version: existingRecord?.version ?? 0,
    };

    await onSaveAttendance(record, {
      debounced,
      previousRecord: existingRecord || null,
    });
  };

  const attemptNavigationOrExit = (action: () => void) => {
    const needsPrompt = shouldPromptEmptyExit({
      selectedSession,
      presentStudentCount: presentStudentIds.length,
      sessionUnlistedCount: sessionUnlistedReports.length,
      courseWeekRecordsCount: courseWeekRecords.length,
      hasExplicitZeroConfirmation,
    });

    if (needsPrompt) {
      setPendingExitAction(() => () => onGuardedNavigate(action));
    } else {
      onGuardedNavigate(action);
    }
  };

  // Handle top-left "bach" logo click from App header
  useEffect(() => {
    if (exitRequestCounter > 0) {
      attemptNavigationOrExit(onBackToLogin);
    }
  }, [exitRequestCounter]);

  const handleExitDecision = async (choice: ExitAttendanceChoice) => {
    const decision = resolveExitPromptDecision(choice, {
      selectedSession,
      courseStudentIds,
    });

    if (decision.action === 'save') {
      if (choice === 'kimse_gelmedi' && activeCourse) {
        const key = `${activeCourse.id}_w${selectedWeek}_${decision.sessionType}`;
        setConfirmedZeroSessions(prev => (prev.includes(key) ? prev : [...prev, key]));
      }
      await triggerSync(
        decision.sessionType,
        decision.absentStudentIds,
        decision.didNotHoldClass,
        false
      );
    } else if (decision.action === 'discard') {
      if (
        activeCourse &&
        decision.sessionType &&
        onDeleteCourseSession &&
        activeAttendanceRecords.some(
          r =>
            r.courseId === activeCourse.id &&
            r.weekNumber === selectedWeek &&
            r.sessionType === decision.sessionType
        )
      ) {
        await onDeleteCourseSession(
          activeCourse.id,
          selectedWeek,
          decision.sessionType
        );
      }
    }

    const nextAction = pendingExitAction;
    setPendingExitAction(null);
    if (nextAction) {
      nextAction();
    }
  };

  const handleSelectSession = async (session: SessionType) => {
    if (session === 'ders yapmadım') {
      if (
        activeCourse &&
        selectedSession &&
        selectedSession !== 'ders yapmadım' &&
        presentStudentIds.length === 0 &&
        sessionUnlistedReports.length === 0 &&
        !hasExplicitZeroConfirmation &&
        onDeleteCourseSession &&
        existingRecord
      ) {
        await onDeleteCourseSession(activeCourse.id, selectedWeek, selectedSession);
      }
      setSelectedSession('ders yapmadım');
      await triggerSync('ders yapmadım', [], true, false);
      return;
    }

    if (selectedSession === session) {
      return;
    }

    if (
      selectedSession &&
      selectedSession !== 'ders yapmadım' &&
      shouldPromptEmptyExit({
        selectedSession,
        presentStudentCount: presentStudentIds.length,
        sessionUnlistedCount: sessionUnlistedReports.length,
        courseWeekRecordsCount: courseWeekRecords.length,
        hasExplicitZeroConfirmation,
      })
    ) {
      setPendingExitAction(() => () =>
        onGuardedNavigate(() => setSelectedSession(session))
      );
      return;
    }

    onGuardedNavigate(() => setSelectedSession(session));
  };

  const handleTogglePresent = (studentId: string) => {
    if (!selectedSession || selectedSession === 'ders yapmadım') return;
    const isCurrentlyPresent = presentStudentIds.includes(studentId);
    const nextPresentIds = isCurrentlyPresent
      ? presentStudentIds.filter(id => id !== studentId)
      : [...presentStudentIds, studentId];

    const nextAbsentDifferenceSet = computeAbsentDifferenceSet(
      courseStudentIds,
      nextPresentIds
    );
    void triggerSync(selectedSession, nextAbsentDifferenceSet, false, true);
  };

  const handleMarkAllPresentOrClear = () => {
    if (!selectedSession || selectedSession === 'ders yapmadım') return;
    const allPresent = presentStudentIds.length === courseStudentIds.length;
    const nextPresentIds = allPresent ? [] : [...courseStudentIds];
    const nextAbsentDifferenceSet = computeAbsentDifferenceSet(
      courseStudentIds,
      nextPresentIds
    );
    void triggerSync(selectedSession, nextAbsentDifferenceSet, false, true);
  };

  const handleAddUnlistedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourse || !selectedSession || selectedSession === 'ders yapmadım')
      return;

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
      s =>
        getCanonicalStudentName(s.name) === cleanName ||
        normalizeTurkish(s.name) === cleanName
    );
    if (alreadyInCourse) {
      if (!presentStudentIds.includes(alreadyInCourse.id)) {
        handleTogglePresent(alreadyInCourse.id);
      }
      setUnlistedNameInput('');
      setUnlistedFeedback({
        type: 'ok',
        text: `${alreadyInCourse.name} zaten bu derste kayıtlı, derste olarak işaretlendi.`,
      });
      setTimeout(() => setUnlistedFeedback(null), 3500);
      return;
    }

    const sessionSlug = slugifyTurkish(selectedSession);
    const studentSlug = slugifyTurkish(cleanName);
    const reportId = `unlisted_${slugifyTurkish(
      activeCourse.id
    )}_w${selectedWeek}_${sessionSlug}_${studentSlug}`;

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
            onClick={() => attemptNavigationOrExit(onBackToLogin)}
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

        {/* Week selector */}
        <div className="flex items-center justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-200/70">
          <div className="flex items-center gap-1.5 text-xs text-stone-600">
            <label htmlFor="week-select" className="text-stone-500">
              hafta:
            </label>
            <select
              id="week-select"
              value={selectedWeek}
              onChange={e => {
                const nextWeek = Number(e.target.value);
                if (nextWeek === selectedWeek) return;
                attemptNavigationOrExit(() => onSelectWeek(nextWeek));
              }}
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

      {/* Concurrent Edit Conflict Banner */}
      {conflictNotice && onResolveConflict && (
        <div
          role="alert"
          data-testid="conflict-warning-banner"
          className="mb-6 rounded-2xl border border-amber-400 bg-amber-50/95 p-4 sm:p-5 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-800 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-serif-art text-lg font-medium text-amber-950">
                  eşzamanlı düzenleme çakışması tespit edildi
                </h2>
                <p className="text-xs text-amber-900 mt-0.5 leading-relaxed">
                  bu dersin ({conflictNotice.sessionType}) yoklaması aynı anda başka bir cihaz veya sekmeden güncellendi (sunucu sürümü: v{conflictNotice.serverRecord.version || 1}). hangisini korumak istersin?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onResolveConflict('accept_server')}
                className="rounded-xl border border-amber-400 bg-white px-3.5 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                diğer cihazdaki durumu yükle
              </button>
              <button
                type="button"
                onClick={() => onResolveConflict('force_local')}
                className="rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-medium text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
              >
                benim seçimlerimi yaz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* If instructor teaches multiple courses, allow switching */}
      {instructorCourses.length > 1 && (
        <div className="mb-6">
          <p className="text-xs text-stone-500 mb-2">sınıf seçimi:</p>
          <div className="flex flex-wrap gap-2">
            {instructorCourses.map(course => (
              <button
                key={course.id}
                type="button"
                onClick={() => {
                  if (course.id === activeCourse?.id) return;
                  attemptNavigationOrExit(() => {
                    setSelectedCourseId(course.id);
                    setSelectedSession(null);
                  });
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
            const hasSavedRecord = activeAttendanceRecords.some(
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

      {/* Attendance Content Area */}
      {selectedSession === 'ders yapmadım' || (didNotHoldRecord && !selectedSession) ? (
        <div className="rounded-2xl border border-stone-300/80 bg-white/85 p-6 sm:p-8 text-center">
          <p className="font-serif-art text-xl sm:text-2xl text-stone-900 mb-2">
            bu hafta için "ders yapmadım" olarak kaydedildi.
          </p>
          <p className="text-xs text-stone-600 mb-4">
            değişiklik otomatik olarak sisteme işlendi. yukarıdan başka bir ders seçebilir veya çıkabilirsin.
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
                derse gelmeyen öğrenciler
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                kimler derste? onların kutucuğuna dokun (otomatik kaydedilir)
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
                        <span
                          className={`text-sm truncate ${
                            isPresent ? 'font-medium text-stone-900' : 'text-stone-600'
                          }`}
                        >
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

              {/* Compact Bar: Listede Olmayan Öğrenci Ekle */}
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
                        unlistedFeedback.type === 'error'
                          ? 'text-rose-700'
                          : 'text-emerald-800'
                      }`}
                    >
                      {unlistedFeedback.type === 'ok' && (
                        <Check className="h-3 w-3 shrink-0" />
                      )}
                      <span>{unlistedFeedback.text}</span>
                    </p>
                  )}

                  {sessionUnlistedReports.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-stone-200/70 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-stone-500">
                        bu derste eklenen liste dışı:
                      </span>
                      {sessionUnlistedReports.map(rep => (
                        <span
                          key={rep.id}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/90 px-2 py-0.5 text-[11px] text-emerald-900"
                        >
                          <span className="font-medium">{rep.studentName}</span>
                          <span className="text-[10px] text-emerald-700">
                            (
                            {rep.status === 'temporary'
                              ? 'geçici'
                              : rep.status === 'enrolled'
                              ? 'kaydedildi'
                              : 'derste'}
                            )
                          </span>
                          {onRemoveUnlistedStudent && rep.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => onRemoveUnlistedStudent(rep.id)}
                              title="kaldır"
                              aria-label={`${rep.studentName} liste dışı kaydını kaldır`}
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

      {/* Exit / Uninteracted Attendance Prompt Modal: "durum nedir?" */}
      {pendingExitAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-status-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 backdrop-blur-[2px] p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-300 bg-[#faf8f4] p-6 sm:p-7 shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2
                  id="exit-status-dialog-title"
                  className="font-serif-art text-2xl sm:text-3xl text-stone-900 leading-tight"
                >
                  durum nedir?
                </h2>
                <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                  {activeCourse?.title} · {selectedWeek}. hafta
                  {selectedSession && selectedSession !== 'ders yapmadım'
                    ? ` · ${selectedSession}`
                    : ''}{' '}
                  için hiçbir öğrenciye tıklanmadı. verileri siteye nasıl işleyelim?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingExitAction(null)}
                aria-label="pencereyi kapat ve yoklamaya dön"
                className="rounded-lg border border-stone-300 bg-white p-1.5 text-stone-500 hover:text-stone-900 transition-colors cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => handleExitDecision('herkes_derste')}
                className="w-full flex flex-col items-start rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-left hover:border-emerald-700 hover:bg-emerald-50/60 active:scale-[0.99] transition-all cursor-pointer group"
              >
                <span className="font-serif-art text-xl font-medium text-stone-900 group-hover:text-emerald-950">
                  herkes derste
                </span>
                <span className="text-xs text-stone-500 mt-0.5">
                  sınıftaki tüm öğrencileri ({courseStudents.length} öğrenci) derste var olarak kaydet
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExitDecision('kimse_gelmedi')}
                className="w-full flex flex-col items-start rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-left hover:border-rose-700 hover:bg-rose-50/50 active:scale-[0.99] transition-all cursor-pointer group"
              >
                <span className="font-serif-art text-xl font-medium text-stone-900 group-hover:text-rose-950">
                  kimse derse gelmedi
                </span>
                <span className="text-xs text-stone-500 mt-0.5">
                  bu derse hiçbir öğrencinin katılmadığını onayla ve kaydet
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExitDecision('yoklama_almiyorum')}
                className="w-full flex flex-col items-start rounded-xl border border-stone-900 bg-stone-900 px-4 py-3.5 text-left text-stone-100 hover:bg-stone-800 active:scale-[0.99] transition-all cursor-pointer"
              >
                <span className="font-serif-art text-xl font-medium">
                  şu anda yoklama almıyorum
                </span>
                <span className="text-xs text-stone-300 mt-0.5">
                  sadece listeyi inceledim · yoklama alınmadı olarak bırak ve çık
                </span>
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-200/80 text-center">
              <button
                type="button"
                onClick={() => setPendingExitAction(null)}
                className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2 cursor-pointer"
              >
                vazgeç, yoklama listesine geri dön
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
