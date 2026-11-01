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
  shouldPromptEmptyExit,
  resolveExitPromptDecision,
  isZeroPresentAttendanceRecord,
  getZeroPresentAttendanceRecords,
} from './enigmaLogic';
import { AttendanceRecord, DB, syncDatabaseMutations } from '../data/database';

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

test('full name after surname warning resolves to exact instructor', () => {
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

test('syncDatabaseMutations dynamically adds and removes students across courses', () => {
  const newSt = createNewStudentRecord({
    rawName: 'Canan Ersoy',
    modality: 'yuzyuze',
    gradeLabel: '5. sınıf',
    enrolledCourseIds: ['yy-5a-mat', 'yy-5a-tur'],
    currentWeek: 2,
    nowIso: '2026-10-28T12:00:00.000Z',
  });

  const mutated = syncDatabaseMutations([newSt], []);
  assert.ok(mutated.students.some(s => s.id === 'stu-canan-ersoy'));
  const yy5aMat = mutated.courses.find(c => c.id === 'yy-5a-mat');
  assert.ok(yy5aMat?.studentIds.includes('stu-canan-ersoy'));

  // Now remove Canan Ersoy
  const afterRemove = syncDatabaseMutations([newSt], ['stu-canan-ersoy']);
  assert.ok(!afterRemove.students.some(s => s.id === 'stu-canan-ersoy'));
  const yy5aMatAfter = afterRemove.courses.find(c => c.id === 'yy-5a-mat');
  assert.ok(!yy5aMatAfter?.studentIds.includes('stu-canan-ersoy'));

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

test('isMelekYilmazInstructor matches exclusively melek yılmaz and no other instructor', () => {
  const melekRes = resolveIdentityInput('melek yılmaz');
  assert.equal(melekRes.type, 'instructor');
  if (melekRes.type === 'instructor') {
    assert.equal(isMelekYilmazInstructor(melekRes.instructor), true);
  }

  for (const inst of DB.instructors) {
    if (inst.name === 'melek yılmaz') {
      assert.equal(isMelekYilmazInstructor(inst), true);
    } else {
      assert.equal(isMelekYilmazInstructor(inst), false);
    }
  }

  assert.equal(
    MELEK_YILMAZ_REASSURANCE_MESSAGE,
    'aklın sakın orada kalmasın melek, yoklaman kayıt altında, iyi dersler'
  );
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




