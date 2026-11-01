import {
  AttendanceRecord,
  Course,
  DB,
  getCanonicalStudentName,
  Instructor,
  Modality,
  normalizeTurkish,
  SessionType,
  slugifyTurkish,
  Student,
  UnlistedStudentReport,
} from '../data/database';

export type LoginResolution =
  | { type: 'admin' }
  | { type: 'feedback_admin' }
  | { type: 'instructor'; instructor: Instructor }
  | { type: 'need_surname'; matchingFirstName: string; candidates: Instructor[] }
  | { type: 'not_found' };

/**
 * Resolves the user input from the "hoş geldin canım, sen kimsin?" prompt.
 * - "sibelius" -> Ekip (Admin) interface
 * - "amadeus" -> Feedback grid interface
 * - Instructor full name or unique first name -> Instructor session selection
 * - Shared first name (e.g. "zehra", "elif", "yağmur", "kaan", "berat", "eymen", "ayşegül", "berra") -> asks for surname
 */
export function resolveIdentityInput(rawInput: string): LoginResolution {
  const input = normalizeTurkish(rawInput);
  if (!input) {
    return { type: 'not_found' };
  }

  if (input === 'sibelius') {
    return { type: 'admin' };
  }

  if (input === 'amadeus') {
    return { type: 'feedback_admin' };
  }

  // 1. Check exact match on full instructor name or alias (e.g. bos1, bos2, bos3, bos4)
  const exactFullMatches = DB.instructors.filter(
    inst => inst.name === input || inst.alias === input
  );
  if (exactFullMatches.length === 1) {
    return { type: 'instructor', instructor: exactFullMatches[0] };
  }

  // 2. Check if user entered first name + last name (ignoring middle name, e.g., "elif dede" for "elif büşra dede")
  const inputTokens = input.split(' ').filter(Boolean);
  if (inputTokens.length >= 2) {
    const first = inputTokens[0];
    const last = inputTokens[inputTokens.length - 1];
    const firstLastMatches = DB.instructors.filter(inst => {
      // Match first + last, or match prefix of multi-word name
      const matchesFirstLast = inst.firstName === first && inst.lastName === last;
      const matchesPrefix = inst.name.startsWith(input + ' ') || inst.name === input;
      return matchesFirstLast || matchesPrefix;
    });

    if (firstLastMatches.length === 1) {
      return { type: 'instructor', instructor: firstLastMatches[0] };
    }
    if (firstLastMatches.length > 1) {
      return {
        type: 'need_surname',
        matchingFirstName: input,
        candidates: firstLastMatches,
      };
    }
  }

  // 3. Single token or partial given name check
  const firstNameMatches = DB.instructors.filter(inst => {
    const instTokens = inst.name.split(' ');
    const givenNames = instTokens.slice(0, -1); // all tokens except surname
    return (
      inst.firstName === input ||
      givenNames.includes(input) ||
      givenNames.join(' ') === input
    );
  });

  if (firstNameMatches.length === 1) {
    return { type: 'instructor', instructor: firstNameMatches[0] };
  }

  if (firstNameMatches.length > 1) {
    return {
      type: 'need_surname',
      matchingFirstName: input,
      candidates: firstNameMatches,
    };
  }

  return { type: 'not_found' };
}

/**
 * Calculates the current academic week number automatically, advancing every Monday.
 * Anchor Monday: October 19, 2026 (Week 1).
 */
export function getCurrentWeekNumber(now: Date = new Date()): number {
  // Anchor: Monday, Oct 19, 2026 00:00:00 local time
  const anchorMonday = new Date(2026, 9, 19, 0, 0, 0, 0);
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const diffMs = current.getTime() - anchorMonday.getTime();
  if (diffMs < 0) {
    return 1;
  }
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(52, week));
}

/**
 * Formats the Monday-Sunday date range for a given week number in lowercase Turkish.
 */
export function getWeekDateRangeLabel(weekNumber: number): string {
  const anchorMonday = new Date(2026, 9, 19, 0, 0, 0, 0);
  const start = new Date(anchorMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);

  const months = [
    'ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran',
    'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'
  ];

  const sDay = start.getDate();
  const sMonth = months[start.getMonth()];
  const eDay = end.getDate();
  const eMonth = months[end.getMonth()];

  if (sMonth === eMonth) {
    return `${sDay} - ${eDay} ${eMonth}`;
  }
  return `${sDay} ${sMonth} - ${eDay} ${eMonth}`;
}

/**
 * Given the full list of course student IDs and the IDs of students marked present ("derste"),
 * returns the difference set (fark kümesi) of absent student IDs.
 */
export function computeAbsentDifferenceSet(
  courseStudentIds: string[],
  presentStudentIds: string[]
): string[] {
  const presentSet = new Set(presentStudentIds);
  return courseStudentIds.filter(id => !presentSet.has(id));
}

/**
 * Determines whether a student is responsible for a given attendance record.
 * Students added later in the term are NOT held responsible for weeks or sessions
 * that took place before they were added.
 */
export function isStudentResponsibleForSession(
  student: Pick<Student, 'id' | 'enrolledCourseIds' | 'addedAtWeek' | 'addedAt'>,
  record: Pick<AttendanceRecord, 'courseId' | 'weekNumber' | 'updatedAt' | 'didNotHoldClass'>
): boolean {
  if (!student.enrolledCourseIds.includes(record.courseId)) return false;
  if (record.didNotHoldClass) return false;
  if (student.addedAtWeek && record.weekNumber < student.addedAtWeek) return false;
  if (student.addedAt && record.updatedAt < student.addedAt) return false;
  return true;
}

/**
 * Builds a clean Student record for a newly added student.
 */
export function createNewStudentRecord(params: {
  rawName: string;
  modality: Modality;
  gradeLabel: string;
  enrolledCourseIds: string[];
  currentWeek: number;
  nowIso?: string;
}): Student {
  const normName = normalizeTurkish(params.rawName);
  const slug = slugifyTurkish(normName);
  return {
    id: `stu-${slug}`,
    name: normName,
    grade: normalizeTurkish(params.gradeLabel),
    modality: params.modality,
    enrolledCourseIds: params.enrolledCourseIds,
    addedAtWeek: params.currentWeek,
    addedAt: params.nowIso || new Date().toISOString(),
  };
}

/**
 * Checks whether a course's current instructor is one of the unassigned placeholders (bos1, bos2, etc.).
 */
export function isUnassignedBosInstructor(instructorName: string): boolean {
  return /^bos\d+$/i.test(normalizeTurkish(instructorName));
}

/**
 * Finds an existing student by full name (first + last name match after Turkish normalization & canonical mapping).
 * "aynı isim soy isimse aynı öğrencidir"
 */
export function findMatchingStudentByFullName(
  rawName: string,
  students: Student[]
): Student | undefined {
  const canonical = getCanonicalStudentName(rawName);
  if (!canonical) return undefined;
  const targetSlugId = `stu-${slugifyTurkish(canonical)}`;
  return students.find(
    s =>
      s.id === targetSlugId ||
      getCanonicalStudentName(s.name) === canonical ||
      normalizeTurkish(s.name) === canonical
  );
}

export const MELEK_YILMAZ_REASSURANCE_MESSAGE =
  'aklın sakın orada kalmasın melek, yoklaman kayıt altında, iyi dersler';

/**
 * Checks whether the given instructor is exclusively "melek yılmaz".
 */
export function isMelekYilmazInstructor(
  instructor: Pick<Instructor, 'id' | 'name'> | null | undefined
): boolean {
  if (!instructor) return false;
  return (
    normalizeTurkish(instructor.name) === 'melek yılmaz' ||
    instructor.id === 'inst-melek-yilmaz'
  );
}

export type ExitAttendanceChoice =
  | 'herkes_derste'
  | 'kimse_gelmedi'
  | 'yoklama_almiyorum';

/**
 * Determines whether the instructor should be prompted with:
 * "durum nedir? herkes derste / kimse derse gelmedi / şu anda yoklama almıyorum"
 * when leaving a lesson or course without taking attendance or without clicking any student.
 */
export function shouldPromptEmptyExit(params: {
  selectedSession: SessionType | null;
  presentStudentCount: number;
  sessionUnlistedCount: number;
  courseWeekRecordsCount: number;
  hasExplicitZeroConfirmation?: boolean;
}): boolean {
  const {
    selectedSession,
    presentStudentCount,
    sessionUnlistedCount,
    courseWeekRecordsCount,
    hasExplicitZeroConfirmation = false,
  } = params;

  if (selectedSession === 'ders yapmadım') {
    return false;
  }

  // If a session (1. ders, 2. ders, ek dersler) is open and no student is marked present
  if (selectedSession !== null) {
    if (hasExplicitZeroConfirmation) return false;
    return presentStudentCount === 0 && sessionUnlistedCount === 0;
  }

  // If no session is selected and no attendance record exists for this course & week at all
  return courseWeekRecordsCount === 0;
}

/**
 * Computes the attendance action to perform based on the instructor's answer to "durum nedir?".
 */
export function resolveExitPromptDecision(
  choice: ExitAttendanceChoice,
  params: {
    selectedSession: SessionType | null;
    courseStudentIds: string[];
  }
):
  | {
      action: 'save';
      sessionType: SessionType;
      absentStudentIds: string[];
      didNotHoldClass: boolean;
    }
  | {
      action: 'discard';
      sessionType: SessionType | null;
    } {
  const targetSession: SessionType =
    params.selectedSession && params.selectedSession !== 'ders yapmadım'
      ? params.selectedSession
      : '1. ders';

  if (choice === 'herkes_derste') {
    return {
      action: 'save',
      sessionType: targetSession,
      absentStudentIds: [],
      didNotHoldClass: false,
    };
  }

  if (choice === 'kimse_gelmedi') {
    return {
      action: 'save',
      sessionType: targetSession,
      absentStudentIds: [...params.courseStudentIds],
      didNotHoldClass: false,
    };
  }

  return {
    action: 'discard',
    sessionType: params.selectedSession,
  };
}

/**
 * Checks whether an attendance record represents an unprocessed "nobody came to class" (0 present)
 * session, while preserving any processed sessions (where at least 1 student was present at the
 * time of recording, or an unlisted student was reported in that session, or "ders yapmadım" was chosen).
 */
export function isZeroPresentAttendanceRecord(
  record: AttendanceRecord,
  courses: Course[],
  unlistedReports: UnlistedStudentReport[] = [],
  customStudents: Student[] = []
): boolean {
  if (record.didNotHoldClass || record.sessionType === 'ders yapmadım') {
    return false;
  }

  const hasUnlistedInSession = unlistedReports.some(
    u =>
      u.courseId === record.courseId &&
      u.weekNumber === record.weekNumber &&
      u.sessionType === record.sessionType
  );
  if (hasUnlistedInSession) {
    return false;
  }

  const course = courses.find(c => c.id === record.courseId);
  if (!course || course.studentIds.length === 0) {
    return false;
  }

  // Students who were on the course roster at the time this attendance record was saved
  const rosterAtRecordTime = course.studentIds.filter(sid => {
    const customStu = customStudents.find(cs => cs.id === sid);
    if (!customStu) return true;
    const resolvedReports = unlistedReports.filter(
      u => u.resolvedStudentId === sid && Boolean(u.resolvedAt)
    );
    if (resolvedReports.length > 0) {
      const earliestResolved = resolvedReports
        .map(u => u.resolvedAt!)
        .sort()[0];
      return earliestResolved <= record.updatedAt;
    }
    return (customStu.addedAt || '') <= record.updatedAt;
  });

  if (rosterAtRecordTime.length === 0) {
    return false;
  }

  const presentAtRecordTime = rosterAtRecordTime.filter(
    sid => !record.absentStudentIds.includes(sid)
  );

  return presentAtRecordTime.length === 0;
}

/**
 * Filters and returns only the attendance records where nobody came to class (0 present),
 * leaving all processed attendance records untouched.
 */
export function getZeroPresentAttendanceRecords(
  attendanceRecords: AttendanceRecord[],
  courses: Course[],
  unlistedReports: UnlistedStudentReport[] = [],
  customStudents: Student[] = []
): AttendanceRecord[] {
  return attendanceRecords.filter(record =>
    isZeroPresentAttendanceRecord(record, courses, unlistedReports, customStudents)
  );
}

