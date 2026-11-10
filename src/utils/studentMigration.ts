import {
  AttendanceRecord,
  BASE_DB,
  buildStudentIdFromName,
  Course,
  InstructorAssignmentRecord,
  isPlaceholderStudentName,
  Modality,
  normalizeName,
  normalizeTurkish,
  RemovedStudentRecord,
  slugifyTurkish,
  Student,
  UnlistedStudentReport,
} from '../data/database';
import { levenshteinDistance } from './enigmaLogic';

export interface MigrationSourceRecord {
  source: 'base' | 'custom_students';
  id: string;
  docId: string;
  name: string;
  normalizedName: string;
  targetId: string;
  grade: string;
  modality: Modality;
  enrolledCourseIds: string[];
  addedAtWeek: number;
  addedAt: string;
  deletedAt?: string | null;
}

export interface MigrationAttendanceRedirect {
  docId: string;
  courseId: string;
  weekNumber: number;
  sessionType: string;
  beforeAbsentIds: string[];
  afterAbsentIds: string[];
  replacedPairs: { fromId: string; toId: string }[];
}

export interface MigrationAttendanceConflict {
  conflictKey: string;
  attendanceDocId: string;
  courseId: string;
  weekNumber: number;
  sessionType: string;
  studentName: string;
  targetId: string;
  absentIdsFound: string[];
  presentIdsFound: string[];
}

export interface MigrationUnlistedRedirect {
  docId: string;
  studentName: string;
  normalizedName: string;
  courseId: string;
  weekNumber: number;
  sessionType: string;
  beforeResolvedId?: string;
  afterResolvedId: string;
}

export interface MigrationGroupPlan {
  normalizedName: string;
  distinctNames: string[];
  hasNameConflict: boolean;
  targetId: string;
  primarySource: 'base' | 'custom_students';
  primaryOriginalId: string;
  records: MigrationSourceRecord[];
  activeRecords: MigrationSourceRecord[];
  mergedCourseIds: string[];
  minAddedAtWeek: number;
  earliestAddedAt: string;
  defaultGrade: string;
  distinctGrades: string[];
  hasGradeConflict: boolean;
  defaultModality: Modality;
  distinctModalities: Modality[];
  hasModalityConflict: boolean;
  needsCustomUpsert: boolean;
  duplicateCustomDocIdsToSoftDelete: string[];
  duplicateRemovedDocIdsToSoftDelete: string[];
  referencedInAttendanceDocIds: string[];
  referencedInUnlistedDocIds: string[];
}

export interface NearDuplicatePair {
  pairKey: string;
  studentA: Student;
  studentB: Student;
  reason: string;
  distance: number;
  sameSlug: boolean;
}

export interface MigrationDryRunReport {
  generatedAtIso: string;
  groupsToMigrate: MigrationGroupPlan[];
  attendanceRedirects: MigrationAttendanceRedirect[];
  unlistedRedirects: MigrationUnlistedRedirect[];
  attendanceConflicts: MigrationAttendanceConflict[];
  nearDuplicatePairs: NearDuplicatePair[];
  skippedPlaceholders: string[];
  totalCustomDocsToUpsert: number;
  totalCustomDocsToSoftDelete: number;
  totalAttendanceDocsToUpdate: number;
  totalUnlistedDocsToUpdate: number;
  unresolvedConflictCount: number;
  isAlreadyClean: boolean;
}

export interface MigrationUserResolutions {
  nameByTargetId?: Record<string, string>;
  gradeByTargetId?: Record<string, string>;
  modalityByTargetId?: Record<string, Modality>;
  attendanceConflictByKey?: Record<string, 'absent' | 'present'>;
  confirmedTypoMerges?: { fromStudentId: string; intoStudentId: string }[];
}

export interface MigrationInputCollections {
  baseStudents?: Student[];
  customStudents: Student[];
  removedStudents?: RemovedStudentRecord[];
  unlistedReports: UnlistedStudentReport[];
  attendanceRecords: AttendanceRecord[];
  instructorAssignments?: InstructorAssignmentRecord[];
  courses?: Course[];
}

export interface MigrationBackupPayload {
  version: 1;
  exportedAtIso: string;
  counts: {
    baseStudents: number;
    customStudents: number;
    removedStudents: number;
    unlistedReports: number;
    attendanceRecords: number;
    instructorAssignments: number;
  };
  data: {
    baseStudents: Student[];
    customStudents: Student[];
    removedStudents: RemovedStudentRecord[];
    unlistedReports: UnlistedStudentReport[];
    attendanceRecords: AttendanceRecord[];
    instructorAssignments: InstructorAssignmentRecord[];
  };
}

function countTurkishDiacritics(str: string): number {
  return (str.match(/[çğıöşü]/g) || []).length;
}

/**
 * Adım B: Birleştirmeden önce ilgili tüm koleksiyonların tam JSON yedeğini üretir.
 */
export function createMigrationBackupPayload(
  input: MigrationInputCollections,
  nowIso = new Date().toISOString()
): MigrationBackupPayload {
  const baseStudents = input.baseStudents || BASE_DB.students;
  const removedStudents = input.removedStudents || [];
  const instructorAssignments = input.instructorAssignments || [];

  return {
    version: 1,
    exportedAtIso: nowIso,
    counts: {
      baseStudents: baseStudents.length,
      customStudents: input.customStudents.length,
      removedStudents: removedStudents.length,
      unlistedReports: input.unlistedReports.length,
      attendanceRecords: input.attendanceRecords.length,
      instructorAssignments: instructorAssignments.length,
    },
    data: {
      baseStudents: [...baseStudents],
      customStudents: [...input.customStudents],
      removedStudents: [...removedStudents],
      unlistedReports: [...input.unlistedReports],
      attendanceRecords: [...input.attendanceRecords],
      instructorAssignments: [...instructorAssignments],
    },
  };
}

/**
 * Adım A, KURU ÇALIŞTIRMA:
 * Hiçbir şey yazmadan rapor üretir. Normalize edilmiş isme (ve stu-<slug> hedef kimliğine) göre
 * gruplanmış tüm tekrarları, her grubun hangi kimliklerle ve hangi derslerle bulunduğunu,
 * sınıf/modality/isim/yoklama çelişkilerini ve yazım benzerliği olan ("olası tekrarlar") aday çiftleri listeler.
 */
export function buildMigrationDryRunReport(
  input: MigrationInputCollections,
  resolutions: MigrationUserResolutions = {},
  nowIso = new Date().toISOString()
): MigrationDryRunReport {
  const baseStudents = input.baseStudents || BASE_DB.students;
  const removedStudents = input.removedStudents || [];
  const skippedPlaceholders: string[] = [];

  // Map confirmed typo merges if user explicitly selected any
  const explicitTypoTargetNameMap = new Map<string, string>();
  const allKnownStudentsForTypoLookup = [...baseStudents, ...input.customStudents];
  for (const merge of resolutions.confirmedTypoMerges || []) {
    const fromStu = allKnownStudentsForTypoLookup.find(s => s.id === merge.fromStudentId);
    const intoStu = allKnownStudentsForTypoLookup.find(s => s.id === merge.intoStudentId);
    if (fromStu && intoStu) {
      explicitTypoTargetNameMap.set(normalizeName(fromStu.name), normalizeName(intoStu.name));
    }
  }

  const byTargetId = new Map<string, MigrationSourceRecord[]>();
  const oldIdToTargetId = new Map<string, string>();
  const oldIdToCourses = new Map<string, string[]>();
  const targetIdToName = new Map<string, string>();

  // 1. Collect built-in students
  for (const s of baseStudents) {
    if (isPlaceholderStudentName(s.name)) {
      skippedPlaceholders.push(`base:${s.id} (${s.name})`);
      continue;
    }
    const rawNorm = normalizeName(s.name);
    const norm = explicitTypoTargetNameMap.get(rawNorm) || rawNorm;
    const targetId = buildStudentIdFromName(norm);
    targetIdToName.set(targetId, norm);

    const rec: MigrationSourceRecord = {
      source: 'base',
      id: s.id,
      docId: s.id,
      name: s.name,
      normalizedName: norm,
      targetId,
      grade: normalizeTurkish(s.grade),
      modality: s.modality,
      enrolledCourseIds: [...s.enrolledCourseIds],
      addedAtWeek: s.addedAtWeek ?? 1,
      addedAt: s.addedAt || '2026-10-19T00:00:00.000Z',
      deletedAt: null,
    };
    const list = byTargetId.get(targetId) || [];
    list.push(rec);
    byTargetId.set(targetId, list);
    oldIdToTargetId.set(s.id, targetId);
    oldIdToCourses.set(s.id, [...s.enrolledCourseIds]);
  }

  // 2. Collect custom_students
  for (const c of input.customStudents) {
    if (isPlaceholderStudentName(c.name)) {
      if (!c.deletedAt) {
        skippedPlaceholders.push(`custom_students:${c.id} (${c.name})`);
      }
      continue;
    }
    const rawNorm = normalizeName(c.name);
    const norm = explicitTypoTargetNameMap.get(rawNorm) || rawNorm;
    const targetId = buildStudentIdFromName(norm);
    if (!targetIdToName.has(targetId)) {
      targetIdToName.set(targetId, norm);
    }

    const rec: MigrationSourceRecord = {
      source: 'custom_students',
      id: c.id,
      docId: c.id,
      name: c.name,
      normalizedName: norm,
      targetId,
      grade: normalizeTurkish(c.grade),
      modality: c.modality,
      enrolledCourseIds: Array.isArray(c.enrolledCourseIds) ? [...c.enrolledCourseIds] : [],
      addedAtWeek: c.addedAtWeek ?? 1,
      addedAt: c.addedAt || '2026-10-19T00:00:00.000Z',
      deletedAt: c.deletedAt || null,
    };
    const list = byTargetId.get(targetId) || [];
    list.push(rec);
    byTargetId.set(targetId, list);
    if (c.id) {
      oldIdToTargetId.set(c.id, targetId);
      oldIdToCourses.set(c.id, [...rec.enrolledCourseIds]);
    }
  }

  // 3. Also map unlisted_students resolvedStudentId -> stu-<slug>
  const unlistedRedirects: MigrationUnlistedRedirect[] = [];
  for (const u of input.unlistedReports) {
    if (u.deletedAt) continue;
    if (isPlaceholderStudentName(u.studentName)) {
      skippedPlaceholders.push(`unlisted_students:${u.id} (${u.studentName})`);
      continue;
    }
    const rawNorm = normalizeName(u.studentName);
    const norm = explicitTypoTargetNameMap.get(rawNorm) || rawNorm;
    const targetStuId = buildStudentIdFromName(norm);
    const expectedTargetId =
      u.status === 'temporary' && !byTargetId.has(targetStuId)
        ? `temp-${slugifyTurkish(norm)}`
        : targetStuId;

    if (u.resolvedStudentId && u.resolvedStudentId.startsWith('stu')) {
      oldIdToTargetId.set(u.resolvedStudentId, targetStuId);
    }

    const canonicalDisplayName = targetIdToName.get(targetStuId) || norm;
    const needsUpdate =
      (u.resolvedStudentId && u.resolvedStudentId !== expectedTargetId) ||
      normalizeName(u.studentName) !== u.studentName;

    if (needsUpdate && (u.resolvedStudentId || u.status !== 'pending')) {
      unlistedRedirects.push({
        docId: u.id,
        studentName: u.studentName,
        normalizedName: canonicalDisplayName,
        courseId: u.courseId,
        weekNumber: u.weekNumber,
        sessionType: u.sessionType,
        beforeResolvedId: u.resolvedStudentId,
        afterResolvedId: expectedTargetId,
      });
    }
  }

  // 4. Analyze attendance records for ID redirects and conflicts
  const attendanceRedirects: MigrationAttendanceRedirect[] = [];
  const attendanceConflicts: MigrationAttendanceConflict[] = [];

  // Map targetId -> set of all legacy/current IDs for that student
  const targetIdToAllIds = new Map<string, Set<string>>();
  for (const [oldId, tId] of oldIdToTargetId.entries()) {
    if (!targetIdToAllIds.has(tId)) {
      targetIdToAllIds.set(tId, new Set());
    }
    targetIdToAllIds.get(tId)!.add(oldId);
  }

  for (const att of input.attendanceRecords) {
    if (att.deletedAt) continue;
    const docId = att.id || `${att.courseId}_w${att.weekNumber}_${slugifyTurkish(att.sessionType)}`;
    const beforeAbsent = Array.isArray(att.absentStudentIds) ? att.absentStudentIds : [];
    const absentSet = new Set(beforeAbsent);

    // Check if any multi-ID student has conflicting attendance in this session
    if (!att.didNotHoldClass) {
      for (const [targetId, idSet] of targetIdToAllIds.entries()) {
        if (idSet.size <= 1) continue;
        const enrolledIdsInThisCourse = Array.from(idSet).filter(id =>
          (oldIdToCourses.get(id) || []).includes(att.courseId)
        );
        if (enrolledIdsInThisCourse.length <= 1) continue;

        const absentIdsFound = enrolledIdsInThisCourse.filter(id => absentSet.has(id));
        const presentIdsFound = enrolledIdsInThisCourse.filter(id => !absentSet.has(id));

        if (absentIdsFound.length > 0 && presentIdsFound.length > 0) {
          const conflictKey = `${docId}__${targetId}`;
          attendanceConflicts.push({
            conflictKey,
            attendanceDocId: docId,
            courseId: att.courseId,
            weekNumber: att.weekNumber,
            sessionType: att.sessionType,
            studentName: targetIdToName.get(targetId) || targetId,
            targetId,
            absentIdsFound,
            presentIdsFound,
          });
        }
      }
    }

    const replacedPairs: { fromId: string; toId: string }[] = [];
    const mappedAbsent: string[] = [];

    for (const rawId of beforeAbsent) {
      const mapped = oldIdToTargetId.get(rawId) || rawId;
      if (mapped !== rawId) {
        replacedPairs.push({ fromId: rawId, toId: mapped });
      }
      const conflictKey = `${docId}__${mapped}`;
      const conflictChoice = resolutions.attendanceConflictByKey?.[conflictKey];
      if (conflictChoice === 'present') {
        continue; // User resolved conflict as present ("geldi")
      }
      if (!mappedAbsent.includes(mapped)) {
        mappedAbsent.push(mapped);
      }
    }

    const hadDuplicateSameId = beforeAbsent.length !== new Set(beforeAbsent).size;
    const changed =
      replacedPairs.length > 0 ||
      hadDuplicateSameId ||
      mappedAbsent.length !== beforeAbsent.length ||
      mappedAbsent.some((id, idx) => id !== beforeAbsent[idx]);

    if (changed) {
      attendanceRedirects.push({
        docId,
        courseId: att.courseId,
        weekNumber: att.weekNumber,
        sessionType: att.sessionType,
        beforeAbsentIds: beforeAbsent,
        afterAbsentIds: mappedAbsent,
        replacedPairs,
      });
    }
  }

  // 5. Build MigrationGroupPlans for any group with >1 record or non-canonical ID
  const groupsToMigrate: MigrationGroupPlan[] = [];

  for (const [targetId, records] of byTargetId.entries()) {
    const activeRecords = records.filter(r => !r.deletedAt);
    if (activeRecords.length === 0) continue;

    const customActive = activeRecords.filter(r => r.source === 'custom_students');
    const baseRecord = activeRecords.find(r => r.source === 'base');

    const distinctNames = Array.from(
      new Set(activeRecords.map(r => r.normalizedName).filter(Boolean))
    );
    const hasNameConflict = distinctNames.length > 1;

    // Pick best default normalized name (base if available, else the spelling with rich Turkish diacritics)
    const bestDefaultName =
      resolutions.nameByTargetId?.[targetId] ||
      (baseRecord
        ? baseRecord.normalizedName
        : [...distinctNames].sort(
            (a, b) => countTurkishDiacritics(b) - countTurkishDiacritics(a)
          )[0]);

    const hasNonCanonicalCustomDoc = customActive.some(
      r => r.id !== targetId || r.docId !== targetId || r.name !== bestDefaultName
    );
    const hasMultipleCustomDocs = customActive.length > 1;

    if (!hasNonCanonicalCustomDoc && !hasMultipleCustomDocs && !hasNameConflict) {
      continue;
    }

    // Adım C: Select primary ("asıl") record: built-in base list if present; otherwise oldest addedAt / addedAtWeek
    const sortedByAge = [...activeRecords].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'base' ? -1 : 1;
      if (a.addedAtWeek !== b.addedAtWeek) return a.addedAtWeek - b.addedAtWeek;
      return a.addedAt.localeCompare(b.addedAt);
    });
    const primary = baseRecord || sortedByAge[0];

    // Merged courses (union of all active records, deduplicated)
    const mergedCoursesSet = new Set<string>();
    for (const r of activeRecords) {
      for (const cid of r.enrolledCourseIds) {
        mergedCoursesSet.add(cid);
      }
    }
    const mergedCourseIds = Array.from(mergedCoursesSet);

    const minAddedAtWeek = Math.min(...activeRecords.map(r => r.addedAtWeek || 1));
    const earliestAddedAt =
      activeRecords
        .map(r => r.addedAt)
        .filter(Boolean)
        .sort()[0] || nowIso;

    const distinctGrades = Array.from(
      new Set(activeRecords.map(r => normalizeTurkish(r.grade)).filter(Boolean))
    );
    const distinctModalities = Array.from(
      new Set(activeRecords.map(r => r.modality).filter(Boolean))
    );

    const hasGradeConflict = distinctGrades.length > 1;
    const hasModalityConflict = distinctModalities.length > 1;

    const duplicateCustomDocIdsToSoftDelete = customActive
      .filter(r => r.docId !== targetId)
      .map(r => r.docId);

    const duplicateRemovedDocIdsToSoftDelete = removedStudents
      .filter(
        rm =>
          !rm.deletedAt &&
          (distinctNames.includes(normalizeName(rm.name)) ||
            oldIdToTargetId.get(rm.studentId) === targetId) &&
          rm.studentId !== targetId
      )
      .map(rm => rm.studentId);

    const referencedInAttendanceDocIds = attendanceRedirects
      .filter(ar => ar.replacedPairs.some(p => p.toId === targetId))
      .map(ar => ar.docId);

    const referencedInUnlistedDocIds = unlistedRedirects
      .filter(ur => ur.afterResolvedId === targetId)
      .map(ur => ur.docId);

    const baseCoursesStr = baseRecord ? [...baseRecord.enrolledCourseIds].sort().join(',') : '';
    const mergedCoursesStr = [...mergedCourseIds].sort().join(',');
    const directCanonicalCustom = customActive.find(r => r.docId === targetId);
    const needsCustomUpsert =
      !baseRecord ||
      baseCoursesStr !== mergedCoursesStr ||
      Boolean(directCanonicalCustom) ||
      hasGradeConflict ||
      hasModalityConflict ||
      hasNameConflict;

    groupsToMigrate.push({
      normalizedName: bestDefaultName,
      distinctNames,
      hasNameConflict,
      targetId,
      primarySource: primary.source,
      primaryOriginalId: primary.id,
      records,
      activeRecords,
      mergedCourseIds,
      minAddedAtWeek,
      earliestAddedAt,
      defaultGrade: resolutions.gradeByTargetId?.[targetId] || primary.grade,
      distinctGrades,
      hasGradeConflict,
      defaultModality: resolutions.modalityByTargetId?.[targetId] || primary.modality,
      distinctModalities,
      hasModalityConflict,
      needsCustomUpsert,
      duplicateCustomDocIdsToSoftDelete,
      duplicateRemovedDocIdsToSoftDelete,
      referencedInAttendanceDocIds,
      referencedInUnlistedDocIds,
    });
  }

  // 6. Compute Near-Duplicate / Typo Pairs ("Olası Tekrarlar") across all active students
  const byExactNorm = new Map<string, MigrationSourceRecord[]>();
  for (const records of byTargetId.values()) {
    for (const r of records) {
      if (r.deletedAt) continue;
      const list = byExactNorm.get(r.normalizedName) || [];
      list.push(r);
      byExactNorm.set(r.normalizedName, list);
    }
  }

  const unifiedActiveStudents: Student[] = [];
  for (const [normName, active] of byExactNorm.entries()) {
    if (active.length === 0) continue;
    const targetId = buildStudentIdFromName(normName);
    const allCourses = Array.from(new Set(active.flatMap(r => r.enrolledCourseIds)));
    unifiedActiveStudents.push({
      id: targetId,
      name: normName,
      grade: active[0].grade,
      modality: active[0].modality,
      enrolledCourseIds: allCourses,
      addedAtWeek: Math.min(...active.map(r => r.addedAtWeek || 1)),
      addedAt: active[0].addedAt,
    });
  }

  const nearDuplicatePairs: NearDuplicatePair[] = [];
  for (let i = 0; i < unifiedActiveStudents.length; i++) {
    for (let j = i + 1; j < unifiedActiveStudents.length; j++) {
      const a = unifiedActiveStudents[i];
      const b = unifiedActiveStudents[j];
      const normA = normalizeName(a.name);
      const normB = normalizeName(b.name);
      if (normA === normB) continue;

      const slugA = slugifyTurkish(normA);
      const slugB = slugifyTurkish(normB);

      if (slugA === slugB) {
        nearDuplicatePairs.push({
          pairKey: `${normA}__${normB}`,
          studentA: a,
          studentB: b,
          reason: 'Aynı slug / Türkçe harf farkı (ş/s, ı/i, ö/o, ü/u, ç/c, ğ/g)',
          distance: 0.5,
          sameSlug: true,
        });
        continue;
      }

      const distNorm = levenshteinDistance(normA, normB);
      const distSlug = levenshteinDistance(slugA, slugB);
      const minDist = Math.min(distNorm, distSlug);
      if (minDist <= 2 && Math.max(normA.length, normB.length) >= 6) {
        nearDuplicatePairs.push({
          pairKey: `${normA}__${normB}`,
          studentA: a,
          studentB: b,
          reason: minDist === 1 ? '1 harf yazım farkı' : '2 harf yazım farkı',
          distance: minDist,
          sameSlug: false,
        });
        continue;
      }

      const tokensA = normA.split(' ').filter(Boolean);
      const tokensB = normB.split(' ').filter(Boolean);
      if (tokensA.length >= 2 && tokensB.length >= 2 && tokensA.length !== tokensB.length) {
        const smaller = tokensA.length < tokensB.length ? tokensA : tokensB;
        const larger = tokensA.length < tokensB.length ? tokensB : tokensA;
        if (smaller.every(t => larger.includes(t))) {
          nearDuplicatePairs.push({
            pairKey: `${normA}__${normB}`,
            studentA: a,
            studentB: b,
            reason: 'Eksik/fazla ikinci ad veya soyad örtüşmesi',
            distance: 1.5,
            sameSlug: false,
          });
        }
      }
    }
  }

  nearDuplicatePairs.sort((a, b) => a.distance - b.distance);

  // Count unresolved conflicts
  let unresolvedConflictCount = 0;
  for (const g of groupsToMigrate) {
    if (g.hasGradeConflict && !resolutions.gradeByTargetId?.[g.targetId]) {
      unresolvedConflictCount++;
    }
    if (g.hasModalityConflict && !resolutions.modalityByTargetId?.[g.targetId]) {
      unresolvedConflictCount++;
    }
    if (g.hasNameConflict && !resolutions.nameByTargetId?.[g.targetId]) {
      unresolvedConflictCount++;
    }
  }
  for (const ac of attendanceConflicts) {
    if (!resolutions.attendanceConflictByKey?.[ac.conflictKey]) {
      unresolvedConflictCount++;
    }
  }

  const totalCustomDocsToUpsert = groupsToMigrate.filter(g => g.needsCustomUpsert).length;
  const totalCustomDocsToSoftDelete = groupsToMigrate.reduce(
    (sum, g) => sum + g.duplicateCustomDocIdsToSoftDelete.length,
    0
  );
  const totalAttendanceDocsToUpdate = attendanceRedirects.length;
  const totalUnlistedDocsToUpdate = unlistedRedirects.length;

  const isAlreadyClean =
    groupsToMigrate.length === 0 &&
    totalAttendanceDocsToUpdate === 0 &&
    totalUnlistedDocsToUpdate === 0;

  return {
    generatedAtIso: nowIso,
    groupsToMigrate,
    attendanceRedirects,
    unlistedRedirects,
    attendanceConflicts,
    nearDuplicatePairs,
    skippedPlaceholders,
    totalCustomDocsToUpsert,
    totalCustomDocsToSoftDelete,
    totalAttendanceDocsToUpdate,
    totalUnlistedDocsToUpdate,
    unresolvedConflictCount,
    isAlreadyClean,
  };
}

/**
 * Bellekte (veya birim testlerinde) migrasyon planını idempotent olarak uygular.
 * İki kez çalıştırıldığında ikinci çalıştırma hiçbir şeyi bozmaz ve 0 değişiklik üretir.
 */
export function applyMigrationPlanInMemory(
  input: MigrationInputCollections,
  resolutions: MigrationUserResolutions = {},
  nowIso = new Date().toISOString()
): {
  customStudents: Student[];
  removedStudents: RemovedStudentRecord[];
  unlistedReports: UnlistedStudentReport[];
  attendanceRecords: AttendanceRecord[];
  report: MigrationDryRunReport;
} {
  const report = buildMigrationDryRunReport(input, resolutions, nowIso);
  if (report.isAlreadyClean) {
    return {
      customStudents: [...input.customStudents],
      removedStudents: [...(input.removedStudents || [])],
      unlistedReports: [...input.unlistedReports],
      attendanceRecords: [...input.attendanceRecords],
      report,
    };
  }

  const nextCustomMap = new Map<string, Student>();
  for (const c of input.customStudents) {
    nextCustomMap.set(c.id, { ...c });
  }

  for (const group of report.groupsToMigrate) {
    const resolvedName =
      resolutions.nameByTargetId?.[group.targetId] || group.normalizedName;
    const resolvedGrade =
      resolutions.gradeByTargetId?.[group.targetId] || group.defaultGrade;
    const resolvedModality =
      resolutions.modalityByTargetId?.[group.targetId] || group.defaultModality;

    if (group.needsCustomUpsert) {
      nextCustomMap.set(group.targetId, {
        id: group.targetId,
        name: resolvedName,
        grade: resolvedGrade,
        modality: resolvedModality,
        enrolledCourseIds: [...group.mergedCourseIds],
        addedAtWeek: group.minAddedAtWeek,
        addedAt: group.earliestAddedAt,
        deletedAt: null,
      });
    }

    for (const dupId of group.duplicateCustomDocIdsToSoftDelete) {
      const oldRec = nextCustomMap.get(dupId);
      if (oldRec && !oldRec.deletedAt) {
        nextCustomMap.set(dupId, {
          ...oldRec,
          deletedAt: nowIso,
        });
      }
    }
  }

  const softDeleteRemovedSet = new Set(
    report.groupsToMigrate.flatMap(g => g.duplicateRemovedDocIdsToSoftDelete)
  );
  const nextRemovedStudents = (input.removedStudents || []).map(rm =>
    softDeleteRemovedSet.has(rm.studentId) && !rm.deletedAt
      ? { ...rm, deletedAt: nowIso }
      : { ...rm }
  );

  const unlistedRedirectMap = new Map(
    report.unlistedRedirects.map(u => [u.docId, u])
  );
  const nextUnlistedReports = input.unlistedReports.map(u => {
    const redir = unlistedRedirectMap.get(u.id);
    if (!redir) return { ...u };
    return {
      ...u,
      studentName: redir.normalizedName,
      resolvedStudentId: redir.afterResolvedId,
    };
  });

  const attRedirectMap = new Map(
    report.attendanceRedirects.map(a => [a.docId, a])
  );
  const nextAttendanceRecords = input.attendanceRecords.map(att => {
    const docId =
      att.id || `${att.courseId}_w${att.weekNumber}_${slugifyTurkish(att.sessionType)}`;
    const redir = attRedirectMap.get(docId);
    if (!redir) return { ...att };
    return {
      ...att,
      id: docId,
      absentStudentIds: [...redir.afterAbsentIds],
    };
  });

  return {
    customStudents: Array.from(nextCustomMap.values()),
    removedStudents: nextRemovedStudents,
    unlistedReports: nextUnlistedReports,
    attendanceRecords: nextAttendanceRecords,
    report,
  };
}
