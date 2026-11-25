import {
  AttendanceRecord,
  Course,
  Instructor,
  SessionType,
  Student,
} from '../data/database';
import {
  isStudentResponsibleForSession,
  isYuzyuzeHolidayWeek,
} from './enigmaLogic';

export interface AttendanceIndex {
  byCourseAndWeek: Map<string, AttendanceRecord[]>;
  byCourse: Map<string, AttendanceRecord[]>;
  byWeek: Map<number, AttendanceRecord[]>;
  absentSetByRecord: WeakMap<AttendanceRecord, Set<string>>;
}

export function makeCourseWeekKey(courseId: string, weekNumber: number): string {
  return `${courseId}::${weekNumber}`;
}

/**
 * Indexes attendance records by (courseId, weekNumber), courseId, and weekNumber in a single O(R) pass,
 * with pre-built absentStudentIds Sets for O(1) membership checks.
 */
export function buildAttendanceIndex(
  attendanceRecords: AttendanceRecord[]
): AttendanceIndex {
  const byCourseAndWeek = new Map<string, AttendanceRecord[]>();
  const byCourse = new Map<string, AttendanceRecord[]>();
  const byWeek = new Map<number, AttendanceRecord[]>();
  const absentSetByRecord = new WeakMap<AttendanceRecord, Set<string>>();

  for (const r of attendanceRecords) {
    const cwKey = makeCourseWeekKey(r.courseId, r.weekNumber);
    let cwList = byCourseAndWeek.get(cwKey);
    if (!cwList) {
      cwList = [];
      byCourseAndWeek.set(cwKey, cwList);
    }
    cwList.push(r);

    let cList = byCourse.get(r.courseId);
    if (!cList) {
      cList = [];
      byCourse.set(r.courseId, cList);
    }
    cList.push(r);

    let wList = byWeek.get(r.weekNumber);
    if (!wList) {
      wList = [];
      byWeek.set(r.weekNumber, wList);
    }
    wList.push(r);

    absentSetByRecord.set(r, new Set(r.absentStudentIds));
  }

  return {
    byCourseAndWeek,
    byCourse,
    byWeek,
    absentSetByRecord,
  };
}

export interface StudentStatItem {
  student: Student;
  totalSessionsHeld: number;
  absentCount: number;
  attendedCount: number;
  attendanceRate: number;
}

export function computeStudentStats(
  students: Student[],
  attendanceIndex: AttendanceIndex,
  currentWeek: number
): StudentStatItem[] {
  return students
    .map(student => {
      let totalSessionsHeld = 0;
      let absentCount = 0;

      for (const courseId of student.enrolledCourseIds) {
        const courseRecords = attendanceIndex.byCourse.get(courseId);
        if (!courseRecords) continue;
        for (const r of courseRecords) {
          if (r.weekNumber > currentWeek) continue;
          if (!isStudentResponsibleForSession(student, r)) continue;
          totalSessionsHeld++;
          const absentSet = attendanceIndex.absentSetByRecord.get(r);
          if (absentSet ? absentSet.has(student.id) : r.absentStudentIds.includes(student.id)) {
            absentCount++;
          }
        }
      }

      const attendedCount = Math.max(0, totalSessionsHeld - absentCount);
      const attendanceRate =
        totalSessionsHeld > 0 ? attendedCount / totalSessionsHeld : 1;

      return {
        student,
        totalSessionsHeld,
        absentCount,
        attendedCount,
        attendanceRate,
      };
    })
    .sort((a, b) => {
      if (b.absentCount !== a.absentCount) {
        return b.absentCount - a.absentCount;
      }
      if (a.attendanceRate !== b.attendanceRate) {
        return a.attendanceRate - b.attendanceRate;
      }
      return a.student.name.localeCompare(b.student.name, 'tr-TR');
    });
}

export interface InstructorStatItem {
  instructor: Instructor;
  courses: Course[];
  thisWeekRecords: AttendanceRecord[];
  didNotTakeAttendance: boolean;
  markedDidNotHold: boolean;
  inactiveThisWeek: boolean;
  isHolidayThisWeek: boolean;
}

export function computeInstructorStats(
  instructors: Instructor[],
  coursesById: Map<string, Course>,
  attendanceIndex: AttendanceIndex,
  currentWeek: number
): InstructorStatItem[] {
  const currentWeekRecords = attendanceIndex.byWeek.get(currentWeek) || [];
  const currentWeekByInstructor = new Map<string, AttendanceRecord[]>();
  const currentWeekByCourse = new Map<string, AttendanceRecord[]>();

  for (const r of currentWeekRecords) {
    let instList = currentWeekByInstructor.get(r.instructorId);
    if (!instList) {
      instList = [];
      currentWeekByInstructor.set(r.instructorId, instList);
    }
    instList.push(r);

    let courseList = currentWeekByCourse.get(r.courseId);
    if (!courseList) {
      courseList = [];
      currentWeekByCourse.set(r.courseId, courseList);
    }
    courseList.push(r);
  }

  return instructors
    .map(instructor => {
      const instCourses: Course[] = [];
      for (const cid of instructor.courseIds) {
        const c = coursesById.get(cid);
        if (c) instCourses.push(c);
      }

      const isHolidayThisWeek =
        instCourses.length > 0 &&
        instCourses.every(c => c.modality === 'yuzyuze') &&
        isYuzyuzeHolidayWeek(currentWeek);

      const seen = new Set<AttendanceRecord>();
      const thisWeekRecords: AttendanceRecord[] = [];
      const byInst = currentWeekByInstructor.get(instructor.id);
      if (byInst) {
        for (const r of byInst) {
          if (!seen.has(r)) {
            seen.add(r);
            thisWeekRecords.push(r);
          }
        }
      }
      for (const cid of instructor.courseIds) {
        const byCourse = currentWeekByCourse.get(cid);
        if (!byCourse) continue;
        for (const r of byCourse) {
          if (!seen.has(r)) {
            seen.add(r);
            thisWeekRecords.push(r);
          }
        }
      }

      const didNotTakeAttendance = !isHolidayThisWeek && thisWeekRecords.length === 0;
      const markedDidNotHold = !isHolidayThisWeek && thisWeekRecords.some(r => r.didNotHoldClass);
      const inactiveThisWeek = didNotTakeAttendance || markedDidNotHold;

      return {
        instructor,
        courses: instCourses,
        thisWeekRecords,
        didNotTakeAttendance,
        markedDidNotHold,
        inactiveThisWeek,
        isHolidayThisWeek,
      };
    })
    .sort((a, b) => {
      if (a.inactiveThisWeek !== b.inactiveThisWeek) {
        return a.inactiveThisWeek ? -1 : 1;
      }
      if (a.markedDidNotHold !== b.markedDidNotHold) {
        return a.markedDidNotHold ? -1 : 1;
      }
      return a.instructor.name.localeCompare(b.instructor.name, 'tr-TR');
    });
}

export interface CourseStatItem {
  course: Course;
  thisWeekRecords: AttendanceRecord[];
  totalAbsences: number;
  noAttendanceThisWeek: boolean;
  isHolidayThisWeek: boolean;
}

export function computeCourseStats(
  courses: Course[],
  attendanceIndex: AttendanceIndex,
  currentWeek: number
): CourseStatItem[] {
  return courses
    .map(course => {
      const isHolidayThisWeek =
        course.modality === 'yuzyuze' && isYuzyuzeHolidayWeek(currentWeek);

      const allCourseRecords = attendanceIndex.byCourse.get(course.id) || [];
      const thisWeekRecords: AttendanceRecord[] = [];
      let totalAbsences = 0;

      for (const r of allCourseRecords) {
        if (r.weekNumber <= currentWeek) {
          totalAbsences += r.absentStudentIds.length;
          if (r.weekNumber === currentWeek) {
            thisWeekRecords.push(r);
          }
        }
      }

      const noAttendanceThisWeek = !isHolidayThisWeek && thisWeekRecords.length === 0;

      return {
        course,
        thisWeekRecords,
        totalAbsences,
        noAttendanceThisWeek,
        isHolidayThisWeek,
      };
    })
    .sort((a, b) => {
      if (b.totalAbsences !== a.totalAbsences) {
        return b.totalAbsences - a.totalAbsences;
      }
      if (a.noAttendanceThisWeek !== b.noAttendanceThisWeek) {
        return a.noAttendanceThisWeek ? -1 : 1;
      }
      return a.course.title.localeCompare(b.course.title, 'tr-TR');
    });
}

export interface CellSessionBadge {
  sessionType: SessionType;
  shortSession: '1.d' | '2.d' | 'ek';
  status: 'pre_registration' | 'absent' | 'present';
}

export type StudentCourseWeekCellState =
  | { kind: 'holiday' }
  | { kind: 'pre_registration' }
  | { kind: 'unrecorded' }
  | { kind: 'did_not_hold' }
  | { kind: 'sessions'; badges: CellSessionBadge[] };

export function resolveStudentCourseWeekCell(
  course: Course | undefined,
  student: Student | undefined,
  studentId: string,
  courseId: string,
  week: number,
  attendanceIndex: AttendanceIndex
): StudentCourseWeekCellState {
  if (course?.modality === 'yuzyuze' && isYuzyuzeHolidayWeek(week)) {
    return { kind: 'holiday' };
  }

  if (student?.addedAtWeek && week < student.addedAtWeek) {
    return { kind: 'pre_registration' };
  }

  const records = attendanceIndex.byCourseAndWeek.get(makeCourseWeekKey(courseId, week));
  if (!records || records.length === 0) {
    return { kind: 'unrecorded' };
  }

  if (records.some(r => r.didNotHoldClass)) {
    return { kind: 'did_not_hold' };
  }

  const badges: CellSessionBadge[] = records.map(r => {
    const shortSession: '1.d' | '2.d' | 'ek' =
      r.sessionType === '1. ders'
        ? '1.d'
        : r.sessionType === '2. ders'
        ? '2.d'
        : 'ek';

    if (student && !isStudentResponsibleForSession(student, r)) {
      return {
        sessionType: r.sessionType,
        shortSession,
        status: 'pre_registration',
      };
    }

    const absentSet = attendanceIndex.absentSetByRecord.get(r);
    const isAbsent = absentSet
      ? absentSet.has(studentId)
      : r.absentStudentIds.includes(studentId);

    return {
      sessionType: r.sessionType,
      shortSession,
      status: isAbsent ? 'absent' : 'present',
    };
  });

  return { kind: 'sessions', badges };
}
