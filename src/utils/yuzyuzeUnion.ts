import {
  Course,
  isPlaceholderStudentName,
  Modality,
  normalizeTurkish,
  Student,
} from '../data/database';

export interface YuzyuzeStudentUnionUpdate {
  student: Student;
  previousCourseIds: string[];
  nextEnrolledCourseIds: string[];
  addedCourseIds: string[];
  gradeClassesAffected: string[];
}

export interface YuzyuzeClassUnionSummary {
  gradeClass: string;
  courseIds: string[];
  beforeCountsByCourseId: Record<string, number>;
  unionStudentCount: number;
  studentsUpdatedCount: number;
}

export interface YuzyuzeClassUnionPlan {
  studentUpdates: YuzyuzeStudentUnionUpdate[];
  classSummaries: YuzyuzeClassUnionSummary[];
  updatedClassesCount: number;
  updatedStudentsCount: number;
  addedEnrollmentsCount: number;
}

export interface YuzyuzeUnionExecutionResult {
  updatedClassesCount: number;
  updatedStudentsCount: number;
  addedEnrollmentsCount: number;
}

export interface ClassBreakdownItem {
  modality: Modality;
  gradeClass: string;
  unionStudentCount: number;
  courses: Array<{
    courseId: string;
    subject: string;
    studentCount: number;
  }>;
}

export interface CustomStudentUnionFirestorePayload {
  id: string;
  name: string;
  grade: string;
  modality: Modality;
  enrolledCourseIds: string[];
  addedAtWeek: number;
  addedAt: string;
  addedAtIso: string;
  deletedAt: null;
}

const MAX_FIRESTORE_ENROLLED_COURSES = 30;

/**
 * Computes the set union of enrolled students per yüz yüze (in-person) class
 * (`modality === 'yuzyuze'`), grouped strictly by `gradeClass` (e.g. "5/a", "6/b").
 *
 * Online courses are never grouped or added; any existing online enrollments on a
 * dual-modality student are preserved untouched.
 */
export function computeYuzyuzeClassUnionPlan(params: {
  students: Student[];
  courses: Course[];
}): YuzyuzeClassUnionPlan {
  const activeStudents = params.students.filter(
    s => !s.deletedAt && !isPlaceholderStudentName(s.name)
  );

  // Group strictly yüz yüze courses by normalized gradeClass
  const coursesByGrade = new Map<string, Course[]>();
  for (const course of params.courses) {
    if (course.modality !== 'yuzyuze') continue;
    const gradeKey = normalizeTurkish(course.gradeClass);
    if (!gradeKey) continue;
    const bucket = coursesByGrade.get(gradeKey) || [];
    bucket.push(course);
    coursesByGrade.set(gradeKey, bucket);
  }

  // Track required yüz yüze courseIds and gradeClasses per studentId
  const studentTargetAdditions = new Map<
    string,
    {
      student: Student;
      targetCourseIds: Set<string>;
      gradeClasses: Set<string>;
    }
  >();

  const classSummaries: YuzyuzeClassUnionSummary[] = [];

  const sortedGrades = Array.from(coursesByGrade.keys()).sort((a, b) =>
    a.localeCompare(b, 'tr-TR')
  );

  for (const gradeClass of sortedGrades) {
    const gradeCourses = coursesByGrade.get(gradeClass) || [];
    const gradeCourseIds = Array.from(new Set(gradeCourses.map(c => c.id)));
    const gradeCourseIdSet = new Set(gradeCourseIds);

    const beforeCountsByCourseId: Record<string, number> = {};
    for (const c of gradeCourses) {
      beforeCountsByCourseId[c.id] = 0;
    }

    const unionStudents: Student[] = [];

    for (const student of activeStudents) {
      let inAnyCourseOfGrade = false;
      for (const c of gradeCourses) {
        const isInCourse =
          student.enrolledCourseIds.includes(c.id) ||
          c.studentIds.includes(student.id);
        if (isInCourse) {
          beforeCountsByCourseId[c.id] = (beforeCountsByCourseId[c.id] || 0) + 1;
          inAnyCourseOfGrade = true;
        }
      }
      if (inAnyCourseOfGrade) {
        unionStudents.push(student);
      }
    }

    let studentsUpdatedInClass = 0;

    for (const student of unionStudents) {
      const existingSet = new Set(student.enrolledCourseIds);
      const missingInClass = gradeCourseIds.filter(cid => !existingSet.has(cid));
      if (missingInClass.length > 0) {
        studentsUpdatedInClass++;
      }

      let entry = studentTargetAdditions.get(student.id);
      if (!entry) {
        entry = {
          student,
          targetCourseIds: new Set<string>(),
          gradeClasses: new Set<string>(),
        };
        studentTargetAdditions.set(student.id, entry);
      }
      for (const cid of gradeCourseIdSet) {
        entry.targetCourseIds.add(cid);
      }
      if (missingInClass.length > 0) {
        entry.gradeClasses.add(gradeClass);
      }
    }

    classSummaries.push({
      gradeClass,
      courseIds: gradeCourseIds,
      beforeCountsByCourseId,
      unionStudentCount: unionStudents.length,
      studentsUpdatedCount: studentsUpdatedInClass,
    });
  }

  const studentUpdates: YuzyuzeStudentUnionUpdate[] = [];
  let addedEnrollmentsCount = 0;

  for (const entry of studentTargetAdditions.values()) {
    const { student, targetCourseIds, gradeClasses } = entry;
    const dedupedExisting = Array.from(new Set(student.enrolledCourseIds));
    const existingSet = new Set(dedupedExisting);

    const addedCourseIds = Array.from(targetCourseIds).filter(
      cid => !existingSet.has(cid)
    );
    if (addedCourseIds.length === 0) continue;

    const nextEnrolledCourseIds = [
      ...dedupedExisting,
      ...addedCourseIds,
    ].slice(0, MAX_FIRESTORE_ENROLLED_COURSES);

    addedEnrollmentsCount += Math.max(
      0,
      nextEnrolledCourseIds.length - dedupedExisting.length
    );

    studentUpdates.push({
      student,
      previousCourseIds: dedupedExisting,
      nextEnrolledCourseIds,
      addedCourseIds,
      gradeClassesAffected: Array.from(gradeClasses).sort((a, b) =>
        a.localeCompare(b, 'tr-TR')
      ),
    });
  }

  studentUpdates.sort((a, b) =>
    a.student.name.localeCompare(b.student.name, 'tr-TR')
  );

  const updatedClassesCount = classSummaries.filter(
    s => s.studentsUpdatedCount > 0
  ).length;

  return {
    studentUpdates,
    classSummaries,
    updatedClassesCount,
    updatedStudentsCount: studentUpdates.length,
    addedEnrollmentsCount,
  };
}

/**
 * Builds a Firestore `custom_students/{id}` payload that strictly complies with
 * `isValidCustomStudent` in `firestore.rules`.
 */
export function buildCustomStudentUnionPayload(
  student: Student,
  nextEnrolledCourseIds: string[],
  nowIso: string
): CustomStudentUnionFirestorePayload {
  const safeAddedAtWeek = Math.min(
    52,
    Math.max(1, Math.round(student.addedAtWeek || 1))
  );
  const safeAddedAtIso =
    student.addedAt && student.addedAt.length <= 64 ? student.addedAt : nowIso;

  const dedupedCourses = Array.from(new Set(nextEnrolledCourseIds)).slice(
    0,
    MAX_FIRESTORE_ENROLLED_COURSES
  );

  return {
    id: student.id.slice(0, 120),
    name: student.name.slice(0, 120),
    grade: (student.grade || '5. sınıf').slice(0, 40),
    modality: student.modality === 'online' ? 'online' : 'yuzyuze',
    enrolledCourseIds: dedupedCourses,
    addedAtWeek: safeAddedAtWeek,
    addedAt: safeAddedAtIso,
    addedAtIso: safeAddedAtIso,
    deletedAt: null,
  };
}

/**
 * Computes per-class union student counts and per-course student counts across modalities.
 */
export function computeClassStudentBreakdown(
  courses: Course[],
  students?: Student[]
): ClassBreakdownItem[] {
  const activeStudentIdSet = students
    ? new Set(
        students
          .filter(s => !s.deletedAt && !isPlaceholderStudentName(s.name))
          .map(s => s.id)
      )
    : null;

  const groups = new Map<
    string,
    {
      modality: Modality;
      gradeClass: string;
      unionIds: Set<string>;
      courses: Array<{ courseId: string; subject: string; studentCount: number }>;
    }
  >();

  for (const c of courses) {
    const key = `${c.modality}::${c.gradeClass}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = {
        modality: c.modality,
        gradeClass: c.gradeClass,
        unionIds: new Set<string>(),
        courses: [],
      };
      groups.set(key, bucket);
    }

    const memberIds = students
      ? students
          .filter(
            s =>
              !s.deletedAt &&
              !isPlaceholderStudentName(s.name) &&
              (s.enrolledCourseIds.includes(c.id) ||
                c.studentIds.includes(s.id))
          )
          .map(s => s.id)
      : c.studentIds.filter(id => !activeStudentIdSet || activeStudentIdSet.has(id));

    const uniqueMemberIds = Array.from(new Set(memberIds));
    for (const id of uniqueMemberIds) {
      bucket.unionIds.add(id);
    }

    bucket.courses.push({
      courseId: c.id,
      subject: c.subject,
      studentCount: uniqueMemberIds.length,
    });
  }

  return Array.from(groups.values())
    .map(g => ({
      modality: g.modality,
      gradeClass: g.gradeClass,
      unionStudentCount: g.unionIds.size,
      courses: g.courses,
    }))
    .sort((a, b) => {
      if (a.modality !== b.modality) {
        return a.modality === 'yuzyuze' ? -1 : 1;
      }
      return a.gradeClass.localeCompare(b.gradeClass, 'tr-TR', {
        numeric: true,
      });
    });
}
