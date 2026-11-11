import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ArrowLeft,
  BookOpen,
  Users,
  UserCheck,
  AlertCircle,
  RotateCcw,
  Trash2,
  Check,
  UserPlus,
  UserMinus,
  ChevronDown,
  ChevronUp,
  Plus,
  RefreshCw,
  Download,
} from 'lucide-react';
import {
  AttendanceRecord,
  AuditLogEntry,
  BASE_DB,
  buildStudentIdFromName,
  Course,
  DATA_DISCREPANCIES,
  getCanonicalStudentName,
  Instructor,
  isPlaceholderStudentName,
  Modality,
  normalizeName,
  normalizeTurkish,
  NotDuplicatePairRecord,
  PlaceboSavePreferenceRecord,
  slugifyTurkish,
  Student,
  UnlistedStudentReport,
} from '../data/database';
import {
  computeActivePlaceboSaveUsers,
  createNewStudentRecord,
  findMatchingStudentByFullName,
  findSimilarStudentsByName,
  getWeekDateRangeLabel,
  isStudentResponsibleForSession,
  isUnassignedBosInstructor,
  SimilarStudentCandidate,
} from '../utils/enigmaLogic';
import {
  buildMigrationDryRunReport,
  MigrationUserResolutions,
} from '../utils/studentMigration';

interface AdminSibeliusViewProps {
  currentWeek: number;
  students: Student[];
  rawCustomStudents?: Student[];
  courses: Course[];
  instructors: Instructor[];
  attendanceRecords: AttendanceRecord[];
  unlistedReports: UnlistedStudentReport[];
  notDuplicatePairs?: NotDuplicatePairRecord[];
  placeboSavePrefs?: PlaceboSavePreferenceRecord[];
  auditLogs?: AuditLogEntry[];
  onAddStudent: (student: Student) => Promise<void>;
  onRemoveStudent: (student: Student) => Promise<void>;
  onAssignInstructor: (
    courseId: string,
    instructorName: string,
    newCourseMeta?: { modality: Modality; gradeClass: string; subject: string }
  ) => Promise<void>;
  onEnrollUnlistedStudent: (
    report: UnlistedStudentReport,
    overrideStudentName?: string
  ) => Promise<string>;
  onMarkTemporaryUnlistedStudent: (report: UnlistedStudentReport) => Promise<string>;
  onDeleteUnlistedReport: (reportId: string) => Promise<void>;
  onMarkNotDuplicatePairs?: (
    pairs: Array<{ studentId1: string; studentId2: string; note?: string }>
  ) => Promise<string[]>;
  onRemoveNotDuplicatePair?: (pairId: string) => Promise<void>;
  canUndoNotDuplicate?: boolean;
  onUndoLastNotDuplicate?: () => Promise<void>;
  onReconcileNotDuplicatesOnMerge?: (
    fromStudentId: string,
    intoStudentId: string
  ) => Promise<void>;
  onDownloadMigrationBackup?: () => void;
  onExecuteStudentMigration?: (resolutions: MigrationUserResolutions) => Promise<string>;
  canUndoMigration?: boolean;
  onUndoMigration?: () => Promise<void>;
  onResetZeroAttendance?: () => Promise<number>;
  onResetAllAttendance: () => Promise<void>;
  canUndoAttendanceReset?: boolean;
  onUndoAttendanceReset?: () => Promise<void>;
  onResetAllFeedbacks: () => Promise<void>;
  canUndoFeedbackReset?: boolean;
  onUndoFeedbackReset?: () => Promise<void>;
  onBackToLogin: () => void;
}

type AdminCategory =
  | 'menu'
  | 'ders'
  | 'ogrenci'
  | 'egitmen'
  | 'liste_disi'
  | 'uyumsuzluklar'
  | 'audit_log';

const ONLINE_GRADE_OPTIONS = [
  { label: '3. sınıf', gradeClass: '3/a' },
  { label: '4. sınıf', gradeClass: '4/a' },
  { label: '5. sınıf', gradeClass: '5/a' },
  { label: '6. sınıf', gradeClass: '6/a' },
  { label: '7. sınıf', gradeClass: '7/a' },
  { label: '8. sınıf', gradeClass: '8/a' },
  { label: '9. sınıf', gradeClass: '9/a' },
  { label: '10. sınıf', gradeClass: '10/a' },
  { label: '11. sınıf', gradeClass: '11/a' },
  { label: '12. sınıf', gradeClass: '12/a' },
  { label: 'tyt', gradeClass: 'tyt' },
];

const YUZYUZE_GRADE_OPTIONS = [
  { label: '5. sınıf', num: '5', branches: ['a', 'b'] },
  { label: '6. sınıf', num: '6', branches: ['a', 'b'] },
  { label: '7. sınıf', num: '7', branches: ['a', 'b'] },
  { label: '8. sınıf', num: '8', branches: ['a'] },
];

const YUZYUZE_CLASS_LEVELS = [
  { label: '5/a sınıfı', gradeClass: '5/a' },
  { label: '5/b sınıfı', gradeClass: '5/b' },
  { label: '6/a sınıfı', gradeClass: '6/a' },
  { label: '6/b sınıfı', gradeClass: '6/b' },
  { label: '7/a sınıfı', gradeClass: '7/a' },
  { label: '7/b sınıfı', gradeClass: '7/b' },
  { label: '8/a sınıfı', gradeClass: '8/a' },
];

export const AdminSibeliusView: React.FC<AdminSibeliusViewProps> = ({
  currentWeek,
  students,
  rawCustomStudents = [],
  courses,
  instructors,
  attendanceRecords: rawAttendanceRecords,
  unlistedReports: rawUnlistedReports,
  notDuplicatePairs = [],
  placeboSavePrefs = [],
  auditLogs = [],
  onAddStudent,
  onRemoveStudent,
  onAssignInstructor,
  onEnrollUnlistedStudent,
  onMarkTemporaryUnlistedStudent,
  onDeleteUnlistedReport,
  onMarkNotDuplicatePairs,
  onRemoveNotDuplicatePair,
  canUndoNotDuplicate,
  onUndoLastNotDuplicate,
  onReconcileNotDuplicatesOnMerge,
  onDownloadMigrationBackup,
  onExecuteStudentMigration,
  canUndoMigration,
  onUndoMigration,
  onResetZeroAttendance,
  onResetAllAttendance,
  canUndoAttendanceReset,
  onUndoAttendanceReset,
  onResetAllFeedbacks,
  canUndoFeedbackReset,
  onUndoFeedbackReset,
  onBackToLogin,
}) => {
  const attendanceRecords = useMemo(
    () => rawAttendanceRecords.filter(r => !r.deletedAt),
    [rawAttendanceRecords]
  );
  const unlistedReports = useMemo(
    () => rawUnlistedReports.filter(r => !r.deletedAt),
    [rawUnlistedReports]
  );

  const [category, setCategory] = useState<AdminCategory>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);
  const [showParanoyaNames, setShowParanoyaNames] = useState(false);

  // Compact top-right reset states with text confirmation ("SIFIRLA")
  const [confirmingAttendanceReset, setConfirmingAttendanceReset] = useState(false);
  const [attendanceResetConfirmText, setAttendanceResetConfirmText] = useState('');
  const [confirmingFeedbackReset, setConfirmingFeedbackReset] = useState(false);
  const [feedbackResetConfirmText, setFeedbackResetConfirmText] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [showUndoIgnoreInNotice, setShowUndoIgnoreInNotice] = useState(false);

  // Add / Remove Student Panel states
  const [activeStudentPanel, setActiveStudentPanel] = useState<'none' | 'add' | 'remove'>('none');

  // Add Student Form states
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentModality, setNewStudentModality] = useState<Modality>('online');
  const [newOnlineGradeClass, setNewOnlineGradeClass] = useState('5/a');
  const [newYuzyuzeGradeNum, setNewYuzyuzeGradeNum] = useState('5');
  const [newYuzyuzeBranch, setNewYuzyuzeBranch] = useState('a');
  const [selectedOnlineCourseIds, setSelectedOnlineCourseIds] = useState<string[]>([]);
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [pendingDuplicateAddConfirm, setPendingDuplicateAddConfirm] = useState<{
    existingStudent: Student;
    newCourseIds: string[];
  } | null>(null);
  const [pendingTypoAddCandidates, setPendingTypoAddCandidates] = useState<{
    typedName: string;
    newCourseIds: string[];
    gradeLabel: string;
    modality: Modality;
    candidates: SimilarStudentCandidate[];
  } | null>(null);

  // Unlisted student enrollment duplicate / typo prompt state
  const [pendingUnlistedConfirm, setPendingUnlistedConfirm] = useState<{
    reportId: string;
    existingStudent: Student;
  } | null>(null);
  const [pendingUnlistedTypo, setPendingUnlistedTypo] = useState<{
    reportId: string;
    candidates: SimilarStudentCandidate[];
  } | null>(null);

  // Migration / Olası Tekrarlar state
  const [rescanCounter, setRescanCounter] = useState(0);
  const [migrationResolutions, setMigrationResolutions] =
    useState<MigrationUserResolutions>({});
  const [isApplyingMigration, setIsApplyingMigration] = useState(false);

  // Remove Student Form states
  const [removeNameInput, setRemoveNameInput] = useState('');
  const [studentToConfirmRemove, setStudentToConfirmRemove] = useState<Student | null>(null);
  const [sameNameCandidates, setSameNameCandidates] = useState<Student[]>([]);
  const [removeFormError, setRemoveFormError] = useState<string | null>(null);

  // Instructor Assignment Panel states
  const [isInstructorAssignOpen, setIsInstructorAssignOpen] = useState(false);
  const [assignInstructorName, setAssignInstructorName] = useState('');
  const [assignModality, setAssignModality] = useState<Modality>('online');
  const [assignGradeClass, setAssignGradeClass] = useState('5/a');
  const [assignTargetCourseId, setAssignTargetCourseId] = useState('');
  const [newCourseSubjectInput, setNewCourseSubjectInput] = useState('');
  const [assignFormError, setAssignFormError] = useState<string | null>(null);
  const [pendingInstructorReplacement, setPendingInstructorReplacement] = useState<{
    course: Course;
    newInstructorName: string;
  } | null>(null);

  const maxWeekToShow = Math.max(currentWeek, 4);
  const weeksList = Array.from({ length: maxWeekToShow }, (_, i) => i + 1);

  const normalizedQuery = normalizeTurkish(searchQuery);

  // Dynamic count of real registered instructors (excluding bos1..bos4 placeholders)
  const realInstructorsCount = useMemo(
    () => instructors.filter(i => !isUnassignedBosInstructor(i.name)).length,
    [instructors]
  );

  const unassignedBosCount = useMemo(
    () => instructors.filter(i => isUnassignedBosInstructor(i.name)).length,
    [instructors]
  );

  const pendingUnlistedCount = useMemo(
    () => unlistedReports.filter(r => r.status === 'pending').length,
    [unlistedReports]
  );

  const paranoyaStats = useMemo(
    () => computeActivePlaceboSaveUsers(placeboSavePrefs),
    [placeboSavePrefs]
  );

  // Available online courses for the currently chosen online grade (Student Add)
  const availableOnlineCoursesForGrade = useMemo(() => {
    return courses.filter(c => {
      if (c.modality !== 'online') return false;
      if (c.gradeClass === newOnlineGradeClass) return true;
      if (newOnlineGradeClass === '3/a' && c.id === 'online-4a-ing') return true;
      if ((newOnlineGradeClass === '11/a' || newOnlineGradeClass === '12/a') && c.gradeClass === 'tyt') {
        return true;
      }
      return false;
    });
  }, [courses, newOnlineGradeClass]);

  // Keep default online course selection in sync when grade changes
  useEffect(() => {
    const primaryGradeCourses = availableOnlineCoursesForGrade
      .filter(c => c.gradeClass === newOnlineGradeClass)
      .map(c => c.id);
    setSelectedOnlineCourseIds(primaryGradeCourses);
  }, [newOnlineGradeClass, availableOnlineCoursesForGrade.length]);

  // Ensure valid branch for 8th grade yüz yüze (Student Add)
  useEffect(() => {
    if (newYuzyuzeGradeNum === '8' && newYuzyuzeBranch !== 'a') {
      setNewYuzyuzeBranch('a');
    }
  }, [newYuzyuzeGradeNum, newYuzyuzeBranch]);

  // Ensure assignGradeClass is valid when switching assignModality
  useEffect(() => {
    const validLevels =
      assignModality === 'online'
        ? ONLINE_GRADE_OPTIONS.map(o => o.gradeClass)
        : YUZYUZE_CLASS_LEVELS.map(o => o.gradeClass);
    if (!validLevels.includes(assignGradeClass)) {
      setAssignGradeClass('5/a');
    }
    setPendingInstructorReplacement(null);
  }, [assignModality, assignGradeClass]);

  // Courses matching selected modality and grade level for Instructor Assignment
  const availableCoursesForInstructorAssign = useMemo(() => {
    return courses.filter(
      c => c.modality === assignModality && c.gradeClass === assignGradeClass
    );
  }, [courses, assignModality, assignGradeClass]);

  // Auto-select the first course (or bos course if present) when modality/level changes
  useEffect(() => {
    if (assignTargetCourseId === '__new__') return;
    if (availableCoursesForInstructorAssign.length === 0) {
      setAssignTargetCourseId('__new__');
      return;
    }
    const stillValid = availableCoursesForInstructorAssign.some(
      c => c.id === assignTargetCourseId
    );
    if (!stillValid) {
      const bosCourse = availableCoursesForInstructorAssign.find(c =>
        isUnassignedBosInstructor(c.instructorName)
      );
      setAssignTargetCourseId(
        (bosCourse || availableCoursesForInstructorAssign[0]).id
      );
    }
  }, [availableCoursesForInstructorAssign, assignTargetCourseId]);

  const showTemporaryNotice = (msg: string, withUndoIgnore = false) => {
    setActionNotice(msg);
    setShowUndoIgnoreInNotice(withUndoIgnore);
    setTimeout(() => {
      setActionNotice(null);
      setShowUndoIgnoreInNotice(false);
    }, 5500);
  };

  const resolveStudentDisplayNameById = (
    studentId: string,
    fallbackNote?: string
  ): string => {
    const matchActive = students.find(
      s => s.id === studentId || buildStudentIdFromName(s.name) === studentId
    );
    if (matchActive) return matchActive.name;
    const matchCustom = rawCustomStudents.find(
      s => s.id === studentId || buildStudentIdFromName(s.name) === studentId
    );
    if (matchCustom) return matchCustom.name;
    const matchBase = BASE_DB.students.find(
      s => s.id === studentId || buildStudentIdFromName(s.name) === studentId
    );
    if (matchBase) return matchBase.name;
    const matchUnlisted = unlistedReports.find(
      u => buildStudentIdFromName(u.studentName) === studentId
    );
    if (matchUnlisted) return matchUnlisted.studentName;
    if (fallbackNote) return fallbackNote;
    return studentId.replace(/^stu-/, '').replace(/-/g, ' ');
  };

  const migrationDryRunReport = useMemo(
    () =>
      buildMigrationDryRunReport(
        {
          baseStudents: BASE_DB.students,
          customStudents: rawCustomStudents,
          unlistedReports: rawUnlistedReports,
          attendanceRecords: rawAttendanceRecords,
          courses,
          notDuplicatePairs,
        },
        migrationResolutions
      ),
    [
      rawCustomStudents,
      rawUnlistedReports,
      rawAttendanceRecords,
      courses,
      notDuplicatePairs,
      migrationResolutions,
      rescanCounter,
    ]
  );

  const executeCreateNewStudentRecord = async (
    cleanName: string,
    modality: Modality,
    gradeLabel: string,
    enrolledCourseIds: string[],
    withUndoIgnore = false
  ) => {
    const newStudent = createNewStudentRecord({
      rawName: cleanName,
      modality,
      gradeLabel,
      enrolledCourseIds,
      currentWeek,
    });

    await onAddStudent(newStudent);
    setNewStudentName('');
    setAddFormError(null);
    setPendingDuplicateAddConfirm(null);
    setPendingTypoAddCandidates(null);
    setActiveStudentPanel('none');
    showTemporaryNotice(
      withUndoIgnore
        ? `"${newStudent.name}" farklı kişi olarak işaretlendi ve ayrı öğrenci olarak sisteme eklendi.`
        : `${newStudent.name} sisteme eklendi (${currentWeek}. haftadan itibaren değerlendirmeye alındı).`,
      withUndoIgnore
    );
  };

  const handleConfirmMergeExistingOnAdd = async (
    existingStudent: Student,
    courseIdsToAdd: string[]
  ) => {
    const mergedCourses = Array.from(
      new Set([...existingStudent.enrolledCourseIds, ...courseIdsToAdd])
    );
    const updatedStudent: Student = {
      ...existingStudent,
      enrolledCourseIds: mergedCourses,
    };
    await onAddStudent(updatedStudent);
    const addedTitles = courseIdsToAdd
      .map(cid => courses.find(c => c.id === cid)?.shortTitle || cid)
      .join(', ');
    setNewStudentName('');
    setAddFormError(null);
    setPendingDuplicateAddConfirm(null);
    setPendingTypoAddCandidates(null);
    setActiveStudentPanel('none');
    showTemporaryNotice(
      `Mevcut öğrenci "${existingStudent.name}" kaydına yeni dersler (${addedTitles}) eklendi.`
    );
  };

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = normalizeName(newStudentName);
    if (!cleanName || cleanName.length < 2 || cleanName.split(' ').length < 2) {
      setAddFormError('lütfen öğrencinin adını ve soyadını gir.');
      return;
    }

    if (isPlaceholderStudentName(cleanName)) {
      setAddFormError(`"${cleanName}" yer tutucu bir kayıttır; gerçek öğrenci olarak eklenemez.`);
      return;
    }

    let enrolledCourseIds: string[] = [];
    let gradeLabel = '';

    if (newStudentModality === 'yuzyuze') {
      const targetGradeClass = `${newYuzyuzeGradeNum}/${newYuzyuzeBranch}`;
      enrolledCourseIds = courses
        .filter(c => c.modality === 'yuzyuze' && c.gradeClass === targetGradeClass)
        .map(c => c.id);
      gradeLabel = `${newYuzyuzeGradeNum}. sınıf (${targetGradeClass} yüz yüze)`;
    } else {
      if (selectedOnlineCourseIds.length === 0) {
        setAddFormError('lütfen öğrencinin aldığı en az bir çevrim içi dersi seç.');
        return;
      }
      enrolledCourseIds = selectedOnlineCourseIds;
      const foundOpt = ONLINE_GRADE_OPTIONS.find(o => o.gradeClass === newOnlineGradeClass);
      gradeLabel = foundOpt ? foundOpt.label : `${newOnlineGradeClass} sınıf`;
    }

    if (enrolledCourseIds.length === 0) {
      setAddFormError('seçilen sınıfa ait ders bulunamadı.');
      return;
    }

    setAddFormError(null);

    // 1. Check exact normalized name match across existing students (Requirement 2 & 3)
    const existingMatch = findMatchingStudentByFullName(cleanName, students);
    if (existingMatch) {
      setPendingTypoAddCandidates(null);
      setPendingDuplicateAddConfirm({
        existingStudent: existingMatch,
        newCourseIds: enrolledCourseIds,
      });
      return;
    }

    // 2. Check similar names / typos ("Şunu mu demek istedin: <ad>?") filtered by notDuplicatePairs
    const similar = findSimilarStudentsByName(
      cleanName,
      students,
      notDuplicatePairs
    );
    if (similar.length > 0) {
      setPendingDuplicateAddConfirm(null);
      setPendingTypoAddCandidates({
        typedName: cleanName,
        newCourseIds: enrolledCourseIds,
        gradeLabel,
        modality: newStudentModality,
        candidates: similar,
      });
      return;
    }

    await executeCreateNewStudentRecord(
      cleanName,
      newStudentModality,
      gradeLabel,
      enrolledCourseIds
    );
  };

  const handleLookupStudentForRemoval = (e: React.FormEvent) => {
    e.preventDefault();
    const queryName = normalizeTurkish(removeNameInput);
    if (!queryName) {
      setRemoveFormError('lütfen kaldırılacak öğrencinin adını soyadını yaz.');
      setStudentToConfirmRemove(null);
      setSameNameCandidates([]);
      return;
    }

    const exactMatches = students.filter(s => s.name === queryName);
    if (exactMatches.length === 1) {
      setStudentToConfirmRemove(exactMatches[0]);
      setSameNameCandidates([]);
      setRemoveFormError(null);
      return;
    }
    if (exactMatches.length > 1) {
      setStudentToConfirmRemove(null);
      setSameNameCandidates(exactMatches);
      setRemoveFormError(null);
      return;
    }

    const partialMatches = students.filter(s => s.name.includes(queryName));
    if (partialMatches.length === 1) {
      setStudentToConfirmRemove(partialMatches[0]);
      setSameNameCandidates([]);
      setRemoveFormError(null);
      return;
    }

    if (partialMatches.length > 1) {
      setStudentToConfirmRemove(null);
      setSameNameCandidates(partialMatches);
      setRemoveFormError(null);
      return;
    }

    setStudentToConfirmRemove(null);
    setSameNameCandidates([]);
    setRemoveFormError('bu isimde kayıtlı bir öğrenci bulunamadı.');
  };

  const handleConfirmRemoveStudent = async () => {
    if (!studentToConfirmRemove) return;
    const removedName = studentToConfirmRemove.name;
    await onRemoveStudent(studentToConfirmRemove);
    setStudentToConfirmRemove(null);
    setRemoveNameInput('');
    setRemoveFormError(null);
    setActiveStudentPanel('none');
    showTemporaryNotice(`${removedName} yoklama sisteminden kaldırıldı.`);
  };

  const handleInstructorAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInstName = normalizeTurkish(assignInstructorName);
    if (!cleanInstName || cleanInstName.length < 2) {
      setAssignFormError('lütfen atanacak eğitmenin adını ve soyadını gir.');
      return;
    }

    // If adding a brand-new course to this level
    if (assignTargetCourseId === '__new__') {
      const cleanSubject = normalizeTurkish(newCourseSubjectInput);
      if (!cleanSubject || cleanSubject.length < 2) {
        setAssignFormError('lütfen yeni eklenecek dersin adını yaz (örn. sosyal bilgiler, geometri).');
        return;
      }

      const newCourseId = `custom_${assignModality}_${slugifyTurkish(assignGradeClass)}_${slugifyTurkish(cleanSubject)}`;
      await onAssignInstructor(newCourseId, cleanInstName, {
        modality: assignModality,
        gradeClass: assignGradeClass,
        subject: cleanSubject,
      });
      setAssignInstructorName('');
      setNewCourseSubjectInput('');
      setPendingInstructorReplacement(null);
      setIsInstructorAssignOpen(false);
      showTemporaryNotice(
        `yeni ders (${assignGradeClass} ${cleanSubject}) oluşturuldu ve eğitmen olarak ${cleanInstName} atandı.`
      );
      return;
    }

    const targetCourse = courses.find(c => c.id === assignTargetCourseId);
    if (!targetCourse) {
      setAssignFormError('lütfen eğitmenin vereceği dersi seç.');
      return;
    }

    setAssignFormError(null);

    // If current instructor is bos1, bos2, bos3, bos4 -> assign immediately without confirmation
    if (isUnassignedBosInstructor(targetCourse.instructorName)) {
      const oldBos = targetCourse.instructorName;
      await onAssignInstructor(targetCourse.id, cleanInstName);
      setAssignInstructorName('');
      setPendingInstructorReplacement(null);
      setIsInstructorAssignOpen(false);
      showTemporaryNotice(
        `${cleanInstName}, ${targetCourse.title} dersine hemen atandı (${oldBos} güncellendi).`
      );
      return;
    }

    // Otherwise ask confirmation: "bu işlem x öğretmenini kaldıracaktır emin misiniz?"
    setPendingInstructorReplacement({
      course: targetCourse,
      newInstructorName: cleanInstName,
    });
  };

  const handleConfirmInstructorReplacement = async () => {
    if (!pendingInstructorReplacement) return;
    const { course, newInstructorName } = pendingInstructorReplacement;
    const oldInstructorName = course.instructorName;
    await onAssignInstructor(course.id, newInstructorName);
    setAssignInstructorName('');
    setPendingInstructorReplacement(null);
    setIsInstructorAssignOpen(false);
    showTemporaryNotice(
      `${newInstructorName}, ${course.title} dersine atandı (${oldInstructorName} kaldırıldı).`
    );
  };

  // ================= STUDENT METRICS (Sorted by lowest attendance rate first) =================
  const baseStudentStats = useMemo(() => {
    return students
      .map(student => {
        const relevantRecords = attendanceRecords.filter(
          r => r.weekNumber <= currentWeek && isStudentResponsibleForSession(student, r)
        );
        const totalSessionsHeld = relevantRecords.length;
        const absentCount = relevantRecords.filter(r =>
          r.absentStudentIds.includes(student.id)
        ).length;
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
  }, [students, attendanceRecords, currentWeek]);

  const studentStats = useMemo(() => {
    if (!normalizedQuery) return baseStudentStats;
    return baseStudentStats.filter(
      item =>
        item.student.name.includes(normalizedQuery) ||
        item.student.grade.includes(normalizedQuery)
    );
  }, [baseStudentStats, normalizedQuery]);

  // ================= INSTRUCTOR METRICS (Unrecorded / "ders yapmadım" this week on top) =================
  const baseInstructorStats = useMemo(() => {
    return instructors
      .map(instructor => {
        const thisWeekRecords = attendanceRecords.filter(
          r =>
            (r.instructorId === instructor.id || instructor.courseIds.includes(r.courseId)) &&
            r.weekNumber === currentWeek
        );
        const didNotTakeAttendance = thisWeekRecords.length === 0;
        const markedDidNotHold = thisWeekRecords.some(r => r.didNotHoldClass);
        const inactiveThisWeek = didNotTakeAttendance || markedDidNotHold;

        const instCourses = instructor.courseIds
          .map(cid => courses.find(c => c.id === cid))
          .filter((c): c is Course => Boolean(c));

        return {
          instructor,
          courses: instCourses,
          thisWeekRecords,
          didNotTakeAttendance,
          markedDidNotHold,
          inactiveThisWeek,
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
  }, [instructors, courses, attendanceRecords, currentWeek]);

  const instructorStats = useMemo(() => {
    if (!normalizedQuery) return baseInstructorStats;
    return baseInstructorStats.filter(item => {
      const courseMatch = item.courses.some(c =>
        c.title.includes(normalizedQuery)
      );
      return (
        item.instructor.name.includes(normalizedQuery) ||
        (item.instructor.alias && item.instructor.alias.includes(normalizedQuery)) ||
        courseMatch
      );
    });
  }, [baseInstructorStats, normalizedQuery]);

  // ================= COURSE METRICS (Highest absence / unrecorded this week on top) =================
  const baseCourseStats = useMemo(() => {
    return courses
      .map(course => {
        const courseRecords = attendanceRecords.filter(
          r => r.courseId === course.id && r.weekNumber <= currentWeek
        );
        const thisWeekRecords = courseRecords.filter(r => r.weekNumber === currentWeek);
        const totalAbsences = courseRecords.reduce(
          (sum, r) => sum + r.absentStudentIds.length,
          0
        );
        const noAttendanceThisWeek = thisWeekRecords.length === 0;

        return {
          course,
          thisWeekRecords,
          totalAbsences,
          noAttendanceThisWeek,
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
  }, [courses, attendanceRecords, currentWeek]);

  const courseStats = useMemo(() => {
    if (!normalizedQuery) return baseCourseStats;
    return baseCourseStats.filter(
      item =>
        item.course.title.includes(normalizedQuery) ||
        item.course.instructorName.includes(normalizedQuery)
    );
  }, [baseCourseStats, normalizedQuery]);

  const resetDetailSelection = () => {
    setSelectedStudentId(null);
    setSelectedCourseId(null);
    setSelectedInstructorId(null);
  };

  // Helper to render a cell for (courseId, studentId, weekNumber)
  const renderStudentCourseWeekCell = (courseId: string, studentId: string, week: number) => {
    const student = students.find(s => s.id === studentId);
    if (student?.addedAtWeek && week < student.addedAtWeek) {
      return <span className="text-stone-400 italic">kayıt öncesi</span>;
    }

    const records = attendanceRecords.filter(
      r => r.courseId === courseId && r.weekNumber === week
    );

    if (records.length === 0) {
      return <span className="text-stone-400">girilmedi</span>;
    }

    if (records.some(r => r.didNotHoldClass)) {
      return <span className="text-amber-700">ders yapılmadı</span>;
    }

    const sessionBadges = records.map(r => {
      const shortSession =
        r.sessionType === '1. ders'
          ? '1.d'
          : r.sessionType === '2. ders'
          ? '2.d'
          : 'ek';

      if (student && !isStudentResponsibleForSession(student, r)) {
        return (
          <span key={r.sessionType} className="inline-block mr-2 text-xs text-stone-400 italic">
            {shortSession}: kayıt öncesi
          </span>
        );
      }

      const isAbsent = r.absentStudentIds.includes(studentId);
      return (
        <span
          key={r.sessionType}
          className={`inline-block mr-2 text-xs ${
            isAbsent ? 'text-rose-700 font-medium' : 'text-emerald-800'
          }`}
        >
          {shortSession}: {isAbsent ? 'yok 🫏' : 'var'}
        </span>
      );
    });

    return <div className="flex flex-wrap gap-y-1">{sessionBadges}</div>;
  };

  // Helper to render a class matrix table for a given Course
  const renderCourseMatrix = (course: Course) => {
    const courseStudents: Student[] = course.studentIds
      .map(sid => students.find(s => s.id === sid))
      .filter((s): s is Student => Boolean(s));

    // Temporary (geçici) students who attended a specific session of this course without being enrolled
    const courseTempReports = unlistedReports.filter(
      r =>
        r.courseId === course.id &&
        (r.status === 'temporary' || r.status === 'pending') &&
        !courseStudents.some(
          cs => getCanonicalStudentName(cs.name) === getCanonicalStudentName(r.studentName)
        )
    );

    const groupedTempStudents = Array.from(
      new Set(courseTempReports.map(r => getCanonicalStudentName(r.studentName)))
    ).map(canonicalName => {
      const matchingExisting = findMatchingStudentByFullName(canonicalName, students);
      const reportsForStudent = courseTempReports.filter(
        r => getCanonicalStudentName(r.studentName) === canonicalName
      );
      return {
        canonicalName,
        matchingExisting,
        reports: reportsForStudent,
      };
    });

    return (
      <div key={course.id} className="rounded-2xl border border-stone-300/90 bg-white/90 p-4 sm:p-5 mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 pb-3 sm:pb-4 mb-3 sm:mb-4">
          <div>
            <h3 className="font-serif-art text-xl sm:text-2xl text-stone-900">{course.title}</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              eğitmen: {course.instructorName} · kayıtlı öğrenci: {courseStudents.length}
              {groupedTempStudents.length > 0
                ? ` · geçici/liste dışı öğrenci: ${groupedTempStudents.length}`
                : ''}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-500">
                <th className="py-2.5 pr-3 font-medium sticky left-0 bg-white/95 z-10">öğrenci</th>
                {weeksList.map(w => (
                  <th key={w} className="py-2.5 px-3 font-medium font-mono-num whitespace-nowrap">
                    {w}. hafta
                    <div className="text-[10px] font-normal text-stone-400">
                      {getWeekDateRangeLabel(w)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/60 text-xs">
              {courseStudents.map((st, idx) => (
                <tr key={st.id} className="hover:bg-stone-100/60">
                  <td className="py-3 sm:py-2.5 pr-3 font-medium text-stone-900 whitespace-nowrap sticky left-0 bg-white/95 z-10">
                    <span className="font-mono-num text-stone-400 mr-1.5">{idx + 1}.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCategory('ogrenci');
                        setSelectedStudentId(st.id);
                      }}
                      className="hover:underline text-left cursor-pointer"
                    >
                      {st.name}
                    </button>
                  </td>
                  {weeksList.map(w => (
                    <td key={w} className="py-3 sm:py-2.5 px-3 whitespace-nowrap">
                      {renderStudentCourseWeekCell(course.id, st.id, w)}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Temporary / Unlisted students for this specific course */}
              {groupedTempStudents.map((tempItem, idx) => (
                <tr key={`temp-${tempItem.canonicalName}`} className="bg-amber-50/40 hover:bg-amber-50/70">
                  <td className="py-3 sm:py-2.5 pr-3 font-medium text-stone-900 whitespace-nowrap sticky left-0 bg-[#fdfbf7] z-10">
                    <span className="font-mono-num text-stone-400 mr-1.5">
                      {courseStudents.length + idx + 1}.
                    </span>
                    {tempItem.matchingExisting ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCategory('ogrenci');
                          setSelectedStudentId(tempItem.matchingExisting!.id);
                        }}
                        className="hover:underline text-left cursor-pointer"
                      >
                        {tempItem.canonicalName}
                      </button>
                    ) : (
                      <span>{tempItem.canonicalName}</span>
                    )}
                    <span className="ml-1.5 inline-block rounded bg-amber-100 border border-amber-300/80 px-1.5 py-0.5 text-[10px] font-normal text-amber-900">
                      {tempItem.reports.some(r => r.status === 'temporary')
                        ? 'geçici öğrenci'
                        : 'liste dışı'}
                    </span>
                  </td>
                  {weeksList.map(w => {
                    const weekReports = tempItem.reports.filter(r => r.weekNumber === w);
                    if (weekReports.length === 0) {
                      return (
                        <td key={w} className="py-3 sm:py-2.5 px-3 whitespace-nowrap text-stone-300">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={w} className="py-3 sm:py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-wrap gap-y-1">
                          {weekReports.map(r => {
                            const shortSession =
                              r.sessionType === '1. ders'
                                ? '1.d'
                                : r.sessionType === '2. ders'
                                ? '2.d'
                                : 'ek';
                            return (
                              <span key={r.id} className="inline-block mr-2 text-xs text-emerald-800 font-medium">
                                {shortSession}: var (geçici)
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-4 pb-24 sm:py-8">
      {/* Top Bar for Sibelius */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-stone-300/80 pb-4 sm:pb-5 mb-6 sm:mb-8">
        <div>
          <button
            type="button"
            onClick={() => {
              if (selectedStudentId || selectedCourseId || selectedInstructorId) {
                resetDetailSelection();
              } else if (category !== 'menu') {
                setCategory('menu');
                setSearchQuery('');
              } else {
                onBackToLogin();
              }
            }}
            className="inline-flex items-center gap-1.5 py-1 text-xs text-stone-500 hover:text-stone-900 transition-colors mb-1 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>
              {selectedStudentId || selectedCourseId || selectedInstructorId
                ? 'listeye geri dön'
                : category !== 'menu'
                ? 'sibelius menüsüne dön'
                : 'ana sayfaya dön'}
            </span>
          </button>
          <h1 className="font-serif-art text-2xl sm:text-4xl text-stone-900 leading-tight">
            sibelius · ekip takip paneli
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            aktif dönem: {currentWeek}. hafta ({getWeekDateRangeLabel(currentWeek)}) · toplam {students.length} tekil öğrenci · {courses.length} ders · {realInstructorsCount} eğitmen
          </p>
        </div>

        {/* Right Side: Compact Data Reset Tools (when in menu) OR Quick Category Switcher (when in sub-view) */}
        {category === 'menu' ? (
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end self-start sm:self-center">
            {canUndoAttendanceReset && onUndoAttendanceReset && (
              <button
                type="button"
                data-testid="undo-attendance-reset-btn"
                onClick={async () => {
                  await onUndoAttendanceReset();
                  showTemporaryNotice('silinen yoklama kayıtları geri yüklendi.');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-950 hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" />
                <span>yoklama sıfırlamayı geri al</span>
              </button>
            )}

            {canUndoFeedbackReset && onUndoFeedbackReset && (
              <button
                type="button"
                data-testid="undo-feedback-reset-btn"
                onClick={async () => {
                  await onUndoFeedbackReset();
                  showTemporaryNotice('silinen feedback kayıtları geri yüklendi.');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-950 hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" />
                <span>feedback silmeyi geri al</span>
              </button>
            )}

            {onResetZeroAttendance && (
              <button
                type="button"
                onClick={async () => {
                  const resetCount = await onResetZeroAttendance();
                  if (resetCount > 0) {
                    showTemporaryNotice(
                      `kimse derse gelmemiş görünen ${resetCount} yoklama kaydı yedeklenerek "yoklama alınmadı" olarak sıfırlandı (işlenmiş kayıtlara dokunulmadı).`
                    );
                  } else {
                    showTemporaryNotice(
                      'kimse derse gelmemiş olarak görünen boş yoklama kaydı bulunmuyor; işlenmiş tüm yoklamalar korundu.'
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300/90 bg-white/80 px-2.5 py-1.5 text-[11px] text-stone-700 hover:border-stone-700 hover:text-stone-950 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" />
                <span>boş (0 gelen) yoklamaları sıfırla</span>
              </button>
            )}

            {!confirmingAttendanceReset ? (
              <button
                type="button"
                data-testid="open-attendance-reset-btn"
                onClick={() => {
                  setConfirmingAttendanceReset(true);
                  setAttendanceResetConfirmText('');
                  setConfirmingFeedbackReset(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300/90 bg-white/80 px-2.5 py-1.5 text-[11px] text-stone-600 hover:border-rose-700 hover:text-rose-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" />
                <span>yoklamaları sıfırla ({attendanceRecords.length})</span>
              </button>
            ) : (
              <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px]">
                <label htmlFor="sibelius-att-reset-input" className="text-rose-900">
                  onay için <strong>SIFIRLA</strong> yaz:
                </label>
                <input
                  id="sibelius-att-reset-input"
                  type="text"
                  value={attendanceResetConfirmText}
                  onChange={e => setAttendanceResetConfirmText(e.target.value)}
                  placeholder="SIFIRLA"
                  className="w-20 rounded border border-rose-300 bg-white px-1.5 py-0.5 text-[11px] text-stone-900 focus:border-rose-700 focus:outline-none"
                />
                <button
                  type="button"
                  data-testid="confirm-attendance-reset-btn"
                  disabled={
                    normalizeTurkish(attendanceResetConfirmText) !== 'sıfırla' &&
                    normalizeTurkish(attendanceResetConfirmText) !== 'sifirla'
                  }
                  onClick={async () => {
                    await onResetAllAttendance();
                    setConfirmingAttendanceReset(false);
                    setAttendanceResetConfirmText('');
                    showTemporaryNotice(
                      'otomatik JSON yedeği indirildi ve tüm yoklama kayıtları sıfırlandı (geri alınabilir).'
                    );
                  }}
                  className="rounded bg-rose-700 px-2 py-0.5 text-white hover:bg-rose-800 disabled:opacity-40 cursor-pointer"
                >
                  yedekle ve sıfırla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingAttendanceReset(false);
                    setAttendanceResetConfirmText('');
                  }}
                  className="px-1 text-stone-600 hover:text-stone-900 cursor-pointer"
                >
                  vazgeç
                </button>
              </div>
            )}

            {!confirmingFeedbackReset ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmingFeedbackReset(true);
                  setFeedbackResetConfirmText('');
                  setConfirmingAttendanceReset(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300/90 bg-white/80 px-2.5 py-1.5 text-[11px] text-stone-600 hover:border-rose-700 hover:text-rose-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="h-3 w-3" />
                <span>feedbackleri temizle</span>
              </button>
            ) : (
              <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px]">
                <label htmlFor="sibelius-fb-reset-input" className="text-rose-900">
                  onay için <strong>SIFIRLA</strong> yaz:
                </label>
                <input
                  id="sibelius-fb-reset-input"
                  type="text"
                  value={feedbackResetConfirmText}
                  onChange={e => setFeedbackResetConfirmText(e.target.value)}
                  placeholder="SIFIRLA"
                  className="w-20 rounded border border-rose-300 bg-white px-1.5 py-0.5 text-[11px] text-stone-900 focus:border-rose-700 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={
                    normalizeTurkish(feedbackResetConfirmText) !== 'sıfırla' &&
                    normalizeTurkish(feedbackResetConfirmText) !== 'sifirla'
                  }
                  onClick={async () => {
                    await onResetAllFeedbacks();
                    setConfirmingFeedbackReset(false);
                    setFeedbackResetConfirmText('');
                    showTemporaryNotice(
                      'otomatik JSON yedeği indirildi ve tüm anonim feedbackler temizlendi (geri alınabilir).'
                    );
                  }}
                  className="rounded bg-rose-700 px-2 py-0.5 text-white hover:bg-rose-800 disabled:opacity-40 cursor-pointer"
                >
                  yedekle ve sil
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingFeedbackReset(false);
                    setFeedbackResetConfirmText('');
                  }}
                  className="px-1 text-stone-600 hover:text-stone-900 cursor-pointer"
                >
                  vazgeç
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            {(['ders', 'ogrenci', 'egitmen', 'liste_disi', 'audit_log', 'uyumsuzluklar'] as const).map(
              cat => {
                const label =
                  cat === 'ders'
                    ? 'ders arat'
                    : cat === 'ogrenci'
                    ? 'öğrenci arat'
                    : cat === 'egitmen'
                    ? 'eğitmen arat'
                    : cat === 'liste_disi'
                    ? `liste dışı öğrenciler${
                        pendingUnlistedCount > 0 ? ` (${pendingUnlistedCount})` : ''
                      }`
                    : cat === 'audit_log'
                    ? `işlem geçmişi (${auditLogs.length})`
                    : `olası tekrarlar & migrasyon (${migrationDryRunReport.groupsToMigrate.length})`;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setCategory(cat);
                      resetDetailSelection();
                      setSearchQuery('');
                    }}
                    className={`rounded-xl px-3 py-2 text-xs font-medium text-center transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      category === cat
                        ? 'bg-stone-900 text-stone-100'
                        : 'border border-stone-300 bg-white/85 text-stone-700 hover:bg-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              }
            )}
          </div>
        )}
      </div>

      {/* Temporary Action Notice Banner with Optional "geri al" Undo Button */}
      {actionNotice && (
        <div
          data-testid="admin-action-notice-banner"
          className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-900"
        >
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-700 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          {(showUndoIgnoreInNotice || canUndoNotDuplicate) &&
            onUndoLastNotDuplicate && (
              <button
                type="button"
                data-testid="admin-undo-not-duplicate-btn"
                onClick={async () => {
                  await onUndoLastNotDuplicate();
                  showTemporaryNotice(
                    'Benzer isim yoksayma işlemi geri alındı.',
                    false
                  );
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-950 hover:bg-amber-100 transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="h-3 w-3" />
                <span>geri al</span>
              </button>
            )}
        </div>
      )}

      {/* Category 0: Main Menu + Liste Dışı Öğrenciler + Student Add/Remove + Instructor Assignment */}
      {category === 'menu' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
            <button
              type="button"
              onClick={() => {
                setCategory('ders');
                resetDetailSelection();
              }}
              className="group flex flex-col justify-between rounded-2xl border border-stone-300/90 bg-white/85 p-5 sm:p-6 text-left hover:border-stone-700 hover:bg-white transition-all cursor-pointer"
            >
              <div>
                <BookOpen className="h-5 w-5 text-stone-700 mb-4" />
                <h2 className="font-serif-art text-2xl text-stone-900 group-hover:translate-x-0.5 transition-transform">
                  ders arat
                </h2>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  çevrim içi ve yüz yüze tüm sınıfları görüntüle; her sınıfın hafta hafta yoklama tablosunu incele.
                </p>
              </div>
              <span className="mt-6 text-xs font-mono-num text-stone-500">
                {courses.length} ders mevcut →
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('ogrenci');
                resetDetailSelection();
              }}
              className="group flex flex-col justify-between rounded-2xl border border-stone-300/90 bg-white/85 p-5 sm:p-6 text-left hover:border-stone-700 hover:bg-white transition-all cursor-pointer"
            >
              <div>
                <Users className="h-5 w-5 text-stone-700 mb-4" />
                <h2 className="font-serif-art text-2xl text-stone-900 group-hover:translate-x-0.5 transition-transform">
                  öğrenci arat
                </h2>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  en az katılım sağlayan öğrenciler en üstte listelenir. öğrenciye tıklayarak yalnızca sorumlu olduğu derslerin haftalık tablosunu gör.
                </p>
              </div>
              <span className="mt-6 text-xs font-mono-num text-stone-500">
                {students.length} öğrenci kayıtlı →
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('egitmen');
                resetDetailSelection();
              }}
              className="group flex flex-col justify-between rounded-2xl border border-stone-300/90 bg-white/85 p-5 sm:p-6 text-left hover:border-stone-700 hover:bg-white transition-all cursor-pointer"
            >
              <div>
                <UserCheck className="h-5 w-5 text-stone-700 mb-4" />
                <h2 className="font-serif-art text-2xl text-stone-900 group-hover:translate-x-0.5 transition-transform">
                  eğitmen arat
                </h2>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  bu hafta yoklama almayan veya ders yapmayan eğitmenler en üstte listelenir. eğitmene tıklayarak sınıfının haftalık katılımını incele.
                </p>
              </div>
              <span className="mt-6 text-xs font-mono-num text-stone-500">
                {realInstructorsCount} eğitmen kayıtlı
                {unassignedBosCount > 0 ? ` (${unassignedBosCount} boş ders)` : ''} →
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('liste_disi');
                resetDetailSelection();
              }}
              className={`group flex flex-col justify-between rounded-2xl border p-5 sm:p-6 text-left transition-all cursor-pointer ${
                pendingUnlistedCount > 0
                  ? 'border-amber-400 bg-amber-50/70 hover:border-amber-600 hover:bg-amber-50'
                  : 'border-stone-300/90 bg-white/85 hover:border-stone-700 hover:bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <UserPlus className="h-5 w-5 text-stone-700" />
                  {pendingUnlistedCount > 0 && (
                    <span className="rounded-full bg-amber-800 px-2 py-0.5 text-[10px] font-mono-num text-white">
                      {pendingUnlistedCount} bekleyen
                    </span>
                  )}
                </div>
                <h2 className="font-serif-art text-2xl text-stone-900 group-hover:translate-x-0.5 transition-transform">
                  liste dışı öğrenciler
                </h2>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  yoklama sırasında eğitmenlerin "listede olmayan öğrenci ekle" ile raporladığı öğrencileri derse kaydet veya geçici öğrenci olarak işle.
                </p>
              </div>
              <span className="mt-6 text-xs font-mono-num text-stone-500">
                {unlistedReports.length} raporlanan kayıt →
              </span>
            </button>
          </div>

          {/* 1. Student Add Bar + Compact Student Remove Button on the right */}
          <div className="rounded-2xl border border-stone-300/90 bg-white/85 overflow-hidden transition-all">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-4 sm:p-5">
              {/* Main Add Student Expandable Trigger */}
              <button
                type="button"
                onClick={() => {
                  setActiveStudentPanel(prev => (prev === 'add' ? 'none' : 'add'));
                  setAddFormError(null);
                }}
                className="flex-1 flex items-center justify-between gap-3 text-left rounded-xl px-3 py-2 hover:bg-stone-100/80 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-stone-100">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-serif-art text-xl text-stone-900 leading-snug">
                      öğrenci ekle
                    </h3>
                    <p className="text-xs text-stone-500">
                      yeni öğrenciyi sınıfına ve derslerine kaydet · eklendiği haftadan itibaren değerlendirilir
                    </p>
                  </div>
                </div>
                <span className="text-stone-500 shrink-0">
                  {activeStudentPanel === 'add' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </span>
              </button>

              {/* Small Remove Student Button on the Right */}
              <button
                type="button"
                onClick={() => {
                  setActiveStudentPanel(prev => (prev === 'remove' ? 'none' : 'remove'));
                  setRemoveFormError(null);
                  setStudentToConfirmRemove(null);
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeStudentPanel === 'remove'
                    ? 'border-rose-800 bg-rose-800 text-white'
                    : 'border-stone-300 bg-white text-stone-700 hover:border-rose-700 hover:text-rose-800'
                }`}
              >
                <UserMinus className="h-3.5 w-3.5" />
                <span>öğrenci kaldır</span>
              </button>
            </div>

            {/* Expandable Add Student Form */}
            {activeStudentPanel === 'add' && (
              <form
                onSubmit={handleAddStudentSubmit}
                className="border-t border-stone-200/80 bg-[#faf8f4]/90 p-5 sm:p-6 space-y-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 1. Adı Soyadı */}
                  <div>
                    <label
                      htmlFor="new-student-name"
                      className="block text-xs font-medium text-stone-700 mb-1.5"
                    >
                      öğrencinin adı soyadı
                    </label>
                    <input
                      id="new-student-name"
                      type="text"
                      autoComplete="off"
                      value={newStudentName}
                      onChange={e => {
                        setNewStudentName(e.target.value);
                        if (addFormError) setAddFormError(null);
                      }}
                      placeholder="örn. deniz yılmaz"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-800 focus:outline-none"
                    />
                  </div>

                  {/* 2. Çevrim İçi / Yüz Yüze */}
                  <div>
                    <span className="block text-xs font-medium text-stone-700 mb-1.5">
                      eğitim türü (çevrim içi / yüz yüze)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {(['online', 'yuzyuze'] as const).map(mod => (
                        <button
                          key={mod}
                          type="button"
                          onClick={() => setNewStudentModality(mod)}
                          className={`rounded-xl border py-2.5 px-3 text-xs font-medium transition-colors cursor-pointer ${
                            newStudentModality === mod
                              ? 'border-stone-900 bg-stone-900 text-stone-100'
                              : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          {mod === 'online' ? 'çevrim içi' : 'yüz yüze'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Sınıf & Şube / Ders Seçimi */}
                {newStudentModality === 'yuzyuze' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="block text-xs font-medium text-stone-700 mb-1.5">
                        hangi sınıf?
                      </span>
                      <div className="grid grid-cols-4 gap-2">
                        {YUZYUZE_GRADE_OPTIONS.map(opt => (
                          <button
                            key={opt.num}
                            type="button"
                            onClick={() => setNewYuzyuzeGradeNum(opt.num)}
                            className={`rounded-xl border py-2 text-xs font-medium transition-colors cursor-pointer ${
                              newYuzyuzeGradeNum === opt.num
                                ? 'border-stone-900 bg-stone-900 text-stone-100'
                                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-medium text-stone-700 mb-1.5">
                        hangi şube?
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          YUZYUZE_GRADE_OPTIONS.find(g => g.num === newYuzyuzeGradeNum)
                            ?.branches || ['a']
                        ).map(branch => (
                          <button
                            key={branch}
                            type="button"
                            onClick={() => setNewYuzyuzeBranch(branch)}
                            className={`rounded-xl border py-2 text-xs font-medium transition-colors cursor-pointer ${
                              newYuzyuzeBranch === branch
                                ? 'border-stone-900 bg-stone-900 text-stone-100'
                                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                            }`}
                          >
                            {newYuzyuzeGradeNum}/{branch} şubesi
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <span className="block text-xs font-medium text-stone-700 mb-1.5">
                        hangi sınıf?
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {ONLINE_GRADE_OPTIONS.map(opt => (
                          <button
                            key={opt.gradeClass}
                            type="button"
                            onClick={() => setNewOnlineGradeClass(opt.gradeClass)}
                            className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                              newOnlineGradeClass === opt.gradeClass
                                ? 'border-stone-900 bg-stone-900 text-stone-100'
                                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-stone-700">
                          seçtiği çevrim içi dersler ({selectedOnlineCourseIds.length} seçili)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const allIds = availableOnlineCoursesForGrade.map(c => c.id);
                            if (selectedOnlineCourseIds.length === allIds.length) {
                              setSelectedOnlineCourseIds([]);
                            } else {
                              setSelectedOnlineCourseIds(allIds);
                            }
                          }}
                          className="text-xs text-stone-600 hover:text-stone-900 underline cursor-pointer"
                        >
                          {selectedOnlineCourseIds.length === availableOnlineCoursesForGrade.length
                            ? 'tüm seçimleri kaldır'
                            : 'tüm dersleri seç'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {availableOnlineCoursesForGrade.map(course => {
                          const checked = selectedOnlineCourseIds.includes(course.id);
                          return (
                            <label
                              key={course.id}
                              className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-xs transition-colors cursor-pointer select-none ${
                                checked
                                  ? 'border-stone-800 bg-stone-900/5 text-stone-900 font-medium'
                                  : 'border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedOnlineCourseIds(prev =>
                                    prev.includes(course.id)
                                      ? prev.filter(id => id !== course.id)
                                      : [...prev, course.id]
                                  );
                                }}
                                className="h-4 w-4 rounded border-stone-400 text-stone-900 focus:ring-stone-700 cursor-pointer"
                              />
                              <div className="min-w-0">
                                <div className="truncate">{course.shortTitle}</div>
                                <div className="text-[10px] text-stone-500 truncate">
                                  {course.instructorName}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {addFormError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2">
                    {addFormError}
                  </p>
                )}

                {/* Exact-Match Duplicate Prevention Prompt (Requirement 2) */}
                {pendingDuplicateAddConfirm && (
                  <div
                    data-testid="admin-duplicate-student-prompt"
                    className="rounded-xl border border-amber-300 bg-amber-50/95 p-4 space-y-2.5 text-xs"
                  >
                    <p className="font-medium text-amber-950 leading-relaxed">
                      Bu öğrenci zaten kayıtlı:{' '}
                      <strong>{pendingDuplicateAddConfirm.existingStudent.name}</strong> (
                      {pendingDuplicateAddConfirm.existingStudent.grade},{' '}
                      {pendingDuplicateAddConfirm.existingStudent.enrolledCourseIds
                        .map(cid => courses.find(c => c.id === cid)?.shortTitle || cid)
                        .join(', ')}
                      ). Bu dersi (
                      {pendingDuplicateAddConfirm.newCourseIds
                        .map(cid => courses.find(c => c.id === cid)?.shortTitle || cid)
                        .join(', ')}
                      ) mevcut öğrenciye ekleyeyim mi?
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid="admin-confirm-merge-existing-btn"
                        onClick={() =>
                          void handleConfirmMergeExistingOnAdd(
                            pendingDuplicateAddConfirm.existingStudent,
                            pendingDuplicateAddConfirm.newCourseIds
                          )
                        }
                        className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-medium text-stone-100 hover:bg-stone-800 cursor-pointer"
                      >
                        evet, bu dersi mevcut öğrenciye ekle
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDuplicateAddConfirm(null)}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
                      >
                        vazgeç
                      </button>
                    </div>
                  </div>
                )}

                {/* Typo / Similar Student Prompt: "Şunu mu demek istedin: <ad>?" with 3 Options */}
                {pendingTypoAddCandidates && (
                  <div
                    data-testid="admin-typo-student-prompt"
                    className="rounded-xl border border-amber-300 bg-amber-50/95 p-4 space-y-3 text-xs"
                  >
                    <p className="font-medium text-amber-950">
                      yazım benzerliği uyarısı — şunu mu demek istedin?
                    </p>
                    <div className="space-y-2">
                      {pendingTypoAddCandidates.candidates.map(cand => (
                        <div
                          key={cand.student.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-stone-900"
                        >
                          <span>
                            şunu mu demek istedin: <strong>{cand.student.name}</strong> (
                            {cand.student.grade} ·{' '}
                            {cand.student.enrolledCourseIds
                              .map(cid => courses.find(c => c.id === cid)?.shortTitle || cid)
                              .join(', ')}
                            )?
                          </span>
                          <button
                            type="button"
                            data-testid={`admin-typo-merge-${cand.student.id}`}
                            onClick={async () => {
                              const typedId = buildStudentIdFromName(
                                pendingTypoAddCandidates.typedName
                              );
                              if (onReconcileNotDuplicatesOnMerge) {
                                await onReconcileNotDuplicatesOnMerge(
                                  typedId,
                                  cand.student.id
                                );
                              }
                              await handleConfirmMergeExistingOnAdd(
                                cand.student,
                                pendingTypoAddCandidates.newCourseIds
                              );
                            }}
                            className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-100 hover:bg-stone-800 shrink-0 cursor-pointer"
                          >
                            Aynı kişi, birleştir
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        data-testid="admin-typo-not-duplicate-btn"
                        onClick={async () => {
                          const typedName = pendingTypoAddCandidates.typedName;
                          const typedId = buildStudentIdFromName(typedName);
                          const cands = pendingTypoAddCandidates.candidates;
                          const mod = pendingTypoAddCandidates.modality;
                          const gr = pendingTypoAddCandidates.gradeLabel;
                          const cIds = pendingTypoAddCandidates.newCourseIds;
                          if (onMarkNotDuplicatePairs) {
                            await onMarkNotDuplicatePairs(
                              cands.map(c => ({
                                studentId1: typedId,
                                studentId2: c.student.id,
                                note: `${typedName} — ${c.student.name}`,
                              }))
                            );
                          }
                          await executeCreateNewStudentRecord(
                            typedName,
                            mod,
                            gr,
                            cIds,
                            true
                          );
                        }}
                        className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-medium text-stone-800 hover:bg-stone-100 cursor-pointer"
                      >
                        Farklı kişiler, bir daha sorma
                      </button>
                      <button
                        type="button"
                        data-testid="admin-typo-cancel-btn"
                        onClick={() => setPendingTypoAddCandidates(null)}
                        className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600 hover:text-stone-900 cursor-pointer"
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-stone-500">
                    not: öğrenci {currentWeek}. haftadan ({getWeekDateRangeLabel(currentWeek)}) itibaren yoklama sistemine dahil edilir; önceki derslerden sorumlu tutulmaz.
                  </p>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-medium text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>öğrenciyi sisteme ekle</span>
                  </button>
                </div>
              </form>
            )}

            {/* Expandable Remove Student Panel */}
            {activeStudentPanel === 'remove' && (
              <div className="border-t border-stone-200/80 bg-[#faf8f4]/90 p-5 sm:p-6 space-y-4">
                <form
                  onSubmit={handleLookupStudentForRemoval}
                  className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
                >
                  <div className="flex-1">
                    <label
                      htmlFor="remove-student-name"
                      className="block text-xs font-medium text-stone-700 mb-1.5"
                    >
                      kaldırılacak öğrencinin adı soyadı
                    </label>
                    <input
                      id="remove-student-name"
                      type="text"
                      autoComplete="off"
                      value={removeNameInput}
                      onChange={e => {
                        setRemoveNameInput(e.target.value);
                        setStudentToConfirmRemove(null);
                        if (removeFormError) setRemoveFormError(null);
                      }}
                      placeholder="öğrencinin adını soyadını yaz..."
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-800 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl border border-stone-800 bg-stone-900 px-4 py-2.5 text-xs font-medium text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    öğrenciyi bul
                  </button>
                </form>

                {removeFormError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2">
                    {removeFormError}
                  </p>
                )}

                {sameNameCandidates.length > 1 && !studentToConfirmRemove && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 space-y-2">
                    <p className="text-xs font-medium text-amber-950">
                      aynı veya benzer isimde birden fazla öğrenci bulundu ({sameNameCandidates.length}). hangisini kaldırmak istiyorsun?
                    </p>
                    <div className="space-y-1.5">
                      {sameNameCandidates.map(cand => (
                        <button
                          key={cand.id}
                          type="button"
                          onClick={() => {
                            setStudentToConfirmRemove(cand);
                            setSameNameCandidates([]);
                          }}
                          className="w-full flex items-center justify-between rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-xs hover:bg-amber-100/60 transition-colors cursor-pointer"
                        >
                          <span>
                            <strong>{cand.name}</strong> · {cand.grade} · {cand.enrolledCourseIds.length} ders
                          </span>
                          <span className="font-mono-num text-[10px] text-stone-400">
                            id: {cand.id}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {studentToConfirmRemove && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50/90 p-4">
                    <div>
                      <p className="text-sm font-medium text-rose-950">
                        "{studentToConfirmRemove.name}" ({studentToConfirmRemove.grade} ·{' '}
                        {studentToConfirmRemove.enrolledCourseIds.length} ders · id: {studentToConfirmRemove.id}) bulundu.
                      </p>
                      <p className="text-xs text-rose-800 mt-0.5">
                        bu öğrenciyi yoklama sisteminden kaldırmak istediğine emin misin?
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleConfirmRemoveStudent}
                        className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-medium text-white hover:bg-rose-800 transition-colors cursor-pointer"
                      >
                        evet, eminim kaldır
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentToConfirmRemove(null)}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                      >
                        vazgeç
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Instructor Assignment Bar (Immediately Below Student Add Bar) */}
          <div className="rounded-2xl border border-stone-300/90 bg-white/85 overflow-hidden transition-all">
            <div className="p-4 sm:p-5">
              <button
                type="button"
                onClick={() => {
                  setIsInstructorAssignOpen(prev => !prev);
                  setAssignFormError(null);
                  setPendingInstructorReplacement(null);
                }}
                className="w-full flex items-center justify-between gap-3 text-left rounded-xl px-3 py-2 hover:bg-stone-100/80 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-stone-100">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-serif-art text-xl text-stone-900 leading-snug">
                      eğitmen ata
                    </h3>
                    <p className="text-xs text-stone-500">
                      eğitmeni dersine ve düzeyine ata · boş (bos1–bos4) sınıflara hemen atanır, dolu sınıflarda onay sorulur
                    </p>
                  </div>
                </div>
                <span className="text-stone-500 shrink-0">
                  {isInstructorAssignOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </span>
              </button>
            </div>

            {isInstructorAssignOpen && (
              <form
                onSubmit={handleInstructorAssignSubmit}
                className="border-t border-stone-200/80 bg-[#faf8f4]/90 p-5 sm:p-6 space-y-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 1. Eğitmen Adı */}
                  <div>
                    <label
                      htmlFor="assign-instructor-name"
                      className="block text-xs font-medium text-stone-700 mb-1.5"
                    >
                      eğitmenin adı soyadı
                    </label>
                    <input
                      id="assign-instructor-name"
                      type="text"
                      autoComplete="off"
                      value={assignInstructorName}
                      onChange={e => {
                        setAssignInstructorName(e.target.value);
                        setPendingInstructorReplacement(null);
                        if (assignFormError) setAssignFormError(null);
                      }}
                      placeholder="örn. selim kaya"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-800 focus:outline-none"
                    />
                  </div>

                  {/* 2. Çevrim İçi / Yüz Yüze */}
                  <div>
                    <span className="block text-xs font-medium text-stone-700 mb-1.5">
                      eğitim türü (yüz yüze / çevrim içi)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {(['online', 'yuzyuze'] as const).map(mod => (
                        <button
                          key={mod}
                          type="button"
                          onClick={() => {
                            setAssignModality(mod);
                            setPendingInstructorReplacement(null);
                          }}
                          className={`rounded-xl border py-2.5 px-3 text-xs font-medium transition-colors cursor-pointer ${
                            assignModality === mod
                              ? 'border-stone-900 bg-stone-900 text-stone-100'
                              : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          {mod === 'online' ? 'çevrim içi' : 'yüz yüze'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Ders Vereceği Düzey */}
                <div>
                  <span className="block text-xs font-medium text-stone-700 mb-1.5">
                    ders vereceği düzey
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(assignModality === 'online'
                      ? ONLINE_GRADE_OPTIONS
                      : YUZYUZE_CLASS_LEVELS
                    ).map(opt => (
                      <button
                        key={opt.gradeClass}
                        type="button"
                        onClick={() => {
                          setAssignGradeClass(opt.gradeClass);
                          setPendingInstructorReplacement(null);
                        }}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                          assignGradeClass === opt.gradeClass
                            ? 'border-stone-900 bg-stone-900 text-stone-100'
                            : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Vereceği Ders */}
                <div>
                  <span className="block text-xs font-medium text-stone-700 mb-1.5">
                    vereceği ders
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {availableCoursesForInstructorAssign.map(course => {
                      const isSelected = assignTargetCourseId === course.id;
                      const isBos = isUnassignedBosInstructor(course.instructorName);
                      return (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => {
                            setAssignTargetCourseId(course.id);
                            setPendingInstructorReplacement(null);
                          }}
                          className={`flex flex-col items-start justify-between rounded-xl border p-3 text-left text-xs transition-all cursor-pointer ${
                            isSelected
                              ? 'border-stone-900 bg-stone-900 text-stone-100 shadow-xs'
                              : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          <div className="font-medium">{course.shortTitle}</div>
                          <div
                            className={`mt-1 text-[11px] ${
                              isSelected
                                ? 'text-stone-300'
                                : isBos
                                ? 'text-amber-700 font-medium'
                                : 'text-stone-500'
                            }`}
                          >
                            mevcut eğitmen: {course.instructorName}
                            {isBos ? ' (boş)' : ''}
                          </div>
                        </button>
                      );
                    })}

                    {/* Option to add a brand-new course to this level */}
                    <button
                      type="button"
                      onClick={() => {
                        setAssignTargetCourseId('__new__');
                        setPendingInstructorReplacement(null);
                      }}
                      className={`flex flex-col items-start justify-between rounded-xl border border-dashed p-3 text-left text-xs transition-all cursor-pointer ${
                        assignTargetCourseId === '__new__'
                          ? 'border-stone-900 bg-stone-900 text-stone-100'
                          : 'border-stone-400 bg-white/60 text-stone-700 hover:bg-white'
                      }`}
                    >
                      <div className="inline-flex items-center gap-1 font-medium">
                        <Plus className="h-3.5 w-3.5" />
                        <span>yeni ders ekle</span>
                      </div>
                      <div
                        className={`mt-1 text-[11px] ${
                          assignTargetCourseId === '__new__' ? 'text-stone-300' : 'text-stone-500'
                        }`}
                      >
                        {assignGradeClass} düzeyine yeni branş aç
                      </div>
                    </button>
                  </div>

                  {assignTargetCourseId === '__new__' && (
                    <div className="mt-3">
                      <label
                        htmlFor="new-course-subject"
                        className="block text-xs font-medium text-stone-700 mb-1.5"
                      >
                        yeni dersin branşı / adı ({assignGradeClass})
                      </label>
                      <input
                        id="new-course-subject"
                        type="text"
                        autoComplete="off"
                        value={newCourseSubjectInput}
                        onChange={e => {
                          setNewCourseSubjectInput(e.target.value);
                          if (assignFormError) setAssignFormError(null);
                        }}
                        placeholder="örn. sosyal bilgiler, felsefe, geometri..."
                        className="w-full sm:w-80 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-800 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {assignFormError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2">
                    {assignFormError}
                  </p>
                )}

                {/* Confirmation box if replacing a non-bos instructor */}
                {pendingInstructorReplacement ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/95 p-4">
                    <div>
                      <p className="text-sm font-medium text-amber-950">
                        bu işlem {pendingInstructorReplacement.course.instructorName} öğretmenini kaldıracaktır emin misiniz?
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        {pendingInstructorReplacement.course.title} dersinin yeni eğitmeni "{pendingInstructorReplacement.newInstructorName}" olarak kaydedilecek.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleConfirmInstructorReplacement}
                        className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-medium text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
                      >
                        evet, eminim
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingInstructorReplacement(null)}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                      >
                        vazgeç
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <p className="text-[11px] text-stone-500">
                      eğitmen atandığı anda ana sayfadan kendi adıyla giriş yapıp yoklama alabilir.
                    </p>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-medium text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>eğitmeni ata</span>
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Audit Log & Olası Tekrarlar / Kimlik Birleştirme Quick Links at Bottom of Menu */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="sibelius-audit-log-btn"
                onClick={() => {
                  setCategory('audit_log');
                  resetDetailSelection();
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300/80 bg-white/75 px-3.5 py-1.5 text-[11px] font-medium text-stone-700 hover:border-stone-500 hover:bg-white transition-colors cursor-pointer"
              >
                <span>işlem geçmişi (audit log): {auditLogs.length} kayıt →</span>
              </button>

              <button
                type="button"
                data-testid="sibelius-duplicates-btn"
                onClick={() => {
                  setCategory('uyumsuzluklar');
                  resetDetailSelection();
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-400/90 bg-amber-50/90 px-3.5 py-1.5 text-[11px] font-medium text-amber-950 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <AlertCircle className="h-3.5 w-3.5 text-amber-800" />
                <span>
                  olası tekrarlar & kimlik birleştirme ({migrationDryRunReport.groupsToMigrate.length} grup · {migrationDryRunReport.nearDuplicatePairs.length} benzer) →
                </span>
              </button>
            </div>

            <button
              type="button"
              data-testid="sibelius-paranoya-panel"
              onClick={() => setShowParanoyaNames(prev => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300/70 bg-white/65 px-3 py-1.5 text-[11px] text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
            >
              <span>
                kaydet butonuna ihtiyaç duyan paranoya sayısı:{' '}
                <strong className="font-mono-num font-medium text-stone-700">
                  {paranoyaStats.count}
                </strong>
              </span>
            </button>
            {showParanoyaNames && paranoyaStats.names.length > 0 && (
              <p className="w-full text-[11px] text-stone-500 text-right">
                aktif edenler: {paranoyaStats.names.join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Search Bar when inside ders / ogrenci / egitmen list */}
      {(category === 'ders' || category === 'ogrenci' || category === 'egitmen') &&
        !selectedStudentId &&
        !selectedCourseId &&
        !selectedInstructorId && (
          <div className="mb-5 sm:mb-6">
            <label htmlFor="sibelius-search" className="sr-only">
              arama yap
            </label>
            <div className="relative">
              <Search className="h-4 w-4 text-stone-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                id="sibelius-search"
                type="text"
                autoComplete="off"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  category === 'ogrenci'
                    ? 'öğrenci adı veya sınıf düzeyi ara...'
                    : category === 'egitmen'
                    ? 'eğitmen adı, bos1-bos4 veya ders ara...'
                    : 'ders adı, sınıf (örn. 6/a) veya eğitmen ara...'
                }
                className="w-full rounded-2xl border border-stone-300 bg-white/95 pl-11 pr-4 py-3.5 text-base sm:text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-700 focus:outline-none"
              />
            </div>
          </div>
        )}

      {/* ================= CATEGORY: ÖĞRENCİ ARAT ================= */}
      {category === 'ogrenci' && !selectedStudentId && (
        <div className="rounded-2xl border border-stone-300/80 bg-white/90 p-3.5 sm:p-5">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-2">
            <span className="text-xs font-medium text-stone-700">
              en az katılım sağlayan öğrenciler en üstte sıralanmaktadır
            </span>
            <span className="text-xs font-mono-num text-stone-500 whitespace-nowrap ml-2">
              {studentStats.length} sonuç
            </span>
          </div>

          <div className="divide-y divide-stone-200/70">
            {studentStats.map(({ student, absentCount, totalSessionsHeld }) => (
              <button
                key={student.id}
                type="button"
                onClick={() => setSelectedStudentId(student.id)}
                className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 py-3 px-2.5 sm:px-3 rounded-xl hover:bg-stone-100/80 active:bg-stone-200/50 text-left transition-colors cursor-pointer"
              >
                <div>
                  <span className="text-sm font-medium text-stone-900">
                    {student.name}
                  </span>
                  <span className="text-xs text-stone-500 ml-2">
                    · {student.grade} · {student.enrolledCourseIds.length} kayıtlı ders
                    {student.addedAtWeek ? ` · ${student.addedAtWeek}. haftada eklendi` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono-num">
                  <span
                    className={
                      absentCount > 0 ? 'text-rose-700 font-medium' : 'text-stone-500'
                    }
                  >
                    devamsızlık: {absentCount} {absentCount > 0 ? '🫏' : ''}
                  </span>
                  <span className="text-stone-400">·</span>
                  <span className="text-stone-500">
                    işlenen yoklama: {totalSessionsHeld}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STUDENT DETAIL VIEW: Week-by-Week Columns for Enrolled Courses Only */}
      {category === 'ogrenci' && selectedStudentId && (() => {
        const student = students.find(s => s.id === selectedStudentId);
        if (!student) return null;
        const enrolledCourses = student.enrolledCourseIds
          .map(cid => courses.find(c => c.id === cid))
          .filter((c): c is Course => Boolean(c));

        const tempAttendancesForStudent = unlistedReports.filter(
          r =>
            r.status === 'temporary' &&
            (r.resolvedStudentId === student.id ||
              getCanonicalStudentName(r.studentName) === getCanonicalStudentName(student.name)) &&
            !student.enrolledCourseIds.includes(r.courseId)
        );

        return (
          <div className="rounded-2xl border border-stone-300/90 bg-white/90 p-4 sm:p-6">
            <div className="border-b border-stone-200 pb-3 sm:pb-4 mb-4 sm:mb-5">
              <h2 className="font-serif-art text-2xl sm:text-3xl text-stone-900">
                {student.name}
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                {student.grade} · yalnızca öğrencinin sorumlu olduğu ({enrolledCourses.length}) ders listelenmektedir
                {student.addedAtWeek ? ` · ${student.addedAtWeek}. haftadan itibaren sorumlu` : ''}
                {student.notes ? ` · not: ${student.notes}` : ''}
              </p>
            </div>

            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-stone-500">
                    <th className="py-2.5 pr-3 font-medium sticky left-0 bg-white/95 z-10">
                      sorumlu olduğu ders & eğitmen
                    </th>
                    {weeksList.map(w => (
                      <th key={w} className="py-2.5 px-3 font-medium font-mono-num whitespace-nowrap">
                        {w}. hafta
                        <div className="text-[10px] font-normal text-stone-400">
                          {getWeekDateRangeLabel(w)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/70 text-xs">
                  {enrolledCourses.map(course => (
                    <tr key={course.id} className="hover:bg-stone-100/60">
                      <td className="py-3 pr-3 whitespace-nowrap sticky left-0 bg-white/95 z-10">
                        <div className="font-medium text-stone-900">{course.title}</div>
                        <div className="text-[11px] text-stone-500">
                          eğitmen: {course.instructorName}
                        </div>
                      </td>
                      {weeksList.map(w => (
                        <td key={w} className="py-3 px-3 whitespace-nowrap">
                          {renderStudentCourseWeekCell(course.id, student.id, w)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tempAttendancesForStudent.length > 0 && (
              <div className="mt-6 pt-4 border-t border-stone-200">
                <h3 className="text-xs font-medium text-stone-800 mb-2">
                  geçici öğrenci olarak katıldığı tekil dersler (derse kayıtlı olmadan)
                </h3>
                <div className="space-y-1.5">
                  {tempAttendancesForStudent.map(rep => {
                    const tempCourse = courses.find(c => c.id === rep.courseId);
                    return (
                      <div
                        key={rep.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="font-medium text-stone-900">
                            {tempCourse?.title || rep.courseId}
                          </span>
                          <span className="text-stone-500 ml-2">
                            · eğitmen: {rep.instructorName} · {rep.weekNumber}. hafta ({rep.sessionType})
                          </span>
                        </div>
                        <span className="text-emerald-800 font-medium">
                          var (geçici öğrenci)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ================= CATEGORY: EĞİTMEN ARAT ================= */}
      {category === 'egitmen' && !selectedInstructorId && (
        <div className="rounded-2xl border border-stone-300/80 bg-white/85 p-5">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-3">
            <span className="text-xs font-medium text-stone-700">
              bu hafta ({currentWeek}. hafta) ders yapmayan / yoklama almayan eğitmenler en üstte listelenmektedir
            </span>
            <span className="text-xs font-mono-num text-stone-500">
              {realInstructorsCount} eğitmen{unassignedBosCount > 0 ? ` + ${unassignedBosCount} boş` : ''}
            </span>
          </div>

          <div className="divide-y divide-stone-200/70">
            {instructorStats.map(
              ({ instructor, courses: instCourses, markedDidNotHold, didNotTakeAttendance }) => (
                <button
                  key={instructor.id}
                  type="button"
                  onClick={() => setSelectedInstructorId(instructor.id)}
                  className="w-full flex flex-wrap items-center justify-between gap-2 py-3 px-3 rounded-xl hover:bg-stone-100/80 text-left transition-colors cursor-pointer"
                >
                  <div>
                    <span className="text-sm font-medium text-stone-900">
                      {instructor.name}
                    </span>
                    <span className="text-xs text-stone-500 ml-2">
                      · {instCourses.map(c => c.title).join(', ')}
                    </span>
                  </div>
                  <div className="text-xs">
                    {markedDidNotHold ? (
                      <span className="text-amber-700 font-medium">
                        bu hafta ders yapmadı
                      </span>
                    ) : didNotTakeAttendance ? (
                      <span className="text-rose-700 font-medium">
                        bu hafta yoklama almadı
                      </span>
                    ) : (
                      <span className="text-emerald-800">
                        bu hafta yoklama aldı
                      </span>
                    )}
                  </div>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* INSTRUCTOR DETAIL VIEW */}
      {category === 'egitmen' && selectedInstructorId && (() => {
        const instructor = instructors.find(i => i.id === selectedInstructorId);
        if (!instructor) return null;
        const instCourses = instructor.courseIds
          .map(cid => courses.find(c => c.id === cid))
          .filter((c): c is Course => Boolean(c));

        return (
          <div>
            <div className="mb-4">
              <h2 className="font-serif-art text-3xl text-stone-900">
                {instructor.name} · sınıf katılım tablosu
              </h2>
            </div>
            {instCourses.map(course => renderCourseMatrix(course))}
          </div>
        );
      })()}

      {/* ================= CATEGORY: DERS ARAT ================= */}
      {category === 'ders' && !selectedCourseId && (
        <div className="rounded-2xl border border-stone-300/80 bg-white/85 p-5">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-3">
            <span className="text-xs font-medium text-stone-700">
              en çok devamsızlık olan ve yoklaması beklenen dersler en üstte listelenmektedir
            </span>
            <span className="text-xs font-mono-num text-stone-500">
              {courseStats.length} ders
            </span>
          </div>

          <div className="divide-y divide-stone-200/70">
            {courseStats.map(({ course, totalAbsences, noAttendanceThisWeek }) => (
              <button
                key={course.id}
                type="button"
                onClick={() => setSelectedCourseId(course.id)}
                className="w-full flex flex-wrap items-center justify-between gap-2 py-3 px-3 rounded-xl hover:bg-stone-100/80 text-left transition-colors cursor-pointer"
              >
                <div>
                  <span className="text-sm font-medium text-stone-900">
                    {course.title}
                  </span>
                  <span className="text-xs text-stone-500 ml-2">
                    · eğitmen: {course.instructorName} · {course.studentIds.length} öğrenci
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono-num">
                  <span className={totalAbsences > 0 ? 'text-rose-700 font-medium' : 'text-stone-500'}>
                    toplam gelmeyen: {totalAbsences}
                  </span>
                  <span className="text-stone-400">·</span>
                  <span className={noAttendanceThisWeek ? 'text-amber-700' : 'text-emerald-800'}>
                    {noAttendanceThisWeek ? 'bu hafta girilmedi' : 'bu hafta girildi'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* COURSE DETAIL VIEW */}
      {category === 'ders' && selectedCourseId && (() => {
        const course = courses.find(c => c.id === selectedCourseId);
        if (!course) return null;
        return renderCourseMatrix(course);
      })()}

      {/* ================= CATEGORY: LİSTE DIŞI ÖĞRENCİLER ================= */}
      {category === 'liste_disi' && (
        <div className="rounded-2xl border border-stone-300/90 bg-white/90 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-4 mb-5">
            <div>
              <h2 className="font-serif-art text-2xl sm:text-3xl text-stone-900">
                liste dışı öğrenciler
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                eğitmenlerin yoklama sırasında "listede olmayan öğrenci ekle" ile raporladığı öğrenciler. her öğrenciyi ilgili derse kalıcı olarak kaydedebilir veya yalnızca o dersin yoklamasında var olacak şekilde "geçici öğrenci" olarak işleyebilirsin.
              </p>
            </div>
            <span className="text-xs font-mono-num text-stone-500 whitespace-nowrap">
              {pendingUnlistedCount} bekleyen · toplam {unlistedReports.length}
            </span>
          </div>

          {unlistedReports.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-stone-600">
                henüz liste dışı olarak raporlanan bir öğrenci bulunmuyor.
              </p>
              <p className="text-xs text-stone-400 mt-1">
                eğitmenler yoklama ekranındaki "listede olmayan öğrenci ekle" barından öğrenci eklediğinde burada listelenir.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {[...unlistedReports]
                .sort((a, b) => {
                  if (a.status === 'pending' && b.status !== 'pending') return -1;
                  if (a.status !== 'pending' && b.status === 'pending') return 1;
                  return b.createdAt.localeCompare(a.createdAt);
                })
                .map(report => {
                  const course = courses.find(c => c.id === report.courseId);
                  const existingStudent = findMatchingStudentByFullName(
                    report.studentName,
                    students
                  );
                  const alreadyEnrolledInThisCourse = existingStudent
                    ? existingStudent.enrolledCourseIds.includes(report.courseId)
                    : false;

                  return (
                    <div
                      key={report.id}
                      className={`rounded-2xl border p-4 sm:p-5 transition-all ${
                        report.status === 'pending'
                          ? 'border-stone-300 bg-[#faf8f4]/90'
                          : 'border-stone-200 bg-white/70'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-serif-art text-xl text-stone-900">
                              {report.studentName}
                            </h3>
                            {report.status === 'pending' && (
                              <span className="rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                                işlem bekliyor
                              </span>
                            )}
                            {report.status === 'enrolled' && (
                              <span className="rounded-md bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
                                bu derse kaydedildi
                              </span>
                            )}
                            {report.status === 'temporary' && (
                              <span className="rounded-md bg-stone-200 border border-stone-300 px-2 py-0.5 text-[11px] font-medium text-stone-800">
                                geçici öğrenci (sadece bu yoklamada var)
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-stone-600 mt-1">
                            ders: <span className="font-medium text-stone-800">{course?.title || report.courseId}</span> · eğitmen:{' '}
                            <span className="font-medium text-stone-800">{report.instructorName}</span> ·{' '}
                            <span className="font-mono-num">
                              {report.weekNumber}. hafta ({getWeekDateRangeLabel(report.weekNumber)}) · {report.sessionType}
                            </span>
                          </p>

                          <div className="mt-2 text-xs">
                            {existingStudent ? (
                              <span className="text-emerald-900">
                                sistem kontrolü: aynı isim soyisimde öğrenci mevcut (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCategory('ogrenci');
                                    setSelectedStudentId(existingStudent.id);
                                  }}
                                  className="underline font-medium hover:text-stone-900 cursor-pointer"
                                >
                                  {existingStudent.name}
                                </button>{' '}
                                · {existingStudent.grade} · {existingStudent.enrolledCourseIds.length} kayıtlı ders
                                {alreadyEnrolledInThisCourse ? ' · bu derse de kayıtlı' : ''})
                              </span>
                            ) : (
                              <span className="text-stone-500">
                                sistem kontrolü: sistemde "{report.studentName}" adında kayıtlı öğrenci yok (kaydet dendiğinde yeni öğrenci oluşturulup yalnızca bu derse eklenecek).
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteUnlistedReport(report.id);
                            showTemporaryNotice(`"${report.studentName}" liste dışı raporu silindi.`);
                          }}
                          title="bu raporu sil"
                          className="self-end sm:self-start rounded-lg border border-stone-200 bg-white p-1.5 text-stone-400 hover:border-rose-300 hover:text-rose-700 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Action Buttons Underneath Each Student */}
                      <div className="mt-4 pt-3 border-t border-stone-200/80 space-y-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={async () => {
                              if (existingStudent && !alreadyEnrolledInThisCourse) {
                                setPendingUnlistedTypo(null);
                                setPendingUnlistedConfirm({
                                  reportId: report.id,
                                  existingStudent,
                                });
                                return;
                              }
                              if (!existingStudent) {
                                const similar = findSimilarStudentsByName(
                                  report.studentName,
                                  students,
                                  notDuplicatePairs
                                );
                                if (similar.length > 0) {
                                  setPendingUnlistedConfirm(null);
                                  setPendingUnlistedTypo({
                                    reportId: report.id,
                                    candidates: similar,
                                  });
                                  return;
                                }
                              }
                              const msg = await onEnrollUnlistedStudent(report);
                              showTemporaryNotice(msg);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
                              report.status === 'enrolled'
                                ? 'bg-emerald-800 text-white'
                                : 'bg-stone-900 text-stone-100 hover:bg-stone-800'
                            }`}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>
                              {report.status === 'temporary'
                                ? 'geçici → kayıtlıya çevir (bu derse kaydet)'
                                : 'bu öğrenciyi bu derse kaydet'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              const msg = await onMarkTemporaryUnlistedStudent(report);
                              showTemporaryNotice(msg);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
                              report.status === 'temporary'
                                ? 'border-stone-900 bg-stone-800 text-stone-100'
                                : 'border-stone-300 bg-white text-stone-800 hover:border-stone-600 hover:bg-stone-50'
                            }`}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>geçici öğrenci</span>
                          </button>
                        </div>

                        {/* Exact-match confirmation for unlisted student enrollment */}
                        {pendingUnlistedConfirm?.reportId === report.id && (
                          <div className="rounded-xl border border-amber-300 bg-amber-50/95 p-3 text-xs space-y-2">
                            <p className="font-medium text-amber-950">
                              Bu öğrenci zaten kayıtlı:{' '}
                              <strong>{pendingUnlistedConfirm.existingStudent.name}</strong> (
                              {pendingUnlistedConfirm.existingStudent.grade},{' '}
                              {pendingUnlistedConfirm.existingStudent.enrolledCourseIds
                                .map(cid => courses.find(c => c.id === cid)?.shortTitle || cid)
                                .join(', ')}
                              ). Bu dersi ({course?.shortTitle || report.courseId}) mevcut öğrenciye ekleyeyim mi?
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  const targetName = pendingUnlistedConfirm.existingStudent.name;
                                  setPendingUnlistedConfirm(null);
                                  const msg = await onEnrollUnlistedStudent(report, targetName);
                                  showTemporaryNotice(msg);
                                }}
                                className="rounded-lg bg-stone-900 px-3 py-1.5 text-[11px] font-medium text-stone-100 hover:bg-stone-800 cursor-pointer"
                              >
                                evet, bu dersi mevcut öğrenciye ekle
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingUnlistedConfirm(null)}
                                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[11px] text-stone-700 hover:bg-stone-100 cursor-pointer"
                              >
                                vazgeç
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Typo warning for unlisted student enrollment with 3 Options */}
                        {pendingUnlistedTypo?.reportId === report.id && (
                          <div className="rounded-xl border border-amber-300 bg-amber-50/95 p-3 text-xs space-y-2.5">
                            <p className="font-medium text-amber-950">
                              şunu mu demek istedin? (benzer isimli kayıtlı öğrenci bulundu):
                            </p>
                            <div className="space-y-2">
                              {pendingUnlistedTypo.candidates.map(cand => (
                                <div
                                  key={cand.student.id}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-300 bg-white px-2.5 py-2 text-[11px] text-stone-900"
                                >
                                  <span>
                                    şunu mu demek istedin: <strong>{cand.student.name}</strong> (
                                    {cand.student.grade} ·{' '}
                                    {cand.student.enrolledCourseIds
                                      .map(cid => courses.find(c => c.id === cid)?.shortTitle || cid)
                                      .join(', ')}
                                    )?
                                  </span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const unlistedId = buildStudentIdFromName(report.studentName);
                                      if (onReconcileNotDuplicatesOnMerge) {
                                        await onReconcileNotDuplicatesOnMerge(
                                          unlistedId,
                                          cand.student.id
                                        );
                                      }
                                      setPendingUnlistedTypo(null);
                                      const msg = await onEnrollUnlistedStudent(
                                        report,
                                        cand.student.name
                                      );
                                      showTemporaryNotice(msg);
                                    }}
                                    className="rounded-lg bg-stone-900 px-2.5 py-1 text-[11px] font-medium text-stone-100 hover:bg-stone-800 shrink-0 cursor-pointer"
                                  >
                                    Aynı kişi, birleştir
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  const unlistedId = buildStudentIdFromName(report.studentName);
                                  const cands = pendingUnlistedTypo.candidates;
                                  if (onMarkNotDuplicatePairs) {
                                    await onMarkNotDuplicatePairs(
                                      cands.map(c => ({
                                        studentId1: unlistedId,
                                        studentId2: c.student.id,
                                        note: `${report.studentName} — ${c.student.name}`,
                                      }))
                                    );
                                  }
                                  setPendingUnlistedTypo(null);
                                  const msg = await onEnrollUnlistedStudent(report);
                                  showTemporaryNotice(msg, true);
                                }}
                                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-800 hover:bg-stone-100 cursor-pointer"
                              >
                                Farklı kişiler, bir daha sorma
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingUnlistedTypo(null)}
                                className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-600 hover:text-stone-900 cursor-pointer"
                              >
                                İptal
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ================= CATEGORY: İŞLEM GEÇMİŞİ (AUDIT LOG) ================= */}
      {category === 'audit_log' && (
        <div className="rounded-2xl border border-stone-300/90 bg-white/90 p-5 sm:p-6">
          <div className="border-b border-stone-200 pb-4 mb-4">
            <h2 className="font-serif-art text-2xl sm:text-3xl text-stone-900">
              işlem geçmişi · audit log
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              yoklama ve yönetim işlemlerinin kim tarafından, ne zaman ve nasıl yapıldığını gösteren kayıt dökümü ({auditLogs.length})
            </p>
          </div>

          {auditLogs.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-500">
              henüz kayıtlı bir işlem geçmişi bulunmuyor.
            </p>
          ) : (
            <div className="divide-y divide-stone-200/70 text-xs">
              {auditLogs.map(log => {
                const dateObj = new Date(log.createdAt);
                const formatted = isNaN(dateObj.getTime())
                  ? log.createdAt
                  : dateObj.toLocaleString('tr-TR', {
                      timeZone: 'Europe/Istanbul',
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });
                return (
                  <div
                    key={log.id}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                  >
                    <div>
                      <span className="font-medium text-stone-900">{log.actor}</span>
                      <span className="mx-1.5 text-stone-400">·</span>
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono-num text-[11px] text-stone-700">
                        {log.action}
                      </span>
                      <span className="mx-1.5 text-stone-400">·</span>
                      <span className="text-stone-600">{log.details}</span>
                    </div>
                    <span className="font-mono-num text-[11px] text-stone-400 whitespace-nowrap">
                      {formatted}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= CATEGORY: OLASI TEKRARLAR, KURU ÇALIŞTIRMA & KİMLİK BİRLEŞTİRME ================= */}
      {category === 'uyumsuzluklar' && (
        <div className="space-y-6">
          {/* Live Duplicate Scanner & Safe Migration Panel (Requirement 3 & 4) */}
          <div
            data-testid="duplicates-migration-panel"
            className="rounded-2xl border border-stone-300/90 bg-white/95 p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-stone-200 pb-4">
              <div>
                <h2 className="font-serif-art text-2xl sm:text-3xl text-stone-900">
                  olası tekrarlar & öğrenci kimliği birleştirme (stu-&lt;slug&gt;)
                </h2>
                <p className="text-xs text-stone-500 mt-1">
                  adım a: kuru çalıştırma raporu (hiçbir şey yazmadan tespit edilen tekrarlar) · adım b: tam json yedek · adım c: tekil stu-&lt;slug&gt; kimliğinde birleştirme
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="rescan-duplicates-btn"
                  onClick={() => {
                    setRescanCounter(prev => prev + 1);
                    showTemporaryNotice('tüm öğrenci, yoklama ve liste dışı koleksiyonları yeniden tarandı.');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-medium text-stone-800 hover:border-stone-600 hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>yeniden tara</span>
                </button>

                {onDownloadMigrationBackup && (
                  <button
                    type="button"
                    data-testid="download-migration-backup-btn"
                    onClick={() => {
                      onDownloadMigrationBackup();
                      showTemporaryNotice('ilgili tüm koleksiyonların tam JSON yedeği indirildi.');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-[#faf8f4] px-3.5 py-2 text-xs font-medium text-stone-800 hover:border-stone-600 hover:bg-white transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>adım b: tam json yedeği indir</span>
                  </button>
                )}

                {canUndoMigration && onUndoMigration && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onUndoMigration();
                      showTemporaryNotice('birleştirme işlemi yedekten geri alındı.');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>birleştirmeyi geri al (yedekten yükle)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl border border-stone-200 bg-[#faf8f4] p-3">
                <div className="text-stone-500">birleştirilecek / taşınacak grup</div>
                <div className="font-mono-num text-xl font-semibold text-stone-900 mt-0.5">
                  {migrationDryRunReport.groupsToMigrate.length}
                </div>
              </div>
              <div className="rounded-xl border border-stone-200 bg-[#faf8f4] p-3">
                <div className="text-stone-500">soft-delete edilecek tekrar belge</div>
                <div className="font-mono-num text-xl font-semibold text-stone-900 mt-0.5">
                  {migrationDryRunReport.totalCustomDocsToSoftDelete}
                </div>
              </div>
              <div className="rounded-xl border border-stone-200 bg-[#faf8f4] p-3">
                <div className="text-stone-500">yönlendirilecek referans (yoklama + liste dışı)</div>
                <div className="font-mono-num text-xl font-semibold text-stone-900 mt-0.5">
                  {migrationDryRunReport.totalAttendanceDocsToUpdate +
                    migrationDryRunReport.totalUnlistedDocsToUpdate}
                </div>
              </div>
              <div className="rounded-xl border border-stone-200 bg-[#faf8f4] p-3">
                <div className="text-stone-500">onay bekleyen çakışma (sınıf/isim/yoklama)</div>
                <div
                  className={`font-mono-num text-xl font-semibold mt-0.5 ${
                    migrationDryRunReport.unresolvedConflictCount > 0
                      ? 'text-amber-800'
                      : 'text-emerald-800'
                  }`}
                >
                  {migrationDryRunReport.unresolvedConflictCount}
                </div>
              </div>
            </div>

            {/* Step A: Groups to Migrate */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-600">
                adım a · kuru çalıştırma: birleştirilecek tekrarlar ve stu-&lt;slug&gt; dönüşümleri ({migrationDryRunReport.groupsToMigrate.length})
              </h3>

              {migrationDryRunReport.groupsToMigrate.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900">
                  tüm öğrenci kimlikleri kanonik <code>stu-&lt;slug&gt;</code> formatında ve tekrar eden kayıt bulunmuyor.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {migrationDryRunReport.groupsToMigrate.map(group => (
                    <div
                      key={group.targetId}
                      className={`rounded-xl border p-3.5 text-xs space-y-2 ${
                        group.hasGradeConflict ||
                        group.hasModalityConflict ||
                        group.hasNameConflict
                          ? 'border-amber-300 bg-amber-50/60'
                          : 'border-stone-200 bg-[#faf8f4]/70'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold text-stone-900 text-sm">
                            {group.normalizedName}
                          </span>
                          <span className="ml-2 font-mono-num text-[11px] text-stone-500">
                            → hedef kimlik: <strong>{group.targetId}</strong> (asıl kaynak: {group.primarySource}:{group.primaryOriginalId})
                          </span>
                        </div>
                        <span className="rounded bg-stone-200/80 px-2 py-0.5 font-mono-num text-[10px] text-stone-700">
                          {group.activeRecords.length} aktif kayıt → 1 tekil kayıt
                        </span>
                      </div>

                      <div className="space-y-1 text-[11px] text-stone-600">
                        {group.activeRecords.map(rec => (
                          <div key={`${rec.source}:${rec.docId}`} className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono-num rounded bg-white border border-stone-200 px-1.5 py-0.5 text-stone-800">
                              {rec.source}:{rec.docId}
                            </span>
                            <span>isim: "{rec.name}"</span>
                            <span>· sınıf: {rec.grade} ({rec.modality})</span>
                            <span>· dersler: [{rec.enrolledCourseIds.join(', ')}]</span>
                            <span>· hafta: {rec.addedAtWeek}</span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-1 text-[11px] text-emerald-900 font-medium">
                        birleşik dersler ({group.mergedCourseIds.length}): [{group.mergedCourseIds.join(', ')}] · en küçük hafta: {group.minAddedAtWeek}
                      </div>

                      {/* Conflict Selectors if grade / modality / spelling differs */}
                      {(group.hasNameConflict ||
                        group.hasGradeConflict ||
                        group.hasModalityConflict) && (
                        <div className="pt-2 border-t border-amber-200/80 flex flex-wrap items-center gap-4 text-[11px]">
                          {group.hasNameConflict && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-amber-950">
                                isim yazımı çakışması (seçin):
                              </span>
                              {group.distinctNames.map(nm => (
                                <button
                                  key={nm}
                                  type="button"
                                  onClick={() =>
                                    setMigrationResolutions(prev => ({
                                      ...prev,
                                      nameByTargetId: {
                                        ...(prev.nameByTargetId || {}),
                                        [group.targetId]: nm,
                                      },
                                    }))
                                  }
                                  className={`rounded-lg border px-2 py-1 cursor-pointer ${
                                    migrationResolutions.nameByTargetId?.[group.targetId] === nm
                                      ? 'border-stone-900 bg-stone-900 text-white'
                                      : 'border-amber-300 bg-white text-stone-800 hover:bg-amber-100'
                                  }`}
                                >
                                  {nm}
                                </button>
                              ))}
                            </div>
                          )}

                          {group.hasGradeConflict && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-amber-950">
                                sınıf/grade çakışması (seçin):
                              </span>
                              {group.distinctGrades.map(gr => (
                                <button
                                  key={gr}
                                  type="button"
                                  onClick={() =>
                                    setMigrationResolutions(prev => ({
                                      ...prev,
                                      gradeByTargetId: {
                                        ...(prev.gradeByTargetId || {}),
                                        [group.targetId]: gr,
                                      },
                                    }))
                                  }
                                  className={`rounded-lg border px-2 py-1 cursor-pointer ${
                                    migrationResolutions.gradeByTargetId?.[group.targetId] === gr
                                      ? 'border-stone-900 bg-stone-900 text-white'
                                      : 'border-amber-300 bg-white text-stone-800 hover:bg-amber-100'
                                  }`}
                                >
                                  {gr}
                                </button>
                              ))}
                            </div>
                          )}

                          {group.hasModalityConflict && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-amber-950">
                                modality çakışması (seçin):
                              </span>
                              {group.distinctModalities.map(md => (
                                <button
                                  key={md}
                                  type="button"
                                  onClick={() =>
                                    setMigrationResolutions(prev => ({
                                      ...prev,
                                      modalityByTargetId: {
                                        ...(prev.modalityByTargetId || {}),
                                        [group.targetId]: md,
                                      },
                                    }))
                                  }
                                  className={`rounded-lg border px-2 py-1 cursor-pointer ${
                                    migrationResolutions.modalityByTargetId?.[group.targetId] === md
                                      ? 'border-stone-900 bg-stone-900 text-white'
                                      : 'border-amber-300 bg-white text-stone-800 hover:bg-amber-100'
                                  }`}
                                >
                                  {md}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step C Action Button */}
            {onExecuteStudentMigration && !migrationDryRunReport.isAlreadyClean && (
              <div className="pt-2 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-stone-600">
                  birleştirme başlatıldığında önce otomatik tam JSON yedeği indirilir, ardından Firestore <code>writeBatch</code> ile tüm tekrarlar tekil <code>stu-&lt;slug&gt;</code> kimliğinde birleştirilir ve <code>audit_log</code>'a kaydedilir.
                </p>
                <button
                  type="button"
                  data-testid="execute-migration-btn"
                  disabled={isApplyingMigration}
                  onClick={async () => {
                    setIsApplyingMigration(true);
                    try {
                      const summary = await onExecuteStudentMigration(migrationResolutions);
                      showTemporaryNotice(summary);
                    } finally {
                      setIsApplyingMigration(false);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-medium text-stone-100 hover:bg-stone-800 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>
                    {isApplyingMigration
                      ? 'birleştiriliyor...'
                      : 'adım c: yedekle ve birleştirmeyi uygula (writeBatch)'}
                  </span>
                </button>
              </div>
            )}

            {/* Near-Duplicate / Similar Names Report ("Benzer İsimler" — Never Auto-Merged) */}
            <div
              data-testid="near-duplicate-pairs-section"
              className="pt-4 border-t border-stone-200 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-600">
                  benzer isimler · olası tekrar uyarıları (otomatik birleştirilmez: {migrationDryRunReport.nearDuplicatePairs.length})
                </h3>
                {migrationDryRunReport.nearDuplicatePairs.length > 0 &&
                  onMarkNotDuplicatePairs && (
                    <button
                      type="button"
                      data-testid="bulk-ignore-near-duplicates-btn"
                      onClick={async () => {
                        const pairsToIgnore =
                          migrationDryRunReport.nearDuplicatePairs.map(p => ({
                            studentId1: p.studentA.id,
                            studentId2: p.studentB.id,
                            note: `${p.studentA.name} — ${p.studentB.name}`,
                          }));
                        await onMarkNotDuplicatePairs(pairsToIgnore);
                        showTemporaryNotice(
                          `${pairsToIgnore.length} benzer isim çifti "farklı kişiler" olarak işaretlendi ve rapordan çıkarıldı.`,
                          true
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-1.5 text-[11px] font-medium text-stone-800 hover:border-stone-600 hover:bg-white transition-colors cursor-pointer"
                    >
                      <span>Tüm benzer çiftleri farklı kişiler olarak yoksay</span>
                    </button>
                  )}
              </div>

              {migrationDryRunReport.nearDuplicatePairs.length === 0 ? (
                <p className="text-xs text-stone-500">
                  bekleyen benzer isimli öğrenci çifti bulunmadı.
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {migrationDryRunReport.nearDuplicatePairs.map(pair => (
                    <div
                      key={pair.pairKey}
                      data-testid={`near-duplicate-pair-${pair.notDuplicatePairId}`}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3 text-xs"
                    >
                      <div>
                        <div className="font-medium text-stone-900">
                          <strong>{pair.studentA.name}</strong> ({pair.studentA.grade} · [{pair.studentA.enrolledCourseIds.join(', ')}])
                          {' — '}
                          <strong>{pair.studentB.name}</strong> ({pair.studentB.grade} · [{pair.studentB.enrolledCourseIds.join(', ')}])
                        </div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          tespit nedeni: {pair.reason} · çift id: <code className="font-mono-num">{pair.notDuplicatePairId}</code>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          data-testid={`merge-pair-btn-${pair.notDuplicatePairId}`}
                          onClick={async () => {
                            if (onReconcileNotDuplicatesOnMerge) {
                              await onReconcileNotDuplicatesOnMerge(
                                pair.studentB.id,
                                pair.studentA.id
                              );
                            }
                            setMigrationResolutions(prev => ({
                              ...prev,
                              confirmedTypoMerges: [
                                ...(prev.confirmedTypoMerges || []),
                                {
                                  fromStudentId: pair.studentB.id,
                                  intoStudentId: pair.studentA.id,
                                },
                              ],
                            }));
                            showTemporaryNotice(
                              `"${pair.studentB.name}" → "${pair.studentA.name}" birleştirme listesine eklendi (Adım C ile uygulayabilirsin).`
                            );
                          }}
                          className="rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-medium text-stone-100 hover:bg-stone-800 cursor-pointer"
                        >
                          Aynı kişi, birleştir
                        </button>
                        <button
                          type="button"
                          data-testid={`ignore-pair-btn-${pair.notDuplicatePairId}`}
                          onClick={async () => {
                            if (onMarkNotDuplicatePairs) {
                              await onMarkNotDuplicatePairs([
                                {
                                  studentId1: pair.studentA.id,
                                  studentId2: pair.studentB.id,
                                  note: `${pair.studentA.name} — ${pair.studentB.name}`,
                                },
                              ]);
                              showTemporaryNotice(
                                `"${pair.studentA.name} — ${pair.studentB.name}" çifti farklı kişiler olarak işaretlendi.`,
                                true
                              );
                            }
                          }}
                          className="rounded-lg border border-stone-300 bg-[#faf8f4] px-2.5 py-1.5 text-[11px] font-medium text-stone-800 hover:bg-stone-200/70 cursor-pointer"
                        >
                          Farklı kişiler, bir daha sorma
                        </button>
                        <button
                          type="button"
                          data-testid={`cancel-pair-btn-${pair.notDuplicatePairId}`}
                          onClick={() =>
                            setMigrationResolutions(prev => ({
                              ...prev,
                              confirmedTypoMerges: (
                                prev.confirmedTypoMerges || []
                              ).filter(
                                m =>
                                  !(
                                    (m.fromStudentId === pair.studentA.id &&
                                      m.intoStudentId === pair.studentB.id) ||
                                    (m.fromStudentId === pair.studentB.id &&
                                      m.intoStudentId === pair.studentA.id)
                                  )
                              ),
                            }))
                          }
                          className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] text-stone-600 hover:text-stone-900 cursor-pointer"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Requirement 4: Admin Management Screen — "Farklı kişi olarak işaretlenen çiftler" */}
            <div
              data-testid="not-duplicates-management-list"
              className="pt-4 border-t border-stone-200 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-600">
                    Farklı kişi olarak işaretlenen çiftler ({notDuplicatePairs.length})
                  </h3>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    bu listedeki öğrenci çiftleri için öğrenci eklerken, liste dışı eşleştirirken veya raporda benzerlik uyarısı gösterilmez.
                  </p>
                </div>
              </div>

              {notDuplicatePairs.length === 0 ? (
                <p className="text-xs text-stone-500">
                  henüz farklı kişi olarak işaretlenmiş bir öğrenci çifti bulunmuyor.
                </p>
              ) : (
                <div className="divide-y divide-stone-200/80 rounded-xl border border-stone-200 bg-[#faf8f4]/70">
                  {notDuplicatePairs.map(pair => {
                    const noteParts = pair.note
                      ? pair.note.split(' — ').map(s => s.trim())
                      : [];
                    const nameA = resolveStudentDisplayNameById(
                      pair.studentIdA,
                      noteParts[0]
                    );
                    const nameB = resolveStudentDisplayNameById(
                      pair.studentIdB,
                      noteParts[1]
                    );
                    return (
                      <div
                        key={pair.id}
                        data-testid={`not-duplicate-row-${pair.id}`}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 text-xs"
                      >
                        <div>
                          <span className="font-medium text-stone-900">
                            {nameA} — {nameB}
                          </span>
                          <span className="ml-2 font-mono-num text-[11px] text-stone-500">
                            ({pair.id})
                          </span>
                        </div>
                        {onRemoveNotDuplicatePair && (
                          <button
                            type="button"
                            data-testid={`remove-not-duplicate-btn-${pair.id}`}
                            onClick={async () => {
                              await onRemoveNotDuplicatePair(pair.id);
                              showTemporaryNotice(
                                `"${nameA} — ${nameB}" için yoksayma kaldırıldı; benzerlik uyarıları yeniden aktif.`
                              );
                            }}
                            className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:border-rose-600 hover:text-rose-800 transition-colors cursor-pointer shrink-0"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>yoksaymayı kaldır</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Static PDF Discrepancy Notes */}
          <div className="rounded-2xl border border-stone-300/90 bg-white/90 p-6">
            <div className="flex items-start gap-3 border-b border-stone-200 pb-4 mb-4">
              <AlertCircle className="h-5 w-5 text-stone-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-serif-art text-2xl text-stone-900">
                  pdf listeleri doğrulama ve birleştirme raporu
                </h2>
                <p className="text-xs text-stone-500 mt-1">
                  çevrim içi sınıf listesi, 2026 yüz yüze yoklama listesi ve ana öğrenci listesi karşılaştırılarak uygulanan birleştirmeler:
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {DATA_DISCREPANCIES.map((item, idx) => (
                <div key={idx} className="border-b border-stone-200/60 pb-3 last:border-none">
                  <div className="text-xs font-semibold text-stone-800">
                    {idx + 1}. {item.category}
                  </div>
                  <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
