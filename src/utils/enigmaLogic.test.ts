import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveIdentityInput,
  getCurrentWeekNumber,
  computeAbsentDifferenceSet,
  isStudentResponsibleForSession,
  createNewStudentRecord,
  findMatchingStudentByFullName,
  isMelekYilmazInstructor,
  MELEK_YILMAZ_REASSURANCE_MESSAGE,
  getInstructorDisplayFirstName,
  getInstructorReassuranceMessage,
  getPlaceboSavePreference,
  setPlaceboSavePreferenceInMap,
  computeActivePlaceboSaveUsers,
  shouldPromptEmptyExit,
  resolveExitPromptDecision,
  isZeroPresentAttendanceRecord,
  getZeroPresentAttendanceRecords,
  buildAttendanceDocId,
  buildCoordinatorDocId,
  cleanCoordinatorNames,
  detectConcurrentAttendanceConflict,
  findSimilarStudentsByName,
  getWeekWeekendDates,
  isYuzyuzeHolidayWeek,
  shouldShowOnlineWeek5ThankYou,
  shouldShowYuzyuzeHolidayMessage,
} from './enigmaLogic';
import {
  AttendanceRecord,
  buildNotDuplicatePairId,
  buildStudentIdFromName,
  canonicalizeAttendanceRecordIds,
  DB,
  deduplicateNotDuplicatePairs,
  isPairIgnoredAsNotDuplicate,
  isPlaceholderStudentName,
  normalizeName,
  NotDuplicatePairRecord,
  reconcileNotDuplicatesOnDelete,
  reconcileNotDuplicatesOnMerge,
  slugifyTurkish,
  STUDENT_ID_ALIAS_MAP,
  syncDatabaseMutations,
} from '../data/database';
import {
  applyMigrationPlanInMemory,
  buildMigrationDryRunReport,
  createMigrationBackupPayload,
} from './studentMigration';
import { WriteQueueController } from './writeQueue';
import { setServerClockOffsetMs } from '../config/academicConfig';

test('sibelius resolves to admin', () => {
  const res = resolveIdentityInput('Sibelius');
  assert.equal(res.type, 'admin');
});

test('amadeus resolves to feedback_admin', () => {
  const res = resolveIdentityInput('AMADEUS');
  assert.equal(res.type, 'feedback_admin');
});

test('bos1, bos2, bos3, bos4 resolve to unassigned online courses in ascending grade order', () => {
  const b1 = resolveIdentityInput('bos1');
  assert.equal(b1.type, 'instructor');
  if (b1.type === 'instructor') {
    assert.deepEqual(b1.instructor.courseIds, ['online-5a-tur']);
  }

  const b2 = resolveIdentityInput('bos2');
  assert.equal(b2.type, 'instructor');
  if (b2.type === 'instructor') {
    assert.deepEqual(b2.instructor.courseIds, ['online-7a-ing']);
  }

  const b3 = resolveIdentityInput('bos3');
  assert.equal(b3.type, 'instructor');
  if (b3.type === 'instructor') {
    assert.deepEqual(b3.instructor.courseIds, ['online-8a-sos']);
  }

  const b4 = resolveIdentityInput('bos4');
  assert.equal(b4.type, 'instructor');
  if (b4.type === 'instructor') {
    assert.deepEqual(b4.instructor.courseIds, ['online-tyt-tur']);
  }
});

test('shared first names trigger surname prompt warning', () => {
  const zehra = resolveIdentityInput('zehra');
  assert.equal(zehra.type, 'need_surname');
  if (zehra.type === 'need_surname') {
    assert.ok(zehra.candidates.length >= 3);
  }

  const elif = resolveIdentityInput('Elif');
  assert.equal(elif.type, 'need_surname');

  const kaan = resolveIdentityInput('kaan');
  assert.equal(kaan.type, 'need_surname');
});

test('full name and middle+last name after surname warning resolve to exact instructor', () => {
  const zehraUgur = resolveIdentityInput('zehra uğur');
  assert.equal(zehraUgur.type, 'instructor');
  if (zehraUgur.type === 'instructor') {
    assert.equal(zehraUgur.instructor.name, 'zehra uğur');
  }

  const elifDede = resolveIdentityInput('Elif Dede');
  assert.equal(elifDede.type, 'instructor');
  if (elifDede.type === 'instructor') {
    assert.equal(elifDede.instructor.name, 'elif büşra dede');
  }

  // Middle + last name resolution for 3-word instructors
  const busraDede = resolveIdentityInput('büşra dede');
  assert.equal(busraDede.type, 'instructor');
  if (busraDede.type === 'instructor') {
    assert.equal(busraDede.instructor.name, 'elif büşra dede');
  }

  const rabiaTirek = resolveIdentityInput('rabia tirek');
  assert.equal(rabiaTirek.type, 'instructor');
  if (rabiaTirek.type === 'instructor') {
    assert.equal(rabiaTirek.instructor.name, 'elif rabia tirek');
  }

  const nisaAkdogan = resolveIdentityInput('nisa akdoğan');
  assert.equal(nisaAkdogan.type, 'instructor');
  if (nisaAkdogan.type === 'instructor') {
    assert.equal(nisaAkdogan.instructor.name, 'fatma nisa akdoğan');
  }

  const zehraNamli = resolveIdentityInput('zehra namlı');
  assert.equal(zehraNamli.type, 'instructor');
  if (zehraNamli.type === 'instructor') {
    assert.equal(zehraNamli.instructor.name, 'fatma zehra namlı');
  }

  const emreSahin = resolveIdentityInput('emre şahin');
  assert.equal(emreSahin.type, 'instructor');
  if (emreSahin.type === 'instructor') {
    assert.equal(emreSahin.instructor.name, 'hüseyin emre şahin');
  }

  // Compound name busenur uçar resolves when typed as 'buse' or 'buse nur uçar'
  const buseShort = resolveIdentityInput('buse');
  assert.equal(buseShort.type, 'instructor');
  if (buseShort.type === 'instructor') {
    assert.equal(buseShort.instructor.name, 'busenur uçar');
  }

  const buseSpaced = resolveIdentityInput('buse nur uçar');
  assert.equal(buseSpaced.type, 'instructor');
  if (buseSpaced.type === 'instructor') {
    assert.equal(buseSpaced.instructor.name, 'busenur uçar');
  }
});

test('unique first name resolves directly without needing surname', () => {
  const cagdas = resolveIdentityInput('çağdaş');
  assert.equal(cagdas.type, 'instructor');
  if (cagdas.type === 'instructor') {
    assert.equal(cagdas.instructor.name, 'çağdaş şahin');
  }
});

test('yüz yüze classes contain union of all students in that grade section', () => {
  const yy6aMat = DB.courses.find(c => c.id === 'yy-6a-mat');
  const yy6aSos = DB.courses.find(c => c.id === 'yy-6a-sos');
  assert.ok(yy6aMat && yy6aSos);
  assert.equal(yy6aMat.studentIds.length, 13);
  assert.equal(yy6aSos.studentIds.length, 13);
});

test('week calculation increments every Monday', () => {
  const w1Wed = new Date(2026, 9, 21, 10, 0, 0); // Oct 21, 2026
  const w2Mon = new Date(2026, 9, 26, 0, 1, 0);  // Oct 26, 2026 (Monday)
  const w2Wed = new Date(2026, 9, 28, 7, 39, 0); // Oct 28, 2026
  const w3Mon = new Date(2026, 10, 2, 9, 0, 0);  // Nov 2, 2026 (Monday)

  assert.equal(getCurrentWeekNumber(w1Wed), 1);
  assert.equal(getCurrentWeekNumber(w2Mon), 2);
  assert.equal(getCurrentWeekNumber(w2Wed), 2);
  assert.equal(getCurrentWeekNumber(w3Mon), 3);
});

test('computeAbsentDifferenceSet returns exact difference set (all minus present)', () => {
  const courseStudents = ['stu-a', 'stu-b', 'stu-c', 'stu-d'];
  const presentStudents = ['stu-a', 'stu-c'];
  const absentDiff = computeAbsentDifferenceSet(courseStudents, presentStudents);
  assert.deepEqual(absentDiff, ['stu-b', 'stu-d']);
});

test('isStudentResponsibleForSession excludes sessions prior to student addition', () => {
  const newStudent = createNewStudentRecord({
    rawName: 'Deniz Yılmaz',
    modality: 'online',
    gradeLabel: '5. sınıf',
    enrolledCourseIds: ['online-5a-mat'],
    currentWeek: 2,
    nowIso: '2026-10-28T12:00:00.000Z',
  });

  // Week 1 session -> NOT responsible
  assert.equal(
    isStudentResponsibleForSession(newStudent, {
      courseId: 'online-5a-mat',
      weekNumber: 1,
      updatedAt: '2026-10-21T10:00:00.000Z',
      didNotHoldClass: false,
    }),
    false
  );

  // Week 2 session recorded BEFORE student was added -> NOT responsible
  assert.equal(
    isStudentResponsibleForSession(newStudent, {
      courseId: 'online-5a-mat',
      weekNumber: 2,
      updatedAt: '2026-10-28T09:00:00.000Z',
      didNotHoldClass: false,
    }),
    false
  );

  // Week 2 session recorded AFTER student was added -> RESPONSIBLE
  assert.equal(
    isStudentResponsibleForSession(newStudent, {
      courseId: 'online-5a-mat',
      weekNumber: 2,
      updatedAt: '2026-10-28T15:00:00.000Z',
      didNotHoldClass: false,
    }),
    true
  );
});

test('syncDatabaseMutations dynamically adds, removes, and updates student course enrollments with deterministic stu-<slug> ID', () => {
  const newSt = createNewStudentRecord({
    rawName: 'Canan Ersoy',
    modality: 'yuzyuze',
    gradeLabel: '5. sınıf',
    enrolledCourseIds: ['yy-5a-mat', 'yy-5a-tur'],
    currentWeek: 2,
    nowIso: '2026-10-28T12:00:00.000Z',
  });

  assert.equal(newSt.id, 'stu-canan-ersoy');

  const mutated = syncDatabaseMutations([newSt], []);
  assert.ok(mutated.students.some(s => s.id === 'stu-canan-ersoy'));
  const yy5aMat = mutated.courses.find(c => c.id === 'yy-5a-mat');
  assert.ok(yy5aMat?.studentIds.includes('stu-canan-ersoy'));

  // Verify Murat Yüksek is only in 6/a courses and not 5/a courses
  const murat = mutated.students.find(s => s.name === 'murat yüksek');
  assert.ok(murat);
  assert.equal(yy5aMat?.studentIds.includes(murat.id), false);
  const yy6aMat = mutated.courses.find(c => c.id === 'yy-6a-mat');
  assert.equal(yy6aMat?.studentIds.includes(murat.id), true);

  // Now remove Canan Ersoy
  const afterRemove = syncDatabaseMutations([newSt], [newSt.id]);
  assert.ok(!afterRemove.students.some(s => s.id === newSt.id));
  const yy5aMatAfter = afterRemove.courses.find(c => c.id === 'yy-5a-mat');
  assert.ok(!yy5aMatAfter?.studentIds.includes(newSt.id));

  // Reset DB back to clean state
  syncDatabaseMutations([], []);
});

test('syncDatabaseMutations assigns new instructor to bos1 and dynamically updates real instructor and course counts', () => {
  const initial = syncDatabaseMutations([], [], []);
  const initialRealInstructors = initial.instructors.filter(i => !/^bos\d+$/.test(i.name)).length;
  const initialCourseCount = initial.courses.length;
  assert.equal(initialRealInstructors, 80);
  assert.equal(initialCourseCount, 86);

  // 1. Assign 'selim kaya' to online-5a-tur (which was bos1)
  const afterBosAssign = syncDatabaseMutations(
    [],
    [],
    [{ courseId: 'online-5a-tur', instructorName: 'Selim Kaya', updatedAt: '2026-10-28T13:00:00.000Z' }]
  );

  const course5aTur = afterBosAssign.courses.find(c => c.id === 'online-5a-tur');
  assert.equal(course5aTur?.instructorName, 'selim kaya');
  assert.ok(!afterBosAssign.instructors.some(i => i.name === 'bos1'));
  // Real instructor count dynamically increases from 80 to 81!
  const nextRealInstructors = afterBosAssign.instructors.filter(i => !/^bos\d+$/.test(i.name)).length;
  assert.equal(nextRealInstructors, 81);

  // 2. Add a brand-new course (e.g. 5/a geometri) with a new instructor
  const afterNewCourse = syncDatabaseMutations(
    [],
    [],
    [
      {
        courseId: 'custom_online_5-a_geometri',
        instructorName: 'Barış Öz',
        modality: 'online',
        gradeClass: '5/a',
        subject: 'geometri',
        updatedAt: '2026-10-28T13:05:00.000Z',
      },
    ]
  );
  assert.equal(afterNewCourse.courses.length, 87);
  assert.equal(afterNewCourse.instructors.filter(i => !/^bos\d+$/.test(i.name)).length, 81);

  // Reset DB back to clean state
  syncDatabaseMutations([], [], []);
});

test('findMatchingStudentByFullName matches existing students by full name and merges new course when enrolled', () => {
  const initial = syncDatabaseMutations([], [], []);
  // Existing student in DB: 'ece safi' (4. sınıf, online-4a-mat, online-4a-tur)
  const found = findMatchingStudentByFullName('Ece Safi', initial.students);
  assert.ok(found);
  assert.equal(found.name, 'ece safi');
  assert.ok(!found.enrolledCourseIds.includes('online-4a-fen'));

  // Enroll existing student in online-4a-fen
  const updatedEce = {
    ...found,
    enrolledCourseIds: [...found.enrolledCourseIds, 'online-4a-fen'],
  };
  const afterEnroll = syncDatabaseMutations([updatedEce], [], []);
  const eceAfter = findMatchingStudentByFullName('ece safi', afterEnroll.students);
  assert.ok(eceAfter?.enrolledCourseIds.includes('online-4a-fen'));
  assert.equal(eceAfter?.addedAtWeek, undefined);

  // Non-existent student returns undefined
  const notFound = findMatchingStudentByFullName('Bilinmeyen Öğrenci', initial.students);
  assert.equal(notFound, undefined);

  syncDatabaseMutations([], [], []);
});

test('placebo save button preference and personalized reassurance message work for Melek and any opted-in instructor', () => {
  const melekRes = resolveIdentityInput('melek yılmaz');
  assert.equal(melekRes.type, 'instructor');

  const cagdasRes = resolveIdentityInput('çağdaş');
  assert.equal(cagdasRes.type, 'instructor');

  const elifBusraRes = resolveIdentityInput('elif büşra dede');
  assert.equal(elifBusraRes.type, 'instructor');

  if (
    melekRes.type === 'instructor' &&
    cagdasRes.type === 'instructor' &&
    elifBusraRes.type === 'instructor'
  ) {
    assert.equal(isMelekYilmazInstructor(melekRes.instructor), true);
    assert.equal(isMelekYilmazInstructor(cagdasRes.instructor), false);

    // Personalized display name & reassurance messages
    assert.equal(getInstructorDisplayFirstName(melekRes.instructor), 'melek');
    assert.equal(
      getInstructorReassuranceMessage(melekRes.instructor),
      MELEK_YILMAZ_REASSURANCE_MESSAGE
    );

    assert.equal(getInstructorDisplayFirstName(cagdasRes.instructor), 'çağdaş');
    assert.equal(
      getInstructorReassuranceMessage(cagdasRes.instructor),
      'aklın sakın orada kalmasın çağdaş, yoklaman kayıt altında, iyi dersler'
    );

    assert.equal(getInstructorDisplayFirstName(elifBusraRes.instructor), 'elif büşra');
    assert.equal(
      getInstructorReassuranceMessage(elifBusraRes.instructor),
      'aklın sakın orada kalmasın elif büşra, yoklaman kayıt altında, iyi dersler'
    );

    // Default preference: false for other instructors, true for Melek
    assert.equal(getPlaceboSavePreference(cagdasRes.instructor, null), false);
    assert.equal(getPlaceboSavePreference(melekRes.instructor, null), true);

    // Opting in persists across logins until deactivated
    const enabledRaw = setPlaceboSavePreferenceInMap(cagdasRes.instructor, true, null);
    assert.equal(getPlaceboSavePreference(cagdasRes.instructor, enabledRaw), true);

    const disabledRaw = setPlaceboSavePreferenceInMap(cagdasRes.instructor, false, enabledRaw);
    assert.equal(getPlaceboSavePreference(cagdasRes.instructor, disabledRaw), false);

    // Remote Firestore preference overrides local empty storage and computes paranoya count
    const remotePrefs = [
      { instructorId: cagdasRes.instructor.id, instructorName: cagdasRes.instructor.name, enabled: true },
      { instructorId: elifBusraRes.instructor.id, instructorName: elifBusraRes.instructor.name, enabled: false },
    ];
    assert.equal(getPlaceboSavePreference(cagdasRes.instructor, null, remotePrefs), true);
    assert.equal(getPlaceboSavePreference(elifBusraRes.instructor, null, remotePrefs), false);
    const activeStats = computeActivePlaceboSaveUsers(remotePrefs);
    assert.equal(activeStats.count, 1);
    assert.deepEqual(activeStats.names, ['çağdaş şahin']);
  }
});

test('shouldPromptEmptyExit triggers when leaving with 0 present students or without taking attendance', () => {
  // Entered course and did not select any session yet (no attendance records for course/week)
  assert.equal(
    shouldPromptEmptyExit({
      selectedSession: null,
      presentStudentCount: 0,
      sessionUnlistedCount: 0,
      courseWeekRecordsCount: 0,
    }),
    true
  );

  // Selected 1. ders and clicked 0 students
  assert.equal(
    shouldPromptEmptyExit({
      selectedSession: '1. ders',
      presentStudentCount: 0,
      sessionUnlistedCount: 0,
      courseWeekRecordsCount: 0,
    }),
    true
  );

  // Selected 1. ders and marked at least 1 student present -> does NOT prompt
  assert.equal(
    shouldPromptEmptyExit({
      selectedSession: '1. ders',
      presentStudentCount: 1,
      sessionUnlistedCount: 0,
      courseWeekRecordsCount: 1,
    }),
    false
  );

  // Selected ders yapmadım -> does NOT prompt
  assert.equal(
    shouldPromptEmptyExit({
      selectedSession: 'ders yapmadım',
      presentStudentCount: 0,
      sessionUnlistedCount: 0,
      courseWeekRecordsCount: 1,
    }),
    false
  );

  // Explicitly confirmed kimse derse gelmedi -> does NOT prompt again
  assert.equal(
    shouldPromptEmptyExit({
      selectedSession: '1. ders',
      presentStudentCount: 0,
      sessionUnlistedCount: 0,
      courseWeekRecordsCount: 1,
      hasExplicitZeroConfirmation: true,
    }),
    false
  );
});

test('resolveExitPromptDecision handles herkes derste, kimse derse gelmedi, and şu anda yoklama almıyorum', () => {
  const courseStudentIds = ['stu-1', 'stu-2', 'stu-3'];

  const allPresent = resolveExitPromptDecision('herkes_derste', {
    selectedSession: '2. ders',
    courseStudentIds,
  });
  assert.deepEqual(allPresent, {
    action: 'save',
    sessionType: '2. ders',
    absentStudentIds: [],
    didNotHoldClass: false,
  });

  const nonePresent = resolveExitPromptDecision('kimse_gelmedi', {
    selectedSession: null,
    courseStudentIds,
  });
  assert.deepEqual(nonePresent, {
    action: 'save',
    sessionType: '1. ders',
    absentStudentIds: ['stu-1', 'stu-2', 'stu-3'],
    didNotHoldClass: false,
  });

  const notTakingNow = resolveExitPromptDecision('yoklama_almiyorum', {
    selectedSession: '1. ders',
    courseStudentIds,
  });
  assert.deepEqual(notTakingNow, {
    action: 'discard',
    sessionType: '1. ders',
  });
});

test('getZeroPresentAttendanceRecords detects 0-present records and never touches processed records', () => {
  const initial = syncDatabaseMutations([], [], []);
  const course = initial.courses.find(c => c.id === 'online-4a-mat')!;
  const allStuIds = course.studentIds;

  const emptyRecord: AttendanceRecord = {
    id: 'online-4a-mat_w2_s1',
    courseId: 'online-4a-mat',
    instructorId: course.instructorId,
    weekNumber: 2,
    sessionType: '1. ders',
    absentStudentIds: [...allStuIds],
    didNotHoldClass: false,
    updatedAt: '2026-10-30T10:00:00.000Z',
  };

  const processedRecord: AttendanceRecord = {
    id: 'online-4a-mat_w2_s2',
    courseId: 'online-4a-mat',
    instructorId: course.instructorId,
    weekNumber: 2,
    sessionType: '2. ders',
    absentStudentIds: allStuIds.slice(1), // 1 student present
    didNotHoldClass: false,
    updatedAt: '2026-10-30T11:00:00.000Z',
  };

  const didNotHoldRecord: AttendanceRecord = {
    id: 'online-4a-mat_w2_sno',
    courseId: 'online-4a-mat',
    instructorId: course.instructorId,
    weekNumber: 2,
    sessionType: 'ders yapmadım',
    absentStudentIds: [],
    didNotHoldClass: true,
    updatedAt: '2026-10-30T12:00:00.000Z',
  };

  const zeroList = getZeroPresentAttendanceRecords(
    [emptyRecord, processedRecord, didNotHoldRecord],
    initial.courses
  );
  assert.equal(zeroList.length, 1);
  assert.equal(zeroList[0].id, 'online-4a-mat_w2_s1');
  assert.equal(isZeroPresentAttendanceRecord(processedRecord, initial.courses), false);
  assert.equal(isZeroPresentAttendanceRecord(didNotHoldRecord, initial.courses), false);
});

test('two student records with the same normalized name resolve to the SAME person (stu-<slug>) and merge courses', () => {
  const stu1 = createNewStudentRecord({
    rawName: 'Ömer Çağrı Şahin',
    modality: 'online',
    gradeLabel: '5. sınıf',
    enrolledCourseIds: ['online-5a-mat'],
    currentWeek: 2,
  });
  const stu2 = createNewStudentRecord({
    rawName: '  ÖMER   ÇAĞRI\u00A0ŞAHİN\u200B ',
    modality: 'online',
    gradeLabel: '5. sınıf',
    enrolledCourseIds: ['online-5a-fen'],
    currentWeek: 3,
  });

  assert.equal(stu1.id, 'stu-omer-cagri-sahin');
  assert.equal(stu2.id, 'stu-omer-cagri-sahin');
  const mutated = syncDatabaseMutations([stu1, stu2], []);
  const matching = mutated.students.filter(s => s.name === 'ömer çağrı şahin');
  assert.equal(matching.length, 1);
  assert.deepEqual(matching[0].enrolledCourseIds, ['online-5a-mat', 'online-5a-fen']);
  assert.equal(matching[0].addedAtWeek, 2);
  syncDatabaseMutations([], []);
});

test('normalizeName and buildStudentIdFromName handle AHMET/Ahmet, İ/I, NBSP, zero-width chars, double spaces, and punctuation', () => {
  // AHMET / Ahmet
  assert.equal(normalizeName('AHMET YILMAZ'), 'ahmet yılmaz');
  assert.equal(normalizeName('Ahmet Yılmaz'), 'ahmet yılmaz');
  assert.equal(buildStudentIdFromName('AHMET YILMAZ'), 'stu-ahmet-yilmaz');
  assert.equal(buildStudentIdFromName('Ahmet Yılmaz'), 'stu-ahmet-yilmaz');

  // İ -> i, I -> ı
  assert.equal(normalizeName('İSMAİL IŞIK'), 'ismail ışık');
  assert.equal(buildStudentIdFromName('İSMAİL IŞIK'), 'stu-ismail-isik');

  // Double spaces, leading/trailing spaces, NBSP (\u00A0), zero-width space (\u200B), BOM (\uFEFF)
  assert.equal(
    normalizeName('  \uFEFFAhmet\u00A0\u00A0Taha\u200B   Şişman...  '),
    'ahmet taha şişman'
  );
  assert.equal(
    buildStudentIdFromName('  \uFEFFAhmet\u00A0\u00A0Taha\u200B   Şişman...  '),
    'stu-ahmet-taha-sisman'
  );

  // Placeholders (bos1, bos2, adını öğrenip giricem) are recognized and excluded from student matching
  assert.equal(isPlaceholderStudentName('bos1'), true);
  assert.equal(isPlaceholderStudentName('BOS2'), true);
  assert.equal(isPlaceholderStudentName('adını öğrenip giricem:)'), true);
  assert.equal(isPlaceholderStudentName('Ecrin Bedir'), false);

  const initial = syncDatabaseMutations([], [], []);
  assert.equal(findMatchingStudentByFullName('bos1', initial.students), undefined);
  assert.equal(
    findMatchingStudentByFullName('adını öğrenip giricem:)', initial.students),
    undefined
  );
});

test('findSimilarStudentsByName detects typos (1-2 char difference, ş/s, ı/i) without auto-merging', () => {
  const initial = syncDatabaseMutations([], [], []);
  // 'ecrin bedir' exists in BASE_DB
  const exact = findMatchingStudentByFullName('ecrin bedir', initial.students);
  assert.ok(exact);

  // 1 letter typo: 'ecrin bedr' -> not exact match, but returned in findSimilarStudentsByName
  assert.equal(findMatchingStudentByFullName('ecrin bedr', initial.students), undefined);
  const similarTypo = findSimilarStudentsByName('ecrin bedr', initial.students);
  assert.ok(similarTypo.some(c => c.student.id === 'stu-ecrin-bedir'));

  // Turkish diacritic typo: 'alperen cosanar' vs 'alperen coşanar'
  const customWithCosanar = syncDatabaseMutations(
    [
      {
        id: 'stu-alperen-cosanar',
        name: 'alperen coşanar',
        grade: '4. sınıf',
        modality: 'online',
        enrolledCourseIds: ['online-4a-mat'],
        addedAtWeek: 2,
      },
    ],
    [],
    []
  );
  const similarDiacritic = findSimilarStudentsByName(
    'alperen cosanar',
    customWithCosanar.students
  );
  assert.ok(similarDiacritic.some(c => c.student.id === 'stu-alperen-cosanar'));
  syncDatabaseMutations([], [], []);
});

test('student migration merges duplicates, redirects attendance & unlisted references, counts absences once, and is idempotent on second run', () => {
  const baseStudents = [
    {
      id: 'stu-ecrin-bedir',
      name: 'ecrin bedir',
      grade: '4. sınıf',
      modality: 'online' as const,
      enrolledCourseIds: ['online-4a-mat', 'online-4a-tur'],
    },
  ];

  // Duplicate custom_students records (including a legacy stu_<random> ID from a second device/course)
  const customStudents = [
    {
      id: 'stu-ecrin-bedir',
      name: 'Ecrin  Bedir',
      grade: '4. sınıf',
      modality: 'online' as const,
      enrolledCourseIds: ['online-4a-mat', 'online-4a-tur', 'online-4a-ing'],
      addedAtWeek: 1,
      addedAt: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 'stu_733b9b514c8f',
      name: 'ECRİN\u00A0BEDİR',
      grade: '4. sınıf',
      modality: 'online' as const,
      enrolledCourseIds: ['online-4a-fen'],
      addedAtWeek: 4,
      addedAt: '2026-11-09T10:00:00.000Z',
    },
  ];

  // Unlisted student report pointing to the old random ID
  const unlistedReports = [
    {
      id: 'unlisted_online-4a-fen_w4_1-ders_ecrin-bedir',
      studentName: 'ECRİN BEDİR',
      courseId: 'online-4a-fen',
      instructorId: 'inst-test',
      instructorName: 'test eğitmen',
      weekNumber: 4,
      sessionType: '1. ders' as const,
      status: 'enrolled' as const,
      resolvedStudentId: 'stu_733b9b514c8f',
      createdAt: '2026-11-09T10:00:00.000Z',
    },
  ];

  // Attendance record containing both old and canonical IDs in absentStudentIds
  const attendanceRecords: AttendanceRecord[] = [
    {
      id: 'online-4a-fen_w4_1-ders',
      courseId: 'online-4a-fen',
      instructorId: 'inst-test',
      weekNumber: 4,
      sessionType: '1. ders',
      absentStudentIds: ['stu_733b9b514c8f', 'stu-ecrin-bedir'],
      didNotHoldClass: false,
      updatedAt: '2026-11-09T12:00:00.000Z',
    },
  ];

  // Step B backup check
  const backup = createMigrationBackupPayload({
    baseStudents,
    customStudents,
    unlistedReports,
    attendanceRecords,
  });
  assert.equal(backup.counts.customStudents, 2);

  // Step A dry run check
  const dryRun1 = buildMigrationDryRunReport({
    baseStudents,
    customStudents,
    unlistedReports,
    attendanceRecords,
  });
  assert.equal(dryRun1.isAlreadyClean, false);
  assert.equal(dryRun1.groupsToMigrate.length, 1);
  assert.equal(dryRun1.groupsToMigrate[0].targetId, 'stu-ecrin-bedir');
  assert.deepEqual(dryRun1.groupsToMigrate[0].mergedCourseIds, [
    'online-4a-mat',
    'online-4a-tur',
    'online-4a-ing',
    'online-4a-fen',
  ]);
  assert.deepEqual(dryRun1.groupsToMigrate[0].duplicateCustomDocIdsToSoftDelete, [
    'stu_733b9b514c8f',
  ]);

  // Step C: First migration run
  const firstRun = applyMigrationPlanInMemory({
    baseStudents,
    customStudents,
    unlistedReports,
    attendanceRecords,
  });

  // Verify duplicate custom_students doc was soft-deleted and primary has union of courses
  const activeCustomAfter = firstRun.customStudents.filter(c => !c.deletedAt);
  assert.equal(activeCustomAfter.length, 1);
  assert.equal(activeCustomAfter[0].id, 'stu-ecrin-bedir');
  assert.deepEqual(activeCustomAfter[0].enrolledCourseIds, [
    'online-4a-mat',
    'online-4a-tur',
    'online-4a-ing',
    'online-4a-fen',
  ]);

  // Verify attendance record redirected stu_733b9b514c8f -> stu-ecrin-bedir and deduplicated
  assert.deepEqual(firstRun.attendanceRecords[0].absentStudentIds, ['stu-ecrin-bedir']);

  // Verify unlisted report resolvedStudentId redirected to stu-ecrin-bedir
  assert.equal(firstRun.unlistedReports[0].resolvedStudentId, 'stu-ecrin-bedir');

  // Verify canonicalizeAttendanceRecordIds also deduplicates via STUDENT_ID_ALIAS_MAP
  STUDENT_ID_ALIAS_MAP.set('stu_733b9b514c8f', 'stu-ecrin-bedir');
  const canonicalizedAtt = canonicalizeAttendanceRecordIds(attendanceRecords[0]);
  assert.deepEqual(canonicalizedAtt.absentStudentIds, ['stu-ecrin-bedir']);

  // Step C: Second migration run (Idempotency check — running twice causes zero changes)
  const secondRun = applyMigrationPlanInMemory({
    baseStudents,
    customStudents: firstRun.customStudents,
    unlistedReports: firstRun.unlistedReports,
    attendanceRecords: firstRun.attendanceRecords,
  });
  assert.equal(secondRun.report.isAlreadyClean, true);
  assert.equal(secondRun.report.groupsToMigrate.length, 0);
  assert.equal(secondRun.report.totalAttendanceDocsToUpdate, 0);
  assert.equal(secondRun.report.totalUnlistedDocsToUpdate, 0);
});

test('buildAttendanceDocId and slugifyTurkish properly transliterate all Turkish characters', () => {
  assert.equal(slugifyTurkish('Işılay Ğümüş Öztürk Çelik Şahin'), 'isilay-gumus-ozturk-celik-sahin');
  assert.equal(buildAttendanceDocId('online-3a-mat', 3, '1. ders'), 'online-3a-mat_w3_1-ders');
  assert.equal(buildAttendanceDocId('online-3a-mat', 3, 'ders yapmadım'), 'online-3a-mat_w3_ders-yapmadim');
  assert.equal(buildAttendanceDocId('yy-6a-türkçe', 2, 'ek dersler'), 'yy-6a-turkce_w2_ek-dersler');
});

test('Europe/Istanbul timezone and server clock offset protect week calculation against wrong device clock', () => {
  // Sunday Oct 25, 2026 at 22:30 UTC is already Monday Oct 26, 2026 01:30 in Europe/Istanbul (UTC+3) -> Week 2!
  const sundayLateUtc = new Date('2026-10-25T22:30:00.000Z');
  assert.equal(getCurrentWeekNumber(sundayLateUtc, '2026-10-19', 'Europe/Istanbul'), 2);

  // Server clock offset test: suppose device clock is 7 days behind server time
  setServerClockOffsetMs(7 * 24 * 60 * 60 * 1000);
  const weekWithOffset = getCurrentWeekNumber();
  setServerClockOffsetMs(0);
  const weekWithoutOffset = getCurrentWeekNumber();
  assert.equal(weekWithOffset, Math.min(52, weekWithoutOffset + 1));
});

test('detectConcurrentAttendanceConflict identifies edits from another session with higher version', () => {
  assert.equal(
    detectConcurrentAttendanceConflict({
      serverVersion: 3,
      serverUpdatedBySessionId: 'sess_other_device',
      expectedBaseVersion: 2,
      currentClientSessionId: 'sess_my_device',
    }),
    true
  );

  // Same session ID -> not a conflict
  assert.equal(
    detectConcurrentAttendanceConflict({
      serverVersion: 3,
      serverUpdatedBySessionId: 'sess_my_device',
      expectedBaseVersion: 2,
      currentClientSessionId: 'sess_my_device',
    }),
    false
  );
});

test('WriteQueueController coalesces rapid clicks into a single write and waits for server confirmation', async () => {
  let writeCalls = 0;
  let lastWrittenPayload = '';
  let isOnline = true;
  let serverSyncRelease: (() => void) | null = null;

  const queue = new WriteQueueController({
    debounceMs: 30,
    savedHideMs: 0,
    getIsOnline: () => isOnline,
    waitForServerSync: () =>
      new Promise<void>(resolve => {
        serverSyncRelease = resolve;
      }),
  });

  // Rapid consecutive clicks (1, 2, 3) within debounce window
  for (const state of ['click-1', 'click-2', 'click-3-final']) {
    queue.enqueueDebounced({
      key: 'att_1',
      label: 'Yoklama',
      execute: async () => {
        writeCalls++;
        lastWrittenPayload = state;
      },
    });
  }

  assert.equal(queue.getSnapshot().phase, 'saving');
  assert.equal(queue.getSnapshot().pendingCount, 1);

  // Wait for 45ms so debounce fires
  await new Promise(r => setTimeout(r, 45));

  // Write execute() ran once with final state, but serverSync hasn't resolved yet -> still 'saving', NOT 'saved'!
  assert.equal(writeCalls, 1);
  assert.equal(lastWrittenPayload, 'click-3-final');
  assert.equal(queue.getSnapshot().phase, 'saving');

  // Now server confirms the write
  if (serverSyncRelease) (serverSyncRelease as () => void)();
  await new Promise(r => setTimeout(r, 10));

  assert.equal(queue.getSnapshot().phase, 'saved');

  // Test offline mode -> shows 'offline' ("bağlantı yok, bağlanınca kaydedilecek")
  isOnline = false;
  queue.enqueueDebounced({
    key: 'att_offline',
    label: 'Offline Yoklama',
    execute: async () => {
      writeCalls++;
    },
  });
  assert.equal(queue.getSnapshot().phase, 'offline');
});

test('not_duplicates: A-B and B-A produce the exact same ordered document ID (studentIdA__studentIdB) and reject self-pairs', () => {
  const pairAB = buildNotDuplicatePairId('Dila Acarca', 'Sıla Acarca');
  const pairBA = buildNotDuplicatePairId('Sıla Acarca', 'Dila Acarca');
  const pairByIdAB = buildNotDuplicatePairId('stu-dila-acarca', 'stu-sila-acarca');
  const pairByIdBA = buildNotDuplicatePairId('stu-sila-acarca', 'stu-dila-acarca');

  assert.ok(pairAB && pairBA && pairByIdAB && pairByIdBA);
  assert.equal(pairAB.id, 'stu-dila-acarca__stu-sila-acarca');
  assert.equal(pairBA.id, 'stu-dila-acarca__stu-sila-acarca');
  assert.equal(pairByIdAB.id, 'stu-dila-acarca__stu-sila-acarca');
  assert.equal(pairByIdBA.id, 'stu-dila-acarca__stu-sila-acarca');
  assert.equal(pairAB.studentIdA, 'stu-dila-acarca');
  assert.equal(pairAB.studentIdB, 'stu-sila-acarca');
  assert.equal(pairBA.studentIdA, 'stu-dila-acarca');
  assert.equal(pairBA.studentIdB, 'stu-sila-acarca');

  // Exact normalized same name must NEVER be allowed in not_duplicates
  assert.equal(buildNotDuplicatePairId('Dila Acarca', '  dila   acarca '), null);
  assert.equal(buildNotDuplicatePairId('stu-dila-acarca', 'stu-dila-acarca'), null);
});

test('not_duplicates: "dila acarca" and "sıla acarca" trigger similarity warning initially, suppress warning in add/match/report when marked "farklı kişiler", and restore warning when removed', () => {
  const dila = createNewStudentRecord({
    rawName: 'Dila Acarca',
    modality: 'online',
    gradeLabel: '5. sınıf',
    enrolledCourseIds: ['online-5a-mat'],
    currentWeek: 2,
  });
  const sila = createNewStudentRecord({
    rawName: 'Sıla Acarca',
    modality: 'online',
    gradeLabel: '5. sınıf',
    enrolledCourseIds: ['online-5a-mat'],
    currentWeek: 2,
  });

  // 1. Before ignoring: adding "sıla acarca" while "dila acarca" is registered triggers similarity warning
  const beforeIgnoreSimilar = findSimilarStudentsByName('Sıla Acarca', [dila], []);
  assert.equal(beforeIgnoreSimilar.length, 1);
  assert.equal(beforeIgnoreSimilar[0].student.id, 'stu-dila-acarca');

  // Also in dry-run migration report before ignoring: pair appears in nearDuplicatePairs and NOT in groupsToMigrate
  const reportBefore = buildMigrationDryRunReport({
    baseStudents: [],
    customStudents: [dila, sila],
    unlistedReports: [],
    attendanceRecords: [],
    notDuplicatePairs: [],
  });
  assert.equal(reportBefore.groupsToMigrate.length, 0);
  assert.ok(
    reportBefore.nearDuplicatePairs.some(
      p => p.notDuplicatePairId === 'stu-dila-acarca__stu-sila-acarca'
    )
  );

  // 2. Mark as "farklı kişiler" (not_duplicates)
  const pairInfo = buildNotDuplicatePairId(dila.id, sila.id)!;
  const ignoreList: NotDuplicatePairRecord[] = [
    {
      id: pairInfo.id,
      studentIdA: pairInfo.studentIdA,
      studentIdB: pairInfo.studentIdB,
      createdAt: '2026-11-10T10:00:00.000Z',
      note: 'dila acarca — sıla acarca',
    },
  ];

  assert.equal(isPairIgnoredAsNotDuplicate('dila acarca', 'sıla acarca', ignoreList), true);
  assert.equal(isPairIgnoredAsNotDuplicate('sıla acarca', 'dila acarca', ignoreList), true);

  // Re-adding or matching unlisted student -> NO warning
  const afterIgnoreSimilar = findSimilarStudentsByName(
    'Sıla Acarca',
    [dila],
    ignoreList
  );
  assert.equal(afterIgnoreSimilar.length, 0);

  // Running dry-run migration report -> NO warning in nearDuplicatePairs
  const reportAfter = buildMigrationDryRunReport({
    baseStudents: [],
    customStudents: [dila, sila],
    unlistedReports: [],
    attendanceRecords: [],
    notDuplicatePairs: ignoreList,
  });
  assert.equal(
    reportAfter.nearDuplicatePairs.some(
      p => p.notDuplicatePairId === 'stu-dila-acarca__stu-sila-acarca'
    ),
    false
  );

  // 3. Remove from ignore list ("Yoksaymayı kaldır") -> warning appears again!
  const afterRemoveIgnoreSimilar = findSimilarStudentsByName(
    'Sıla Acarca',
    [dila],
    []
  );
  assert.equal(afterRemoveIgnoreSimilar.length, 1);
  assert.equal(afterRemoveIgnoreSimilar[0].student.id, 'stu-dila-acarca');
});

test('not_duplicates: merging an ignored student into another student migrates not_duplicates records to the primary ID and deletes self-pairs, and deleting a student cleans up their records', () => {
  // Suppose stu-dila-acarca is ignored against stu-sila-acarca AND stu-ela-acarca
  const initialPairs: NotDuplicatePairRecord[] = [
    {
      id: 'stu-dila-acarca__stu-sila-acarca',
      studentIdA: 'stu-dila-acarca',
      studentIdB: 'stu-sila-acarca',
      createdAt: '2026-11-10T10:00:00.000Z',
      note: 'dila acarca — sıla acarca',
    },
    {
      id: 'stu-dila-acarca__stu-ela-acarca',
      studentIdA: 'stu-dila-acarca',
      studentIdB: 'stu-ela-acarca',
      createdAt: '2026-11-10T10:05:00.000Z',
      note: 'dila acarca — ela acarca',
    },
  ];

  // Case A: stu-dila-acarca is merged into stu-dila-nur-acarca
  const mergedIntoThird = reconcileNotDuplicatesOnMerge(
    initialPairs,
    'stu-dila-acarca',
    'stu-dila-nur-acarca',
    '2026-11-10T11:00:00.000Z'
  );

  // Old records with stu-dila-acarca are scheduled for deletion
  assert.deepEqual(mergedIntoThird.toDeleteIds.sort(), [
    'stu-dila-acarca__stu-ela-acarca',
    'stu-dila-acarca__stu-sila-acarca',
  ]);

  // New records transferred to stu-dila-nur-acarca in canonical sorted order
  assert.deepEqual(
    mergedIntoThird.nextPairs.map(p => p.id).sort(),
    [
      'stu-dila-nur-acarca__stu-ela-acarca',
      'stu-dila-nur-acarca__stu-sila-acarca',
    ]
  );

  // Case B: If stu-dila-acarca and stu-sila-acarca themselves are merged as the same person,
  // their mutual pair stu-dila-acarca__stu-sila-acarca is deleted (self-pair eliminated) while stu-ela-acarca is migrated!
  const mergedSelf = reconcileNotDuplicatesOnMerge(
    initialPairs,
    'stu-dila-acarca',
    'stu-sila-acarca',
    '2026-11-10T11:10:00.000Z'
  );
  assert.equal(
    mergedSelf.nextPairs.some(
      p => p.studentIdA === p.studentIdB || p.id.includes('stu-dila-acarca')
    ),
    false
  );
  assert.deepEqual(
    mergedSelf.nextPairs.map(p => p.id),
    ['stu-ela-acarca__stu-sila-acarca']
  );

  // Case C: Deleting a student cleans up all not_duplicates records containing that student
  const afterDelete = reconcileNotDuplicatesOnDelete(
    mergedSelf.nextPairs,
    'stu-sila-acarca'
  );
  assert.equal(afterDelete.nextPairs.length, 0);
  assert.deepEqual(afterDelete.toDeleteIds, ['stu-ela-acarca__stu-sila-acarca']);
});

test('not_duplicates: two devices ignoring the same pair concurrently (even in opposite A-B / B-A order) converge to a single document', () => {
  const device1 = buildNotDuplicatePairId('stu-dila-acarca', 'stu-sila-acarca')!;
  const device2 = buildNotDuplicatePairId('stu-sila-acarca', 'stu-dila-acarca')!;

  const combined = deduplicateNotDuplicatePairs([
    {
      id: device1.id,
      studentIdA: device1.studentIdA,
      studentIdB: device1.studentIdB,
      createdAt: '2026-11-10T12:00:05.000Z',
    },
    {
      id: device2.id,
      studentIdA: device2.studentIdA,
      studentIdB: device2.studentIdB,
      createdAt: '2026-11-10T12:00:01.000Z',
      note: 'kardeş öğrenciler',
    },
  ]);

  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, 'stu-dila-acarca__stu-sila-acarca');
  assert.equal(combined[0].createdAt, '2026-11-10T12:00:01.000Z');
  assert.equal(combined[0].note, 'kardeş öğrenciler');
});

test('coordinator tracking: buildCoordinatorDocId produces w01, w04, w12 formatted IDs', () => {
  assert.equal(buildCoordinatorDocId(1), 'w01');
  assert.equal(buildCoordinatorDocId(4), 'w04');
  assert.equal(buildCoordinatorDocId(9), 'w09');
  assert.equal(buildCoordinatorDocId(10), 'w10');
  assert.equal(buildCoordinatorDocId(12), 'w12');
});

test('coordinator tracking: getWeekWeekendDates calculates correct Saturday and Sunday dates from term start', () => {
  // Term start is Monday 2026-10-19
  // Week 1: Monday Oct 19 -> Saturday Oct 24, Sunday Oct 25
  const w1 = getWeekWeekendDates(1, '2026-10-19');
  assert.equal(w1.saturdayDayMonth, '24 ekim');
  assert.equal(w1.sundayDayMonth, '25 ekim');
  assert.equal(w1.saturdayFormatted, '24 ekim cumartesi');
  assert.equal(w1.sundayFormatted, '25 ekim pazar');

  // Week 4: Monday Nov 09 -> Saturday Nov 14, Sunday Nov 15
  const w4 = getWeekWeekendDates(4, '2026-10-19');
  assert.equal(w4.saturdayDayMonth, '14 kasım');
  assert.equal(w4.sundayDayMonth, '15 kasım');
  assert.equal(w4.saturdayFormatted, '14 kasım cumartesi');
  assert.equal(w4.sundayFormatted, '15 kasım pazar');

  // Month boundary check: Week 2 (Monday Oct 26 -> Saturday Oct 31, Sunday Nov 1)
  const w2 = getWeekWeekendDates(2, '2026-10-19');
  assert.equal(w2.saturdayDayMonth, '31 ekim');
  assert.equal(w2.sundayDayMonth, '1 kasım');
});

test('coordinator tracking: cleanCoordinatorNames converts empty and whitespace strings to null', () => {
  const cleaned = cleanCoordinatorNames([
    '  dila acarca  ',
    '',
    '   ',
    null,
    undefined,
    'sıla acarca',
  ]);
  assert.deepEqual(cleaned, [
    'dila acarca',
    null,
    null,
    null,
    null,
    'sıla acarca',
  ]);
});

test('coordinator tracking: duplicate detection correctly normalizes Turkish characters and whitespace', () => {
  // Turkish I / ı and İ / i casing
  assert.equal(normalizeName('İSMAİL ÇAĞLAR'), normalizeName('ismail çağlar'));
  assert.equal(normalizeName('IŞIL KOÇ'), normalizeName('ışıl koç'));
  // Whitespace normalization
  assert.equal(normalizeName('   ahmet    yılmaz  '), normalizeName('ahmet yılmaz'));
  // Duplicate comparison in the same cell
  const slot1 = 'Zeynep  Ören ';
  const slot2 = 'zeynep ören';
  assert.equal(normalizeName(slot1), normalizeName(slot2));

  // Distinct persons (e.g. siblings with short names) do NOT trigger same-person equality
  const sib1 = 'dila acarca';
  const sib2 = 'sıla acarca';
  assert.notEqual(normalizeName(sib1), normalizeName(sib2));
});

test('holiday logic: weeks 4 and 5 are holidays for yüz yüze and coordinator tracking', () => {
  assert.equal(isYuzyuzeHolidayWeek(1), false);
  assert.equal(isYuzyuzeHolidayWeek(2), false);
  assert.equal(isYuzyuzeHolidayWeek(3), false);
  assert.equal(isYuzyuzeHolidayWeek(4), true);
  assert.equal(isYuzyuzeHolidayWeek(5), true);
  assert.equal(isYuzyuzeHolidayWeek(6), false);
  assert.equal(isYuzyuzeHolidayWeek(12), false);

  // Yüz yüze holiday message only shows for yuzyuze modality on weeks 4 and 5
  assert.equal(shouldShowYuzyuzeHolidayMessage('yuzyuze', 4), true);
  assert.equal(shouldShowYuzyuzeHolidayMessage('yuzyuze', 5), true);
  assert.equal(shouldShowYuzyuzeHolidayMessage('yuzyuze', 3), false);
  assert.equal(shouldShowYuzyuzeHolidayMessage('yuzyuze', 6), false);
  assert.equal(shouldShowYuzyuzeHolidayMessage('online', 4), false);
  assert.equal(shouldShowYuzyuzeHolidayMessage('online', 5), false);
});

test('online week 5 thank-you message: shows only for online instructors on week 5 and expires from week 6 onwards', () => {
  // Online instructor in week 5 -> true
  assert.equal(shouldShowOnlineWeek5ThankYou('online', 5, 5), true);
  assert.equal(shouldShowOnlineWeek5ThankYou('online', 5, 4), true);

  // Online instructor viewing week 4 -> false
  assert.equal(shouldShowOnlineWeek5ThankYou('online', 4, 4), false);

  // Online instructor from week 6 onwards -> expired (false)
  assert.equal(shouldShowOnlineWeek5ThankYou('online', 5, 6), false);
  assert.equal(shouldShowOnlineWeek5ThankYou('online', 6, 6), false);
  assert.equal(shouldShowOnlineWeek5ThankYou('online', 5, 7), false);

  // Yüz yüze instructor -> never sees the online week 5 message
  assert.equal(shouldShowOnlineWeek5ThankYou('yuzyuze', 5, 5), false);
  assert.equal(shouldShowOnlineWeek5ThankYou('yuzyuze', 5, 4), false);
});
