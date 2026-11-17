import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSibeliusQuerySnapshot,
  computeStudentAttendanceSummary,
  ENABLE_SIBELIUS_CHATBOT,
} from './sibeliusChatbotLogic';
import { AttendanceRecord, Course, Instructor, Student } from '../data/database';

const mockCourses: Course[] = [
  {
    id: 'online-5a-mat',
    modality: 'online',
    gradeClass: '5/a',
    subject: 'Matematik',
    instructorId: 'inst-1',
    instructorName: 'ali veli',
    title: '5. sınıf matematik · ali veli',
    shortTitle: '5/a mat',
    studentIds: ['stu-1', 'stu-3'],
  },
  {
    id: 'yy-5a-mat',
    modality: 'yuzyuze',
    gradeClass: '5/a',
    subject: 'Matematik',
    instructorId: 'inst-2',
    instructorName: 'ayşe fatma',
    title: '5/a yüz yüze matematik · ayşe fatma',
    shortTitle: '5/a yy mat',
    studentIds: ['stu-2', 'stu-3'],
  },
];

const mockStudents: Student[] = [
  {
    id: 'stu-1',
    name: 'ahmet yılmaz',
    grade: '5. sınıf',
    modality: 'online',
    enrolledCourseIds: ['online-5a-mat'],
    addedAtWeek: 1,
  },
  {
    id: 'stu-2',
    name: 'beren apaydın',
    grade: '5/a yüz yüze',
    modality: 'yuzyuze',
    enrolledCourseIds: ['yy-5a-mat'],
    addedAtWeek: 1,
  },
  {
    id: 'stu-3',
    name: 'azra melek ecevit',
    grade: '5. sınıf',
    modality: 'online',
    enrolledCourseIds: ['online-5a-mat', 'yy-5a-mat'],
    addedAtWeek: 1,
  },
];

const mockInstructors: Instructor[] = [
  {
    id: 'inst-1',
    name: 'ali veli',
    firstName: 'ali',
    lastName: 'veli',
    modality: 'online',
    courseIds: ['online-5a-mat'],
  },
  {
    id: 'inst-2',
    name: 'ayşe fatma',
    firstName: 'ayşe',
    lastName: 'fatma',
    modality: 'yuzyuze',
    courseIds: ['yy-5a-mat'],
  },
];

const mockAttendance: AttendanceRecord[] = [
  {
    id: 'att-1',
    courseId: 'online-5a-mat',
    instructorId: 'inst-1',
    weekNumber: 1,
    sessionType: '1. ders',
    absentStudentIds: ['stu-1'],
    didNotHoldClass: false,
    updatedAt: '2026-10-19T10:00:00.000Z',
  },
  {
    id: 'att-2',
    courseId: 'online-5a-mat',
    instructorId: 'inst-1',
    weekNumber: 2,
    sessionType: '1. ders',
    absentStudentIds: ['stu-1'],
    didNotHoldClass: false,
    updatedAt: '2026-10-26T10:00:00.000Z',
  },
];

test('ENABLE_SIBELIUS_CHATBOT feature flag is enabled by default', () => {
  assert.equal(ENABLE_SIBELIUS_CHATBOT, true);
});

test('computeStudentAttendanceSummary calculates exact absence and attendance counts', () => {
  const summary = computeStudentAttendanceSummary(
    mockStudents[0],
    mockCourses,
    mockAttendance,
    3
  );
  assert.equal(summary.totalSessionsHeld, 2);
  assert.equal(summary.absentCount, 2);
  assert.equal(summary.attendedCount, 0);
  assert.equal(summary.absentDetails.length, 2);
});

test('buildSibeliusQuerySnapshot accurately separates online, yuzyuze, and hybrid student counts', () => {
  const snapshot = buildSibeliusQuerySnapshot('çevrim içinde kaç öğrenci var?', {
    currentWeek: 3,
    students: mockStudents,
    courses: mockCourses,
    instructors: mockInstructors,
    attendanceRecords: mockAttendance,
    unlistedReports: [],
  });

  assert.equal(snapshot.counts.totalUniqueStudents, 3);
  assert.equal(snapshot.counts.onlineEnrolledStudents, 2);
  assert.equal(snapshot.counts.onlineOnlyStudents, 1);
  assert.equal(snapshot.counts.yuzyuzeEnrolledStudents, 2);
  assert.equal(snapshot.counts.yuzyuzeOnlyStudents, 1);
  assert.deepEqual(snapshot.counts.hybridBothModalitiesStudents, ['azra melek ecevit']);
});

test('buildSibeliusQuerySnapshot matches student name with Turkish suffixes and produces directHint', () => {
  const snapshot = buildSibeliusQuerySnapshot("ahmet yılmaz'ın kaç devamsızlığı var?", {
    currentWeek: 3,
    students: mockStudents,
    courses: mockCourses,
    instructors: mockInstructors,
    attendanceRecords: mockAttendance,
    unlistedReports: [],
  });

  assert.equal(snapshot.matchedStudents.length, 1);
  assert.equal(snapshot.matchedStudents[0].name, 'ahmet yılmaz');
  assert.equal(snapshot.matchedStudents[0].absentCount, 2);
  assert.ok(snapshot.directHint?.includes('toplam 2 kez derse gelmedi'));
});
