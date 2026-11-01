/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  AttendanceRecord,
  BASE_DB,
  FeedbackItem,
  getCanonicalStudentName,
  Instructor,
  InstructorAssignmentRecord,
  Modality,
  normalizeTurkish,
  RemovedStudentRecord,
  slugifyTurkish,
  Student,
  syncDatabaseMutations,
  UnlistedStudentReport,
} from './data/database';
import {
  createNewStudentRecord,
  findMatchingStudentByFullName,
  getCurrentWeekNumber,
  getWeekDateRangeLabel,
  getZeroPresentAttendanceRecords,
  resolveIdentityInput,
} from './utils/enigmaLogic';
import { BogaziciIllustration } from './components/BogaziciIllustration';
import { FeedbackWidget } from './components/FeedbackWidget';
import { InstructorView } from './components/InstructorView';
import { AdminSibeliusView } from './components/AdminSibeliusView';
import { AmadeusFeedbackView } from './components/AmadeusFeedbackView';

type AppRoute =
  | { view: 'login' }
  | { view: 'instructor'; instructor: Instructor }
  | { view: 'sibelius' }
  | { view: 'amadeus' };

export default function App() {
  const [identityInput, setIdentityInput] = useState('');
  const [promptWarning, setPromptWarning] = useState<string | null>(null);
  const [route, setRoute] = useState<AppRoute>({ view: 'login' });
  const [instructorExitCounter, setInstructorExitCounter] = useState(0);

  const currentWeek = getCurrentWeekNumber();
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);

  // Real-time synced lists from Firestore
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [customStudents, setCustomStudents] = useState<Student[]>([]);
  const [removedStudentIds, setRemovedStudentIds] = useState<string[]>([]);
  const [instructorAssignments, setInstructorAssignments] = useState<InstructorAssignmentRecord[]>([]);
  const [unlistedReports, setUnlistedReports] = useState<UnlistedStudentReport[]>([]);

  // Synchronize effective students, courses, and instructors whenever mutations change
  const effectiveDb = useMemo(
    () => syncDatabaseMutations(customStudents, removedStudentIds, instructorAssignments),
    [customStudents, removedStudentIds, instructorAssignments]
  );

  // Keep URL hash/path synced with "bach"
  useEffect(() => {
    if (!window.location.hash || window.location.hash.startsWith('#enigma')) {
      window.history.replaceState(null, 'bach', '#bach');
    }
  }, []);

  // Real-time Firestore listener for attendance
  useEffect(() => {
    const attendanceQuery = query(
      collection(db, 'attendance'),
      where('weekNumber', '>=', 1),
      where('weekNumber', '<=', 52)
    );
    const unsubscribe = onSnapshot(
      attendanceQuery,
      snapshot => {
        const remoteRecords: AttendanceRecord[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as AttendanceRecord;
          remoteRecords.push({ ...data, id: docSnap.id });
        });
        setAttendanceRecords(remoteRecords);
      },
      error => {
        try {
          handleFirestoreError(error, OperationType.GET, 'attendance');
        } catch {
          // Handled
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time Firestore listener for anonymous feedback
  useEffect(() => {
    const feedbackQuery = query(
      collection(db, 'feedback'),
      where('createdAt', '>=', '2020-01-01')
    );
    const unsubscribe = onSnapshot(
      feedbackQuery,
      snapshot => {
        const items: FeedbackItem[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as FeedbackItem;
          items.push({ ...data, id: docSnap.id });
        });
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setFeedbacks(items);
      },
      error => {
        try {
          handleFirestoreError(error, OperationType.GET, 'feedback');
        } catch {
          // Handled
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time Firestore listener for custom added students
  useEffect(() => {
    const customStudentsQuery = query(
      collection(db, 'custom_students'),
      where('addedAt', '>=', '2020-01-01')
    );
    const unsubscribe = onSnapshot(
      customStudentsQuery,
      snapshot => {
        const items: Student[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as Student;
          items.push(data);
        });
        setCustomStudents(items);
      },
      error => {
        try {
          handleFirestoreError(error, OperationType.GET, 'custom_students');
        } catch {
          // Handled
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time Firestore listener for removed students
  useEffect(() => {
    const removedStudentsQuery = query(
      collection(db, 'removed_students'),
      where('removedAt', '>=', '2020-01-01')
    );
    const unsubscribe = onSnapshot(
      removedStudentsQuery,
      snapshot => {
        const ids: string[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as RemovedStudentRecord;
          ids.push(data.studentId || docSnap.id);
        });
        setRemovedStudentIds(ids);
      },
      error => {
        try {
          handleFirestoreError(error, OperationType.GET, 'removed_students');
        } catch {
          // Handled
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time Firestore listener for instructor assignments
  useEffect(() => {
    const assignmentsQuery = query(
      collection(db, 'instructor_assignments'),
      where('updatedAt', '>=', '2020-01-01')
    );
    const unsubscribe = onSnapshot(
      assignmentsQuery,
      snapshot => {
        const items: InstructorAssignmentRecord[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as InstructorAssignmentRecord;
          items.push(data);
        });
        setInstructorAssignments(items);
      },
      error => {
        try {
          handleFirestoreError(error, OperationType.GET, 'instructor_assignments');
        } catch {
          // Handled
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time Firestore listener for unlisted student reports
  useEffect(() => {
    const unlistedQuery = query(
      collection(db, 'unlisted_students'),
      where('createdAt', '>=', '2020-01-01')
    );
    const unsubscribe = onSnapshot(
      unlistedQuery,
      snapshot => {
        const items: UnlistedStudentReport[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as UnlistedStudentReport;
          items.push({ ...data, id: docSnap.id });
        });
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setUnlistedReports(items);
      },
      error => {
        try {
          handleFirestoreError(error, OperationType.GET, 'unlisted_students');
        } catch {
          // Handled
        }
      }
    );

    return () => unsubscribe();
  }, []);

  const handleAddStudent = async (student: Student) => {
    setRemovedStudentIds(prev => prev.filter(id => id !== student.id));
    setCustomStudents(prev => {
      const withoutOld = prev.filter(s => s.id !== student.id);
      return [...withoutOld, student];
    });

    try {
      await deleteDoc(doc(db, 'removed_students', student.id));
    } catch {
      // Ignore if not in removed_students
    }

    try {
      await setDoc(doc(db, 'custom_students', student.id), {
        id: student.id,
        name: student.name,
        grade: student.grade,
        modality: student.modality,
        enrolledCourseIds: student.enrolledCourseIds,
        addedAtWeek: student.addedAtWeek || 1,
        addedAt: student.addedAt || '2026-10-19T00:00:00.000Z',
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `custom_students/${student.id}`);
      } catch {
        // Handled
      }
    }
  };

  const handleRemoveStudent = async (student: Student) => {
    const isBaseStudent = BASE_DB.students.some(s => s.id === student.id);
    if (isBaseStudent) {
      setRemovedStudentIds(prev => (prev.includes(student.id) ? prev : [...prev, student.id]));
    }
    setCustomStudents(prev => prev.filter(s => s.id !== student.id));

    try {
      await deleteDoc(doc(db, 'custom_students', student.id));
    } catch {
      // Ignore if not in custom_students
    }

    if (isBaseStudent) {
      try {
        await setDoc(doc(db, 'removed_students', student.id), {
          studentId: student.id,
          name: student.name,
          removedAt: new Date().toISOString(),
        });
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.WRITE, `removed_students/${student.id}`);
        } catch {
          // Handled
        }
      }
    }
  };

  const handleAssignInstructor = async (
    courseId: string,
    rawInstructorName: string,
    newCourseMeta?: { modality: Modality; gradeClass: string; subject: string }
  ) => {
    const cleanName = normalizeTurkish(rawInstructorName);
    const updatedAt = new Date().toISOString();
    const record: InstructorAssignmentRecord = {
      courseId,
      instructorName: cleanName,
      updatedAt,
      ...(newCourseMeta
        ? {
            modality: newCourseMeta.modality,
            gradeClass: normalizeTurkish(newCourseMeta.gradeClass),
            subject: normalizeTurkish(newCourseMeta.subject),
          }
        : {}),
    };

    setInstructorAssignments(prev => {
      const withoutOld = prev.filter(a => a.courseId !== courseId);
      return [...withoutOld, record];
    });

    const baseCourse = BASE_DB.courses.find(c => c.id === courseId);
    if (baseCourse && baseCourse.instructorName === cleanName) {
      try {
        await deleteDoc(doc(db, 'instructor_assignments', courseId));
      } catch {
        // Ignore if not present
      }
      return;
    }

    try {
      await setDoc(doc(db, 'instructor_assignments', courseId), record);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `instructor_assignments/${courseId}`);
      } catch {
        // Handled
      }
    }
  };

  const handleSaveAttendance = async (record: AttendanceRecord) => {
    // Optimistically update local state immediately
    setAttendanceRecords(prev => {
      const filtered = prev.filter(
        r =>
          !(
            r.courseId === record.courseId &&
            r.weekNumber === record.weekNumber &&
            r.sessionType === record.sessionType
          )
      );
      return [...filtered, record];
    });

    const docId =
      record.id ||
      `${record.courseId}_w${record.weekNumber}_${record.sessionType.replace(/[^a-z0-9]/g, '')}`;

    try {
      await setDoc(doc(db, 'attendance', docId), {
        courseId: record.courseId,
        instructorId: record.instructorId,
        weekNumber: record.weekNumber,
        sessionType: record.sessionType,
        absentStudentIds: record.absentStudentIds,
        didNotHoldClass: record.didNotHoldClass,
        updatedAt: record.updatedAt,
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `attendance/${docId}`);
      } catch {
        // Already logged
      }
    }
  };

  const handleAddUnlistedStudent = async (report: UnlistedStudentReport) => {
    setUnlistedReports(prev => {
      const withoutOld = prev.filter(r => r.id !== report.id);
      return [report, ...withoutOld];
    });

    try {
      await setDoc(doc(db, 'unlisted_students', report.id), {
        id: report.id,
        studentName: report.studentName,
        courseId: report.courseId,
        instructorId: report.instructorId,
        instructorName: report.instructorName,
        weekNumber: report.weekNumber,
        sessionType: report.sessionType,
        status: report.status,
        createdAt: report.createdAt,
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `unlisted_students/${report.id}`);
      } catch {
        // Handled
      }
    }
  };

  const handleDeleteUnlistedReport = async (reportId: string) => {
    setUnlistedReports(prev => prev.filter(r => r.id !== reportId));
    try {
      await deleteDoc(doc(db, 'unlisted_students', reportId));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `unlisted_students/${reportId}`);
      } catch {
        // Handled
      }
    }
  };

  const handleEnrollUnlistedStudent = async (report: UnlistedStudentReport): Promise<string> => {
    const course = effectiveDb.courses.find(c => c.id === report.courseId);
    const courseTitle = course ? course.title : report.courseId;
    const canonicalName = getCanonicalStudentName(report.studentName);
    const existingStudent = findMatchingStudentByFullName(canonicalName, effectiveDb.students);

    let targetStudent: Student;
    let noticeMessage = '';

    if (existingStudent) {
      const nextCourses = existingStudent.enrolledCourseIds.includes(report.courseId)
        ? existingStudent.enrolledCourseIds
        : [...existingStudent.enrolledCourseIds, report.courseId];

      targetStudent = {
        ...existingStudent,
        enrolledCourseIds: nextCourses,
      };
      await handleAddStudent(targetStudent);
      noticeMessage = `"${existingStudent.name}" sistemde aynı isim soyisimle bulundu ve ${courseTitle} dersine eklendi.`;
    } else {
      const gradePrefix = course?.gradeClass
        ? course.gradeClass === 'tyt'
          ? 'tyt'
          : `${course.gradeClass.split('/')[0]}. sınıf${
              course.modality === 'yuzyuze' ? ` (${course.gradeClass} yüz yüze)` : ''
            }`
        : '5. sınıf';

      targetStudent = createNewStudentRecord({
        rawName: canonicalName,
        modality: course?.modality || 'online',
        gradeLabel: gradePrefix,
        enrolledCourseIds: [report.courseId],
        currentWeek: report.weekNumber,
        nowIso: '2026-10-19T00:00:00.000Z',
      });
      await handleAddStudent(targetStudent);
      noticeMessage = `"${targetStudent.name}" için yeni öğrenci kaydı oluşturuldu ve şimdilik sadece ${courseTitle} dersine kaydedildi.`;
    }

    // Ensure student is marked present (not in absentStudentIds) for that specific lesson session
    const matchingAttendance = attendanceRecords.find(
      r =>
        r.courseId === report.courseId &&
        r.weekNumber === report.weekNumber &&
        r.sessionType === report.sessionType
    );
    if (matchingAttendance && matchingAttendance.absentStudentIds.includes(targetStudent.id)) {
      await handleSaveAttendance({
        ...matchingAttendance,
        absentStudentIds: matchingAttendance.absentStudentIds.filter(id => id !== targetStudent.id),
        updatedAt: new Date().toISOString(),
      });
    }

    const resolvedAt = new Date().toISOString();
    const updatedReport: UnlistedStudentReport = {
      ...report,
      status: 'enrolled',
      resolvedStudentId: targetStudent.id,
      resolvedExistingStudent: Boolean(existingStudent),
      resolvedAt,
    };

    setUnlistedReports(prev => prev.map(r => (r.id === report.id ? updatedReport : r)));

    try {
      await setDoc(doc(db, 'unlisted_students', report.id), {
        id: updatedReport.id,
        studentName: updatedReport.studentName,
        courseId: updatedReport.courseId,
        instructorId: updatedReport.instructorId,
        instructorName: updatedReport.instructorName,
        weekNumber: updatedReport.weekNumber,
        sessionType: updatedReport.sessionType,
        status: 'enrolled',
        resolvedStudentId: targetStudent.id,
        resolvedExistingStudent: Boolean(existingStudent),
        createdAt: updatedReport.createdAt,
        resolvedAt,
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `unlisted_students/${report.id}`);
      } catch {
        // Handled
      }
    }

    return noticeMessage;
  };

  const handleMarkTemporaryUnlistedStudent = async (
    report: UnlistedStudentReport
  ): Promise<string> => {
    const course = effectiveDb.courses.find(c => c.id === report.courseId);
    const courseTitle = course ? course.title : report.courseId;
    const canonicalName = getCanonicalStudentName(report.studentName);
    const existingStudent = findMatchingStudentByFullName(canonicalName, effectiveDb.students);

    const resolvedStudentId = existingStudent
      ? existingStudent.id
      : `temp-${slugifyTurkish(canonicalName)}`;
    const resolvedAt = new Date().toISOString();

    const updatedReport: UnlistedStudentReport = {
      ...report,
      status: 'temporary',
      resolvedStudentId,
      resolvedExistingStudent: Boolean(existingStudent),
      resolvedAt,
    };

    setUnlistedReports(prev => prev.map(r => (r.id === report.id ? updatedReport : r)));

    try {
      await setDoc(doc(db, 'unlisted_students', report.id), {
        id: updatedReport.id,
        studentName: updatedReport.studentName,
        courseId: updatedReport.courseId,
        instructorId: updatedReport.instructorId,
        instructorName: updatedReport.instructorName,
        weekNumber: updatedReport.weekNumber,
        sessionType: updatedReport.sessionType,
        status: 'temporary',
        resolvedStudentId,
        resolvedExistingStudent: Boolean(existingStudent),
        createdAt: updatedReport.createdAt,
        resolvedAt,
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `unlisted_students/${report.id}`);
      } catch {
        // Handled
      }
    }

    if (existingStudent) {
      return `"${existingStudent.name}" sistemde mevcut öğrenci olarak doğrulandı; ${courseTitle} dersine kayıt yapılmadan yalnızca ${report.weekNumber}. hafta (${report.sessionType}) yoklamasında var olarak işlendi.`;
    }
    return `"${canonicalName}" derse kayıt yapılmadan yalnızca ${courseTitle} · ${report.weekNumber}. hafta (${report.sessionType}) yoklamasında geçici öğrenci olarak var yazıldı.`;
  };

  const handleDeleteCourseSession = async (courseId: string, weekNumber: number, sessionType: string) => {
    const target = attendanceRecords.find(
      r => r.courseId === courseId && r.weekNumber === weekNumber && r.sessionType === sessionType
    );
    setAttendanceRecords(prev =>
      prev.filter(
        r => !(r.courseId === courseId && r.weekNumber === weekNumber && r.sessionType === sessionType)
      )
    );
    if (target?.id) {
      try {
        await deleteDoc(doc(db, 'attendance', target.id));
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.DELETE, `attendance/${target.id}`);
        } catch {
          // Handled
        }
      }
    }
  };

  const handleResetZeroPresentAttendance = async (): Promise<number> => {
    const zeroRecords = getZeroPresentAttendanceRecords(
      attendanceRecords,
      effectiveDb.courses,
      unlistedReports,
      customStudents
    );
    if (zeroRecords.length === 0) {
      return 0;
    }

    const zeroIds = new Set(zeroRecords.map(r => r.id).filter(Boolean));
    setAttendanceRecords(prev => prev.filter(r => !r.id || !zeroIds.has(r.id)));

    try {
      await Promise.all(
        zeroRecords
          .filter(r => Boolean(r.id))
          .map(r => deleteDoc(doc(db, 'attendance', r.id!)))
      );
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, 'attendance');
      } catch {
        // Handled
      }
    }

    return zeroRecords.length;
  };

  const handleResetAllAttendance = async () => {
    setAttendanceRecords([]);
    try {
      const q = query(
        collection(db, 'attendance'),
        where('weekNumber', '>=', 1),
        where('weekNumber', '<=', 52)
      );
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'attendance', d.id))));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, 'attendance');
      } catch {
        // Handled
      }
    }
  };

  const handleDeleteFeedback = async (feedbackId: string) => {
    setFeedbacks(prev => prev.filter(f => f.id !== feedbackId));
    try {
      await deleteDoc(doc(db, 'feedback', feedbackId));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `feedback/${feedbackId}`);
      } catch {
        // Handled
      }
    }
  };

  const handleClearAllFeedbacks = async () => {
    setFeedbacks([]);
    try {
      const q = query(
        collection(db, 'feedback'),
        where('createdAt', '>=', '2020-01-01')
      );
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'feedback', d.id))));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, 'feedback');
      } catch {
        // Handled
      }
    }
  };

  const handleIdentitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = resolveIdentityInput(identityInput);

    if (res.type === 'admin') {
      setPromptWarning(null);
      setRoute({ view: 'sibelius' });
      window.history.replaceState(null, 'bach', '#bach/sibelius');
      return;
    }

    if (res.type === 'feedback_admin') {
      setPromptWarning(null);
      setRoute({ view: 'amadeus' });
      window.history.replaceState(null, 'bach', '#bach/amadeus');
      return;
    }

    if (res.type === 'instructor') {
      setPromptWarning(null);
      setSelectedWeek(currentWeek);
      setRoute({ view: 'instructor', instructor: res.instructor });
      window.history.replaceState(null, 'bach', `#bach/${res.instructor.id}`);
      return;
    }

    if (res.type === 'need_surname') {
      setPromptWarning(
        `birden fazla "${res.matchingFirstName}" isimli eğitmenimiz var canım, soyismini de girer misin?`
      );
      return;
    }

    setPromptWarning(
      'bu isimle eşleşen bir eğitmen bulamadım canım, ismini kontrol edip tekrar yazar mısın?'
    );
  };

  const handleReturnHome = () => {
    setRoute({ view: 'login' });
    setIdentityInput('');
    setPromptWarning(null);
    setInstructorExitCounter(0);
    window.history.replaceState(null, 'bach', '#bach');
  };

  const handleHeaderBrandClick = () => {
    if (route.view === 'instructor') {
      setInstructorExitCounter(prev => prev + 1);
      return;
    }
    handleReturnHome();
  };

  return (
    <div className="relative min-h-[100dvh] flex flex-col justify-between selection:bg-stone-800 selection:text-stone-100">
      {/* Subtle Boğaziçi University South Campus Illustration */}
      <BogaziciIllustration />

      {/* Minimal Top-Left "bach" Brand Mark ONLY */}
      <header className="relative z-20 flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4">
        <button
          type="button"
          onClick={handleHeaderBrandClick}
          className="font-serif-art text-lg tracking-wide text-stone-800 hover:text-stone-950 py-1 pr-3 transition-colors cursor-pointer"
        >
          bach
        </button>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col justify-center">
        {route.view === 'login' && (
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8 sm:py-12 pb-20 text-center">
            <h1 className="font-serif-art text-3xl sm:text-5xl font-normal tracking-tight text-stone-900 mb-5 sm:mb-6 text-balance">
              hoş geldin canım, sen kimsin?
            </h1>

            <form onSubmit={handleIdentitySubmit} className="space-y-4" autoComplete="off">
              <label htmlFor="who-are-you-input" className="sr-only">
                hoş geldin canım, sen kimsin?
              </label>
              <input
                id="who-are-you-input"
                name="bach_identity_no_autofill"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="go"
                value={identityInput}
                onChange={e => {
                  setIdentityInput(e.target.value);
                  if (promptWarning) setPromptWarning(null);
                }}
                placeholder="ismini yazıp enter'a bas..."
                className="w-full rounded-2xl border border-stone-400/80 bg-[#faf8f4]/95 px-5 sm:px-6 py-3.5 sm:py-4 text-center text-base sm:text-lg text-stone-900 placeholder:text-stone-400 shadow-xs focus:border-stone-800 focus:bg-white focus:outline-none transition-all"
              />

              {promptWarning && (
                <p
                  role="alert"
                  className="text-sm text-amber-900 bg-amber-100/80 border border-amber-300/80 rounded-xl px-4 py-2.5"
                >
                  {promptWarning}
                </p>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs text-stone-500">
                <span className="font-mono-num whitespace-nowrap">
                  {currentWeek}. hafta ({getWeekDateRangeLabel(currentWeek)})
                </span>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">boğaziçi gençlik merkezi</span>
              </div>
            </form>
          </div>
        )}

        {route.view === 'instructor' && (
          <InstructorView
            instructor={route.instructor}
            currentWeek={currentWeek}
            selectedWeek={selectedWeek}
            onSelectWeek={setSelectedWeek}
            attendanceRecords={attendanceRecords}
            unlistedReports={unlistedReports}
            onSaveAttendance={handleSaveAttendance}
            onAddUnlistedStudent={handleAddUnlistedStudent}
            onRemoveUnlistedStudent={handleDeleteUnlistedReport}
            onDeleteCourseSession={handleDeleteCourseSession}
            onBackToLogin={handleReturnHome}
            exitRequestCounter={instructorExitCounter}
          />
        )}

        {route.view === 'sibelius' && (
          <AdminSibeliusView
            currentWeek={currentWeek}
            students={effectiveDb.students}
            courses={effectiveDb.courses}
            instructors={effectiveDb.instructors}
            attendanceRecords={attendanceRecords}
            unlistedReports={unlistedReports}
            onAddStudent={handleAddStudent}
            onRemoveStudent={handleRemoveStudent}
            onAssignInstructor={handleAssignInstructor}
            onEnrollUnlistedStudent={handleEnrollUnlistedStudent}
            onMarkTemporaryUnlistedStudent={handleMarkTemporaryUnlistedStudent}
            onDeleteUnlistedReport={handleDeleteUnlistedReport}
            onResetZeroAttendance={handleResetZeroPresentAttendance}
            onResetAllAttendance={handleResetAllAttendance}
            onResetAllFeedbacks={handleClearAllFeedbacks}
            onBackToLogin={handleReturnHome}
          />
        )}

        {route.view === 'amadeus' && (
          <AmadeusFeedbackView
            feedbacks={feedbacks}
            onDeleteFeedback={handleDeleteFeedback}
            onClearAllFeedbacks={handleClearAllFeedbacks}
            onBackToLogin={handleReturnHome}
          />
        )}
      </main>

      {/* Anonymous Feedback Button at bottom-left */}
      <FeedbackWidget />
    </div>
  );
}
