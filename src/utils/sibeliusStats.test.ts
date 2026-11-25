import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AttendanceRecord,
  BASE_DB,
  Course,
  DB,
  Instructor,
  Student,
  syncDatabaseMutations,
} from '../data/database';
import {
  buildAttendanceIndex,
  computeCourseStats,
  computeInstructorStats,
  computeStudentStats,
  resolveStudentCourseWeekCell,
} from './sibeliusStats';

test('BASE_DB and DB have isolated clones with no shared mutable references', () => {
  assert.notEqual(BASE_DB, DB);
  assert.notEqual(BASE_DB.students, DB.students);
  assert.notEqual(BASE_DB.courses, DB.courses);
  assert.notEqual(BASE_DB.instructors, DB.instructors);
  assert.equal(BASE_DB.students.length, DB.students.length);
  assert.equal(BASE_DB.courses.length, DB.courses.length);

  // Verify mutating DB student enrolledCourseIds does NOT leak into BASE_DB
  const baseFirst = BASE_DB.students[0];
  const dbFirst = DB.studentsById.get(baseFirst.id)!;
  assert.ok(dbFirst);
  assert.notEqual(baseFirst, dbFirst);
  assert.notEqual(baseFirst.enrolledCourseIds, dbFirst.enrolledCourseIds);

  const origBaseCount = baseFirst.enrolledCourseIds.length;
  dbFirst.enrolledCourseIds.push('fake-temp-course');
  assert.equal(baseFirst.enrolledCourseIds.length, origBaseCount);

  // Reset DB cleanly via syncDatabaseMutations
  const synced = syncDatabaseMutations([], [], []);
  assert.equal(synced.studentsById.get(baseFirst.id)!.enrolledCourseIds.length, origBaseCount);
  assert.equal(synced.coursesById.size, synced.courses.length);
  assert.equal(synced.instructorsById.size, synced.instructors.length);
});

test('indexed Sibelius stats and O(1) cell resolver preserve pre-registration, holiday, didNotHoldClass, and absence rules', () => {
  const courses: Course[] = [
    {
      id: 'online-9a-mat',
      title: '9/a matematik (çevrim içi)',
      shortTitle: '9/a matematik',
      gradeClass: '9/a',
      subject: 'matematik',
      modality: 'online',
      instructorId: 'inst-ali',
      instructorName: 'ali veli',
      studentIds: ['stu-a', 'stu-b'],
    },
    {
      id: 'yy-5a-mat',
      title: '5/a matematik (yüz yüze)',
      shortTitle: '5/a matematik',
      gradeClass: '5/a',
      subject: 'matematik',
      modality: 'yuzyuze',
      instructorId: 'inst-ayse',
      instructorName: 'ayşe demir',
      studentIds: ['stu-a'],
    },
  ];
  const coursesById = new Map(courses.map(c => [c.id, c]));

  const instructors: Instructor[] = [
    {
      id: 'inst-ali',
      name: 'ali veli',
      firstName: 'ali',
      lastName: 'veli',
      modality: 'online',
      courseIds: ['online-9a-mat'],
    },
    {
      id: 'inst-ayse',
      name: 'ayşe demir',
      firstName: 'ayşe',
      lastName: 'demir',
      modality: 'yuzyuze',
      courseIds: ['yy-5a-mat'],
    },
  ];

  const students: Student[] = [
    {
      id: 'stu-a',
      name: 'ahmet yılmaz',
      grade: '9. sınıf',
      modality: 'online',
      enrolledCourseIds: ['online-9a-mat', 'yy-5a-mat'],
    },
    {
      id: 'stu-b',
      name: 'burak kaya',
      grade: '9. sınıf',
      modality: 'online',
      enrolledCourseIds: ['online-9a-mat'],
      addedAtWeek: 2,
      addedAt: '2026-10-27T12:00:00.000Z',
    },
  ];

  const attendance: AttendanceRecord[] = [
    {
      id: 'online-9a-mat_w1_1-ders',
      courseId: 'online-9a-mat',
      instructorId: 'inst-ali',
      weekNumber: 1,
      sessionType: '1. ders',
      absentStudentIds: ['stu-a', 'stu-b'], // stu-b added in week 2 -> pre-registration
      didNotHoldClass: false,
      updatedAt: '2026-10-21T10:00:00.000Z',
    },
    {
      id: 'online-9a-mat_w2_1-ders',
      courseId: 'online-9a-mat',
      instructorId: 'inst-ali',
      weekNumber: 2,
      sessionType: '1. ders',
      absentStudentIds: ['stu-b'], // updatedAt BEFORE stu-b addedAt -> pre-registration!
      didNotHoldClass: false,
      updatedAt: '2026-10-27T09:00:00.000Z',
    },
    {
      id: 'online-9a-mat_w2_2-ders',
      courseId: 'online-9a-mat',
      instructorId: 'inst-ali',
      weekNumber: 2,
      sessionType: '2. ders',
      absentStudentIds: ['stu-b'], // updatedAt AFTER stu-b addedAt -> responsible & absent!
      didNotHoldClass: false,
      updatedAt: '2026-10-28T15:00:00.000Z',
    },
    {
      id: 'yy-5a-mat_w2_ders-yapmadim',
      courseId: 'yy-5a-mat',
      instructorId: 'inst-ayse',
      weekNumber: 2,
      sessionType: 'ders yapmadım',
      absentStudentIds: [],
      didNotHoldClass: true,
      updatedAt: '2026-10-28T16:00:00.000Z',
    },
  ];

  const index = buildAttendanceIndex(attendance);

  // Student stats up to week 4
  const studentStats = computeStudentStats(students, index, 4);
  const stuAStat = studentStats.find(s => s.student.id === 'stu-a')!;
  const stuBStat = studentStats.find(s => s.student.id === 'stu-b')!;

  // stu-a: 3 online sessions held (w1 1.d absent, w2 1.d present, w2 2.d present); yy w2 didNotHoldClass not counted
  assert.equal(stuAStat.totalSessionsHeld, 3);
  assert.equal(stuAStat.absentCount, 1);
  assert.equal(stuAStat.attendedCount, 2);

  // stu-b: only responsible for w2 2.ders (w1 is before addedAtWeek, w2 1.d is before addedAt)
  assert.equal(stuBStat.totalSessionsHeld, 1);
  assert.equal(stuBStat.absentCount, 1);
  assert.equal(stuBStat.attendedCount, 0);

  // Sorting: equal absentCount (1 == 1), lower attendanceRate (0 < 0.66) comes first -> stu-b first!
  assert.equal(studentStats[0].student.id, 'stu-b');

  // Cell states
  // 1) Yüz yüze week 4 -> holiday
  assert.deepEqual(
    resolveStudentCourseWeekCell(courses[1], students[0], 'stu-a', 'yy-5a-mat', 4, index),
    { kind: 'holiday' }
  );
  // 2) stu-b in week 1 -> pre_registration
  assert.deepEqual(
    resolveStudentCourseWeekCell(courses[0], students[1], 'stu-b', 'online-9a-mat', 1, index),
    { kind: 'pre_registration' }
  );
  // 3) stu-b in week 2 -> 1.d pre_registration (before addedAt), 2.d absent
  assert.deepEqual(
    resolveStudentCourseWeekCell(courses[0], students[1], 'stu-b', 'online-9a-mat', 2, index),
    {
      kind: 'sessions',
      badges: [
        { sessionType: '1. ders', shortSession: '1.d', status: 'pre_registration' },
        { sessionType: '2. ders', shortSession: '2.d', status: 'absent' },
      ],
    }
  );
  // 4) yy-5a-mat week 2 -> did_not_hold
  assert.deepEqual(
    resolveStudentCourseWeekCell(courses[1], students[0], 'stu-a', 'yy-5a-mat', 2, index),
    { kind: 'did_not_hold' }
  );
  // 5) online-9a-mat week 3 -> unrecorded
  assert.deepEqual(
    resolveStudentCourseWeekCell(courses[0], students[0], 'stu-a', 'online-9a-mat', 3, index),
    { kind: 'unrecorded' }
  );

  // Instructor stats in week 4 (holiday for yüz yüze, active for online)
  const instStatsW4 = computeInstructorStats(instructors, coursesById, index, 4);
  const ayseStat = instStatsW4.find(i => i.instructor.id === 'inst-ayse')!;
  const aliStat = instStatsW4.find(i => i.instructor.id === 'inst-ali')!;
  assert.equal(ayseStat.isHolidayThisWeek, true);
  assert.equal(ayseStat.didNotTakeAttendance, false);
  assert.equal(aliStat.didNotTakeAttendance, true);
  assert.equal(instStatsW4[0].instructor.id, 'inst-ali'); // inactive on top

  // Course stats up to week 4
  const courseStats = computeCourseStats(courses, index, 4);
  const onlineMatStat = courseStats.find(c => c.course.id === 'online-9a-mat')!;
  assert.equal(onlineMatStat.totalAbsences, 4); // 2 + 1 + 1 raw absent entries
  assert.equal(onlineMatStat.noAttendanceThisWeek, true);
});

test('reassigning online-6a-mat to semanur demirci preserves all historical attendance and isolates amro alismaeil on empty online-6b-mat', () => {
  const courses: Course[] = [
    {
      id: 'online-6a-mat',
      title: '6/a matematik (çevrim içi)',
      shortTitle: '6/a matematik',
      gradeClass: '6/a',
      subject: 'matematik',
      modality: 'online',
      instructorId: 'inst-semanur-demirci',
      instructorName: 'semanur demirci',
      studentIds: ['stu-dila-acarca', 'stu-osman-turan'],
    },
    {
      id: 'online-6b-mat',
      title: '6/b matematik (çevrim içi)',
      shortTitle: '6/b matematik',
      gradeClass: '6/b',
      subject: 'matematik',
      modality: 'online',
      instructorId: 'inst-amro-alismaeil',
      instructorName: 'amro alismaeil',
      studentIds: [],
    },
  ];
  const coursesById = new Map(courses.map(c => [c.id, c]));

  const instructors: Instructor[] = [
    {
      id: 'inst-semanur-demirci',
      name: 'semanur demirci',
      firstName: 'semanur',
      lastName: 'demirci',
      modality: 'online',
      courseIds: ['online-6a-mat'],
    },
    {
      id: 'inst-amro-alismaeil',
      name: 'amro alismaeil',
      firstName: 'amro',
      lastName: 'alismaeil',
      modality: 'online',
      courseIds: ['online-6b-mat'],
    },
  ];

  const students: Student[] = [
    {
      id: 'stu-dila-acarca',
      name: 'dila acarca',
      grade: '6. sınıf',
      modality: 'online',
      enrolledCourseIds: ['online-6a-mat'],
    },
    {
      id: 'stu-osman-turan',
      name: 'osman turan',
      grade: '6. sınıf',
      modality: 'online',
      enrolledCourseIds: ['online-6a-mat'],
    },
  ];

  // Historical attendance previously recorded under inst-amro-alismaeil for online-6a-mat
  const attendance: AttendanceRecord[] = [
    {
      id: 'online-6a-mat_w3_1-ders',
      courseId: 'online-6a-mat',
      instructorId: 'inst-amro-alismaeil',
      weekNumber: 3,
      sessionType: '1. ders',
      absentStudentIds: ['stu-dila-acarca'],
      didNotHoldClass: false,
      updatedAt: '2026-11-04T12:00:00.000Z',
    },
    {
      id: 'online-6a-mat_w6_1-ders',
      courseId: 'online-6a-mat',
      instructorId: 'inst-amro-alismaeil',
      weekNumber: 6,
      sessionType: '1. ders',
      absentStudentIds: ['stu-osman-turan'],
      didNotHoldClass: false,
      updatedAt: '2026-11-25T12:00:00.000Z',
    },
  ];

  const index = buildAttendanceIndex(attendance);

  // Course stats keep all historical absences under online-6a-mat, while online-6b-mat stays 0
  const courseStats = computeCourseStats(courses, index, 6);
  const stat6a = courseStats.find(c => c.course.id === 'online-6a-mat')!;
  const stat6b = courseStats.find(c => c.course.id === 'online-6b-mat')!;
  assert.equal(stat6a.totalAbsences, 2);
  assert.equal(stat6a.noAttendanceThisWeek, false);
  assert.equal(stat6b.totalAbsences, 0);
  assert.equal(stat6b.noAttendanceThisWeek, true);

  // Student stats preserve week 3 and week 6 attendance for 6/a students
  const studentStats = computeStudentStats(students, index, 6);
  const dilaStat = studentStats.find(s => s.student.id === 'stu-dila-acarca')!;
  assert.equal(dilaStat.totalSessionsHeld, 2);
  assert.equal(dilaStat.absentCount, 1);

  // Instructor stats credit online-6a-mat's week 6 record to semanur demirci, NOT amro alismaeil
  const instStats = computeInstructorStats(instructors, coursesById, index, 6);
  const semanurStat = instStats.find(i => i.instructor.id === 'inst-semanur-demirci')!;
  const amroStat = instStats.find(i => i.instructor.id === 'inst-amro-alismaeil')!;
  assert.equal(semanurStat.thisWeekRecords.length, 1);
  assert.equal(semanurStat.didNotTakeAttendance, false);
  assert.equal(amroStat.thisWeekRecords.length, 0);
  assert.equal(amroStat.didNotTakeAttendance, true);
});

