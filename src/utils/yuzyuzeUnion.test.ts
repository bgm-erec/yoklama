import test from 'node:test';
import assert from 'node:assert/strict';
import { Course, Student, syncDatabaseMutations } from '../data/database';
import {
  buildCustomStudentUnionPayload,
  computeClassStudentBreakdown,
  computeYuzyuzeClassUnionPlan,
} from './yuzyuzeUnion';

function makeCourse(overrides: Partial<Course>): Course {
  return {
    id: overrides.id || 'yy-6b-mat',
    title: overrides.title || '6/b matematik (yüz yüze)',
    shortTitle: overrides.shortTitle || '6/b matematik',
    gradeClass: overrides.gradeClass || '6/b',
    subject: overrides.subject || 'matematik',
    modality: overrides.modality || 'yuzyuze',
    instructorId: overrides.instructorId || 'inst-test',
    instructorName: overrides.instructorName || 'test hoca',
    studentIds: overrides.studentIds || [],
  };
}

function makeStudent(overrides: Partial<Student>): Student {
  return {
    id: overrides.id || 'stu-test',
    name: overrides.name || 'test öğrenci',
    grade: overrides.grade || '6. sınıf (6/b yüz yüze)',
    modality: overrides.modality || 'yuzyuze',
    enrolledCourseIds: overrides.enrolledCourseIds || [],
    addedAtWeek: overrides.addedAtWeek ?? 1,
    addedAt: overrides.addedAt ?? '2026-03-01T00:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
  };
}

test('computeYuzyuzeClassUnionPlan merges partial enrollments within each yüz yüze gradeClass using union', () => {
  const courses: Course[] = [
    makeCourse({ id: 'yy-6b-mat', gradeClass: '6/b', subject: 'matematik', studentIds: ['stu-a', 'stu-b'] }),
    makeCourse({ id: 'yy-6b-fen', gradeClass: '6/b', subject: 'fen bilimleri', studentIds: ['stu-a'] }),
    makeCourse({ id: 'yy-6b-tur', gradeClass: '6/b', subject: 'türkçe', studentIds: ['stu-c'] }),
  ];

  const students: Student[] = [
    makeStudent({ id: 'stu-a', name: 'ali veli', enrolledCourseIds: ['yy-6b-mat', 'yy-6b-fen'] }),
    makeStudent({ id: 'stu-b', name: 'büşra can', enrolledCourseIds: ['yy-6b-mat'] }),
    makeStudent({ id: 'stu-c', name: 'cem deniz', enrolledCourseIds: ['yy-6b-tur'] }),
  ];

  const plan = computeYuzyuzeClassUnionPlan({ students, courses });

  assert.equal(plan.updatedClassesCount, 1);
  assert.equal(plan.updatedStudentsCount, 3);
  assert.equal(plan.addedEnrollmentsCount, 5); // stu-a +1, stu-b +2, stu-c +2

  const updateMap = new Map(plan.studentUpdates.map(u => [u.student.id, u]));
  assert.deepEqual(updateMap.get('stu-a')?.nextEnrolledCourseIds, ['yy-6b-mat', 'yy-6b-fen', 'yy-6b-tur']);
  assert.deepEqual(updateMap.get('stu-b')?.nextEnrolledCourseIds, ['yy-6b-mat', 'yy-6b-fen', 'yy-6b-tur']);
  assert.deepEqual(updateMap.get('stu-c')?.nextEnrolledCourseIds, ['yy-6b-tur', 'yy-6b-mat', 'yy-6b-fen']);

  const summary = plan.classSummaries[0];
  assert.equal(summary.gradeClass, '6/b');
  assert.equal(summary.unionStudentCount, 3);
  assert.equal(summary.beforeCountsByCourseId['yy-6b-mat'], 2);
  assert.equal(summary.beforeCountsByCourseId['yy-6b-fen'], 1);
  assert.equal(summary.beforeCountsByCourseId['yy-6b-tur'], 1);
});

test('computeYuzyuzeClassUnionPlan NEVER merges online courses and preserves dual-modality online courses', () => {
  const courses: Course[] = [
    makeCourse({ id: 'yy-6a-mat', gradeClass: '6/a', subject: 'matematik', modality: 'yuzyuze' }),
    makeCourse({ id: 'yy-6a-fen', gradeClass: '6/a', subject: 'fen bilimleri', modality: 'yuzyuze' }),
    makeCourse({ id: 'online-6a-mat', gradeClass: '6/a', subject: 'matematik', modality: 'online' }),
    makeCourse({ id: 'online-6a-fen', gradeClass: '6/a', subject: 'fen bilimleri', modality: 'online' }),
  ];

  const students: Student[] = [
    makeStudent({
      id: 'stu-dual',
      name: 'ırmak sevde',
      modality: 'yuzyuze',
      enrolledCourseIds: ['yy-6a-mat', 'online-6a-mat'],
    }),
    makeStudent({
      id: 'stu-online-only',
      name: 'online öğrenci',
      grade: '6. sınıf',
      modality: 'online',
      enrolledCourseIds: ['online-6a-mat'],
    }),
  ];

  const plan = computeYuzyuzeClassUnionPlan({ students, courses });

  assert.equal(plan.updatedStudentsCount, 1);
  assert.equal(plan.studentUpdates[0].student.id, 'stu-dual');
  assert.deepEqual(plan.studentUpdates[0].nextEnrolledCourseIds, [
    'yy-6a-mat',
    'online-6a-mat',
    'yy-6a-fen',
  ]);
  // online-only student is completely untouched
  assert.equal(plan.studentUpdates.some(u => u.student.id === 'stu-online-only'), false);
});

test('computeYuzyuzeClassUnionPlan is idempotent and ignores soft-deleted / placeholder students', () => {
  const courses: Course[] = [
    makeCourse({ id: 'yy-5a-mat', gradeClass: '5/a', subject: 'matematik' }),
    makeCourse({ id: 'yy-5a-tur', gradeClass: '5/a', subject: 'türkçe' }),
  ];

  const students: Student[] = [
    makeStudent({ id: 'stu-ok', name: 'ahmet yılmaz', enrolledCourseIds: ['yy-5a-mat'] }),
    makeStudent({ id: 'stu-del', name: 'silinmiş öğrenci', enrolledCourseIds: ['yy-5a-tur'], deletedAt: '2026-04-01T00:00:00Z' }),
    makeStudent({ id: 'stu-ph', name: 'adını öğrenip giricem:)', enrolledCourseIds: ['yy-5a-tur'] }),
  ];

  const firstPlan = computeYuzyuzeClassUnionPlan({ students, courses });
  assert.equal(firstPlan.updatedStudentsCount, 1);
  assert.deepEqual(firstPlan.studentUpdates[0].nextEnrolledCourseIds, ['yy-5a-mat', 'yy-5a-tur']);

  const updatedStudents = students.map(s =>
    s.id === 'stu-ok'
      ? { ...s, enrolledCourseIds: firstPlan.studentUpdates[0].nextEnrolledCourseIds }
      : s
  );

  const secondPlan = computeYuzyuzeClassUnionPlan({ students: updatedStudents, courses });
  assert.equal(secondPlan.updatedStudentsCount, 0);
  assert.equal(secondPlan.updatedClassesCount, 0);
  assert.equal(secondPlan.addedEnrollmentsCount, 0);
});

test('buildCustomStudentUnionPayload creates Firestore-rules-compliant custom_students record', () => {
  const st = makeStudent({
    id: 'stu-kerim',
    name: 'kerim ensar yılmaz',
    grade: '6. sınıf (6/b yüz yüze)',
    modality: 'yuzyuze',
    addedAtWeek: 2,
    addedAt: '2026-03-15T10:00:00.000Z',
  });
  const payload = buildCustomStudentUnionPayload(
    st,
    ['yy-6b-tur', 'yy-6b-mat', 'yy-6b-tur'],
    '2026-04-10T12:00:00.000Z'
  );

  assert.equal(payload.id, 'stu-kerim');
  assert.equal(payload.addedAtWeek, 2);
  assert.equal(payload.addedAt, '2026-03-15T10:00:00.000Z');
  assert.equal(payload.addedAtIso, '2026-03-15T10:00:00.000Z');
  assert.equal(payload.deletedAt, null);
  assert.deepEqual(payload.enrolledCourseIds, ['yy-6b-tur', 'yy-6b-mat']);
});

test('union updates round-trip cleanly through syncDatabaseMutations without touching online classes', () => {
  const customStudents: Student[] = [
    makeStudent({
      id: 'stu-kerim-ensar-yilmaz',
      name: 'kerim ensar yılmaz',
      grade: '6. sınıf (6/b yüz yüze)',
      modality: 'yuzyuze',
      enrolledCourseIds: ['yy-6b-tur', 'yy-6b-ing', 'yy-6b-sos'],
      addedAtWeek: 2,
    }),
    makeStudent({
      id: 'stu-online-only-test',
      name: 'online test öğrenci',
      grade: '6. sınıf',
      modality: 'online',
      enrolledCourseIds: ['online-6a-mat'],
      addedAtWeek: 2,
    }),
  ];

  const beforeSync = syncDatabaseMutations(customStudents, [], []);
  const matBefore = beforeSync.courses.find(c => c.id === 'yy-6b-mat')!;
  const turBefore = beforeSync.courses.find(c => c.id === 'yy-6b-tur')!;
  assert.equal(turBefore.studentIds.length - matBefore.studentIds.length, 1);

  const plan = computeYuzyuzeClassUnionPlan({
    students: beforeSync.students,
    courses: beforeSync.courses,
  });

  const mergedCustom = [...customStudents];
  for (const upd of plan.studentUpdates) {
    const idx = mergedCustom.findIndex(c => c.id === upd.student.id);
    const nextRec: Student = {
      ...upd.student,
      enrolledCourseIds: upd.nextEnrolledCourseIds,
    };
    if (idx >= 0) mergedCustom[idx] = nextRec;
    else mergedCustom.push(nextRec);
  }

  const afterSync = syncDatabaseMutations(mergedCustom, [], []);
  const breakdown = computeClassStudentBreakdown(afterSync.courses, afterSync.students);
  const yy6b = breakdown.find(b => b.modality === 'yuzyuze' && b.gradeClass === '6/b')!;
  assert.ok(yy6b.courses.every(c => c.studentCount === yy6b.unionStudentCount));

  // Verify online 6/a courses still have differing counts (not merged)
  const online6a = breakdown.find(b => b.modality === 'online' && b.gradeClass === '6/a')!;
  const onlineCounts = new Set(online6a.courses.map(c => c.studentCount));
  assert.ok(onlineCounts.size > 1);
});
