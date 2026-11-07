/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  waitForPendingWrites,
  where,
} from 'firebase/firestore';
import {
  CLIENT_SESSION_ID,
  db,
  formatFirestoreTimestamp,
  handleFirestoreError,
  OperationType,
  writeAuditLog,
} from './firebase';
import {
  AttendanceRecord,
  AuditLogEntry,
  BASE_DB,
  FeedbackItem,
  getCanonicalStudentName,
  Instructor,
  InstructorAssignmentRecord,
  Modality,
  normalizeTurkish,
  PlaceboSavePreferenceRecord,
  RemovedStudentRecord,
  slugifyTurkish,
  Student,
  syncDatabaseMutations,
  UnlistedStudentReport,
} from './data/database';
import {
  buildAttendanceDocId,
  createNewStudentRecord,
  detectConcurrentAttendanceConflict,
  findMatchingStudentByFullName,
  getCurrentWeekNumber,
  getWeekDateRangeLabel,
  getZeroPresentAttendanceRecords,
  resolveIdentityInput,
} from './utils/enigmaLogic';
import {
  isClockSkewSignificant,
  getClockSkewMinutes,
  syncServerClockOffset,
} from './config/academicConfig';
import { WriteQueueController, WriteQueueSnapshot } from './utils/writeQueue';
import { BogaziciIllustration } from './components/BogaziciIllustration';
import { FeedbackWidget } from './components/FeedbackWidget';
import {
  AttendanceConflictNotice,
  InstructorView,
} from './components/InstructorView';
import { AdminSibeliusView } from './components/AdminSibeliusView';
import { AmadeusFeedbackView } from './components/AmadeusFeedbackView';
import { SaveStatusIndicator } from './components/SaveStatusIndicator';
import { NavigationGuardModal } from './components/NavigationGuardModal';

type AppRoute =
  | { view: 'login' }
  | { view: 'instructor'; instructor: Instructor }
  | { view: 'sibelius' }
  | { view: 'amadeus' };

function triggerJsonBackupDownload(filenamePrefix: string, data: unknown): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const jsonString = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        source: filenamePrefix,
        records: data,
      },
      null,
      2
    );
    window.localStorage.setItem(
      `bach_last_backup_${filenamePrefix}`,
      jsonString
    );
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `bach-yedek-${filenamePrefix}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    console.error('Yedek JSON indirme hatası:', err);
  }
}

export default function App() {
  const [identityInput, setIdentityInput] = useState('');
  const [promptWarning, setPromptWarning] = useState<string | null>(null);
  const [route, setRoute] = useState<AppRoute>({ view: 'login' });
  const [instructorExitCounter, setInstructorExitCounter] = useState(0);

  const [currentWeek, setCurrentWeek] = useState<number>(() =>
    getCurrentWeekNumber()
  );
  const [selectedWeek, setSelectedWeek] = useState<number>(() =>
    getCurrentWeekNumber()
  );
  const [clockSkewNotice, setClockSkewNotice] = useState<string | null>(null);
  const [activeInstructorCourseId, setActiveInstructorCourseId] =
    useState<string>('');

  // Unified write queue controller instance
  const writeQueueRef = useRef<WriteQueueController | null>(null);
  if (!writeQueueRef.current) {
    writeQueueRef.current = new WriteQueueController({
      debounceMs: 650,
      savedHideMs: 3000,
      waitForServerSync: () => waitForPendingWrites(db),
      getIsOnline: () =>
        typeof navigator !== 'undefined' ? navigator.onLine : true,
    });
  }

  const [queueSnapshot, setQueueSnapshot] = useState<WriteQueueSnapshot>(() =>
    writeQueueRef.current!.getSnapshot()
  );

  // Navigation guard modal state
  const [isNavGuardOpen, setIsNavGuardOpen] = useState(false);
  const pendingGuardedNavRef = useRef<(() => void) | null>(null);

  // Concurrent edit conflict state
  const [conflictNotice, setConflictNotice] =
    useState<AttendanceConflictNotice | null>(null);
  const knownVersionsRef = useRef<Map<string, number>>(new Map());

  // Undo buffers for soft-deleted bulk operations
  const [lastSoftDeletedAttendanceIds, setLastSoftDeletedAttendanceIds] =
    useState<string[]>([]);
  const [lastSoftDeletedFeedbackIds, setLastSoftDeletedFeedbackIds] = useState<
    string[]
  >([]);

  // Real-time synced lists from Firestore
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [customStudents, setCustomStudents] = useState<Student[]>([]);
  const [removedStudentIds, setRemovedStudentIds] = useState<string[]>([]);
  const [instructorAssignments, setInstructorAssignments] = useState<
    InstructorAssignmentRecord[]
  >([]);
  const [unlistedReports, setUnlistedReports] = useState<
    UnlistedStudentReport[]
  >([]);
  const [placeboSavePrefs, setPlaceboSavePrefs] = useState<
    PlaceboSavePreferenceRecord[]
  >([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Synchronize effective students, courses, and instructors whenever mutations change
  const effectiveDb = useMemo(
    () =>
      syncDatabaseMutations(
        customStudents,
        removedStudentIds,
        instructorAssignments
      ),
    [customStudents, removedStudentIds, instructorAssignments]
  );

  const safeReplaceHash = (hash: string) => {
    try {
      window.history.replaceState(null, 'bach', hash);
    } catch (err) {
      console.warn('Hash güncellenemedi:', err);
    }
  };

  // Subscribe to WriteQueueController state transitions
  useEffect(() => {
    const queue = writeQueueRef.current!;
    return queue.subscribe(snap => {
      setQueueSnapshot(snap);
    });
  }, []);

  // Automatically continue paused in-app navigation once pending writes finish on server
  useEffect(() => {
    if (!isNavGuardOpen || !pendingGuardedNavRef.current) return;
    if (
      queueSnapshot.pendingCount === 0 &&
      queueSnapshot.inFlightCount === 0 &&
      queueSnapshot.failedCount === 0 &&
      queueSnapshot.isOnline &&
      queueSnapshot.phase !== 'saving' &&
      queueSnapshot.phase !== 'offline' &&
      queueSnapshot.phase !== 'error'
    ) {
      const nextAction = pendingGuardedNavRef.current;
      pendingGuardedNavRef.current = null;
      setIsNavGuardOpen(false);
      nextAction();
    }
  }, [isNavGuardOpen, queueSnapshot]);

  // Sync server clock offset on boot so week calculation is independent of wrong device clock
  useEffect(() => {
    if (!window.location.hash || window.location.hash.startsWith('#enigma')) {
      safeReplaceHash('#bach');
    }

    void syncServerClockOffset().then(() => {
      const correctedWeek = getCurrentWeekNumber();
      setCurrentWeek(correctedWeek);
      setSelectedWeek(prev => (prev === currentWeek ? correctedWeek : prev));
      if (isClockSkewSignificant()) {
        setClockSkewNotice(
          `cihaz saatin sunucu saatinden ~${getClockSkewMinutes()} dk farklı görünüyor; hafta hesabı otomatik olarak Europe/Istanbul sunucu saatine göre düzeltildi.`
        );
      }
    });
  }, []);

  // Browser exit / reload / visibility / back-button protection & offline recovery
  useEffect(() => {
    const queue = writeQueueRef.current!;

    const handleOnline = () => queue.handleConnectivityChange(true);
    const handleOffline = () => queue.handleConnectivityChange(false);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void queue.flushAll();
      }
    };

    const handlePageHide = () => {
      void queue.flushAll();
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const snap = queue.getSnapshot();
      if (snap.hasUnsavedWork) {
        void queue.flushAll();
        e.preventDefault();
        e.returnValue = 'Kaydedilmemiş yoklama değişiklikleri var.';
        return e.returnValue;
      }
    };

    const handleHashChange = () => {
      if (route.view === 'login') return;
      const currentHash = window.location.hash;
      if (currentHash === '#bach' || currentHash === '') {
        const snap = queue.getSnapshot();
        if (snap.hasUnsavedWork) {
          // Restore hash and pause navigation until write completes
          if (route.view === 'instructor') {
            safeReplaceHash(`#bach/${route.instructor.id}`);
          } else if (route.view === 'sibelius') {
            safeReplaceHash('#bach/sibelius');
          } else if (route.view === 'amadeus') {
            safeReplaceHash('#bach/amadeus');
          }
          void queue.flushAll();
          pendingGuardedNavRef.current = () => {
            setRoute({ view: 'login' });
            setIdentityInput('');
            setPromptWarning(null);
            safeReplaceHash('#bach');
          };
          setIsNavGuardOpen(true);
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [route]);

  const handleGuardedNavigate = (action: () => void) => {
    const queue = writeQueueRef.current!;
    const snap = queue.getSnapshot();
    if (
      snap.pendingCount > 0 ||
      snap.inFlightCount > 0 ||
      snap.failedCount > 0 ||
      snap.phase === 'saving' ||
      snap.phase === 'offline' ||
      snap.phase === 'error'
    ) {
      void queue.flushAll();
      pendingGuardedNavRef.current = action;
      setIsNavGuardOpen(true);
      return;
    }
    action();
  };

  // Roster mutation listeners (lightweight delta collections: custom_students, removed_students, instructor_assignments)
  useEffect(() => {
    const customStudentsQuery = query(
      collection(db, 'custom_students'),
      where('addedAtWeek', '>=', 1)
    );
    const unsubCustom = onSnapshot(
      customStudentsQuery,
      { includeMetadataChanges: true },
      snapshot => {
        const items: Student[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data.deletedAt) return;
          items.push({
            ...(data as Student),
            id: data.id || docSnap.id,
            addedAt: formatFirestoreTimestamp(data.addedAt, data.addedAtIso),
            deletedAt: data.deletedAt
              ? formatFirestoreTimestamp(data.deletedAt, data.deletedAtIso)
              : null,
          });
        });
        setCustomStudents(items);
      },
      error => {
        console.error('custom_students dinleme hatası:', error);
      }
    );

    const removedStudentsQuery = query(
      collection(db, 'removed_students'),
      where('studentId', '>=', '')
    );
    const unsubRemoved = onSnapshot(
      removedStudentsQuery,
      snapshot => {
        const ids: string[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as RemovedStudentRecord;
          if (data.deletedAt) return;
          ids.push(data.studentId || docSnap.id);
        });
        setRemovedStudentIds(ids);
      },
      error => {
        console.error('removed_students dinleme hatası:', error);
      }
    );

    const assignmentsQuery = query(
      collection(db, 'instructor_assignments'),
      where('courseId', '>=', '')
    );
    const unsubAssign = onSnapshot(
      assignmentsQuery,
      snapshot => {
        const items: InstructorAssignmentRecord[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          items.push({
            ...(data as InstructorAssignmentRecord),
            updatedAt: formatFirestoreTimestamp(
              data.updatedAt,
              data.updatedAtIso
            ),
          });
        });
        setInstructorAssignments(items);
      },
      error => {
        console.error('instructor_assignments dinleme hatası:', error);
      }
    );

    return () => {
      unsubCustom();
      unsubRemoved();
      unsubAssign();
    };
  }, []);

  // Scoped Real-Time Listener for Attendance & Unlisted Students (Item 7: Only active week & relevant course!)
  useEffect(() => {
    if (route.view === 'login' || route.view === 'amadeus') {
      // Do not download attendance or unlisted_students on login or feedback screens!
      // Only run a one-time startup check for any unsent offline writes in IndexedDB cache
      let initialChecked = false;
      const startupQuery = query(
        collection(db, 'attendance'),
        where('weekNumber', '==', currentWeek)
      );
      const unsubStartup = onSnapshot(
        startupQuery,
        { includeMetadataChanges: true },
        snapshot => {
          if (!initialChecked) {
            initialChecked = true;
            if (snapshot.metadata.hasPendingWrites) {
              writeQueueRef.current?.notifySnapshotPendingState(true, true);
              void waitForPendingWrites(db).then(() => {
                writeQueueRef.current?.notifySnapshotPendingState(false, false);
              });
            }
          }
        },
        err => {
          console.error('Başlangıç bekleyen yazma kontrolü hatası:', err);
        }
      );
      return () => unsubStartup();
    }

    if (route.view === 'instructor') {
      const targetCourseId =
        activeInstructorCourseId || route.instructor.courseIds[0] || '';
      if (!targetCourseId) return;

      let isFirstSnap = true;
      const attQuery = query(
        collection(db, 'attendance'),
        where('weekNumber', '==', selectedWeek),
        where('courseId', '==', targetCourseId)
      );

      const unsubAtt = onSnapshot(
        attQuery,
        { includeMetadataChanges: true },
        snapshot => {
          writeQueueRef.current?.notifySnapshotPendingState(
            snapshot.metadata.hasPendingWrites,
            isFirstSnap
          );
          isFirstSnap = false;

          const incomingRecords: AttendanceRecord[] = [];
          snapshot.forEach(docSnap => {
            const raw = docSnap.data();
            const record: AttendanceRecord = {
              id: docSnap.id,
              courseId: raw.courseId,
              instructorId: raw.instructorId,
              weekNumber: raw.weekNumber,
              sessionType: raw.sessionType,
              absentStudentIds: Array.isArray(raw.absentStudentIds)
                ? raw.absentStudentIds
                : [],
              didNotHoldClass: Boolean(raw.didNotHoldClass),
              updatedAt: formatFirestoreTimestamp(
                raw.updatedAt,
                raw.updatedAtIso
              ),
              version: typeof raw.version === 'number' ? raw.version : 1,
              updatedBySessionId: raw.updatedBySessionId,
              deletedAt: raw.deletedAt
                ? formatFirestoreTimestamp(raw.deletedAt, raw.deletedAtIso)
                : null,
            };

            if (!docSnap.metadata.hasPendingWrites && record.version) {
              const prevKnown = knownVersionsRef.current.get(docSnap.id) ?? 0;
              if (
                prevKnown > 0 &&
                detectConcurrentAttendanceConflict({
                  serverVersion: record.version,
                  serverUpdatedBySessionId: record.updatedBySessionId,
                  expectedBaseVersion: prevKnown,
                  currentClientSessionId: CLIENT_SESSION_ID,
                })
              ) {
                setConflictNotice({
                  docId: docSnap.id,
                  courseId: record.courseId,
                  weekNumber: record.weekNumber,
                  sessionType: record.sessionType,
                  serverRecord: record,
                  localAttemptRecord: record,
                });
              }
              knownVersionsRef.current.set(docSnap.id, record.version);
            }

            incomingRecords.push(record);
          });

          setAttendanceRecords(prev => {
            const others = prev.filter(
              r =>
                !(
                  r.courseId === targetCourseId &&
                  r.weekNumber === selectedWeek
                )
            );
            return [...others, ...incomingRecords];
          });
        },
        error => {
          console.error('Yoklama dinleme hatası:', error);
        }
      );

      const unlistedQuery = query(
        collection(db, 'unlisted_students'),
        where('weekNumber', '==', selectedWeek),
        where('courseId', '==', targetCourseId)
      );

      const unsubUnlisted = onSnapshot(
        unlistedQuery,
        { includeMetadataChanges: true },
        snapshot => {
          writeQueueRef.current?.notifySnapshotPendingState(
            snapshot.metadata.hasPendingWrites,
            false
          );
          const items: UnlistedStudentReport[] = [];
          snapshot.forEach(docSnap => {
            const raw = docSnap.data();
            items.push({
              ...(raw as UnlistedStudentReport),
              id: docSnap.id,
              createdAt: formatFirestoreTimestamp(
                raw.createdAt,
                raw.createdAtIso
              ),
              resolvedAt: raw.resolvedAt
                ? formatFirestoreTimestamp(raw.resolvedAt, raw.resolvedAtIso)
                : undefined,
              deletedAt: raw.deletedAt
                ? formatFirestoreTimestamp(raw.deletedAt, raw.deletedAtIso)
                : null,
            });
          });
          setUnlistedReports(prev => {
            const others = prev.filter(
              r =>
                !(
                  r.courseId === targetCourseId &&
                  r.weekNumber === selectedWeek
                )
            );
            return [...others, ...items];
          });
        },
        error => {
          console.error('Liste dışı öğrenci dinleme hatası:', error);
        }
      );

      return () => {
        unsubAtt();
        unsubUnlisted();
      };
    }

    if (route.view === 'sibelius') {
      const attQuery = query(
        collection(db, 'attendance'),
        where('weekNumber', '>=', 1),
        where('weekNumber', '<=', currentWeek + 1)
      );
      const unsubAtt = onSnapshot(
        attQuery,
        { includeMetadataChanges: true },
        snapshot => {
          writeQueueRef.current?.notifySnapshotPendingState(
            snapshot.metadata.hasPendingWrites,
            false
          );
          const remoteRecords: AttendanceRecord[] = [];
          snapshot.forEach(docSnap => {
            const raw = docSnap.data();
            remoteRecords.push({
              id: docSnap.id,
              courseId: raw.courseId,
              instructorId: raw.instructorId,
              weekNumber: raw.weekNumber,
              sessionType: raw.sessionType,
              absentStudentIds: Array.isArray(raw.absentStudentIds)
                ? raw.absentStudentIds
                : [],
              didNotHoldClass: Boolean(raw.didNotHoldClass),
              updatedAt: formatFirestoreTimestamp(
                raw.updatedAt,
                raw.updatedAtIso
              ),
              version: typeof raw.version === 'number' ? raw.version : 1,
              updatedBySessionId: raw.updatedBySessionId,
              deletedAt: raw.deletedAt
                ? formatFirestoreTimestamp(raw.deletedAt, raw.deletedAtIso)
                : null,
            });
          });
          setAttendanceRecords(remoteRecords);
        },
        error => {
          console.error('Sibelius yoklama dinleme hatası:', error);
        }
      );

      const unlistedQuery = query(
        collection(db, 'unlisted_students'),
        where('weekNumber', '>=', 1),
        where('weekNumber', '<=', currentWeek + 1)
      );
      const unsubUnlisted = onSnapshot(
        unlistedQuery,
        snapshot => {
          const items: UnlistedStudentReport[] = [];
          snapshot.forEach(docSnap => {
            const raw = docSnap.data();
            items.push({
              ...(raw as UnlistedStudentReport),
              id: docSnap.id,
              createdAt: formatFirestoreTimestamp(
                raw.createdAt,
                raw.createdAtIso
              ),
              resolvedAt: raw.resolvedAt
                ? formatFirestoreTimestamp(raw.resolvedAt, raw.resolvedAtIso)
                : undefined,
              deletedAt: raw.deletedAt
                ? formatFirestoreTimestamp(raw.deletedAt, raw.deletedAtIso)
                : null,
            });
          });
          items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setUnlistedReports(items);
        },
        error => {
          console.error('Sibelius liste dışı dinleme hatası:', error);
        }
      );

      const prefsQuery = query(
        collection(db, 'placebo_save_preferences'),
        where('instructorId', '>=', '')
      );
      const unsubPrefs = onSnapshot(
        prefsQuery,
        snapshot => {
          const items: PlaceboSavePreferenceRecord[] = [];
          snapshot.forEach(docSnap => {
            const raw = docSnap.data();
            items.push({
              instructorId: raw.instructorId || docSnap.id,
              instructorName: raw.instructorName,
              enabled: Boolean(raw.enabled),
              updatedAt: formatFirestoreTimestamp(
                raw.updatedAt,
                raw.updatedAtIso
              ),
            });
          });
          setPlaceboSavePrefs(items);
        },
        error => {
          console.error('Placebo tercih dinleme hatası:', error);
        }
      );

      const auditQuery = query(
        collection(db, 'audit_log'),
        where('createdAtIso', '>=', '2020-01-01')
      );
      const unsubAudit = onSnapshot(
        auditQuery,
        snapshot => {
          const logs: AuditLogEntry[] = [];
          snapshot.forEach(docSnap => {
            const raw = docSnap.data();
            logs.push({
              id: docSnap.id,
              actor: raw.actor,
              action: raw.action,
              target: raw.target,
              details: raw.details,
              createdAt: formatFirestoreTimestamp(
                raw.createdAt,
                raw.createdAtIso
              ),
            });
          });
          logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setAuditLogs(logs.slice(0, 100));
        },
        error => {
          console.error('Audit log dinleme hatası:', error);
        }
      );

      return () => {
        unsubAtt();
        unsubUnlisted();
        unsubPrefs();
        unsubAudit();
      };
    }
  }, [route, selectedWeek, activeInstructorCourseId, currentWeek]);

  // Scoped Real-Time Listener for Amadeus Feedback View ONLY
  useEffect(() => {
    if (route.view !== 'amadeus') return;
    const feedbackQuery = query(
      collection(db, 'feedback'),
      where('message', '>=', '')
    );
    const unsubscribe = onSnapshot(
      feedbackQuery,
      snapshot => {
        const items: FeedbackItem[] = [];
        snapshot.forEach(docSnap => {
          const raw = docSnap.data();
          items.push({
            id: docSnap.id,
            message: raw.message,
            createdAt: formatFirestoreTimestamp(
              raw.createdAt,
              raw.createdAtIso
            ),
            deletedAt: raw.deletedAt
              ? formatFirestoreTimestamp(raw.deletedAt, raw.deletedAtIso)
              : null,
          });
        });
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setFeedbacks(items);
      },
      error => {
        console.error('Feedback dinleme hatası:', error);
      }
    );

    return () => unsubscribe();
  }, [route.view]);

  const handleAddStudent = async (student: Student) => {
    const prevCustom = [...customStudents];
    const prevRemoved = [...removedStudentIds];

    setRemovedStudentIds(prev => prev.filter(id => id !== student.id));
    setCustomStudents(prev => {
      const withoutOld = prev.filter(s => s.id !== student.id);
      return [...withoutOld, student];
    });

    await writeQueueRef.current!.enqueueImmediate({
      key: `student_add_${student.id}`,
      label: 'Öğrenci Ekle',
      rollback: () => {
        setCustomStudents(prevCustom);
        setRemovedStudentIds(prevRemoved);
      },
      execute: async () => {
        const nowIso = new Date().toISOString();
        try {
          await setDoc(doc(db, 'custom_students', student.id), {
            id: student.id,
            name: student.name,
            grade: student.grade,
            modality: student.modality,
            enrolledCourseIds: student.enrolledCourseIds,
            addedAtWeek: student.addedAtWeek || currentWeek,
            addedAt: serverTimestamp(),
            addedAtIso: student.addedAt || nowIso,
            deletedAt: null,
          });
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'ogrenci_ekle',
            target: student.id,
            details: `${student.name} (${student.grade}) sisteme eklendi.`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `custom_students/${student.id}`
          );
        }
      },
    });
  };

  const handleRemoveStudent = async (student: Student) => {
    const prevCustom = [...customStudents];
    const prevRemoved = [...removedStudentIds];
    const isBaseStudent = BASE_DB.students.some(s => s.id === student.id);

    if (isBaseStudent) {
      setRemovedStudentIds(prev =>
        prev.includes(student.id) ? prev : [...prev, student.id]
      );
    }
    setCustomStudents(prev => prev.filter(s => s.id !== student.id));

    await writeQueueRef.current!.enqueueImmediate({
      key: `student_remove_${student.id}`,
      label: 'Öğrenci Kaldır',
      rollback: () => {
        setCustomStudents(prevCustom);
        setRemovedStudentIds(prevRemoved);
      },
      execute: async () => {
        const nowIso = new Date().toISOString();
        try {
          const isCustom = prevCustom.some(s => s.id === student.id);
          if (isCustom) {
            await setDoc(doc(db, 'custom_students', student.id), {
              id: student.id,
              name: student.name,
              grade: student.grade,
              modality: student.modality,
              enrolledCourseIds: student.enrolledCourseIds,
              addedAtWeek: student.addedAtWeek || 1,
              addedAt: student.addedAt || nowIso,
              addedAtIso: student.addedAt || nowIso,
              deletedAt: serverTimestamp(),
              deletedAtIso: nowIso,
            });
          }
          if (isBaseStudent) {
            await setDoc(doc(db, 'removed_students', student.id), {
              studentId: student.id,
              name: student.name,
              removedAt: serverTimestamp(),
              removedAtIso: nowIso,
              deletedAt: null,
            });
          }
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'ogrenci_kaldir',
            target: student.id,
            details: `${student.name} (${student.id}) sistemden kaldırıldı (soft delete).`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `removed_students/${student.id}`
          );
        }
      },
    });
  };

  const handleAssignInstructor = async (
    courseId: string,
    rawInstructorName: string,
    newCourseMeta?: { modality: Modality; gradeClass: string; subject: string }
  ) => {
    const prevAssignments = [...instructorAssignments];
    const cleanName = normalizeTurkish(rawInstructorName);
    const updatedAtIso = new Date().toISOString();
    const record: InstructorAssignmentRecord = {
      courseId,
      instructorName: cleanName,
      updatedAt: updatedAtIso,
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

    await writeQueueRef.current!.enqueueImmediate({
      key: `assign_inst_${courseId}`,
      label: 'Eğitmen Ata',
      rollback: () => setInstructorAssignments(prevAssignments),
      execute: async () => {
        try {
          await setDoc(doc(db, 'instructor_assignments', courseId), {
            ...record,
            updatedAt: serverTimestamp(),
            updatedAtIso,
          });
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'egitmen_ata',
            target: courseId,
            details: `${courseId} dersine eğitmen olarak ${cleanName} atandı.`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `instructor_assignments/${courseId}`
          );
        }
      },
    });
  };

  const handleSaveAttendance = async (
    record: AttendanceRecord,
    options?: {
      debounced?: boolean;
      previousRecord?: AttendanceRecord | null;
      forceOverwriteVersion?: number;
    }
  ) => {
    const docId =
      record.id ||
      buildAttendanceDocId(
        record.courseId,
        record.weekNumber,
        record.sessionType
      );
    const expectedBaseVersion =
      options?.forceOverwriteVersion ??
      knownVersionsRef.current.get(docId) ??
      record.version ??
      0;
    const optimisticVersion = expectedBaseVersion + 1;
    const nowIso = new Date().toISOString();

    const optimisticRecord: AttendanceRecord = {
      ...record,
      id: docId,
      updatedAt: nowIso,
      version: optimisticVersion,
      updatedBySessionId: CLIENT_SESSION_ID,
      deletedAt: null,
    };

    const previousSnapshot = options?.previousRecord;

    // Optimistic UI update immediately
    setAttendanceRecords(prev => {
      const filtered = prev.filter(
        r =>
          !(
            r.courseId === record.courseId &&
            r.weekNumber === record.weekNumber &&
            r.sessionType === record.sessionType
          )
      );
      return [...filtered, optimisticRecord];
    });

    const rollbackFn = () => {
      setAttendanceRecords(prev => {
        const filtered = prev.filter(
          r =>
            !(
              r.courseId === record.courseId &&
              r.weekNumber === record.weekNumber &&
              r.sessionType === record.sessionType
            )
        );
        return previousSnapshot ? [...filtered, previousSnapshot] : filtered;
      });
    };

    const executeWrite = async () => {
      const docRef = doc(db, 'attendance', docId);
      const isOnline =
        typeof navigator !== 'undefined' ? navigator.onLine : true;

      try {
        if (isOnline) {
          let nextVersion = optimisticVersion;
          await runTransaction(db, async tx => {
            const serverSnap = await tx.get(docRef);
            if (serverSnap.exists()) {
              const serverData = serverSnap.data();
              const serverVersion =
                typeof serverData.version === 'number'
                  ? serverData.version
                  : 1;
              const serverSessionId = serverData.updatedBySessionId as
                | string
                | undefined;

              if (
                options?.forceOverwriteVersion === undefined &&
                !serverData.deletedAt &&
                detectConcurrentAttendanceConflict({
                  serverVersion,
                  serverUpdatedBySessionId: serverSessionId,
                  expectedBaseVersion,
                  currentClientSessionId: CLIENT_SESSION_ID,
                })
              ) {
                const serverRec: AttendanceRecord = {
                  id: docId,
                  courseId: serverData.courseId,
                  instructorId: serverData.instructorId,
                  weekNumber: serverData.weekNumber,
                  sessionType: serverData.sessionType,
                  absentStudentIds: Array.isArray(serverData.absentStudentIds)
                    ? serverData.absentStudentIds
                    : [],
                  didNotHoldClass: Boolean(serverData.didNotHoldClass),
                  updatedAt: formatFirestoreTimestamp(
                    serverData.updatedAt,
                    serverData.updatedAtIso
                  ),
                  version: serverVersion,
                  updatedBySessionId: serverSessionId,
                  deletedAt: null,
                };
                setConflictNotice({
                  docId,
                  courseId: record.courseId,
                  weekNumber: record.weekNumber,
                  sessionType: record.sessionType,
                  serverRecord: serverRec,
                  localAttemptRecord: optimisticRecord,
                });
                throw new Error(
                  'CONCURRENT_CONFLICT: Bu dersin yoklaması başka bir cihazdan güncellendi.'
                );
              }
              nextVersion = serverVersion + 1;
            } else {
              nextVersion = 1;
            }

            tx.set(docRef, {
              courseId: record.courseId,
              instructorId: record.instructorId,
              weekNumber: record.weekNumber,
              sessionType: record.sessionType,
              absentStudentIds: record.absentStudentIds,
              didNotHoldClass: record.didNotHoldClass,
              updatedAt: serverTimestamp(),
              updatedAtIso: nowIso,
              version: nextVersion,
              updatedBySessionId: CLIENT_SESSION_ID,
              deletedAt: null,
            });
          });
          knownVersionsRef.current.set(docId, nextVersion);
        } else {
          // Offline mode: write directly to Firestore persistent local cache
          await setDoc(docRef, {
            courseId: record.courseId,
            instructorId: record.instructorId,
            weekNumber: record.weekNumber,
            sessionType: record.sessionType,
            absentStudentIds: record.absentStudentIds,
            didNotHoldClass: record.didNotHoldClass,
            updatedAt: serverTimestamp(),
            updatedAtIso: nowIso,
            version: optimisticVersion,
            updatedBySessionId: CLIENT_SESSION_ID,
            deletedAt: null,
          });
          knownVersionsRef.current.set(docId, optimisticVersion);
        }

        void writeAuditLog({
          actor: record.instructorId,
          action: record.didNotHoldClass ? 'ders_yapmadim' : 'yoklama_kaydet',
          target: docId,
          details: `${record.courseId} · ${record.weekNumber}. hafta · ${record.sessionType} (${record.absentStudentIds.length} gelmeyen)`,
        });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `attendance/${docId}`
        );
      }
    };

    const task = {
      key: `attendance_${docId}`,
      label: 'Yoklama Kaydı',
      execute: executeWrite,
      rollback: rollbackFn,
    };

    if (options?.debounced) {
      writeQueueRef.current!.enqueueDebounced(task);
    } else {
      await writeQueueRef.current!.enqueueImmediate(task);
    }
  };

  const handleResolveConflict = (
    resolution: 'accept_server' | 'force_local'
  ) => {
    if (!conflictNotice) return;
    const notice = conflictNotice;
    setConflictNotice(null);

    if (resolution === 'accept_server') {
      knownVersionsRef.current.set(
        notice.docId,
        notice.serverRecord.version || 1
      );
      writeQueueRef.current!.discardFailedAndRollback();
      setAttendanceRecords(prev => {
        const filtered = prev.filter(r => r.id !== notice.docId);
        return [...filtered, notice.serverRecord];
      });
      return;
    }

    // Force overwrite with local selection
    const forcedVersion = notice.serverRecord.version || 1;
    knownVersionsRef.current.set(notice.docId, forcedVersion);
    void handleSaveAttendance(notice.localAttemptRecord, {
      debounced: false,
      forceOverwriteVersion: forcedVersion,
    });
  };

  const handleAddUnlistedStudent = async (report: UnlistedStudentReport) => {
    const prevReports = [...unlistedReports];
    setUnlistedReports(prev => {
      const withoutOld = prev.filter(r => r.id !== report.id);
      return [report, ...withoutOld];
    });

    await writeQueueRef.current!.enqueueImmediate({
      key: `unlisted_add_${report.id}`,
      label: 'Liste Dışı Öğrenci Ekle',
      rollback: () => setUnlistedReports(prevReports),
      execute: async () => {
        const nowIso = new Date().toISOString();
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
            createdAt: serverTimestamp(),
            createdAtIso: report.createdAt || nowIso,
            deletedAt: null,
          });
          void writeAuditLog({
            actor: report.instructorName,
            action: 'liste_disi_ekle',
            target: report.id,
            details: `${report.studentName} liste dışı öğrenci olarak eklendi (${report.courseId}, ${report.weekNumber}. hafta).`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `unlisted_students/${report.id}`
          );
        }
      },
    });
  };

  const handleDeleteUnlistedReport = async (reportId: string) => {
    const prevReports = [...unlistedReports];
    const target = unlistedReports.find(r => r.id === reportId);
    const nowIso = new Date().toISOString();

    setUnlistedReports(prev =>
      prev.map(r => (r.id === reportId ? { ...r, deletedAt: nowIso } : r))
    );

    await writeQueueRef.current!.enqueueImmediate({
      key: `unlisted_del_${reportId}`,
      label: 'Liste Dışı Öğrenci Sil',
      rollback: () => setUnlistedReports(prevReports),
      execute: async () => {
        try {
          if (target) {
            await setDoc(doc(db, 'unlisted_students', reportId), {
              id: target.id,
              studentName: target.studentName,
              courseId: target.courseId,
              instructorId: target.instructorId,
              instructorName: target.instructorName,
              weekNumber: target.weekNumber,
              sessionType: target.sessionType,
              status: target.status,
              createdAt: target.createdAt,
              createdAtIso: target.createdAt,
              deletedAt: serverTimestamp(),
              deletedAtIso: nowIso,
            });
          } else {
            await deleteDoc(doc(db, 'unlisted_students', reportId));
          }
          void writeAuditLog({
            actor: target?.instructorName || 'sibelius (ekip)',
            action: 'liste_disi_sil',
            target: reportId,
            details: `${target?.studentName || reportId} liste dışı raporu kaldırıldı (soft delete).`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.DELETE,
            `unlisted_students/${reportId}`
          );
        }
      },
    });
  };

  const handleEnrollUnlistedStudent = async (
    report: UnlistedStudentReport
  ): Promise<string> => {
    const course = effectiveDb.courses.find(c => c.id === report.courseId);
    const courseTitle = course ? course.title : report.courseId;
    const canonicalName = getCanonicalStudentName(report.studentName);
    const existingStudent = findMatchingStudentByFullName(
      canonicalName,
      effectiveDb.students
    );

    let targetStudent: Student;
    let noticeMessage = '';

    if (existingStudent) {
      const nextCourses = existingStudent.enrolledCourseIds.includes(
        report.courseId
      )
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
              course.modality === 'yuzyuze'
                ? ` (${course.gradeClass} yüz yüze)`
                : ''
            }`
        : '5. sınıf';

      targetStudent = createNewStudentRecord({
        rawName: canonicalName,
        modality: course?.modality || 'online',
        gradeLabel: gradePrefix,
        enrolledCourseIds: [report.courseId],
        currentWeek: report.weekNumber,
      });
      await handleAddStudent(targetStudent);
      noticeMessage = `"${targetStudent.name}" için yeni öğrenci kaydı oluşturuldu ve şimdilik sadece ${courseTitle} dersine kaydedildi.`;
    }

    const matchingAttendance = attendanceRecords.find(
      r =>
        !r.deletedAt &&
        r.courseId === report.courseId &&
        r.weekNumber === report.weekNumber &&
        r.sessionType === report.sessionType
    );
    if (
      matchingAttendance &&
      matchingAttendance.absentStudentIds.includes(targetStudent.id)
    ) {
      await handleSaveAttendance(
        {
          ...matchingAttendance,
          absentStudentIds: matchingAttendance.absentStudentIds.filter(
            id => id !== targetStudent.id
          ),
          updatedAt: new Date().toISOString(),
        },
        { debounced: false, previousRecord: matchingAttendance }
      );
    }

    const resolvedAtIso = new Date().toISOString();
    const updatedReport: UnlistedStudentReport = {
      ...report,
      status: 'enrolled',
      resolvedStudentId: targetStudent.id,
      resolvedExistingStudent: Boolean(existingStudent),
      resolvedAt: resolvedAtIso,
    };

    setUnlistedReports(prev =>
      prev.map(r => (r.id === report.id ? updatedReport : r))
    );

    await writeQueueRef.current!.enqueueImmediate({
      key: `unlisted_enroll_${report.id}`,
      label: 'Liste Dışı Öğrenciyi Derse Kaydet',
      execute: async () => {
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
            createdAtIso: updatedReport.createdAt,
            resolvedAt: serverTimestamp(),
            resolvedAtIso,
            deletedAt: null,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `unlisted_students/${report.id}`
          );
        }
      },
    });

    return noticeMessage;
  };

  const handleMarkTemporaryUnlistedStudent = async (
    report: UnlistedStudentReport
  ): Promise<string> => {
    const course = effectiveDb.courses.find(c => c.id === report.courseId);
    const courseTitle = course ? course.title : report.courseId;
    const canonicalName = getCanonicalStudentName(report.studentName);
    const existingStudent = findMatchingStudentByFullName(
      canonicalName,
      effectiveDb.students
    );

    const resolvedStudentId = existingStudent
      ? existingStudent.id
      : `temp-${slugifyTurkish(canonicalName)}`;
    const resolvedAtIso = new Date().toISOString();

    const updatedReport: UnlistedStudentReport = {
      ...report,
      status: 'temporary',
      resolvedStudentId,
      resolvedExistingStudent: Boolean(existingStudent),
      resolvedAt: resolvedAtIso,
    };

    setUnlistedReports(prev =>
      prev.map(r => (r.id === report.id ? updatedReport : r))
    );

    await writeQueueRef.current!.enqueueImmediate({
      key: `unlisted_temp_${report.id}`,
      label: 'Geçici Öğrenci İşaretle',
      execute: async () => {
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
            createdAtIso: updatedReport.createdAt,
            resolvedAt: serverTimestamp(),
            resolvedAtIso,
            deletedAt: null,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `unlisted_students/${report.id}`
          );
        }
      },
    });

    if (existingStudent) {
      return `"${existingStudent.name}" sistemde mevcut öğrenci olarak doğrulandı; ${courseTitle} dersine kayıt yapılmadan yalnızca ${report.weekNumber}. hafta (${report.sessionType}) yoklamasında var olarak işlendi.`;
    }
    return `"${canonicalName}" derse kayıt yapılmadan yalnızca ${courseTitle} · ${report.weekNumber}. hafta (${report.sessionType}) yoklamasında geçici öğrenci olarak var yazıldı.`;
  };

  const handleDeleteCourseSession = async (
    courseId: string,
    weekNumber: number,
    sessionType: string
  ) => {
    const prevAttendance = [...attendanceRecords];
    const target = attendanceRecords.find(
      r =>
        !r.deletedAt &&
        r.courseId === courseId &&
        r.weekNumber === weekNumber &&
        r.sessionType === sessionType
    );
    const nowIso = new Date().toISOString();

    setAttendanceRecords(prev =>
      prev.map(r =>
        r.courseId === courseId &&
        r.weekNumber === weekNumber &&
        r.sessionType === sessionType
          ? { ...r, deletedAt: nowIso }
          : r
      )
    );

    if (target?.id) {
      await writeQueueRef.current!.enqueueImmediate({
        key: `attendance_del_${target.id}`,
        label: 'Ders Yoklamasını Sıfırla',
        rollback: () => setAttendanceRecords(prevAttendance),
        execute: async () => {
          try {
            await setDoc(doc(db, 'attendance', target.id!), {
              courseId: target.courseId,
              instructorId: target.instructorId,
              weekNumber: target.weekNumber,
              sessionType: target.sessionType,
              absentStudentIds: target.absentStudentIds,
              didNotHoldClass: target.didNotHoldClass,
              updatedAt: serverTimestamp(),
              updatedAtIso: nowIso,
              version: (target.version || 1) + 1,
              updatedBySessionId: CLIENT_SESSION_ID,
              deletedAt: serverTimestamp(),
              deletedAtIso: nowIso,
            });
            void writeAuditLog({
              actor: target.instructorId,
              action: 'ders_yoklama_sifirla',
              target: target.id!,
              details: `${courseId} · ${weekNumber}. hafta · ${sessionType} yoklaması sıfırlandı (soft delete).`,
            });
          } catch (error) {
            handleFirestoreError(
              error,
              OperationType.DELETE,
              `attendance/${target.id}`
            );
          }
        },
      });
    }
  };

  const handleResetZeroPresentAttendance = async (): Promise<number> => {
    const activeRecords = attendanceRecords.filter(r => !r.deletedAt);
    const zeroRecords = getZeroPresentAttendanceRecords(
      activeRecords,
      effectiveDb.courses,
      unlistedReports.filter(u => !u.deletedAt),
      customStudents
    );
    if (zeroRecords.length === 0) {
      return 0;
    }

    triggerJsonBackupDownload('bos-yoklamalar', zeroRecords);

    const prevAttendance = [...attendanceRecords];
    const nowIso = new Date().toISOString();
    const zeroIds = new Set(zeroRecords.map(r => r.id).filter(Boolean) as string[]);

    setAttendanceRecords(prev =>
      prev.map(r => (r.id && zeroIds.has(r.id) ? { ...r, deletedAt: nowIso } : r))
    );
    setLastSoftDeletedAttendanceIds(Array.from(zeroIds));

    await writeQueueRef.current!.enqueueImmediate({
      key: 'reset_zero_attendance',
      label: 'Boş Yoklamaları Sıfırla',
      rollback: () => setAttendanceRecords(prevAttendance),
      execute: async () => {
        try {
          await Promise.all(
            zeroRecords
              .filter(r => Boolean(r.id))
              .map(r =>
                setDoc(doc(db, 'attendance', r.id!), {
                  courseId: r.courseId,
                  instructorId: r.instructorId,
                  weekNumber: r.weekNumber,
                  sessionType: r.sessionType,
                  absentStudentIds: r.absentStudentIds,
                  didNotHoldClass: r.didNotHoldClass,
                  updatedAt: serverTimestamp(),
                  updatedAtIso: nowIso,
                  version: (r.version || 1) + 1,
                  updatedBySessionId: CLIENT_SESSION_ID,
                  deletedAt: serverTimestamp(),
                  deletedAtIso: nowIso,
                })
              )
          );
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'bos_yoklamalari_sifirla',
            target: 'attendance',
            details: `${zeroRecords.length} adet 0 gelenli yoklama kaydı yedeklenerek soft-delete ile sıfırlandı.`,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'attendance');
        }
      },
    });

    return zeroRecords.length;
  };

  const handleResetAllAttendance = async () => {
    const activeRecords = attendanceRecords.filter(r => !r.deletedAt);
    triggerJsonBackupDownload('tum-yoklamalar', activeRecords);

    const prevAttendance = [...attendanceRecords];
    const nowIso = new Date().toISOString();
    const affectedIds = activeRecords
      .map(r => r.id)
      .filter((id): id is string => Boolean(id));

    setAttendanceRecords(prev =>
      prev.map(r => ({ ...r, deletedAt: nowIso }))
    );
    setLastSoftDeletedAttendanceIds(affectedIds);

    await writeQueueRef.current!.enqueueImmediate({
      key: 'reset_all_attendance',
      label: 'Tüm Yoklamaları Sıfırla',
      rollback: () => setAttendanceRecords(prevAttendance),
      execute: async () => {
        try {
          await Promise.all(
            activeRecords
              .filter(r => Boolean(r.id))
              .map(r =>
                setDoc(doc(db, 'attendance', r.id!), {
                  courseId: r.courseId,
                  instructorId: r.instructorId,
                  weekNumber: r.weekNumber,
                  sessionType: r.sessionType,
                  absentStudentIds: r.absentStudentIds,
                  didNotHoldClass: r.didNotHoldClass,
                  updatedAt: serverTimestamp(),
                  updatedAtIso: nowIso,
                  version: (r.version || 1) + 1,
                  updatedBySessionId: CLIENT_SESSION_ID,
                  deletedAt: serverTimestamp(),
                  deletedAtIso: nowIso,
                })
              )
          );
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'tum_yoklamalari_sifirla',
            target: 'attendance',
            details: `${activeRecords.length} yoklama kaydı otomatik JSON yedeği alınarak soft-delete ile sıfırlandı.`,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'attendance');
        }
      },
    });
  };

  const handleUndoAttendanceReset = async () => {
    if (lastSoftDeletedAttendanceIds.length === 0) return;
    const idsToRestore = new Set(lastSoftDeletedAttendanceIds);
    const recordsToRestore = attendanceRecords.filter(
      r => r.id && idsToRestore.has(r.id)
    );
    const nowIso = new Date().toISOString();

    setAttendanceRecords(prev =>
      prev.map(r =>
        r.id && idsToRestore.has(r.id) ? { ...r, deletedAt: null } : r
      )
    );
    setLastSoftDeletedAttendanceIds([]);

    await writeQueueRef.current!.enqueueImmediate({
      key: 'undo_attendance_reset',
      label: 'Yoklama Sıfırlamayı Geri Al',
      execute: async () => {
        try {
          await Promise.all(
            recordsToRestore.map(r =>
              setDoc(doc(db, 'attendance', r.id!), {
                courseId: r.courseId,
                instructorId: r.instructorId,
                weekNumber: r.weekNumber,
                sessionType: r.sessionType,
                absentStudentIds: r.absentStudentIds,
                didNotHoldClass: r.didNotHoldClass,
                updatedAt: serverTimestamp(),
                updatedAtIso: nowIso,
                version: (r.version || 1) + 1,
                updatedBySessionId: CLIENT_SESSION_ID,
                deletedAt: null,
              })
            )
          );
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'yoklama_sifirlama_geri_al',
            target: 'attendance',
            details: `${recordsToRestore.length} yoklama kaydı geri yüklendi (undo).`,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'attendance');
        }
      },
    });
  };

  const handleDeleteFeedback = async (feedbackId: string) => {
    const prevFeedbacks = [...feedbacks];
    const target = feedbacks.find(f => f.id === feedbackId);
    const nowIso = new Date().toISOString();

    setFeedbacks(prev =>
      prev.map(f => (f.id === feedbackId ? { ...f, deletedAt: nowIso } : f))
    );
    setLastSoftDeletedFeedbackIds([feedbackId]);

    await writeQueueRef.current!.enqueueImmediate({
      key: `feedback_del_${feedbackId}`,
      label: 'Feedback Sil',
      rollback: () => setFeedbacks(prevFeedbacks),
      execute: async () => {
        try {
          if (target) {
            await setDoc(doc(db, 'feedback', feedbackId), {
              message: target.message,
              createdAt: target.createdAt,
              createdAtIso: target.createdAt,
              deletedAt: serverTimestamp(),
              deletedAtIso: nowIso,
            });
          } else {
            await deleteDoc(doc(db, 'feedback', feedbackId));
          }
          void writeAuditLog({
            actor: 'amadeus',
            action: 'feedback_sil',
            target: feedbackId,
            details: `Anonim geri bildirim (${feedbackId}) kaldırıldı (soft delete).`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.DELETE,
            `feedback/${feedbackId}`
          );
        }
      },
    });
  };

  const handleClearAllFeedbacks = async () => {
    const prevFeedbacks = [...feedbacks];
    const nowIso = new Date().toISOString();

    await writeQueueRef.current!.enqueueImmediate({
      key: 'clear_all_feedbacks',
      label: 'Tüm Feedbackleri Temizle',
      rollback: () => setFeedbacks(prevFeedbacks),
      execute: async () => {
        try {
          const q = query(
            collection(db, 'feedback'),
            where('message', '>=', '')
          );
          const snap = await getDocs(q);
          const activeDocs = snap.docs.filter(d => !d.data().deletedAt);
          const backupData = activeDocs.map(d => ({
            id: d.id,
            ...d.data(),
          }));
          triggerJsonBackupDownload('feedbackler', backupData);

          const ids = activeDocs.map(d => d.id);
          setLastSoftDeletedFeedbackIds(ids);
          setFeedbacks(prev => prev.map(f => ({ ...f, deletedAt: nowIso })));

          await Promise.all(
            activeDocs.map(d => {
              const raw = d.data();
              return setDoc(doc(db, 'feedback', d.id), {
                message: raw.message,
                createdAt: raw.createdAt,
                createdAtIso: formatFirestoreTimestamp(
                  raw.createdAt,
                  raw.createdAtIso
                ),
                deletedAt: serverTimestamp(),
                deletedAtIso: nowIso,
              });
            })
          );
          void writeAuditLog({
            actor: 'sibelius/amadeus',
            action: 'tum_feedbackleri_temizle',
            target: 'feedback',
            details: `${activeDocs.length} adet feedback otomatik JSON yedeği alınarak soft-delete ile temizlendi.`,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'feedback');
        }
      },
    });
  };

  const handleUndoFeedbackReset = async () => {
    if (lastSoftDeletedFeedbackIds.length === 0) return;
    const idsToRestore = new Set(lastSoftDeletedFeedbackIds);
    setFeedbacks(prev =>
      prev.map(f =>
        f.id && idsToRestore.has(f.id) ? { ...f, deletedAt: null } : f
      )
    );
    setLastSoftDeletedFeedbackIds([]);

    await writeQueueRef.current!.enqueueImmediate({
      key: 'undo_feedback_reset',
      label: 'Feedback Silmeyi Geri Al',
      execute: async () => {
        try {
          const q = query(
            collection(db, 'feedback'),
            where('message', '>=', '')
          );
          const snap = await getDocs(q);
          const docsToRestore = snap.docs.filter(d => idsToRestore.has(d.id));
          await Promise.all(
            docsToRestore.map(d => {
              const raw = d.data();
              return setDoc(doc(db, 'feedback', d.id), {
                message: raw.message,
                createdAt: raw.createdAt,
                createdAtIso: formatFirestoreTimestamp(
                  raw.createdAt,
                  raw.createdAtIso
                ),
                deletedAt: null,
              });
            })
          );
          void writeAuditLog({
            actor: 'sibelius/amadeus',
            action: 'feedback_silme_geri_al',
            target: 'feedback',
            details: `${docsToRestore.length} adet feedback geri yüklendi (undo).`,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'feedback');
        }
      },
    });
  };

  const handleDownloadHtml = () => {
    const link = document.createElement('a');
    link.href = './bach.html';
    link.download = 'bach.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleIdentitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeTurkish(identityInput);
    if (cleaned === 'html' || cleaned === 'indir' || cleaned === 'bach.html') {
      setPromptWarning(null);
      setIdentityInput('');
      handleDownloadHtml();
      return;
    }

    const res = resolveIdentityInput(identityInput);

    if (res.type === 'admin') {
      setPromptWarning(null);
      setRoute({ view: 'sibelius' });
      safeReplaceHash('#bach/sibelius');
      return;
    }

    if (res.type === 'feedback_admin') {
      setPromptWarning(null);
      setRoute({ view: 'amadeus' });
      safeReplaceHash('#bach/amadeus');
      return;
    }

    if (res.type === 'instructor') {
      setPromptWarning(null);
      setSelectedWeek(currentWeek);
      setActiveInstructorCourseId(res.instructor.courseIds[0] || '');
      setRoute({ view: 'instructor', instructor: res.instructor });
      safeReplaceHash(`#bach/${res.instructor.id}`);
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

  const performReturnHome = () => {
    setRoute({ view: 'login' });
    setIdentityInput('');
    setPromptWarning(null);
    setInstructorExitCounter(0);
    setConflictNotice(null);
    safeReplaceHash('#bach');
  };

  const handleReturnHome = () => {
    handleGuardedNavigate(performReturnHome);
  };

  const handleHeaderBrandClick = () => {
    if (route.view === 'instructor') {
      setInstructorExitCounter(prev => prev + 1);
      return;
    }
    handleReturnHome();
  };

  const isStandaloneFile =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { __BACH_STANDALONE__?: boolean })
        .__BACH_STANDALONE__ || window.location.protocol === 'file:'
    );

  return (
    <div className="relative min-h-[100dvh] flex flex-col justify-between selection:bg-stone-800 selection:text-stone-100">
      {/* Subtle Boğaziçi University South Campus Illustration */}
      <BogaziciIllustration />

      {/* Minimal Top-Left "bach" Brand Mark & Standalone HTML Download */}
      <header className="relative z-20 flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4">
        <button
          type="button"
          onClick={handleHeaderBrandClick}
          className="font-serif-art text-lg tracking-wide text-stone-800 hover:text-stone-950 py-1 pr-3 transition-colors cursor-pointer"
        >
          bach
        </button>

        {!isStandaloneFile && (
          <a
            href="./bach.html"
            download="bach.html"
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300/90 bg-[#faf8f4]/90 px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-500 hover:bg-white hover:text-stone-950 shadow-2xs transition-all"
            title="Tüm uygulamayı tek bir bağımsız HTML dosyası olarak indir"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            <span>bach.html indir</span>
          </a>
        )}
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col justify-center">
        {clockSkewNotice && (
          <div className="mx-auto w-full max-w-2xl px-4 pt-2">
            <p className="rounded-xl border border-amber-300/80 bg-amber-50/90 px-3.5 py-2 text-center text-[11px] text-amber-900">
              {clockSkewNotice}
            </p>
          </div>
        )}

        {route.view === 'login' && (
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8 sm:py-12 pb-20 text-center">
            <h1 className="font-serif-art text-3xl sm:text-5xl font-normal tracking-tight text-stone-900 mb-5 sm:mb-6 text-balance">
              hoş geldin canım, sen kimsin?
            </h1>

            <form
              onSubmit={handleIdentitySubmit}
              className="space-y-4"
              autoComplete="off"
            >
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
                <span className="whitespace-nowrap">
                  boğaziçi gençlik merkezi
                </span>
              </div>
            </form>
          </div>
        )}

        {route.view === 'instructor' && (
          <InstructorView
            instructor={
              effectiveDb.instructors.find(i => i.id === route.instructor.id) ||
              route.instructor
            }
            currentWeek={currentWeek}
            selectedWeek={selectedWeek}
            onSelectWeek={setSelectedWeek}
            onActiveCourseChange={setActiveInstructorCourseId}
            attendanceRecords={attendanceRecords}
            unlistedReports={unlistedReports}
            onSaveAttendance={handleSaveAttendance}
            onAddUnlistedStudent={handleAddUnlistedStudent}
            onRemoveUnlistedStudent={handleDeleteUnlistedReport}
            onDeleteCourseSession={handleDeleteCourseSession}
            onBackToLogin={performReturnHome}
            onGuardedNavigate={handleGuardedNavigate}
            conflictNotice={conflictNotice}
            onResolveConflict={handleResolveConflict}
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
            placeboSavePrefs={placeboSavePrefs}
            auditLogs={auditLogs}
            onAddStudent={handleAddStudent}
            onRemoveStudent={handleRemoveStudent}
            onAssignInstructor={handleAssignInstructor}
            onEnrollUnlistedStudent={handleEnrollUnlistedStudent}
            onMarkTemporaryUnlistedStudent={handleMarkTemporaryUnlistedStudent}
            onDeleteUnlistedReport={handleDeleteUnlistedReport}
            onResetZeroAttendance={handleResetZeroPresentAttendance}
            onResetAllAttendance={handleResetAllAttendance}
            canUndoAttendanceReset={lastSoftDeletedAttendanceIds.length > 0}
            onUndoAttendanceReset={handleUndoAttendanceReset}
            onResetAllFeedbacks={handleClearAllFeedbacks}
            canUndoFeedbackReset={lastSoftDeletedFeedbackIds.length > 0}
            onUndoFeedbackReset={handleUndoFeedbackReset}
            onBackToLogin={handleReturnHome}
          />
        )}

        {route.view === 'amadeus' && (
          <AmadeusFeedbackView
            feedbacks={feedbacks}
            onDeleteFeedback={handleDeleteFeedback}
            onClearAllFeedbacks={handleClearAllFeedbacks}
            canUndoFeedbackReset={lastSoftDeletedFeedbackIds.length > 0}
            onUndoFeedbackReset={handleUndoFeedbackReset}
            onBackToLogin={handleReturnHome}
          />
        )}
      </main>

      {/* Anonymous Feedback Button at bottom-left */}
      <FeedbackWidget />

      {/* Fixed Corner Auto-Save & Server Sync Status Indicator (aria-live) */}
      <SaveStatusIndicator
        snapshot={queueSnapshot}
        onRetry={() => {
          void writeQueueRef.current?.retryFailed();
        }}
      />

      {/* In-App Navigation Guard Modal when writes are pending or failed */}
      <NavigationGuardModal
        isOpen={isNavGuardOpen}
        snapshot={queueSnapshot}
        onRetry={() => {
          void writeQueueRef.current?.retryFailed();
        }}
        onForceExit={() => {
          writeQueueRef.current?.discardFailedAndRollback();
          const next = pendingGuardedNavRef.current;
          pendingGuardedNavRef.current = null;
          setIsNavGuardOpen(false);
          if (next) next();
        }}
        onCancel={() => {
          pendingGuardedNavRef.current = null;
          setIsNavGuardOpen(false);
        }}
      />
    </div>
  );
}
