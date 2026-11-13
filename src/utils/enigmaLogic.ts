import {
  AttendanceRecord,
  buildStudentIdFromName,
  Course,
  DB,
  Instructor,
  isPairIgnoredAsNotDuplicate,
  isPlaceholderStudentName,
  Modality,
  normalizeName,
  normalizeTurkish,
  NotDuplicatePairRecord,
  resolveCanonicalStudentId,
  SessionType,
  slugifyTurkish,
  Student,
  UnlistedStudentReport,
} from '../data/database';
import {
  ACADEMIC_CONFIG,
  getTrustedNow,
  getZonedDateParts,
  ONLINE_THANK_YOU_EXPIRES_WEEK,
  ONLINE_THANK_YOU_WEEK,
  parseIsoDateToUtcMidnightMs,
  YUZYUZE_HOLIDAY_WEEKS,
} from '../config/academicConfig';

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
  const input = normalizeName(rawInput);
  if (!input) {
    return { type: 'not_found' };
  }

  if (input === 'sibelius') {
    return { type: 'admin' };
  }

  if (input === 'amadeus') {
    return { type: 'feedback_admin' };
  }

  // 1. Check exact match on full instructor name, alias (e.g. bos1..bos4), or space-insensitive full name
  const collapsedInput = input.replace(/\s+/g, '');
  const exactFullMatches = DB.instructors.filter(
    inst =>
      inst.name === input ||
      inst.alias === input ||
      inst.name.replace(/\s+/g, '') === collapsedInput
  );
  if (exactFullMatches.length === 1) {
    return { type: 'instructor', instructor: exactFullMatches[0] };
  }

  // 2. Check if user entered given name + last name (including middle name + last name, e.g., "elif dede" or "büşra dede" for "elif büşra dede")
  const inputTokens = input.split(' ').filter(Boolean);
  if (inputTokens.length >= 2) {
    const first = inputTokens[0];
    const last = inputTokens[inputTokens.length - 1];
    const firstLastMatches = DB.instructors.filter(inst => {
      const instTokens = inst.name.split(' ').filter(Boolean);
      const givenNames = instTokens.slice(0, -1);
      const matchesGivenAndLast =
        (inst.firstName === first ||
          givenNames.includes(first) ||
          inst.firstName === `${first}nur`) &&
        inst.lastName === last;
      const matchesPrefix = inst.name.startsWith(input + ' ') || inst.name === input;
      const matchesSuffix = inst.name.endsWith(' ' + input);
      return matchesGivenAndLast || matchesPrefix || matchesSuffix;
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
      givenNames.join(' ') === input ||
      givenNames.join('') === collapsedInput
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

  // 4. Fallback for compound "-nur" first names (e.g. "buse" -> "busenur uçar") or unique last/second name (e.g. "zümra" -> "ayşegül zümra")
  const fallbackMatches = DB.instructors.filter(
    inst => inst.firstName === `${input}nur` || inst.lastName === input
  );
  if (fallbackMatches.length === 1) {
    return { type: 'instructor', instructor: fallbackMatches[0] };
  }
  if (fallbackMatches.length > 1) {
    return {
      type: 'need_surname',
      matchingFirstName: input,
      candidates: fallbackMatches,
    };
  }

  return { type: 'not_found' };
}

/**
 * Calculates the current academic week number automatically, advancing every Monday in Europe/Istanbul timezone.
 * Independent of local device timezone and uses configurable term start date (ACADEMIC_CONFIG.termStartMondayIso).
 */
export function getCurrentWeekNumber(
  now: Date = getTrustedNow(),
  termStartIso: string = ACADEMIC_CONFIG.termStartMondayIso,
  timeZone: string = ACADEMIC_CONFIG.timeZone
): number {
  const anchorUtcMs = parseIsoDateToUtcMidnightMs(termStartIso);
  const { year, month, day } = getZonedDateParts(now, timeZone);
  const currentUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  const diffMs = currentUtcMs - anchorUtcMs;
  if (diffMs < 0) {
    return 1;
  }
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(ACADEMIC_CONFIG.maxWeeks, week));
}

/**
 * Formats the Monday-Sunday date range for a given week number in lowercase Turkish,
 * using configurable term start date and timezone-independent UTC calendar math.
 */
export function getWeekDateRangeLabel(
  weekNumber: number,
  termStartIso: string = ACADEMIC_CONFIG.termStartMondayIso
): string {
  const anchorUtcMs = parseIsoDateToUtcMidnightMs(termStartIso);
  const start = new Date(anchorUtcMs + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);

  const months = [
    'ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran',
    'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'
  ];

  const sDay = start.getUTCDate();
  const sMonth = months[start.getUTCMonth()];
  const eDay = end.getUTCDate();
  const eMonth = months[end.getUTCMonth()];

  if (sMonth === eMonth) {
    return `${sDay} - ${eDay} ${eMonth}`;
  }
  return `${sDay} ${sMonth} - ${eDay} ${eMonth}`;
}

/**
 * Generates a deterministic attendance document ID with proper Turkish character transliteration
 * (ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c).
 */
export function buildAttendanceDocId(
  courseId: string,
  weekNumber: number,
  sessionType: SessionType | string
): string {
  const courseSlug = slugifyTurkish(courseId);
  const sessionSlug = slugifyTurkish(sessionType);
  return `${courseSlug}_w${weekNumber}_${sessionSlug}`;
}

/**
 * Generates document ID for coordinator assignments: "w01", "w02", ..., "w12"
 */
export function buildCoordinatorDocId(weekNumber: number): string {
  return `w${Math.max(1, weekNumber).toString().padStart(2, '0')}`;
}

/**
 * Returns formatted weekend dates (Saturday and Sunday) for a given academic week,
 * calculated strictly from the term start date.
 */
export function getWeekWeekendDates(
  weekNumber: number,
  termStartIso: string = ACADEMIC_CONFIG.termStartMondayIso
): {
  saturdayFormatted: string;
  sundayFormatted: string;
  saturdayDayMonth: string;
  sundayDayMonth: string;
} {
  const anchorUtcMs = parseIsoDateToUtcMidnightMs(termStartIso);
  const weekMondayMs = anchorUtcMs + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000;
  const satMs = weekMondayMs + 5 * 24 * 60 * 60 * 1000;
  const sunMs = weekMondayMs + 6 * 24 * 60 * 60 * 1000;

  const satDate = new Date(satMs);
  const sunDate = new Date(sunMs);

  const months = [
    'ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran',
    'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'
  ];

  const satDay = satDate.getUTCDate();
  const satMonth = months[satDate.getUTCMonth()];
  const sunDay = sunDate.getUTCDate();
  const sunMonth = months[sunDate.getUTCMonth()];

  const saturdayDayMonth = `${satDay} ${satMonth}`;
  const sundayDayMonth = `${sunDay} ${sunMonth}`;

  return {
    saturdayFormatted: `${saturdayDayMonth} cumartesi`,
    sundayFormatted: `${sundayDayMonth} pazar`,
    saturdayDayMonth,
    sundayDayMonth,
  };
}

/**
 * Converts whitespace-only or empty strings into null for Firestore storage.
 */
export function cleanCoordinatorNames(
  names: Array<string | null | undefined>
): (string | null)[] {
  return names.map(n => {
    if (typeof n === 'string') {
      const trimmed = n.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  });
}

/**
 * Returns true if the given academic week is an official holiday for yüz yüze (in-person) classes
 * and weekend coordinator tracking (weeks 4 and 5).
 */
export function isYuzyuzeHolidayWeek(weekNumber: number): boolean {
  return YUZYUZE_HOLIDAY_WEEKS.includes(weekNumber);
}

/**
 * Returns true if the online instructor should see the warm thank-you message for week 5.
 * Shown only for online modality, when viewing week 5, and expires from week 6 onwards.
 */
export function shouldShowOnlineWeek5ThankYou(
  modality: Modality | undefined,
  selectedWeek: number,
  currentWeek: number
): boolean {
  if (modality !== 'online') return false;
  if (currentWeek >= ONLINE_THANK_YOU_EXPIRES_WEEK) return false;
  return selectedWeek === ONLINE_THANK_YOU_WEEK;
}

/**
 * Returns true if the yüz yüze instructor is viewing a holiday week (week 4 or 5)
 * on the attendance sheet.
 */
export function shouldShowYuzyuzeHolidayMessage(
  modality: Modality | undefined,
  selectedWeek: number
): boolean {
  return modality === 'yuzyuze' && isYuzyuzeHolidayWeek(selectedWeek);
}

/**
 * KURAL: Öğrenci kimliği = "stu-" + slug(normalizeName(ad))
 */
export function generatePermanentStudentId(rawName = ''): string {
  return buildStudentIdFromName(rawName);
}

/**
 * Given the full list of course student IDs and the IDs of students marked present ("derste"),
 * returns the difference set (fark kümesi) of absent student IDs.
 */
export function computeAbsentDifferenceSet(
  courseStudentIds: string[],
  presentStudentIds: string[]
): string[] {
  const presentSet = new Set(presentStudentIds.map(id => resolveCanonicalStudentId(id)));
  return courseStudentIds.filter(id => !presentSet.has(resolveCanonicalStudentId(id)));
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
 * Builds a clean Student record for a student using the deterministic name-based ID:
 * "stu-" + slugifyTurkish(normalizeName(ad))
 */
export function createNewStudentRecord(params: {
  rawName: string;
  modality: Modality;
  gradeLabel: string;
  enrolledCourseIds: string[];
  currentWeek: number;
  nowIso?: string;
  customId?: string;
}): Student {
  const normName = normalizeName(params.rawName);
  const canonicalId = params.customId || buildStudentIdFromName(normName);
  return {
    id: canonicalId,
    name: normName,
    grade: normalizeTurkish(params.gradeLabel),
    modality: params.modality,
    enrolledCourseIds: Array.from(new Set(params.enrolledCourseIds)),
    addedAtWeek: params.currentWeek,
    addedAt: params.nowIso || getTrustedNow().toISOString(),
  };
}

/**
 * Detects whether a remote attendance document was concurrently updated by another device/session
 * since the local client loaded or last saved its base version.
 */
export function detectConcurrentAttendanceConflict(params: {
  serverVersion?: number;
  serverUpdatedBySessionId?: string;
  expectedBaseVersion: number;
  currentClientSessionId: string;
}): boolean {
  const {
    serverVersion,
    serverUpdatedBySessionId,
    expectedBaseVersion,
    currentClientSessionId,
  } = params;
  if (typeof serverVersion !== 'number') return false;
  if (serverVersion <= expectedBaseVersion) return false;
  if (serverUpdatedBySessionId && serverUpdatedBySessionId === currentClientSessionId) {
    return false;
  }
  return true;
}

/**
 * Checks whether a course's current instructor is one of the unassigned placeholders (bos1, bos2, etc.).
 */
export function isUnassignedBosInstructor(instructorName: string): boolean {
  return /^bos\d+$/i.test(normalizeName(instructorName));
}

/**
 * Finds an existing real student by exact normalized full name (Requirement 1, 2, 2b).
 * Placeholders (bos1, bos2, adını öğrenip giricem, etc.) are excluded.
 */
export function findMatchingStudentByFullName(
  rawName: string,
  students: Student[]
): Student | undefined {
  if (isPlaceholderStudentName(rawName)) return undefined;
  const norm = normalizeName(rawName);
  if (!norm) return undefined;
  return students.find(
    s => !isPlaceholderStudentName(s.name) && normalizeName(s.name) === norm
  );
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

export interface SimilarStudentCandidate {
  student: Student;
  reason: string;
  distance: number;
}

/**
 * Yazım hatası / benzer isim uyarısı (Requirement 2 & 3):
 * Çok benzer ama normalizeName ile birebir aynı olmayan isimleri (ş/s, ı/i, ö/o, ğ/g, ü/u, ç/c farkı,
 * 1-2 harf yazım hatası, aynı soyadı paylaşıp ad kısmı kısa/1-2 harf farklı olanlar veya eksik/fazla göbek adı) bulur.
 * not_duplicates listesindeki çiftler için asla uyarı üretmez.
 * Birebir aynı normalize isimler (stNorm === norm) burada yer almaz (her zaman aynı kişidir).
 */
export function findSimilarStudentsByName(
  rawName: string,
  students: Student[],
  notDuplicatePairs: NotDuplicatePairRecord[] = []
): SimilarStudentCandidate[] {
  if (isPlaceholderStudentName(rawName)) return [];
  const norm = normalizeName(rawName);
  if (!norm || norm.length < 3) return [];
  const slug = slugifyTurkish(norm);
  const candidateId = buildStudentIdFromName(norm);
  const inputTokens = norm.split(' ').filter(Boolean);

  const candidates: SimilarStudentCandidate[] = [];
  const seenIds = new Set<string>();

  for (const st of students) {
    if (isPlaceholderStudentName(st.name)) continue;
    const stNorm = normalizeName(st.name);
    if (!stNorm || stNorm === norm) continue; // exact matches are ALWAYS the same person (findMatchingStudentByFullName)
    if (seenIds.has(st.id)) continue;

    // Requirement 1 & 3: If this pair is in not_duplicates, never warn!
    if (
      isPairIgnoredAsNotDuplicate(candidateId, st.id, notDuplicatePairs) ||
      isPairIgnoredAsNotDuplicate(norm, stNorm, notDuplicatePairs)
    ) {
      continue;
    }

    const stSlug = slugifyTurkish(stNorm);

    // 1. Same Turkish-transliterated slug (e.g. ş/s, ı/i, ö/o, ü/u, ç/c, ğ/g difference)
    if (slug && stSlug === slug) {
      seenIds.add(st.id);
      candidates.push({
        student: st,
        reason: 'Türkçe karakter farkı (ş/s, ı/i, ö/o, ü/u, ç/c, ğ/g)',
        distance: 0.5,
      });
      continue;
    }

    // 2. Small Levenshtein edit distance (1 or 2 chars) on normalized name or slug
    const normDist = levenshteinDistance(norm, stNorm);
    const slugDist = levenshteinDistance(slug, stSlug);
    const minDist = Math.min(normDist, slugDist);
    if (minDist <= 2 && Math.max(norm.length, stNorm.length) >= 5) {
      seenIds.add(st.id);
      candidates.push({
        student: st,
        reason: normDist <= 1 ? '1 harf farkı' : 'yazım benzerliği (1-2 harf farkı)',
        distance: minDist,
      });
      continue;
    }

    // 3. Token subset / missing middle name or fused given name, or same surname with short given name difference
    const stTokens = stNorm.split(' ').filter(Boolean);
    if (norm.replace(/\s+/g, '') === stNorm.replace(/\s+/g, '')) {
      seenIds.add(st.id);
      candidates.push({
        student: st,
        reason: 'bitişik/ayrı yazım farkı',
        distance: 0.8,
      });
      continue;
    }

    if (inputTokens.length >= 2 && stTokens.length >= 2) {
      const sameLast = inputTokens[inputTokens.length - 1] === stTokens[stTokens.length - 1];
      const sameFirst = inputTokens[0] === stTokens[0];

      // Same surname + short given name with 1-2 char difference (e.g. "dila acarca" / "sıla acarca")
      if (sameLast) {
        const givenA = inputTokens.slice(0, -1).join(' ');
        const givenB = stTokens.slice(0, -1).join(' ');
        const givenDist = Math.min(
          levenshteinDistance(givenA, givenB),
          levenshteinDistance(slugifyTurkish(givenA), slugifyTurkish(givenB))
        );
        if (givenDist >= 1 && givenDist <= 2) {
          seenIds.add(st.id);
          candidates.push({
            student: st,
            reason: givenDist === 1 ? '1 harf farkı (aynı soyad)' : 'benzer ad ve aynı soyad',
            distance: givenDist,
          });
          continue;
        }
      }

      if (sameLast && sameFirst && inputTokens.length !== stTokens.length) {
        seenIds.add(st.id);
        candidates.push({
          student: st,
          reason: 'ikinci ad farkı (aynı ad ve soyad)',
          distance: 1.5,
        });
        continue;
      }
      const smaller = inputTokens.length < stTokens.length ? inputTokens : stTokens;
      const larger = inputTokens.length < stTokens.length ? stTokens : inputTokens;
      if (smaller.length >= 2 && smaller.every(t => larger.includes(t))) {
        seenIds.add(st.id);
        candidates.push({
          student: st,
          reason: 'eksik/fazla ad eşleşmesi',
          distance: 1.8,
        });
      }
    }
  }

  return candidates.sort((a, b) => a.distance - b.distance);
}

export const MELEK_YILMAZ_REASSURANCE_MESSAGE =
  'aklın sakın orada kalmasın melek, yoklaman kayıt altında, iyi dersler';

export const PLACEBO_SAVE_STORAGE_KEY = 'bach_placebo_save_prefs_v1';

/**
 * Checks whether the given instructor is "melek yılmaz".
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

/**
 * Extracts the given name(s) of an instructor (without surname) for personalized reassurance messages.
 */
export function getInstructorDisplayFirstName(
  instructor: Pick<Instructor, 'name' | 'firstName'> | null | undefined
): string {
  if (!instructor) return '';
  const normName = normalizeTurkish(instructor.name);
  const parts = normName.split(' ').filter(Boolean);
  if (parts.length > 1) {
    return parts.slice(0, -1).join(' ');
  }
  return normalizeTurkish(instructor.firstName || instructor.name);
}

/**
 * Builds the personalized reassurance message shown after clicking the placebo "kaydet" button:
 * "aklın sakın orada kalmasın <isim>, yoklaman kayıt altında, iyi dersler"
 */
export function getInstructorReassuranceMessage(
  instructor: Pick<Instructor, 'name' | 'firstName'> | null | undefined
): string {
  const displayName = getInstructorDisplayFirstName(instructor) || 'canım';
  return `aklın sakın orada kalmasın ${displayName}, yoklaman kayıt altında, iyi dersler`;
}

/**
 * Reads the persisted placebo save button preference for an instructor from remote Firestore records
 * or serialized localStorage JSON.
 * Defaults to false for all instructors unless explicitly enabled (or Melek Yılmaz if not yet overridden).
 */
export function getPlaceboSavePreference(
  instructor: Pick<Instructor, 'id' | 'name'> | null | undefined,
  storageRaw: string | null | undefined,
  remotePrefs?: { instructorId: string; instructorName: string; enabled: boolean }[]
): boolean {
  if (!instructor) return false;

  if (remotePrefs && remotePrefs.length > 0) {
    const normName = normalizeTurkish(instructor.name);
    const matched = remotePrefs.find(
      p => p.instructorId === instructor.id || normalizeTurkish(p.instructorName) === normName
    );
    if (matched) {
      return matched.enabled;
    }
  }

  if (storageRaw) {
    try {
      const parsed = JSON.parse(storageRaw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed[instructor.id] === 'boolean') {
          return parsed[instructor.id] as boolean;
        }
        const normName = normalizeTurkish(instructor.name);
        if (typeof parsed[normName] === 'boolean') {
          return parsed[normName] as boolean;
        }
      }
    } catch {
      // Ignore malformed storage JSON
    }
  }
  return isMelekYilmazInstructor(instructor);
}

/**
 * Checks whether localStorage has an explicit boolean preference saved for this instructor.
 */
export function getExplicitLocalPlaceboSavePreference(
  instructor: Pick<Instructor, 'id' | 'name'> | null | undefined,
  storageRaw: string | null | undefined
): boolean | null {
  if (!instructor || !storageRaw) return null;
  try {
    const parsed = JSON.parse(storageRaw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed[instructor.id] === 'boolean') {
        return parsed[instructor.id] as boolean;
      }
      const normName = normalizeTurkish(instructor.name);
      if (typeof parsed[normName] === 'boolean') {
        return parsed[normName] as boolean;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Computes the list and count of instructors who have activated the placebo save button.
 */
export function computeActivePlaceboSaveUsers(
  remotePrefs: { instructorId: string; instructorName: string; enabled: boolean }[]
): { count: number; names: string[] } {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const pref of remotePrefs) {
    if (!pref.enabled) continue;
    const key = pref.instructorId || normalizeTurkish(pref.instructorName);
    if (!seen.has(key)) {
      seen.add(key);
      names.push(normalizeTurkish(pref.instructorName));
    }
  }
  names.sort((a, b) => a.localeCompare(b, 'tr-TR'));
  return { count: names.length, names };
}

/**
 * Updates the serialized storage JSON with the instructor's placebo save button toggle preference.
 */
export function setPlaceboSavePreferenceInMap(
  instructor: Pick<Instructor, 'id' | 'name'>,
  enabled: boolean,
  storageRaw: string | null | undefined
): string {
  let map: Record<string, boolean> = {};
  if (storageRaw) {
    try {
      const parsed = JSON.parse(storageRaw);
      if (parsed && typeof parsed === 'object') {
        map = { ...parsed };
      }
    } catch {
      map = {};
    }
  }
  map[instructor.id] = enabled;
  map[normalizeTurkish(instructor.name)] = enabled;
  return JSON.stringify(map);
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

