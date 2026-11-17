import {
  AttendanceRecord,
  Course,
  Instructor,
  normalizeName,
  normalizeTurkish,
  Student,
  UnlistedStudentReport,
} from '../data/database';
import {
  isStudentResponsibleForSession,
  isUnassignedBosInstructor,
  isYuzyuzeHolidayWeek,
} from './enigmaLogic';

/**
 * Feature flag to easily disable or revert the Sibelius AI Assistant if needed.
 * Setting this to `false` completely removes the assistant UI from the Sibelius panel.
 */
export const ENABLE_SIBELIUS_CHATBOT = true;

export interface SibeliusChatContextInput {
  currentWeek: number;
  students: Student[];
  courses: Course[];
  instructors: Instructor[];
  attendanceRecords: AttendanceRecord[];
  unlistedReports: UnlistedStudentReport[];
}

export interface StudentAttendanceSummary {
  id: string;
  name: string;
  grade: string;
  modality: 'online' | 'yuzyuze';
  hasOnlineCourses: boolean;
  hasYuzyuzeCourses: boolean;
  enrolledCourses: string[];
  totalSessionsHeld: number;
  absentCount: number;
  attendedCount: number;
  absentDetails: string[];
}

export interface SibeliusComputedSnapshot {
  currentWeek: number;
  counts: {
    totalUniqueStudents: number;
    onlineEnrolledStudents: number;
    onlineOnlyStudents: number;
    onlinePrimaryModalityStudents: number;
    yuzyuzeEnrolledStudents: number;
    yuzyuzeOnlyStudents: number;
    yuzyuzePrimaryModalityStudents: number;
    hybridBothModalitiesStudents: string[];
    totalCourses: number;
    onlineCourses: number;
    yuzyuzeCourses: number;
    realInstructors: number;
    unassignedBosCourses: number;
    totalAttendanceRecords: number;
    pendingUnlistedReports: number;
  };
  gradeBreakdown: Record<string, { online: number; yuzyuze: number }>;
  topAbsentStudents: Array<{
    name: string;
    grade: string;
    absentCount: number;
    totalSessionsHeld: number;
  }>;
  inactiveInstructorsThisWeek: Array<{
    name: string;
    courses: string[];
    reason: 'yoklama almadı' | 'ders yapmadım işaretledi';
  }>;
  matchedStudents: StudentAttendanceSummary[];
  matchedCourses: Array<{
    title: string;
    modality: string;
    instructorName: string;
    studentCount: number;
    recordedWeeksCount: number;
    thisWeekStatus: string;
  }>;
  matchedInstructors: Array<{
    name: string;
    courses: string[];
    thisWeekStatus: string;
  }>;
  directHint: string | null;
}

export function computeStudentAttendanceSummary(
  student: Student,
  courses: Course[],
  activeAttendanceRecords: AttendanceRecord[],
  currentWeek: number
): StudentAttendanceSummary {
  const courseMap = new Map(courses.map(c => [c.id, c]));
  const relevantRecords = activeAttendanceRecords.filter(
    r => r.weekNumber <= currentWeek && isStudentResponsibleForSession(student, r)
  );
  const absentRecords = relevantRecords.filter(r =>
    r.absentStudentIds.includes(student.id)
  );
  const totalSessionsHeld = relevantRecords.length;
  const absentCount = absentRecords.length;
  const attendedCount = Math.max(0, totalSessionsHeld - absentCount);

  const absentDetails = absentRecords
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map(r => {
      const cTitle = courseMap.get(r.courseId)?.shortTitle || r.courseId;
      return `${r.weekNumber}. hafta ${cTitle} (${r.sessionType})`;
    });

  const enrolledCourses = student.enrolledCourseIds.map(
    cid => courseMap.get(cid)?.shortTitle || cid
  );

  const hasOnlineCourses = student.enrolledCourseIds.some(cid =>
    cid.startsWith('online-') || courseMap.get(cid)?.modality === 'online'
  );
  const hasYuzyuzeCourses = student.enrolledCourseIds.some(cid =>
    cid.startsWith('yy-') || courseMap.get(cid)?.modality === 'yuzyuze'
  );

  return {
    id: student.id,
    name: student.name,
    grade: student.grade,
    modality: student.modality,
    hasOnlineCourses,
    hasYuzyuzeCourses,
    enrolledCourses,
    totalSessionsHeld,
    absentCount,
    attendedCount,
    absentDetails,
  };
}

/**
 * Builds a compact, deterministic data snapshot tailored to the user's question
 * so the Gemini model can answer accurately in 1-2 sentences without hallucinating numbers.
 */
export function buildSibeliusQuerySnapshot(
  question: string,
  input: SibeliusChatContextInput
): SibeliusComputedSnapshot {
  const activeAttendance = input.attendanceRecords.filter(r => !r.deletedAt);
  const activeUnlisted = input.unlistedReports.filter(r => !r.deletedAt);
  const courseMap = new Map(input.courses.map(c => [c.id, c]));

  let onlineEnrolledStudents = 0;
  let onlineOnlyStudents = 0;
  let onlinePrimaryModalityStudents = 0;
  let yuzyuzeEnrolledStudents = 0;
  let yuzyuzeOnlyStudents = 0;
  let yuzyuzePrimaryModalityStudents = 0;
  const hybridBothModalitiesStudents: string[] = [];

  for (const s of input.students) {
    const hasOnline = s.enrolledCourseIds.some(
      cid => cid.startsWith('online-') || courseMap.get(cid)?.modality === 'online'
    );
    const hasYy = s.enrolledCourseIds.some(
      cid => cid.startsWith('yy-') || courseMap.get(cid)?.modality === 'yuzyuze'
    );

    if (s.modality === 'online') onlinePrimaryModalityStudents++;
    if (s.modality === 'yuzyuze') yuzyuzePrimaryModalityStudents++;

    if (hasOnline) onlineEnrolledStudents++;
    if (hasYy) yuzyuzeEnrolledStudents++;
    if (hasOnline && !hasYy) onlineOnlyStudents++;
    if (hasYy && !hasOnline) yuzyuzeOnlyStudents++;
    if (hasOnline && hasYy) hybridBothModalitiesStudents.push(s.name);
  }

  // Per-grade unique student counts
  const gradeBreakdown: Record<string, { online: number; yuzyuze: number }> = {};
  for (const c of input.courses) {
    const key = c.gradeClass;
    if (!gradeBreakdown[key]) {
      gradeBreakdown[key] = { online: 0, yuzyuze: 0 };
    }
  }
  const gradeSets = new Map<string, { online: Set<string>; yuzyuze: Set<string> }>();
  for (const c of input.courses) {
    if (!gradeSets.has(c.gradeClass)) {
      gradeSets.set(c.gradeClass, { online: new Set(), yuzyuze: new Set() });
    }
    const bucket = gradeSets.get(c.gradeClass)!;
    const targetSet = c.modality === 'online' ? bucket.online : bucket.yuzyuze;
    for (const sid of c.studentIds) {
      targetSet.add(sid);
    }
  }
  for (const [gradeClass, sets] of gradeSets.entries()) {
    gradeBreakdown[gradeClass] = {
      online: sets.online.size,
      yuzyuze: sets.yuzyuze.size,
    };
  }

  // Compute attendance summaries for all students
  const allStudentSummaries = input.students.map(s =>
    computeStudentAttendanceSummary(s, input.courses, activeAttendance, input.currentWeek)
  );

  const sortedByAbsence = [...allStudentSummaries].sort((a, b) => {
    if (b.absentCount !== a.absentCount) return b.absentCount - a.absentCount;
    return a.name.localeCompare(b.name, 'tr-TR');
  });

  const topAbsentStudents = sortedByAbsence
    .filter(s => s.absentCount > 0)
    .slice(0, 8)
    .map(s => ({
      name: s.name,
      grade: s.grade,
      absentCount: s.absentCount,
      totalSessionsHeld: s.totalSessionsHeld,
    }));

  // Inactive instructors this week
  const realInstructorsList = input.instructors.filter(
    i => !isUnassignedBosInstructor(i.name)
  );
  const inactiveInstructorsThisWeek: SibeliusComputedSnapshot['inactiveInstructorsThisWeek'] = [];

  for (const inst of realInstructorsList) {
    const instCourses = inst.courseIds
      .map(cid => courseMap.get(cid))
      .filter((c): c is Course => Boolean(c));

    const isHoliday =
      instCourses.length > 0 &&
      instCourses.every(c => c.modality === 'yuzyuze') &&
      isYuzyuzeHolidayWeek(input.currentWeek);

    if (isHoliday) continue;

    const weekRecords = activeAttendance.filter(
      r =>
        (r.instructorId === inst.id || inst.courseIds.includes(r.courseId)) &&
        r.weekNumber === input.currentWeek
    );

    if (weekRecords.length === 0) {
      inactiveInstructorsThisWeek.push({
        name: inst.name,
        courses: instCourses.map(c => c.shortTitle),
        reason: 'yoklama almadı',
      });
    } else if (weekRecords.some(r => r.didNotHoldClass)) {
      inactiveInstructorsThisWeek.push({
        name: inst.name,
        courses: instCourses.map(c => c.shortTitle),
        reason: 'ders yapmadım işaretledi',
      });
    }
  }

  // Match specific students, courses, or instructors mentioned in the question
  const normQ = normalizeName(question);
  const qTokens = normQ
    .split(/\s+/)
    .map(t => t.replace(/[^a-z0-9çğıöşü]/gi, ''))
    .filter(t => t.length >= 2);

  // Stopwords that shouldn't trigger name matches by themselves
  const stopWords = new Set([
    'kac',
    'kaç',
    'var',
    'yok',
    'ogrenci',
    'öğrenci',
    'ders',
    'derse',
    'hafta',
    'gelmemis',
    'gelmemiş',
    'gelmedi',
    'katilmadi',
    'katılmadı',
    'devamsizlik',
    'devamsızlık',
    'cevrim',
    'çevrim',
    'ici',
    'içi',
    'online',
    'yuz',
    'yüz',
    'yuze',
    'yüze',
    'sinif',
    'sınıf',
    'sube',
    'şube',
    'toplam',
    'egitmen',
    'eğitmen',
    'hoca',
    'kim',
    'kimler',
    'nedir',
    'nasil',
    'nasıl',
    'kez',
    'kere',
    'tane',
    'kisi',
    'kişi',
    'yoklama',
  ]);

  const candidateTokens = qTokens.filter(
    t => t.length >= 3 && !stopWords.has(t) && !stopWords.has(normalizeTurkish(t))
  );

  // Score students by token overlap or substring match (handling Turkish suffixes like "ali'nin", "beren'in")
  const scoredStudents = allStudentSummaries
    .map(summary => {
      const sNorm = normalizeName(summary.name);
      const sParts = sNorm.split(/\s+/);
      let score = 0;

      if (normQ.includes(sNorm)) {
        score += 10;
      }
      for (const part of sParts) {
        if (part.length < 2) continue;
        if (candidateTokens.some(qt => qt === part || (part.length >= 3 && qt.startsWith(part)))) {
          score += 3;
        }
      }
      return { summary, score };
    })
    .filter(item => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(item => item.summary);

  const matchedCourses = input.courses
    .filter(c => {
      const titleNorm = normalizeName(c.title);
      const shortNorm = normalizeName(c.shortTitle);
      return (
        normQ.includes(shortNorm) ||
        normQ.includes(c.gradeClass) ||
        candidateTokens.some(t => titleNorm.includes(t))
      );
    })
    .slice(0, 10)
    .map(c => {
      const cRecords = activeAttendance.filter(
        r => r.courseId === c.id && r.weekNumber <= input.currentWeek
      );
      const thisWeek = cRecords.filter(r => r.weekNumber === input.currentWeek);
      return {
        title: c.title,
        modality: c.modality,
        instructorName: c.instructorName,
        studentCount: c.studentIds.length,
        recordedWeeksCount: new Set(cRecords.map(r => r.weekNumber)).size,
        thisWeekStatus:
          thisWeek.length === 0
            ? 'bu hafta yoklama girilmedi'
            : thisWeek.some(r => r.didNotHoldClass)
            ? 'bu hafta ders yapılmadı'
            : `bu hafta yoklama alındı (${thisWeek.map(r => r.sessionType).join(', ')})`,
      };
    });

  const matchedInstructors = realInstructorsList
    .filter(inst => {
      const iNorm = normalizeName(inst.name);
      const iParts = iNorm.split(/\s+/);
      return (
        normQ.includes(iNorm) ||
        iParts.some(
          p => p.length >= 3 && candidateTokens.some(qt => qt.startsWith(p))
        )
      );
    })
    .slice(0, 6)
    .map(inst => {
      const instCourses = inst.courseIds
        .map(cid => courseMap.get(cid)?.shortTitle || cid);
      const weekRecords = activeAttendance.filter(
        r =>
          (r.instructorId === inst.id || inst.courseIds.includes(r.courseId)) &&
          r.weekNumber === input.currentWeek
      );
      return {
        name: inst.name,
        courses: instCourses,
        thisWeekStatus:
          weekRecords.length === 0
            ? 'bu hafta yoklama girmedi'
            : weekRecords.some(r => r.didNotHoldClass)
            ? 'bu hafta ders yapmadım işaretledi'
            : `bu hafta ${weekRecords.length} oturum yoklaması girdi`,
      };
    });

  let directHint: string | null = null;
  if (scoredStudents.length === 1) {
    const st = scoredStudents[0];
    directHint =
      st.absentCount === 0
        ? `${st.name} (${st.grade}): sorumlu olduğu ${st.totalSessionsHeld} oturumun tamamına katıldı, hiç devamsızlığı yok (0 kez gelmedi).`
        : `${st.name} (${st.grade}): sorumlu olduğu ${st.totalSessionsHeld} oturumda toplam ${st.absentCount} kez derse gelmedi (${st.attendedCount} oturuma katıldı). Gelmediği oturumlar: ${st.absentDetails.join('; ')}.`;
  }

  return {
    currentWeek: input.currentWeek,
    counts: {
      totalUniqueStudents: input.students.length,
      onlineEnrolledStudents,
      onlineOnlyStudents,
      onlinePrimaryModalityStudents,
      yuzyuzeEnrolledStudents,
      yuzyuzeOnlyStudents,
      yuzyuzePrimaryModalityStudents,
      hybridBothModalitiesStudents,
      totalCourses: input.courses.length,
      onlineCourses: input.courses.filter(c => c.modality === 'online').length,
      yuzyuzeCourses: input.courses.filter(c => c.modality === 'yuzyuze').length,
      realInstructors: realInstructorsList.length,
      unassignedBosCourses: input.courses.filter(c =>
        isUnassignedBosInstructor(c.instructorName)
      ).length,
      totalAttendanceRecords: activeAttendance.length,
      pendingUnlistedReports: activeUnlisted.filter(r => r.status === 'pending').length,
    },
    gradeBreakdown,
    topAbsentStudents,
    inactiveInstructorsThisWeek: inactiveInstructorsThisWeek.slice(0, 15),
    matchedStudents: scoredStudents,
    matchedCourses,
    matchedInstructors,
    directHint,
  };
}
