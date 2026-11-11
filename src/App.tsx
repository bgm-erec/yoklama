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
  writeBatch,
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
  buildNotDuplicatePairId,
  buildStudentIdFromName,
  canonicalizeAttendanceRecordIds,
  deduplicateNotDuplicatePairs,
  FeedbackItem,
  getCanonicalStudentName,
  Instructor,
  InstructorAssignmentRecord,
  Modality,
  normalizeName,
  normalizeTurkish,
  NotDuplicatePairRecord,
  PlaceboSavePreferenceRecord,
  reconcileNotDuplicatesOnDelete,
  reconcileNotDuplicatesOnMerge,
  RemovedStudentRecord,
  slugifyTurkish,
  Student,
  STUDENT_ID_ALIAS_MAP,
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
  buildMigrationDryRunReport,
  createMigrationBackupPayload,
  MigrationBackupPayload,
  MigrationUserResolutions,
} from './utils/studentMigration';
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

  // Undo buffers for soft-deleted bulk operations & migration backup
  const [lastSoftDeletedAttendanceIds, setLastSoftDeletedAttendanceIds] =
    useState<string[]>([]);
  const [lastSoftDeletedFeedbackIds, setLastSoftDeletedFeedbackIds] = useState<
    string[]
  >([]);
  const [lastMigrationBackup, setLastMigrationBackup] =
    useState<MigrationBackupPayload | null>(null);
  const [lastIgnoredNotDuplicateIds, setLastIgnoredNotDuplicateIds] = useState<
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
  const [notDuplicatePairs, setNotDuplicatePairs] = useState<
    NotDuplicatePairRecord[]
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
          const rawId = data.id || docSnap.id;
          if (typeof data.name === 'string') {
            const canonicalId = buildStudentIdFromName(data.name);
            if (rawId && canonicalId && rawId !== canonicalId) {
              STUDENT_ID_ALIAS_MAP.set(rawId, canonicalId);
            }
          }
          if (data.deletedAt) return;
          items.push({
            ...(data as Student),
            id: rawId,
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

    const notDuplicatesQuery = query(
      collection(db, 'not_duplicates'),
      where('studentIdA', '>=', '')
    );
    const unsubNotDups = onSnapshot(
      notDuplicatesQuery,
      { includeMetadataChanges: true },
      snapshot => {
        const items: NotDuplicatePairRecord[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data.deletedAt) return;
          const pair = buildNotDuplicatePairId(
            String(data.studentIdA || ''),
            String(data.studentIdB || '')
          );
          if (!pair) return;
          items.push({
            id: pair.id,
            studentIdA: pair.studentIdA,
            studentIdB: pair.studentIdB,
            createdAt: formatFirestoreTimestamp(
              data.createdAt,
              data.createdAtIso
            ),
            note: typeof data.note === 'string' ? data.note : undefined,
          });
        });
        setNotDuplicatePairs(deduplicateNotDuplicatePairs(items));
      },
      error => {
        console.error('not_duplicates dinleme hatası:', error);
      }
    );

    return () => {
      unsubCustom();
      unsubRemoved();
      unsubAssign();
      unsubNotDups();
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
            const record: AttendanceRecord = canonicalizeAttendanceRecordIds({
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
            remoteRecords.push(
              canonicalizeAttendanceRecordIds({
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
              })
            );
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

    const canonicalName = normalizeName(student.name);
    const canonicalId = buildStudentIdFromName(canonicalName);
    const baseMatch = BASE_DB.students.find(s => s.id === canonicalId);
    const existingCustomMatch = customStudents.find(
      s => buildStudentIdFromName(s.name) === canonicalId || s.id === canonicalId
    );

    const mergedCourses = Array.from(
      new Set([
        ...(baseMatch?.enrolledCourseIds || []),
        ...(existingCustomMatch?.enrolledCourseIds || []),
        ...(student.enrolledCourseIds || []),
      ])
    );

    const canonicalStudent: Student = {
      ...student,
      id: canonicalId,
      name: canonicalName,
      grade: normalizeTurkish(
        student.grade || existingCustomMatch?.grade || baseMatch?.grade || '5. sınıf'
      ),
      modality:
        student.modality || existingCustomMatch?.modality || baseMatch?.modality || 'online',
      enrolledCourseIds: mergedCourses,
      addedAtWeek: Math.min(
        student.addedAtWeek || currentWeek,
        existingCustomMatch?.addedAtWeek || currentWeek,
        baseMatch ? 1 : currentWeek
      ),
      addedAt:
        existingCustomMatch?.addedAt ||
        student.addedAt ||
        new Date().toISOString(),
      deletedAt: null,
    };

    setRemovedStudentIds(prev => prev.filter(id => id !== canonicalId));
    setCustomStudents(prev => {
      const withoutOld = prev.filter(
        s => s.id !== canonicalId && buildStudentIdFromName(s.name) !== canonicalId
      );
      return [...withoutOld, canonicalStudent];
    });

    await writeQueueRef.current!.enqueueImmediate({
      key: `student_add_${canonicalId}`,
      label: 'Öğrenci Ekle',
      rollback: () => {
        setCustomStudents(prevCustom);
        setRemovedStudentIds(prevRemoved);
      },
      execute: async () => {
        const nowIso = new Date().toISOString();
        const docRef = doc(db, 'custom_students', canonicalId);
        const isOnline =
          typeof navigator !== 'undefined' ? navigator.onLine : true;

        try {
          if (isOnline) {
            // Requirement 2: Firestore transaction on stu-<slug> so even if two devices add the same student concurrently, a single merged document is written
            await runTransaction(db, async tx => {
              const serverSnap = await tx.get(docRef);
              let finalCourses = [...mergedCourses];
              let finalAddedAtWeek = canonicalStudent.addedAtWeek || currentWeek;
              let finalAddedAtIso = canonicalStudent.addedAt || nowIso;
              let finalGrade = canonicalStudent.grade;
              let finalModality = canonicalStudent.modality;

              if (serverSnap.exists()) {
                const srv = serverSnap.data();
                if (!srv.deletedAt) {
                  const srvCourses = Array.isArray(srv.enrolledCourseIds)
                    ? (srv.enrolledCourseIds as string[])
                    : [];
                  finalCourses = Array.from(
                    new Set([...srvCourses, ...finalCourses])
                  );
                  if (typeof srv.addedAtWeek === 'number') {
                    finalAddedAtWeek = Math.min(finalAddedAtWeek, srv.addedAtWeek);
                  }
                  const srvIso = formatFirestoreTimestamp(
                    srv.addedAt,
                    srv.addedAtIso
                  );
                  if (srvIso && srvIso < finalAddedAtIso) {
                    finalAddedAtIso = srvIso;
                  }
                  if (srv.grade && !student.grade) {
                    finalGrade = normalizeTurkish(srv.grade);
                  }
                  if (srv.modality && !student.modality) {
                    finalModality = srv.modality as Modality;
                  }
                }
              }

              tx.set(docRef, {
                id: canonicalId,
                name: canonicalName,
                grade: finalGrade,
                modality: finalModality,
                enrolledCourseIds: finalCourses,
                addedAtWeek: finalAddedAtWeek,
                addedAt: serverTimestamp(),
                addedAtIso: finalAddedAtIso,
                deletedAt: null,
              });
            });
          } else {
            await setDoc(docRef, {
              id: canonicalId,
              name: canonicalName,
              grade: canonicalStudent.grade,
              modality: canonicalStudent.modality,
              enrolledCourseIds: canonicalStudent.enrolledCourseIds,
              addedAtWeek: canonicalStudent.addedAtWeek || currentWeek,
              addedAt: serverTimestamp(),
              addedAtIso: canonicalStudent.addedAt || nowIso,
              deletedAt: null,
            });
          }

          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'ogrenci_ekle',
            target: canonicalId,
            details: `${canonicalName} (${canonicalStudent.grade}) [${canonicalId}] sisteme eklendi/güncellendi.`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `custom_students/${canonicalId}`
          );
        }
      },
    });
  };

  const handleRemoveStudent = async (student: Student) => {
    const prevCustom = [...customStudents];
    const prevRemoved = [...removedStudentIds];
    const prevNotDups = [...notDuplicatePairs];
    const isBaseStudent = BASE_DB.students.some(s => s.id === student.id);

    const notDupCleanup = reconcileNotDuplicatesOnDelete(
      notDuplicatePairs,
      student.id
    );

    if (isBaseStudent) {
      setRemovedStudentIds(prev =>
        prev.includes(student.id) ? prev : [...prev, student.id]
      );
    }
    setCustomStudents(prev => prev.filter(s => s.id !== student.id));
    setNotDuplicatePairs(notDupCleanup.nextPairs);

    await writeQueueRef.current!.enqueueImmediate({
      key: `student_remove_${student.id}`,
      label: 'Öğrenci Kaldır',
      rollback: () => {
        setCustomStudents(prevCustom);
        setRemovedStudentIds(prevRemoved);
        setNotDuplicatePairs(prevNotDups);
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
          if (notDupCleanup.toDeleteIds.length > 0) {
            await Promise.all(
              notDupCleanup.toDeleteIds.map(pairId =>
                deleteDoc(doc(db, 'not_duplicates', pairId))
              )
            );
          }
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'ogrenci_kaldir',
            target: student.id,
            details: `${student.name} (${student.id}) sistemden kaldırıldı (soft delete${
              notDupCleanup.toDeleteIds.length > 0
                ? `, ${notDupCleanup.toDeleteIds.length} yoksayma kaydı temizlendi`
                : ''
            }).`,
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

  const handleMarkNotDuplicatePairs = async (
    rawPairs: Array<{ studentId1: string; studentId2: string; note?: string }>
  ): Promise<string[]> => {
    const nowIso = new Date().toISOString();
    const validRecords: NotDuplicatePairRecord[] = [];
    for (const item of rawPairs) {
      const built = buildNotDuplicatePairId(item.studentId1, item.studentId2);
      if (!built) continue;
      validRecords.push({
        id: built.id,
        studentIdA: built.studentIdA,
        studentIdB: built.studentIdB,
        createdAt: nowIso,
        ...(item.note ? { note: item.note } : {}),
      });
    }
    const dedupedNew = deduplicateNotDuplicatePairs(validRecords);
    if (dedupedNew.length === 0) return [];

    const prevNotDups = [...notDuplicatePairs];
    const addedIds = dedupedNew.map(r => r.id);

    setNotDuplicatePairs(prev =>
      deduplicateNotDuplicatePairs([...prev, ...dedupedNew])
    );
    setLastIgnoredNotDuplicateIds(addedIds);

    await writeQueueRef.current!.enqueueImmediate({
      key: `not_duplicates_add_${addedIds.join('_')}`,
      label: 'Farklı Kişiler Olarak İşaretle',
      rollback: () => {
        setNotDuplicatePairs(prevNotDups);
      },
      execute: async () => {
        const isOnline =
          typeof navigator !== 'undefined' ? navigator.onLine : true;
        try {
          if (isOnline && dedupedNew.length === 1) {
            const rec = dedupedNew[0];
            const docRef = doc(db, 'not_duplicates', rec.id);
            await runTransaction(db, async tx => {
              const snap = await tx.get(docRef);
              const existingCreatedAtIso = snap.exists()
                ? formatFirestoreTimestamp(
                    snap.data().createdAt,
                    snap.data().createdAtIso
                  )
                : rec.createdAt;
              tx.set(docRef, {
                studentIdA: rec.studentIdA,
                studentIdB: rec.studentIdB,
                createdAt: serverTimestamp(),
                createdAtIso: existingCreatedAtIso || nowIso,
                ...(rec.note ? { note: rec.note } : {}),
              });
            });
          } else {
            const batch = writeBatch(db);
            for (const rec of dedupedNew) {
              batch.set(doc(db, 'not_duplicates', rec.id), {
                studentIdA: rec.studentIdA,
                studentIdB: rec.studentIdB,
                createdAt: serverTimestamp(),
                createdAtIso: rec.createdAt || nowIso,
                ...(rec.note ? { note: rec.note } : {}),
              });
            }
            await batch.commit();
          }

          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'farkli_kisiler_yoksay',
            target: addedIds.join(','),
            details: `${dedupedNew
              .map(r => `${r.studentIdA} ↔ ${r.studentIdB}`)
              .join(', ')} farklı kişiler olarak işaretlendi (not_duplicates).`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `not_duplicates/${addedIds[0]}`
          );
        }
      },
    });

    return addedIds;
  };

  const handleRemoveNotDuplicatePair = async (pairId: string) => {
    const prevNotDups = [...notDuplicatePairs];
    setNotDuplicatePairs(prev => prev.filter(p => p.id !== pairId));
    setLastIgnoredNotDuplicateIds(prev => prev.filter(id => id !== pairId));

    await writeQueueRef.current!.enqueueImmediate({
      key: `not_duplicates_del_${pairId}`,
      label: 'Benzerlik Yoksaymayı Kaldır',
      rollback: () => setNotDuplicatePairs(prevNotDups),
      execute: async () => {
        try {
          await deleteDoc(doc(db, 'not_duplicates', pairId));
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'farkli_kisiler_yoksay_kaldir',
            target: pairId,
            details: `${pairId} çifti için benzer isim yoksayması kaldırıldı.`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.DELETE,
            `not_duplicates/${pairId}`
          );
        }
      },
    });
  };

  const handleUndoLastNotDuplicatePairs = async () => {
    if (lastIgnoredNotDuplicateIds.length === 0) return;
    const idsToRemove = [...lastIgnoredNotDuplicateIds];
    const prevNotDups = [...notDuplicatePairs];

    setNotDuplicatePairs(prev =>
      prev.filter(p => !idsToRemove.includes(p.id))
    );
    setLastIgnoredNotDuplicateIds([]);

    await writeQueueRef.current!.enqueueImmediate({
      key: `not_duplicates_undo_${idsToRemove.join('_')}`,
      label: 'Yoksaymayı Geri Al',
      rollback: () => setNotDuplicatePairs(prevNotDups),
      execute: async () => {
        try {
          await Promise.all(
            idsToRemove.map(id => deleteDoc(doc(db, 'not_duplicates', id)))
          );
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'farkli_kisiler_yoksay_geri_al',
            target: idsToRemove.join(','),
            details: `${idsToRemove.join(', ')} yoksayma işlemi geri alındı.`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.DELETE,
            `not_duplicates/${idsToRemove[0]}`
          );
        }
      },
    });
  };

  const handleReconcileNotDuplicatesForMerge = async (
    fromStudentId: string,
    intoStudentId: string
  ) => {
    const nowIso = new Date().toISOString();
    const reconciled = reconcileNotDuplicatesOnMerge(
      notDuplicatePairs,
      fromStudentId,
      intoStudentId,
      nowIso
    );
    if (
      reconciled.toDeleteIds.length === 0 &&
      reconciled.toUpsert.length === 0
    ) {
      return;
    }

    const prevNotDups = [...notDuplicatePairs];
    setNotDuplicatePairs(reconciled.nextPairs);

    await writeQueueRef.current!.enqueueImmediate({
      key: `not_duplicates_reconcile_${fromStudentId}_${intoStudentId}`,
      label: 'Yoksayma Kayıtlarını Birleştirilen Kimliğe Taşı',
      rollback: () => setNotDuplicatePairs(prevNotDups),
      execute: async () => {
        try {
          const batch = writeBatch(db);
          for (const delId of reconciled.toDeleteIds) {
            batch.delete(doc(db, 'not_duplicates', delId));
          }
          for (const upsertRec of reconciled.toUpsert) {
            batch.set(doc(db, 'not_duplicates', upsertRec.id), {
              studentIdA: upsertRec.studentIdA,
              studentIdB: upsertRec.studentIdB,
              createdAt: serverTimestamp(),
              createdAtIso: upsertRec.createdAt || nowIso,
              ...(upsertRec.note ? { note: upsertRec.note } : {}),
            });
          }
          await batch.commit();
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `not_duplicates/${intoStudentId}`
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
    report: UnlistedStudentReport,
    overrideStudentName?: string
  ): Promise<string> => {
    const course = effectiveDb.courses.find(c => c.id === report.courseId);
    const courseTitle = course ? course.title : report.courseId;
    const canonicalName = getCanonicalStudentName(
      overrideStudentName || report.studentName
    );
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
        id: buildStudentIdFromName(existingStudent.name),
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
      noticeMessage = `"${targetStudent.name}" için yeni öğrenci kaydı (${targetStudent.id}) oluşturuldu ve şimdilik sadece ${courseTitle} dersine kaydedildi.`;
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
      studentName: targetStudent.name,
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

  const handleDownloadMigrationBackup = () => {
    const backup = createMigrationBackupPayload({
      baseStudents: BASE_DB.students,
      customStudents,
      removedStudents: removedStudentIds.map(id => ({
        studentId: id,
        name: id,
        removedAt: new Date().toISOString(),
      })),
      unlistedReports,
      attendanceRecords,
      instructorAssignments,
      notDuplicatePairs,
    });
    setLastMigrationBackup(backup);
    triggerJsonBackupDownload('ogrenci-birlestirme-tam-yedek', backup);
  };

  const handleExecuteStudentMigration = async (
    resolutions: MigrationUserResolutions
  ): Promise<string> => {
    const nowIso = new Date().toISOString();
    const backup = createMigrationBackupPayload(
      {
        baseStudents: BASE_DB.students,
        customStudents,
        removedStudents: removedStudentIds.map(id => ({
          studentId: id,
          name: id,
          removedAt: nowIso,
        })),
        unlistedReports,
        attendanceRecords,
        instructorAssignments,
        notDuplicatePairs,
      },
      nowIso
    );
    setLastMigrationBackup(backup);
    triggerJsonBackupDownload('ogrenci-birlestirme-oncesi', backup);

    const report = buildMigrationDryRunReport(
      {
        baseStudents: BASE_DB.students,
        customStudents,
        unlistedReports,
        attendanceRecords,
        courses: effectiveDb.courses,
        notDuplicatePairs,
      },
      resolutions,
      nowIso
    );

    if (report.isAlreadyClean) {
      return 'Tüm öğrenci kimlikleri zaten birleştirilmiş durumda (idempotent kontrol: yapılacak değişiklik yok).';
    }

    // Reconcile any not_duplicates pairs when students are merged
    let nextNotDups = [...notDuplicatePairs];
    const notDupIdsToDelete = new Set<string>();
    const notDupRecordsToUpsert = new Map<string, NotDuplicatePairRecord>();

    const applyMergeOnNotDups = (fromId: string, intoId: string) => {
      const rec = reconcileNotDuplicatesOnMerge(
        nextNotDups,
        fromId,
        intoId,
        nowIso
      );
      nextNotDups = rec.nextPairs;
      for (const dId of rec.toDeleteIds) {
        notDupIdsToDelete.add(dId);
        notDupRecordsToUpsert.delete(dId);
      }
      for (const uRec of rec.toUpsert) {
        notDupIdsToDelete.delete(uRec.id);
        notDupRecordsToUpsert.set(uRec.id, uRec);
      }
    };

    for (const group of report.groupsToMigrate) {
      for (const rec of group.activeRecords) {
        if (rec.id !== group.targetId) {
          applyMergeOnNotDups(rec.id, group.targetId);
        }
        if (rec.docId !== group.targetId) {
          applyMergeOnNotDups(rec.docId, group.targetId);
        }
      }
    }
    if (resolutions.confirmedTypoMerges) {
      for (const tm of resolutions.confirmedTypoMerges) {
        applyMergeOnNotDups(tm.fromStudentId, tm.intoStudentId);
      }
    }

    setNotDuplicatePairs(nextNotDups);

    await writeQueueRef.current!.enqueueImmediate({
      key: 'student_identity_migration_batch',
      label: 'Öğrenci Kimliklerini Birleştir',
      execute: async () => {
        try {
          const batch = writeBatch(db);

          for (const group of report.groupsToMigrate) {
            const resolvedName =
              resolutions.nameByTargetId?.[group.targetId] ||
              group.normalizedName;
            const resolvedGrade =
              resolutions.gradeByTargetId?.[group.targetId] ||
              group.defaultGrade;
            const resolvedModality =
              resolutions.modalityByTargetId?.[group.targetId] ||
              group.defaultModality;

            if (group.needsCustomUpsert) {
              batch.set(doc(db, 'custom_students', group.targetId), {
                id: group.targetId,
                name: resolvedName,
                grade: resolvedGrade,
                modality: resolvedModality,
                enrolledCourseIds: group.mergedCourseIds,
                addedAtWeek: group.minAddedAtWeek,
                addedAt: serverTimestamp(),
                addedAtIso: group.earliestAddedAt,
                deletedAt: null,
              });
            }

            for (const dupId of group.duplicateCustomDocIdsToSoftDelete) {
              const oldRec = customStudents.find(c => c.id === dupId);
              if (oldRec) {
                batch.set(doc(db, 'custom_students', dupId), {
                  id: oldRec.id,
                  name: oldRec.name,
                  grade: oldRec.grade,
                  modality: oldRec.modality,
                  enrolledCourseIds: oldRec.enrolledCourseIds,
                  addedAtWeek: oldRec.addedAtWeek || 1,
                  addedAt: oldRec.addedAt || nowIso,
                  addedAtIso: oldRec.addedAt || nowIso,
                  deletedAt: serverTimestamp(),
                  deletedAtIso: nowIso,
                });
              }
            }
          }

          for (const uRedir of report.unlistedRedirects) {
            const orig = unlistedReports.find(u => u.id === uRedir.docId);
            if (orig) {
              batch.set(doc(db, 'unlisted_students', orig.id), {
                id: orig.id,
                studentName: uRedir.normalizedName,
                courseId: orig.courseId,
                instructorId: orig.instructorId,
                instructorName: orig.instructorName,
                weekNumber: orig.weekNumber,
                sessionType: orig.sessionType,
                status: orig.status,
                resolvedStudentId: uRedir.afterResolvedId,
                resolvedExistingStudent: Boolean(orig.resolvedExistingStudent),
                createdAt: orig.createdAt,
                createdAtIso: orig.createdAt,
                resolvedAt: orig.resolvedAt || nowIso,
                resolvedAtIso: orig.resolvedAt || nowIso,
                deletedAt: null,
              });
            }
          }

          for (const aRedir of report.attendanceRedirects) {
            const orig = attendanceRecords.find(a => a.id === aRedir.docId);
            if (orig) {
              batch.set(doc(db, 'attendance', aRedir.docId), {
                courseId: orig.courseId,
                instructorId: orig.instructorId,
                weekNumber: orig.weekNumber,
                sessionType: orig.sessionType,
                absentStudentIds: aRedir.afterAbsentIds,
                didNotHoldClass: orig.didNotHoldClass,
                updatedAt: serverTimestamp(),
                updatedAtIso: nowIso,
                version: (orig.version || 1) + 1,
                updatedBySessionId: CLIENT_SESSION_ID,
                deletedAt: null,
              });
            }
          }

          for (const delPairId of notDupIdsToDelete) {
            batch.delete(doc(db, 'not_duplicates', delPairId));
          }
          for (const upsertPair of notDupRecordsToUpsert.values()) {
            batch.set(doc(db, 'not_duplicates', upsertPair.id), {
              studentIdA: upsertPair.studentIdA,
              studentIdB: upsertPair.studentIdB,
              createdAt: serverTimestamp(),
              createdAtIso: upsertPair.createdAt || nowIso,
              ...(upsertPair.note ? { note: upsertPair.note } : {}),
            });
          }

          await batch.commit();

          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'ogrenci_kimlik_migrasyonu',
            target: 'custom_students,unlisted_students,attendance,not_duplicates',
            details: `${report.groupsToMigrate.length} öğrenci grubu stu-<slug> kimliğinde birleştirildi (${report.totalCustomDocsToSoftDelete} tekrar belge soft-delete, ${report.totalUnlistedDocsToUpdate} liste dışı ve ${report.totalAttendanceDocsToUpdate} yoklama referansı güncellendi).`,
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            'student_identity_migration'
          );
        }
      },
    });

    return `Birleştirme tamamlandı: ${report.groupsToMigrate.length} öğrenci grubu stu-<slug> kimliğinde birleştirildi, ${report.totalCustomDocsToSoftDelete} tekrar belge soft-delete edildi, ${report.totalUnlistedDocsToUpdate} liste dışı ve ${report.totalAttendanceDocsToUpdate} yoklama kaydı güncellendi.`;
  };

  const handleUndoStudentMigration = async () => {
    if (!lastMigrationBackup) return;
    const backup = lastMigrationBackup;
    setLastMigrationBackup(null);

    await writeQueueRef.current!.enqueueImmediate({
      key: 'undo_student_identity_migration',
      label: 'Kimlik Birleştirmeyi Geri Al',
      execute: async () => {
        try {
          const batch = writeBatch(db);
          for (const c of backup.data.customStudents) {
            batch.set(doc(db, 'custom_students', c.id), {
              id: c.id,
              name: c.name,
              grade: c.grade,
              modality: c.modality,
              enrolledCourseIds: c.enrolledCourseIds,
              addedAtWeek: c.addedAtWeek || 1,
              addedAt: c.addedAt,
              addedAtIso: c.addedAt,
              deletedAt: c.deletedAt || null,
            });
          }
          for (const u of backup.data.unlistedReports) {
            batch.set(doc(db, 'unlisted_students', u.id), {
              id: u.id,
              studentName: u.studentName,
              courseId: u.courseId,
              instructorId: u.instructorId,
              instructorName: u.instructorName,
              weekNumber: u.weekNumber,
              sessionType: u.sessionType,
              status: u.status,
              resolvedStudentId: u.resolvedStudentId || null,
              resolvedExistingStudent: Boolean(u.resolvedExistingStudent),
              createdAt: u.createdAt,
              createdAtIso: u.createdAt,
              resolvedAt: u.resolvedAt || null,
              resolvedAtIso: u.resolvedAt || null,
              deletedAt: u.deletedAt || null,
            });
          }
          if (backup.data.notDuplicatePairs) {
            for (const p of backup.data.notDuplicatePairs) {
              batch.set(doc(db, 'not_duplicates', p.id), {
                studentIdA: p.studentIdA,
                studentIdB: p.studentIdB,
                createdAt: p.createdAt,
                createdAtIso: p.createdAt,
                ...(p.note ? { note: p.note } : {}),
              });
            }
          }
          await batch.commit();
          void writeAuditLog({
            actor: 'sibelius (ekip)',
            action: 'ogrenci_migrasyon_geri_al',
            target: 'custom_students,unlisted_students',
            details: 'Öğrenci kimlik birleştirme işlemi yedekten geri yüklendi.',
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            'undo_student_identity_migration'
          );
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
            allStudents={effectiveDb.students}
            allCourses={effectiveDb.courses}
            attendanceRecords={attendanceRecords}
            unlistedReports={unlistedReports}
            notDuplicatePairs={notDuplicatePairs}
            onSaveAttendance={handleSaveAttendance}
            onAddStudent={handleAddStudent}
            onAddUnlistedStudent={handleAddUnlistedStudent}
            onRemoveUnlistedStudent={handleDeleteUnlistedReport}
            onMarkNotDuplicatePairs={handleMarkNotDuplicatePairs}
            onUndoLastNotDuplicate={handleUndoLastNotDuplicatePairs}
            onReconcileNotDuplicatesOnMerge={handleReconcileNotDuplicatesForMerge}
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
            rawCustomStudents={customStudents}
            courses={effectiveDb.courses}
            instructors={effectiveDb.instructors}
            attendanceRecords={attendanceRecords}
            unlistedReports={unlistedReports}
            notDuplicatePairs={notDuplicatePairs}
            placeboSavePrefs={placeboSavePrefs}
            auditLogs={auditLogs}
            onAddStudent={handleAddStudent}
            onRemoveStudent={handleRemoveStudent}
            onAssignInstructor={handleAssignInstructor}
            onEnrollUnlistedStudent={handleEnrollUnlistedStudent}
            onMarkTemporaryUnlistedStudent={handleMarkTemporaryUnlistedStudent}
            onDeleteUnlistedReport={handleDeleteUnlistedReport}
            onMarkNotDuplicatePairs={handleMarkNotDuplicatePairs}
            onRemoveNotDuplicatePair={handleRemoveNotDuplicatePair}
            canUndoNotDuplicate={lastIgnoredNotDuplicateIds.length > 0}
            onUndoLastNotDuplicate={handleUndoLastNotDuplicatePairs}
            onReconcileNotDuplicatesOnMerge={handleReconcileNotDuplicatesForMerge}
            onDownloadMigrationBackup={handleDownloadMigrationBackup}
            onExecuteStudentMigration={handleExecuteStudentMigration}
            canUndoMigration={Boolean(lastMigrationBackup)}
            onUndoMigration={handleUndoStudentMigration}
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
