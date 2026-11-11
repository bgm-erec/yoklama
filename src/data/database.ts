export type Modality = 'online' | 'yuzyuze';

export type SessionType = '1. ders' | '2. ders' | 'ek dersler' | 'ders yapmadım';

export interface Student {
  id: string;
  name: string;
  grade: string;
  modality: Modality;
  enrolledCourseIds: string[];
  notes?: string;
  addedAtWeek?: number;
  addedAt?: string;
  deletedAt?: string | null;
}

export interface RemovedStudentRecord {
  studentId: string;
  name: string;
  removedAt: string;
  deletedAt?: string | null;
}

export interface InstructorAssignmentRecord {
  courseId: string;
  instructorName: string;
  updatedAt: string;
  modality?: Modality;
  gradeClass?: string;
  subject?: string;
}

export interface Course {
  id: string;
  title: string; // e.g., "5/a matematik (çevrim içi)" or "5/a matematik (yüz yüze)"
  shortTitle: string; // e.g., "5/a matematik"
  gradeClass: string; // e.g., "5/a"
  subject: string; // e.g., "matematik"
  modality: Modality;
  instructorId: string;
  instructorName: string;
  studentIds: string[];
}

export interface Instructor {
  id: string;
  name: string; // lowercase full name or bos1..bos4
  firstName: string;
  lastName: string;
  modality: Modality;
  courseIds: string[];
  alias?: string; // e.g. bos1
}

export interface AttendanceRecord {
  id?: string;
  courseId: string;
  instructorId: string;
  weekNumber: number;
  sessionType: SessionType;
  absentStudentIds: string[];
  didNotHoldClass: boolean;
  updatedAt: string;
  version?: number;
  updatedBySessionId?: string;
  deletedAt?: string | null;
}

export interface FeedbackItem {
  id?: string;
  message: string;
  createdAt: string;
  deletedAt?: string | null;
}

export type UnlistedReportStatus = 'pending' | 'enrolled' | 'temporary';

export interface UnlistedStudentReport {
  id: string;
  studentName: string;
  courseId: string;
  instructorId: string;
  instructorName: string;
  weekNumber: number;
  sessionType: SessionType;
  status: UnlistedReportStatus;
  resolvedStudentId?: string;
  resolvedExistingStudent?: boolean;
  createdAt: string;
  resolvedAt?: string;
  deletedAt?: string | null;
}

export interface PlaceboSavePreferenceRecord {
  instructorId: string;
  instructorName: string;
  enabled: boolean;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  details: string;
  createdAt: string;
}

export interface NotDuplicatePairRecord {
  id: string; // `${studentIdA}__${studentIdB}` where studentIdA < studentIdB
  studentIdA: string;
  studentIdB: string;
  createdAt: string;
  note?: string;
}

export interface CoordinatorAssignmentRecord {
  id?: string; // docId: 'w01', 'w02', ...
  weekNumber: number;
  saturday: (string | null)[];
  sunday: (string | null)[];
  updatedAt: string;
  updatedAtIso?: string;
}

// Raw Online Courses from BGM ÇEVRİM İÇİ SINIF LİSTESİ PDF
interface RawCourseDef {
  id: string;
  gradeClass: string;
  subject: string;
  modality: Modality;
  instructorName: string;
  alias?: string;
  rawStudents: { name: string; grade: string; note?: string }[];
  initialWeek1Absents?: string[];
  initialWeek1Tracked?: boolean;
}

const RAW_COURSES: RawCourseDef[] = [
  // ================= ONLINE COURSES =================
  {
    id: 'online-3a-mat',
    gradeClass: '3/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'çağdaş şahin',
    rawStudents: [
      { name: 'Deren Lina Yavuz', grade: '3. sınıf' },
      { name: 'Melek Sima Sinemli', grade: '3. sınıf' },
      { name: 'Adını öğrenip giricem:)', grade: '3. sınıf' },
    ],
  },
  {
    id: 'online-4a-mat',
    gradeClass: '4/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'sinem dila çin',
    rawStudents: [
      { name: 'Ece Safi', grade: '4. sınıf' },
      { name: 'Esila Esinnaz Çakır', grade: '4. sınıf' },
      { name: 'Esilya Erdoğan', grade: '4. sınıf' },
      { name: 'Meryem Aslan', grade: '4. sınıf' },
      { name: 'İkranur Çapan', grade: '4. sınıf', note: 'total görme engelli' },
      { name: 'Ecrin Bedir', grade: '4. sınıf' },
    ],
  },
  {
    id: 'online-4a-tur',
    gradeClass: '4/a',
    subject: 'türkçe',
    modality: 'online',
    instructorName: 'nisa irem demirkaya',
    rawStudents: [
      { name: 'Ece Safi', grade: '4. sınıf' },
      { name: 'Esila Esinnaz Çakır', grade: '4. sınıf' },
      { name: 'Esilya Erdoğan', grade: '4. sınıf' },
      { name: 'Meryem Aslan', grade: '4. sınıf' },
      { name: 'Ecrin Bedir', grade: '4. sınıf' },
    ],
  },
  {
    id: 'online-4a-fen',
    gradeClass: '4/a',
    subject: 'fen bilimleri',
    modality: 'online',
    instructorName: 'afra özil',
    rawStudents: [
      { name: 'Esila Esinnaz Çakır', grade: '4. sınıf' },
      { name: 'Esilya Erdoğan', grade: '4. sınıf' },
    ],
  },
  {
    id: 'online-4a-ing',
    gradeClass: '4/a',
    subject: 'ingilizce',
    modality: 'online',
    instructorName: 'elif rabia tirek',
    rawStudents: [
      { name: 'Esila Esinnaz Çakır', grade: '4. sınıf' },
      { name: 'Esilya Erdoğan', grade: '4. sınıf' },
      { name: 'İkranur Çapan', grade: '4. sınıf', note: 'total görme engelli' },
      { name: 'Deren Lina Yavuz', grade: '3. sınıf', note: '3. sınıf ing dersi olmadığı için 4e katılacak' },
    ],
  },
  {
    id: 'online-5a-mat',
    gradeClass: '5/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'hüseyin emre şahin',
    rawStudents: [
      { name: 'Ecrin Safi', grade: '5. sınıf' },
      { name: 'Dijle Ada Özyaman', grade: '5. sınıf' },
      { name: 'Aynur Nisa İpek', grade: '5. sınıf' },
      { name: 'Zehra Yıldırım', grade: '5. sınıf' },
      { name: 'Zeynep Ezo Altuntaş', grade: '5. sınıf' },
      { name: 'Ahmet Furkan Aktan', grade: '5. sınıf' },
      { name: 'Büşra Bayır', grade: '5. sınıf' },
      { name: 'Elfin Erva Akkaya', grade: '5. sınıf' },
      { name: 'Ertuğrul Çapan', grade: '5. sınıf' },
      { name: 'Eymen Beken', grade: '5. sınıf' },
      { name: 'Eylül Ülkü Eruz', grade: '5. sınıf' },
      { name: 'Doğa İnan', grade: '5. sınıf' },
      { name: 'Masal Ekici', grade: '5. sınıf' },
      { name: 'Kaan Üver', grade: '5. sınıf' },
      { name: 'Nehir Elvin Açıkgöz', grade: '5. sınıf' },
      { name: 'Muhammed Talha Yanarateş', grade: '5. sınıf' },
      { name: 'Sudelâl Terzi', grade: '5. sınıf' },
      { name: 'Maidenur Çakmak', grade: '5. sınıf' },
      { name: 'Gökay Kırklar', grade: '5. sınıf' },
      { name: 'Şerife Sena Süzmeçelik', grade: '5. sınıf' },
      { name: 'Zeynep Yeniocak', grade: '5. sınıf' },
    ],
  },
  {
    id: 'online-5a-tur',
    gradeClass: '5/a',
    subject: 'türkçe',
    modality: 'online',
    instructorName: 'bos1',
    alias: 'bos1',
    rawStudents: [
      { name: 'Aynur Nisa İpek', grade: '5. sınıf' },
      { name: 'Zehra Yıldırım', grade: '5. sınıf' },
      { name: 'Zeynep Ezo Altuntaş', grade: '5. sınıf' },
      { name: 'Gökay Kırklar', grade: '5. sınıf' },
      { name: 'Eymen Beken', grade: '5. sınıf' },
      { name: 'Doğa İnan', grade: '5. sınıf' },
      { name: 'Masal Ekici', grade: '5. sınıf' },
      { name: 'Nehir Elvin Açıkgöz', grade: '5. sınıf' },
      { name: 'Sudelâl Terzi', grade: '5. sınıf' },
      { name: 'Büşra Bayır', grade: '5. sınıf' },
      { name: 'Maidenur Çakmak', grade: '5. sınıf' },
      { name: 'Dijle Ada Özyaman', grade: '5. sınıf' },
      { name: 'Muhammed Talha Yanarateş', grade: '5. sınıf' },
      { name: 'Şerife Sena Süzmeçelik', grade: '5. sınıf' },
    ],
  },
  {
    id: 'online-5a-fen',
    gradeClass: '5/a',
    subject: 'fen bilimleri',
    modality: 'online',
    instructorName: 'irem fındık',
    rawStudents: [
      { name: 'Eylül Ülkü Eruz', grade: '5. sınıf' },
      { name: 'Büşra Bayır', grade: '5. sınıf' },
      { name: 'Elfin Erva Akkaya', grade: '5. sınıf' },
      { name: 'Gökay Kırklar', grade: '5. sınıf' },
      { name: 'Aynur Nisa İpek', grade: '5. sınıf' },
      { name: 'Eymen Beken', grade: '5. sınıf' },
      { name: 'Doğa İnan', grade: '5. sınıf' },
      { name: 'Masal Ekici', grade: '5. sınıf' },
      { name: 'Nehir Elvin Açıkgöz', grade: '5. sınıf' },
      { name: 'Sudelâl Terzi', grade: '5. sınıf' },
      { name: 'Maidenur Çakmak', grade: '5. sınıf' },
    ],
  },
  {
    id: 'online-5a-sos',
    gradeClass: '5/a',
    subject: 'sosyal bilgiler',
    modality: 'online',
    instructorName: 'kaan osman',
    rawStudents: [
      { name: 'Aynur Nisa İpek', grade: '5. sınıf' },
      { name: 'Eymen Beken', grade: '5. sınıf' },
      { name: 'Doğa İnan', grade: '5. sınıf' },
      { name: 'Masal Ekici', grade: '5. sınıf' },
      { name: 'Nehir Elvin Açıkgöz', grade: '5. sınıf' },
      { name: 'Sudelâl Terzi', grade: '5. sınıf' },
      { name: 'Büşra Bayır', grade: '5. sınıf' },
      { name: 'Maidenur Çakmak', grade: '5. sınıf' },
    ],
  },
  {
    id: 'online-5a-ing',
    gradeClass: '5/a',
    subject: 'ingilizce',
    modality: 'online',
    instructorName: 'berat korkmaz',
    rawStudents: [
      { name: 'Eylül Ülkü Eruz', grade: '5. sınıf' },
      { name: 'Büşra Bayır', grade: '5. sınıf' },
      { name: 'Elfin Erva Akkaya', grade: '5. sınıf' },
      { name: 'Ecrin Safi', grade: '5. sınıf' },
      { name: 'Gökay Kırklar', grade: '5. sınıf' },
      { name: 'Eymen Beken', grade: '5. sınıf' },
      { name: 'Doğa İnan', grade: '5. sınıf' },
      { name: 'Masal Ekici', grade: '5. sınıf' },
      { name: 'Nehir Elvin Açıkgöz', grade: '5. sınıf' },
      { name: 'Sudelâl Terzi', grade: '5. sınıf' },
      { name: 'Maidenur Çakmak', grade: '5. sınıf' },
      { name: 'Dijle Ada Özyaman', grade: '5. sınıf' },
      { name: 'Muhammed Talha Yanarateş', grade: '5. sınıf' },
      { name: 'Şerife Sena Süzmeçelik', grade: '5. sınıf' },
    ],
  },
  {
    id: 'online-6a-mat',
    gradeClass: '6/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'semanur demircioğlu',
    rawStudents: [
      { name: 'Abdullah Muhammed Kaya', grade: '6. sınıf' },
      { name: 'Dila Acarca', grade: '6. sınıf' },
      { name: 'Buğlem Hazal Çakır', grade: '6. sınıf' },
      { name: 'Sukeyna Tağaç', grade: '6. sınıf' },
      { name: 'Zeynep Kalkan', grade: '6. sınıf' },
      { name: 'Esmanur Ensari', grade: '6. sınıf' },
      { name: 'Reyhan Çetinkaya', grade: '6. sınıf' },
      { name: 'Abdülkerim Salih Yıldız', grade: '6. sınıf' },
      { name: 'Asel Miray Yalçın', grade: '6. sınıf' },
      { name: 'Hüseyin Kalın', grade: '6. sınıf' },
      { name: 'Mirac Ali Çetinkaya', grade: '6. sınıf' },
      { name: 'Osman Turan', grade: '6. sınıf' },
      { name: 'Aysima Dereli', grade: '6. sınıf' },
      { name: 'İkranur Bedir', grade: '6. sınıf' },
      { name: 'Enes Çakmak', grade: '6. sınıf' },
      { name: 'Salih Eren Aydoğdu', grade: '6. sınıf' },
      { name: 'Muhammet Yasin Dağ', grade: '6. sınıf' },
      { name: 'Hatice Hüma Demir', grade: '6. sınıf' },
    ],
  },
  {
    id: 'online-6a-tur',
    gradeClass: '6/a',
    subject: 'türkçe',
    modality: 'online',
    instructorName: 'fevziye büşra hacı',
    rawStudents: [
      { name: 'Abdullah Muhammed Kaya', grade: '6. sınıf' },
      { name: 'Dila Acarca', grade: '6. sınıf' },
      { name: 'Buğlem Hazal Çakır', grade: '6. sınıf' },
      { name: 'Sukeyna Tağaç', grade: '6. sınıf' },
      { name: 'Zeynep Kalkan', grade: '6. sınıf' },
      { name: 'Esmanur Ensari', grade: '6. sınıf' },
      { name: 'Reyhan Çetinkaya', grade: '6. sınıf' },
      { name: 'Abdülkerim Salih Yıldız', grade: '6. sınıf' },
      { name: 'Hüseyin Kalın', grade: '6. sınıf' },
      { name: 'Osman Turan', grade: '6. sınıf' },
      { name: 'Aysima Dereli', grade: '6. sınıf' },
      { name: 'İkranur Bedir', grade: '6. sınıf' },
      { name: 'Enes Çakmak', grade: '6. sınıf' },
      { name: 'Salih Eren Aydoğdu', grade: '6. sınıf' },
      { name: 'Muhammet Yasin Dağ', grade: '6. sınıf' },
    ],
  },
  {
    id: 'online-6a-fen',
    gradeClass: '6/a',
    subject: 'fen bilimleri',
    modality: 'online',
    instructorName: 'eylül şahbaz',
    rawStudents: [
      { name: 'Abdullah Muhammed Kaya', grade: '6. sınıf' },
      { name: 'Dila Acarca', grade: '6. sınıf' },
      { name: 'Buğlem Hazal Çakır', grade: '6. sınıf' },
      { name: 'Sukeyna Tağaç', grade: '6. sınıf' },
      { name: 'Zeynep Kalkan', grade: '6. sınıf' },
      { name: 'Esmanur Ensari', grade: '6. sınıf' },
      { name: 'Reyhan Çetinkaya', grade: '6. sınıf' },
      { name: 'Abdülkerim Salih Yıldız', grade: '6. sınıf' },
      { name: 'Asel Miray Yalçın', grade: '6. sınıf' },
      { name: 'Hüseyin Kalın', grade: '6. sınıf' },
      { name: 'Osman Turan', grade: '6. sınıf' },
      { name: 'Aysima Dereli', grade: '6. sınıf' },
      { name: 'İkranur Bedir', grade: '6. sınıf' },
      { name: 'Enes Çakmak', grade: '6. sınıf' },
      { name: 'Salih Eren Aydoğdu', grade: '6. sınıf' },
      { name: 'Muhammet Yasin Dağ', grade: '6. sınıf' },
      { name: 'Hatice Hüma Demir', grade: '6. sınıf' },
      { name: 'Mirac Ali Çetinkaya', grade: '6. sınıf' },
    ],
  },
  {
    id: 'online-6a-sos',
    gradeClass: '6/a',
    subject: 'sosyal bilgiler',
    modality: 'online',
    instructorName: 'zehra uğur',
    rawStudents: [
      { name: 'Abdullah Muhammed Kaya', grade: '6. sınıf' },
      { name: 'Dila Acarca', grade: '6. sınıf' },
      { name: 'Reyhan Çetinkaya', grade: '6. sınıf' },
      { name: 'Abdülkerim Salih Yıldız', grade: '6. sınıf' },
      { name: 'Hüseyin Kalın', grade: '6. sınıf' },
      { name: 'Osman Turan', grade: '6. sınıf' },
      { name: 'Aysima Dereli', grade: '6. sınıf' },
      { name: 'İkranur Bedir', grade: '6. sınıf' },
      { name: 'Enes Çakmak', grade: '6. sınıf' },
      { name: 'Salih Eren Aydoğdu', grade: '6. sınıf' },
      { name: 'Muhammet Yasin Dağ', grade: '6. sınıf' },
    ],
  },
  {
    id: 'online-6a-ing',
    gradeClass: '6/a',
    subject: 'ingilizce',
    modality: 'online',
    instructorName: 'aşina sağer',
    rawStudents: [
      { name: 'Abdullah Muhammed Kaya', grade: '6. sınıf' },
      { name: 'Dila Acarca', grade: '6. sınıf' },
      { name: 'Zeynep Kalkan', grade: '6. sınıf' },
      { name: 'Abdülkerim Salih Yıldız', grade: '6. sınıf' },
      { name: 'Asel Miray Yalçın', grade: '6. sınıf' },
      { name: 'Hüseyin Kalın', grade: '6. sınıf' },
      { name: 'Osman Turan', grade: '6. sınıf' },
      { name: 'Aysima Dereli', grade: '6. sınıf' },
      { name: 'İkranur Bedir', grade: '6. sınıf' },
      { name: 'Enes Çakmak', grade: '6. sınıf' },
      { name: 'Salih Eren Aydoğdu', grade: '6. sınıf' },
      { name: 'Muhammet Yasin Dağ', grade: '6. sınıf' },
      { name: 'Hatice Hüma Demir', grade: '6. sınıf' },
    ],
  },
  {
    id: 'online-7a-mat',
    gradeClass: '7/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'neslihan öztürk',
    rawStudents: [
      { name: 'Amine Seyitoğlu', grade: '7. sınıf' },
      { name: 'Nujin Çekmez', grade: '7. sınıf' },
      { name: 'Meryem Nisa Özgün', grade: '7. sınıf' },
      { name: 'Dicle Tezel', grade: '7. sınıf' },
      { name: 'Bade Eylül Güneşligün', grade: '7. sınıf' },
      { name: 'Nisa Yurtseven', grade: '7. sınıf' },
      { name: 'Eymen Canpolat', grade: '7. sınıf' },
      { name: 'Havin Barut', grade: '7. sınıf' },
      { name: 'Bedriye Aktay', grade: '7. sınıf' },
      { name: 'İclal Çekmez', grade: '7. sınıf' },
      { name: 'Ecrin Çekmez', grade: '7. sınıf' },
      { name: 'Alya Semiha Tekerek', grade: '7. sınıf' },
      { name: 'Elif Sueda Toyguş', grade: '7. sınıf' },
      { name: 'Hiranur Torun', grade: '7. sınıf' },
      { name: 'Zeynep Su Şimşek', grade: '7. sınıf' },
      { name: 'Sena Emre', grade: '7. sınıf' },
      { name: 'Zeynep Hira Kartal', grade: '7. sınıf' },
      { name: 'Abdullah Yüce', grade: '7. sınıf' },
      { name: 'Elif Gözen', grade: '7. sınıf' },
      { name: 'Mira Tümkaya', grade: '7. sınıf' },
      { name: 'Yazar Çetin', grade: '7. sınıf' },
      { name: 'Bahar Nas Eruz', grade: '7. sınıf' },
      { name: 'Barış Erdem İşler', grade: '7. sınıf' },
      { name: 'Azra Melek Ecevit', grade: '7. sınıf' },
      { name: 'Kübra Sarıcı', grade: '7. sınıf' },
      { name: 'Mehmet Emin Hendem', grade: '7. sınıf' },
      { name: 'Mustafa Emir Yüksel', grade: '7. sınıf' },
      { name: 'Narinsu Bedir', grade: '7. sınıf' },
      { name: 'Rüzgar Rüstem Öncel', grade: '7. sınıf' },
      { name: 'İbrahim Kadir Göbel', grade: '7. sınıf' },
      { name: 'Defne Saklıca', grade: '7. sınıf' },
      { name: 'Reyan Gül', grade: '7. sınıf' },
    ],
  },
  {
    id: 'online-7a-tur',
    gradeClass: '7/a',
    subject: 'türkçe',
    modality: 'online',
    instructorName: 'hale özgenç',
    rawStudents: [
      { name: 'Amine Seyitoğlu', grade: '7. sınıf' },
      { name: 'Nujin Çekmez', grade: '7. sınıf' },
      { name: 'Bade Eylül Güneşligün', grade: '7. sınıf' },
      { name: 'Nisa Yurtseven', grade: '7. sınıf' },
      { name: 'İclal Çekmez', grade: '7. sınıf' },
      { name: 'Ecrin Çekmez', grade: '7. sınıf' },
      { name: 'Alya Semiha Tekerek', grade: '7. sınıf' },
      { name: 'Hiranur Torun', grade: '7. sınıf' },
      { name: 'Zeynep Su Şimşek', grade: '7. sınıf' },
      { name: 'Sena Emre', grade: '7. sınıf' },
      { name: 'Abdullah Yüce', grade: '7. sınıf' },
      { name: 'Elif Gözen', grade: '7. sınıf' },
      { name: 'Mira Tümkaya', grade: '7. sınıf' },
      { name: 'Yazar Çetin', grade: '7. sınıf' },
      { name: 'Azra Melek Ecevit', grade: '7. sınıf' },
      { name: 'Kübra Sarıcı', grade: '7. sınıf' },
      { name: 'Mehmet Emin Hendem', grade: '7. sınıf' },
      { name: 'Narinsu Bedir', grade: '7. sınıf' },
      { name: 'Rüzgar Rüstem Öncel', grade: '7. sınıf' },
      { name: 'Zeynep Hira Kartal', grade: '7. sınıf' },
      { name: 'İbrahim Kadir Göbel', grade: '7. sınıf' },
      { name: 'Defne Saklıca', grade: '7. sınıf' },
      { name: 'Reyan Gül', grade: '7. sınıf' },
    ],
  },
  {
    id: 'online-7a-fen',
    gradeClass: '7/a',
    subject: 'fen bilimleri',
    modality: 'online',
    instructorName: 'fatma zehra namlı',
    rawStudents: [
      { name: 'Amine Seyitoğlu', grade: '7. sınıf' },
      { name: 'Nujin Çekmez', grade: '7. sınıf' },
      { name: 'Meryem Nisa Özgün', grade: '7. sınıf' },
      { name: 'Dicle Tezel', grade: '7. sınıf' },
      { name: 'Bade Eylül Güneşligün', grade: '7. sınıf' },
      { name: 'Nisa Yurtseven', grade: '7. sınıf' },
      { name: 'Eymen Canpolat', grade: '7. sınıf' },
      { name: 'Havin Barut', grade: '7. sınıf' },
      { name: 'Bedriye Aktay', grade: '7. sınıf' },
      { name: 'İclal Çekmez', grade: '7. sınıf' },
      { name: 'Ecrin Çekmez', grade: '7. sınıf' },
      { name: 'Alya Semiha Tekerek', grade: '7. sınıf' },
      { name: 'Elif Sueda Toyguş', grade: '7. sınıf' },
      { name: 'Hiranur Torun', grade: '7. sınıf' },
      { name: 'Zeynep Su Şimşek', grade: '7. sınıf' },
      { name: 'Zeynep Hira Kartal', grade: '7. sınıf' },
      { name: 'Abdullah Yüce', grade: '7. sınıf' },
      { name: 'Elif Gözen', grade: '7. sınıf' },
      { name: 'Mira Tümkaya', grade: '7. sınıf' },
      { name: 'Yazar Çetin', grade: '7. sınıf' },
      { name: 'Bahar Nas Eruz', grade: '7. sınıf' },
      { name: 'Azra Melek Ecevit', grade: '7. sınıf' },
      { name: 'Kübra Sarıcı', grade: '7. sınıf' },
      { name: 'Mehmet Emin Hendem', grade: '7. sınıf' },
      { name: 'Narinsu Bedir', grade: '7. sınıf' },
      { name: 'Sena Emre', grade: '7. sınıf' },
      { name: 'Rüzgar Rüstem Öncel', grade: '7. sınıf' },
      { name: 'İbrahim Kadir Göbel', grade: '7. sınıf' },
      { name: 'Defne Saklıca', grade: '7. sınıf' },
      { name: 'Reyan Gül', grade: '7. sınıf' },
    ],
  },
  {
    id: 'online-7a-sos',
    gradeClass: '7/a',
    subject: 'sosyal bilgiler',
    modality: 'online',
    instructorName: 'şebnem şimal durgu',
    rawStudents: [
      { name: 'Meryem Nisa Özgün', grade: '7. sınıf' },
      { name: 'Alya Semiha Tekerek', grade: '7. sınıf' },
      { name: 'Azra Melek Ecevit', grade: '7. sınıf' },
      { name: 'Kübra Sarıcı', grade: '7. sınıf' },
      { name: 'Ecrin Çekmez', grade: '7. sınıf' },
      { name: 'Abdullah Yüce', grade: '7. sınıf' },
      { name: 'İbrahim Kadir Göbel', grade: '7. sınıf' },
      { name: 'Reyan Gül', grade: '7. sınıf' },
    ],
  },
  {
    id: 'online-7a-ing',
    gradeClass: '7/a',
    subject: 'ingilizce',
    modality: 'online',
    instructorName: 'bos2',
    alias: 'bos2',
    rawStudents: [
      { name: 'Amine Seyitoğlu', grade: '7. sınıf' },
      { name: 'Nujin Çekmez', grade: '7. sınıf' },
      { name: 'Dicle Tezel', grade: '7. sınıf' },
      { name: 'Bade Eylül Güneşligün', grade: '7. sınıf' },
      { name: 'Nisa Yurtseven', grade: '7. sınıf' },
      { name: 'Bahar Nas Eruz', grade: '7. sınıf' },
      { name: 'Azra Melek Ecevit', grade: '7. sınıf' },
      { name: 'Kübra Sarıcı', grade: '7. sınıf' },
      { name: 'Mustafa Emir Yüksel', grade: '7. sınıf' },
      { name: 'Ecrin Çekmez', grade: '7. sınıf' },
      { name: 'Cihangir Ömer Tan', grade: '7. sınıf' },
      { name: 'Hiranur Torun', grade: '7. sınıf' },
      { name: 'Abdullah Yüce', grade: '7. sınıf' },
      { name: 'Rüzgar Rüstem Öncel', grade: '7. sınıf' },
      { name: 'İbrahim Kadir Göbel', grade: '7. sınıf' },
      { name: 'Elifsu Şen', grade: '7. sınıf' },
      { name: 'Reyan Gül', grade: '7. sınıf' },
    ],
  },
  {
    id: 'online-8a-mat',
    gradeClass: '8/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'busenur uçar',
    rawStudents: [
      { name: 'Esma Gök', grade: '8. sınıf' },
      { name: 'Sahra Doğmuş', grade: '8. sınıf' },
      { name: 'Asmin Macar', grade: '8. sınıf' },
      { name: 'Halisa Akıncı', grade: '8. sınıf' },
      { name: 'Nursena Üçdağ', grade: '8. sınıf' },
      { name: 'Murat Tuncay', grade: '8. sınıf' },
      { name: 'Asya Ölmez', grade: '8. sınıf' },
      { name: 'Miray Cansu Yaman', grade: '8. sınıf' },
      { name: 'Meriç Naz Akyüz', grade: '8. sınıf' },
      { name: 'Meryem Güneş', grade: '8. sınıf' },
      { name: 'Zehra Eser', grade: '8. sınıf' },
      { name: 'Eylül Temel', grade: '8. sınıf' },
      { name: 'Zeynep Sude Karataş', grade: '8. sınıf' },
      { name: 'Zeynep Tekin', grade: '8. sınıf' },
      { name: 'Erva Emre', grade: '8. sınıf' },
      { name: 'Sahra Su Emre', grade: '8. sınıf' },
      { name: 'Yağmur Karadağ', grade: '8. sınıf' },
      { name: 'Burhan Emir Türköz', grade: '8. sınıf' },
      { name: 'Zeynep Öykü Ören', grade: '8. sınıf' },
      { name: 'Erva Şişman', grade: '8. sınıf' },
      { name: 'Kadir Anıl Durusoy', grade: '8. sınıf' },
      { name: 'Miraç Çakmak', grade: '8. sınıf' },
      { name: 'Hasan Pelit', grade: '8. sınıf' },
      { name: 'Yağmur Demircioğlu', grade: '8. sınıf' },
      { name: 'Melike Abay', grade: '8. sınıf' },
      { name: 'Caner Kırçıçek', grade: '8. sınıf' },
      { name: 'Minel Turan', grade: '8. sınıf' },
      { name: 'Yunus İslam Çalışkan', grade: '8. sınıf' },
      { name: 'Efsa Ölmez', grade: '8. sınıf' },
      { name: 'Alperen Acarca', grade: '8. sınıf' },
      { name: 'Pınar Parçacı', grade: '8. sınıf' },
      { name: 'Ada Karataş', grade: '8. sınıf' },
    ],
  },
  {
    id: 'online-8a-tur',
    gradeClass: '8/a',
    subject: 'türkçe',
    modality: 'online',
    instructorName: 'azra bulut',
    rawStudents: [
      { name: 'Esma Gök', grade: '8. sınıf' },
      { name: 'Sahra Doğmuş', grade: '8. sınıf' },
      { name: 'Asmin Macar', grade: '8. sınıf' },
      { name: 'Halisa Akıncı', grade: '8. sınıf' },
      { name: 'Murat Tuncay', grade: '8. sınıf' },
      { name: 'Asya Ölmez', grade: '8. sınıf' },
      { name: 'Miray Cansu Yaman', grade: '8. sınıf' },
      { name: 'Meriç Naz Akyüz', grade: '8. sınıf' },
      { name: 'Meryem Güneş', grade: '8. sınıf' },
      { name: 'Zehra Eser', grade: '8. sınıf' },
      { name: 'Eylül Temel', grade: '8. sınıf' },
      { name: 'Zeynep Sude Karataş', grade: '8. sınıf' },
      { name: 'Erva Emre', grade: '8. sınıf' },
      { name: 'Sahra Su Emre', grade: '8. sınıf' },
      { name: 'Yağmur Karadağ', grade: '8. sınıf' },
      { name: 'Burhan Emir Türköz', grade: '8. sınıf' },
      { name: 'İlayda Kara', grade: '8. sınıf' },
      { name: 'Zeynep Öykü Ören', grade: '8. sınıf' },
      { name: 'Erva Şişman', grade: '8. sınıf' },
      { name: 'Kadir Anıl Durusoy', grade: '8. sınıf' },
      { name: 'Miraç Çakmak', grade: '8. sınıf' },
      { name: 'Hasan Pelit', grade: '8. sınıf' },
      { name: 'Yağmur Demircioğlu', grade: '8. sınıf' },
      { name: 'Melike Abay', grade: '8. sınıf' },
      { name: 'Caner Kırçıçek', grade: '8. sınıf' },
      { name: 'Yunus İslam Çalışkan', grade: '8. sınıf' },
      { name: 'Alperen Acarca', grade: '8. sınıf' },
      { name: 'Pınar Parçacı', grade: '8. sınıf' },
      { name: 'Ada Karataş', grade: '8. sınıf' },
    ],
  },
  {
    id: 'online-8a-fen',
    gradeClass: '8/a',
    subject: 'fen bilimleri',
    modality: 'online',
    instructorName: 'yağmur alver',
    rawStudents: [
      { name: 'Esma Gök', grade: '8. sınıf' },
      { name: 'Sahra Doğmuş', grade: '8. sınıf' },
      { name: 'Halisa Akıncı', grade: '8. sınıf' },
      { name: 'Nursena Üçdağ', grade: '8. sınıf' },
      { name: 'Murat Tuncay', grade: '8. sınıf' },
      { name: 'Asya Ölmez', grade: '8. sınıf' },
      { name: 'Miray Cansu Yaman', grade: '8. sınıf' },
      { name: 'Meriç Naz Akyüz', grade: '8. sınıf' },
      { name: 'Meryem Güneş', grade: '8. sınıf' },
      { name: 'Zehra Eser', grade: '8. sınıf' },
      { name: 'Eylül Temel', grade: '8. sınıf' },
      { name: 'Zeynep Sude Karataş', grade: '8. sınıf' },
      { name: 'Zeynep Tekin', grade: '8. sınıf' },
      { name: 'Erva Emre', grade: '8. sınıf' },
      { name: 'Sahra Su Emre', grade: '8. sınıf' },
      { name: 'Yağmur Karadağ', grade: '8. sınıf' },
      { name: 'Burhan Emir Türköz', grade: '8. sınıf' },
      { name: 'İlayda Kara', grade: '8. sınıf' },
      { name: 'Zeynep Öykü Ören', grade: '8. sınıf' },
      { name: 'Erva Şişman', grade: '8. sınıf' },
      { name: 'Kadir Anıl Durusoy', grade: '8. sınıf' },
      { name: 'Miraç Çakmak', grade: '8. sınıf' },
      { name: 'Hasan Pelit', grade: '8. sınıf' },
      { name: 'Yağmur Demircioğlu', grade: '8. sınıf' },
      { name: 'Melike Abay', grade: '8. sınıf' },
      { name: 'Caner Kırçıçek', grade: '8. sınıf' },
      { name: 'Yunus İslam Çalışkan', grade: '8. sınıf' },
      { name: 'Meryem Ece Kaş', grade: '8. sınıf' },
      { name: 'Alperen Acarca', grade: '8. sınıf' },
      { name: 'Pınar Parçacı', grade: '8. sınıf' },
      { name: 'Ada Karataş', grade: '8. sınıf' },
    ],
  },
  {
    id: 'online-8a-sos',
    gradeClass: '8/a',
    subject: 'sosyal bilgiler',
    modality: 'online',
    instructorName: 'bos3',
    alias: 'bos3',
    rawStudents: [
      { name: 'Esma Gök', grade: '8. sınıf' },
      { name: 'Sahra Doğmuş', grade: '8. sınıf' },
      { name: 'Yağmur Karadağ', grade: '8. sınıf' },
      { name: 'Zeynep Öykü Ören', grade: '8. sınıf' },
      { name: 'Erva Şişman', grade: '8. sınıf' },
      { name: 'Kadir Anıl Durusoy', grade: '8. sınıf' },
      { name: 'Miraç Çakmak', grade: '8. sınıf' },
      { name: 'Hasan Pelit', grade: '8. sınıf' },
      { name: 'Yağmur Demircioğlu', grade: '8. sınıf' },
      { name: 'Melike Abay', grade: '8. sınıf' },
      { name: 'Caner Kırçıçek', grade: '8. sınıf' },
      { name: 'Zeynep Sude Karataş', grade: '8. sınıf' },
      { name: 'Yunus İslam Çalışkan', grade: '8. sınıf' },
      { name: 'Alperen Acarca', grade: '8. sınıf' },
    ],
  },
  {
    id: 'online-8a-ing',
    gradeClass: '8/a',
    subject: 'ingilizce',
    modality: 'online',
    instructorName: 'yağmur gençtürk',
    rawStudents: [
      { name: 'Murat Tuncay', grade: '8. sınıf' },
      { name: 'Zehra Eser', grade: '8. sınıf' },
      { name: 'Yağmur Karadağ', grade: '8. sınıf' },
      { name: 'Zeynep Öykü Ören', grade: '8. sınıf' },
      { name: 'Erva Şişman', grade: '8. sınıf' },
      { name: 'Kadir Anıl Durusoy', grade: '8. sınıf' },
      { name: 'Esma Gök', grade: '8. sınıf' },
      { name: 'Miraç Çakmak', grade: '8. sınıf' },
      { name: 'Hasan Pelit', grade: '8. sınıf' },
      { name: 'Yağmur Demircioğlu', grade: '8. sınıf' },
      { name: 'Melike Abay', grade: '8. sınıf' },
      { name: 'Caner Kırçıçek', grade: '8. sınıf' },
      { name: 'Yunus İslam Çalışkan', grade: '8. sınıf' },
      { name: 'Meryem Ece Kaş', grade: '8. sınıf' },
    ],
  },
  {
    id: 'online-9a-mat',
    gradeClass: '9/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'ceydanur öztürk',
    rawStudents: [
      { name: 'Gülbahar Karadaban', grade: '9. sınıf' },
      { name: 'Sahra Değirmenci', grade: '9. sınıf' },
      { name: 'Fidan Kaya', grade: '9. sınıf' },
      { name: 'Zeynep Eflal Demircan', grade: '9. sınıf' },
      { name: 'Havin Ölmez', grade: '9. sınıf' },
      { name: 'Eylül Seyitoğlu', grade: '9. sınıf' },
      { name: 'Zümra Cengiz', grade: '9. sınıf' },
      { name: 'Berat Çelik', grade: '9. sınıf' },
      { name: 'Nisanur Özgün', grade: '9. sınıf' },
      { name: 'Ecemsu Erdoğan', grade: '9. sınıf' },
      { name: 'Elif Nur Tuncay', grade: '9. sınıf' },
      { name: 'Elif Güzel', grade: '9. sınıf' },
      { name: 'Zemzem Yıldız', grade: '9. sınıf' },
      { name: 'Miraç Hira Saraçoğlu', grade: '9. sınıf' },
      { name: 'Nil Danışoğlu', grade: '9. sınıf' },
      { name: 'Nisa Yağmur Yüksel', grade: '9. sınıf' },
      { name: 'Eylül Ünal', grade: '9. sınıf' },
      { name: 'Zehra Yalçın', grade: '9. sınıf' },
      { name: 'Nisa Karanfil', grade: '9. sınıf' },
      { name: 'Emir Vehbi Elmez', grade: '9. sınıf' },
      { name: 'Asel Akyüz', grade: '9. sınıf' },
      { name: 'Miray Özer', grade: '9. sınıf' },
      { name: 'Yağmur Özdemir', grade: '9. sınıf' },
      { name: 'Barış Ege Kayım', grade: '9. sınıf' },
      { name: 'Evren Duman', grade: '9. sınıf' },
      { name: 'Zeynep İrem Turun', grade: '9. sınıf' },
      { name: 'Ahmet Adil Öztürk', grade: '9. sınıf' },
      { name: 'Ayberk Şalgam', grade: '9. sınıf' },
      { name: 'Azra Çelebi', grade: '9. sınıf' },
      { name: 'Ela Dora Çıtak', grade: '9. sınıf' },
      { name: 'Recep Aras Şahbazer', grade: '9. sınıf' },
      { name: 'Barış Yıldızbaş', grade: '9. sınıf' },
      { name: 'İsmail Turan', grade: '9. sınıf' },
      { name: 'Hazal Burus', grade: '9. sınıf' },
      { name: 'Talha Berk Ünsal', grade: '9. sınıf' },
      { name: 'Hazal Güneş', grade: '9. sınıf' },
      { name: 'Belfin Jinda Yalçın', grade: '9. sınıf' },
      { name: 'İrem Su Altuntaş', grade: '9. sınıf' },
      { name: 'Yağmur Kocaman', grade: '9. sınıf' },
    ],
  },
  {
    id: 'online-9a-edb',
    gradeClass: '9/a',
    subject: 'türk dili ve edebiyatı',
    modality: 'online',
    instructorName: 'esmanur sena demir',
    rawStudents: [
      { name: 'Gülbahar Karadaban', grade: '9. sınıf' },
      { name: 'Sahra Değirmenci', grade: '9. sınıf' },
      { name: 'Fidan Kaya', grade: '9. sınıf' },
      { name: 'Zeynep Eflal Demircan', grade: '9. sınıf' },
      { name: 'Havin Ölmez', grade: '9. sınıf' },
      { name: 'Eylül Seyitoğlu', grade: '9. sınıf' },
      { name: 'Elif Güzel', grade: '9. sınıf' },
      { name: 'Nisa Yağmur Yüksel', grade: '9. sınıf' },
      { name: 'Eylül Ünal', grade: '9. sınıf' },
      { name: 'Zehra Yalçın', grade: '9. sınıf' },
      { name: 'Emir Vehbi Elmez', grade: '9. sınıf' },
      { name: 'Asel Akyüz', grade: '9. sınıf' },
      { name: 'Miray Özer', grade: '9. sınıf' },
      { name: 'Yağmur Özdemir', grade: '9. sınıf' },
      { name: 'Barış Ege Kayım', grade: '9. sınıf' },
      { name: 'Evren Duman', grade: '9. sınıf' },
      { name: 'Ahmet Adil Öztürk', grade: '9. sınıf' },
      { name: 'Nisanur Özgün', grade: '9. sınıf' },
      { name: 'Barış Yıldızbaş', grade: '9. sınıf' },
      { name: 'İsmail Turan', grade: '9. sınıf' },
      { name: 'Hazal Burus', grade: '9. sınıf' },
      { name: 'Talha Berk Ünsal', grade: '9. sınıf' },
      { name: 'Hazal Güneş', grade: '9. sınıf' },
      { name: 'Belfin Jinda Yalçın', grade: '9. sınıf' },
      { name: 'İrem Su Altuntaş', grade: '9. sınıf' },
    ],
  },
  {
    id: 'online-9a-fiz',
    gradeClass: '9/a',
    subject: 'fizik',
    modality: 'online',
    instructorName: 'ibrahim arslan',
    rawStudents: [
      { name: 'Sahra Değirmenci', grade: '9. sınıf' },
      { name: 'Fidan Kaya', grade: '9. sınıf' },
      { name: 'Havin Ölmez', grade: '9. sınıf' },
      { name: 'Eylül Seyitoğlu', grade: '9. sınıf' },
      { name: 'Zümra Cengiz', grade: '9. sınıf' },
      { name: 'Berat Çelik', grade: '9. sınıf' },
      { name: 'Nisanur Özgün', grade: '9. sınıf' },
      { name: 'Ecemsu Erdoğan', grade: '9. sınıf' },
      { name: 'Elif Nur Tuncay', grade: '9. sınıf' },
      { name: 'Elif Güzel', grade: '9. sınıf' },
      { name: 'Zemzem Yıldız', grade: '9. sınıf' },
      { name: 'Miraç Hira Saraçoğlu', grade: '9. sınıf' },
      { name: 'Eylül Ünal', grade: '9. sınıf' },
      { name: 'Zehra Yalçın', grade: '9. sınıf' },
      { name: 'Nisa Karanfil', grade: '9. sınıf' },
      { name: 'Asel Akyüz', grade: '9. sınıf' },
      { name: 'Miray Özer', grade: '9. sınıf' },
      { name: 'Yağmur Özdemir', grade: '9. sınıf' },
      { name: 'Barış Ege Kayım', grade: '9. sınıf' },
      { name: 'Evren Duman', grade: '9. sınıf' },
      { name: 'Zeynep İrem Turun', grade: '9. sınıf' },
      { name: 'Ahmet Adil Öztürk', grade: '9. sınıf' },
      { name: 'Azra Çelebi', grade: '9. sınıf' },
      { name: 'Ela Dora Çıtak', grade: '9. sınıf' },
      { name: 'Recep Aras Şahbazer', grade: '9. sınıf' },
      { name: 'İsmail Turan', grade: '9. sınıf' },
      { name: 'Hazal Burus', grade: '9. sınıf' },
      { name: 'Talha Berk Ünsal', grade: '9. sınıf' },
      { name: 'Hazal Güneş', grade: '9. sınıf' },
      { name: 'Belfin Jinda Yalçın', grade: '9. sınıf' },
      { name: 'İrem Su Altuntaş', grade: '9. sınıf' },
      { name: 'Yağmur Kocaman', grade: '9. sınıf' },
    ],
  },
  {
    id: 'online-9a-kim',
    gradeClass: '9/a',
    subject: 'kimya',
    modality: 'online',
    instructorName: 'zehra akgün acar',
    rawStudents: [
      { name: 'Gülbahar Karadaban', grade: '9. sınıf' },
      { name: 'Sahra Değirmenci', grade: '9. sınıf' },
      { name: 'Fidan Kaya', grade: '9. sınıf' },
      { name: 'Eylül Seyitoğlu', grade: '9. sınıf' },
      { name: 'Zümra Cengiz', grade: '9. sınıf' },
      { name: 'Nisanur Özgün', grade: '9. sınıf' },
      { name: 'Ecemsu Erdoğan', grade: '9. sınıf' },
      { name: 'Elif Nur Tuncay', grade: '9. sınıf' },
      { name: 'Elif Güzel', grade: '9. sınıf' },
      { name: 'Zemzem Yıldız', grade: '9. sınıf' },
      { name: 'Eylül Ünal', grade: '9. sınıf' },
      { name: 'Zehra Yalçın', grade: '9. sınıf' },
      { name: 'Nisa Karanfil', grade: '9. sınıf' },
      { name: 'Emir Vehbi Elmez', grade: '9. sınıf' },
      { name: 'Asel Akyüz', grade: '9. sınıf' },
      { name: 'Miray Özer', grade: '9. sınıf' },
      { name: 'Yağmur Özdemir', grade: '9. sınıf' },
      { name: 'Barış Ege Kayım', grade: '9. sınıf' },
      { name: 'Evren Duman', grade: '9. sınıf' },
      { name: 'Zeynep İrem Turun', grade: '9. sınıf' },
      { name: 'Ahmet Adil Öztürk', grade: '9. sınıf' },
      { name: 'Azra Çelebi', grade: '9. sınıf' },
      { name: 'Ela Dora Çıtak', grade: '9. sınıf' },
      { name: 'İsmail Turan', grade: '9. sınıf' },
      { name: 'Hazal Burus', grade: '9. sınıf' },
      { name: 'Talha Berk Ünsal', grade: '9. sınıf' },
      { name: 'Hazal Güneş', grade: '9. sınıf' },
      { name: 'Belfin Jinda Yalçın', grade: '9. sınıf' },
      { name: 'İrem Su Altuntaş', grade: '9. sınıf' },
      { name: 'Yağmur Kocaman', grade: '9. sınıf' },
    ],
  },
  {
    id: 'online-9a-biy',
    gradeClass: '9/a',
    subject: 'biyoloji',
    modality: 'online',
    instructorName: 'kerem yılmazer',
    rawStudents: [
      { name: 'Sahra Değirmenci', grade: '9. sınıf' },
      { name: 'Fidan Kaya', grade: '9. sınıf' },
      { name: 'Eylül Seyitoğlu', grade: '9. sınıf' },
      { name: 'Zümra Cengiz', grade: '9. sınıf' },
      { name: 'Nisanur Özgün', grade: '9. sınıf' },
      { name: 'Elif Nur Tuncay', grade: '9. sınıf' },
      { name: 'Elif Güzel', grade: '9. sınıf' },
      { name: 'Zemzem Yıldız', grade: '9. sınıf' },
      { name: 'Nisa Yağmur Yüksel', grade: '9. sınıf' },
      { name: 'Eylül Ünal', grade: '9. sınıf' },
      { name: 'Zehra Yalçın', grade: '9. sınıf' },
      { name: 'Nisa Karanfil', grade: '9. sınıf' },
      { name: 'Asel Akyüz', grade: '9. sınıf' },
      { name: 'Miray Özer', grade: '9. sınıf' },
      { name: 'Yağmur Özdemir', grade: '9. sınıf' },
      { name: 'Barış Ege Kayım', grade: '9. sınıf' },
      { name: 'Evren Duman', grade: '9. sınıf' },
      { name: 'Ahmet Adil Öztürk', grade: '9. sınıf' },
      { name: 'Azra Çelebi', grade: '9. sınıf' },
      { name: 'Barış Yıldızbaş', grade: '9. sınıf' },
      { name: 'İsmail Turan', grade: '9. sınıf' },
      { name: 'Hazal Burus', grade: '9. sınıf' },
      { name: 'Talha Berk Ünsal', grade: '9. sınıf' },
      { name: 'Hazal Güneş', grade: '9. sınıf' },
    ],
  },
  {
    id: 'online-9a-ing',
    gradeClass: '9/a',
    subject: 'ingilizce',
    modality: 'online',
    instructorName: 'nur ezel özbey',
    rawStudents: [
      { name: 'Fidan Kaya', grade: '9. sınıf' },
      { name: 'Havin Ölmez', grade: '9. sınıf' },
      { name: 'Eylül Seyitoğlu', grade: '9. sınıf' },
      { name: 'Zümra Cengiz', grade: '9. sınıf' },
      { name: 'Berat Çelik', grade: '9. sınıf' },
      { name: 'Elif Nur Tuncay', grade: '9. sınıf' },
      { name: 'Nisa Yağmur Yüksel', grade: '9. sınıf' },
      { name: 'Eylül Ünal', grade: '9. sınıf' },
      { name: 'Zehra Yalçın', grade: '9. sınıf' },
      { name: 'Nisa Karanfil', grade: '9. sınıf' },
      { name: 'Asel Akyüz', grade: '9. sınıf' },
      { name: 'Miray Özer', grade: '9. sınıf' },
      { name: 'Yağmur Özdemir', grade: '9. sınıf' },
      { name: 'Barış Ege Kayım', grade: '9. sınıf' },
      { name: 'Evren Duman', grade: '9. sınıf' },
      { name: 'Zeynep İrem Turun', grade: '9. sınıf' },
      { name: 'Ayberk Şalgam', grade: '9. sınıf' },
      { name: 'Barış Yıldızbaş', grade: '9. sınıf' },
      { name: 'Hazal Burus', grade: '9. sınıf' },
      { name: 'Talha Berk Ünsal', grade: '9. sınıf' },
      { name: 'Hazal Güneş', grade: '9. sınıf' },
      { name: 'Belfin Jinda Yalçın', grade: '9. sınıf' },
    ],
  },
  {
    id: 'online-10a-mat',
    gradeClass: '10/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'ilkay şahin',
    rawStudents: [
      { name: 'Nursima Girgin', grade: '10. sınıf' },
      { name: 'Rabia Sinem Kaya', grade: '10. sınıf' },
      { name: 'Mukaddes Çekmez', grade: '10. sınıf' },
      { name: 'Hamza Askay', grade: '10. sınıf' },
      { name: 'Aslı Enez', grade: '10. sınıf' },
      { name: 'Damla Nur Sincar', grade: '10. sınıf' },
      { name: 'Fatime Denli', grade: '10. sınıf' },
      { name: 'Zine Özgün', grade: '10. sınıf' },
      { name: 'Hicret Duru Alabacak', grade: '10. sınıf' },
      { name: 'Ecrin Buse Çubukcu', grade: '10. sınıf' },
      { name: 'Nisanur Öngören', grade: '10. sınıf' },
      { name: 'Yağmur Kocaman', grade: '10. sınıf' },
      { name: 'İlknur Ateş', grade: '10. sınıf' },
      { name: 'Belinay Kadri', grade: '10. sınıf' },
      { name: 'Esma Naz Yarıcı', grade: '10. sınıf' },
      { name: 'Zehra Demir', grade: '10. sınıf' },
      { name: 'Irmak Baytar', grade: '10. sınıf' },
      { name: 'Yunus Emre Tümkaya', grade: '10. sınıf' },
      { name: 'Senem Akın', grade: '10. sınıf' },
      { name: 'Ufuk Yıldırım', grade: '10. sınıf' },
      { name: 'Şevval Durusoy', grade: '10. sınıf' },
      { name: 'Tuana Dereli', grade: '10. sınıf' },
      { name: 'Eslem Elif Aydoğdu', grade: '10. sınıf' },
      { name: 'Yusuf Eren Açari', grade: '10. sınıf' },
      { name: 'Elif Su Torun', grade: '10. sınıf' },
      { name: 'Betül Pelit', grade: '10. sınıf' },
    ],
  },
  {
    id: 'online-10a-edb',
    gradeClass: '10/a',
    subject: 'türk dili ve edebiyatı',
    modality: 'online',
    instructorName: 'nesibe mina erol',
    rawStudents: [
      { name: 'Nursima Girgin', grade: '10. sınıf' },
      { name: 'Mukaddes Çekmez', grade: '10. sınıf' },
      { name: 'Hamza Askay', grade: '10. sınıf' },
      { name: 'Belinay Kadri', grade: '10. sınıf' },
      { name: 'Esma Naz Yarıcı', grade: '10. sınıf' },
      { name: 'Irmak Baytar', grade: '10. sınıf' },
      { name: 'Yunus Emre Tümkaya', grade: '10. sınıf' },
      { name: 'Senem Akın', grade: '10. sınıf' },
      { name: 'Aslı Enez', grade: '10. sınıf' },
      { name: 'Ufuk Yıldırım', grade: '10. sınıf' },
      { name: 'Şevval Durusoy', grade: '10. sınıf' },
      { name: 'Eslem Elif Aydoğdu', grade: '10. sınıf' },
      { name: 'Betül Pelit', grade: '10. sınıf' },
    ],
  },
  {
    id: 'online-10a-fiz',
    gradeClass: '10/a',
    subject: 'fizik',
    modality: 'online',
    instructorName: 'elif büşra dede',
    rawStudents: [
      { name: 'Nursima Girgin', grade: '10. sınıf' },
      { name: 'Rabia Sinem Kaya', grade: '10. sınıf' },
      { name: 'Mukaddes Çekmez', grade: '10. sınıf' },
      { name: 'Hamza Askay', grade: '10. sınıf' },
      { name: 'Aslı Enez', grade: '10. sınıf' },
      { name: 'Damla Nur Sincar', grade: '10. sınıf' },
      { name: 'Zine Özgün', grade: '10. sınıf' },
      { name: 'Ecrin Buse Çubukcu', grade: '10. sınıf' },
      { name: 'Nisanur Öngören', grade: '10. sınıf' },
      { name: 'Yağmur Kocaman', grade: '10. sınıf' },
      { name: 'Zehra Ceren Parmaksız', grade: '10. sınıf' },
      { name: 'İlknur Ateş', grade: '10. sınıf' },
      { name: 'Mert Ali Şimşek', grade: '10. sınıf' },
      { name: 'Belinay Kadri', grade: '10. sınıf' },
      { name: 'Esma Naz Yarıcı', grade: '10. sınıf' },
      { name: 'Zehra Demir', grade: '10. sınıf' },
      { name: 'Irmak Baytar', grade: '10. sınıf' },
      { name: 'Yunus Emre Tümkaya', grade: '10. sınıf' },
      { name: 'Senem Akın', grade: '10. sınıf' },
      { name: 'Ufuk Yıldırım', grade: '10. sınıf' },
      { name: 'Şevval Durusoy', grade: '10. sınıf' },
      { name: 'Tuana Dereli', grade: '10. sınıf' },
      { name: 'Eslem Elif Aydoğdu', grade: '10. sınıf' },
      { name: 'Elif Su Torun', grade: '10. sınıf' },
      { name: 'Betül Pelit', grade: '10. sınıf' },
    ],
  },
  {
    id: 'online-10a-kim',
    gradeClass: '10/a',
    subject: 'kimya',
    modality: 'online',
    instructorName: 'erva öner',
    rawStudents: [
      { name: 'Nursima Girgin', grade: '10. sınıf' },
      { name: 'Rabia Sinem Kaya', grade: '10. sınıf' },
      { name: 'Mukaddes Çekmez', grade: '10. sınıf' },
      { name: 'Hamza Askay', grade: '10. sınıf' },
      { name: 'Aslı Enez', grade: '10. sınıf' },
      { name: 'Damla Nur Sincar', grade: '10. sınıf' },
      { name: 'Fatime Denli', grade: '10. sınıf' },
      { name: 'Zine Özgün', grade: '10. sınıf' },
      { name: 'Hicret Duru Alabacak', grade: '10. sınıf' },
      { name: 'Ecrin Buse Çubukcu', grade: '10. sınıf' },
      { name: 'Nisanur Öngören', grade: '10. sınıf' },
      { name: 'Yağmur Kocaman', grade: '10. sınıf' },
      { name: 'Zehra Ceren Parmaksız', grade: '10. sınıf' },
      { name: 'İlknur Ateş', grade: '10. sınıf' },
      { name: 'Mert Ali Şimşek', grade: '10. sınıf' },
      { name: 'Belinay Kadri', grade: '10. sınıf' },
      { name: 'Esma Naz Yarıcı', grade: '10. sınıf' },
      { name: 'Zehra Demir', grade: '10. sınıf' },
      { name: 'Irmak Baytar', grade: '10. sınıf' },
      { name: 'Yunus Emre Tümkaya', grade: '10. sınıf' },
      { name: 'Senem Akın', grade: '10. sınıf' },
      { name: 'Ufuk Yıldırım', grade: '10. sınıf' },
      { name: 'Şevval Durusoy', grade: '10. sınıf' },
      { name: 'Tuana Dereli', grade: '10. sınıf' },
      { name: 'Eslem Elif Aydoğdu', grade: '10. sınıf' },
      { name: 'Yusuf Eren Açari', grade: '10. sınıf' },
      { name: 'Elif Su Torun', grade: '10. sınıf' },
      { name: 'Betül Pelit', grade: '10. sınıf' },
    ],
  },
  {
    id: 'online-10a-biy',
    gradeClass: '10/a',
    subject: 'biyoloji',
    modality: 'online',
    instructorName: 'elif aysu gündoğdu',
    rawStudents: [
      { name: 'Nursima Girgin', grade: '10. sınıf' },
      { name: 'Rabia Sinem Kaya', grade: '10. sınıf' },
      { name: 'Mukaddes Çekmez', grade: '10. sınıf' },
      { name: 'Hamza Askay', grade: '10. sınıf' },
      { name: 'Zine Özgün', grade: '10. sınıf' },
      { name: 'Hicret Duru Alabacak', grade: '10. sınıf' },
      { name: 'Ecrin Buse Çubukcu', grade: '10. sınıf' },
      { name: 'Nisanur Öngören', grade: '10. sınıf' },
      { name: 'Yağmur Kocaman', grade: '10. sınıf' },
      { name: 'İlknur Ateş', grade: '10. sınıf' },
      { name: 'Belinay Kadri', grade: '10. sınıf' },
      { name: 'Esma Naz Yarıcı', grade: '10. sınıf' },
      { name: 'Irmak Baytar', grade: '10. sınıf' },
      { name: 'Yunus Emre Tümkaya', grade: '10. sınıf' },
      { name: 'Senem Akın', grade: '10. sınıf' },
      { name: 'Aslı Enez', grade: '10. sınıf' },
      { name: 'Ufuk Yıldırım', grade: '10. sınıf' },
      { name: 'Şevval Durusoy', grade: '10. sınıf' },
      { name: 'Tuana Dereli', grade: '10. sınıf' },
      { name: 'Eslem Elif Aydoğdu', grade: '10. sınıf' },
      { name: 'Elif Su Torun', grade: '10. sınıf' },
      { name: 'Betül Pelit', grade: '10. sınıf' },
    ],
  },
  {
    id: 'online-10a-ing',
    gradeClass: '10/a',
    subject: 'ingilizce',
    modality: 'online',
    instructorName: 'dilanur arslan',
    rawStudents: [
      { name: 'Mukaddes Çekmez', grade: '10. sınıf' },
      { name: 'Aslı Enez', grade: '10. sınıf' },
      { name: 'Belinay Kadri', grade: '10. sınıf' },
      { name: 'Esma Naz Yarıcı', grade: '10. sınıf' },
      { name: 'Senem Akın', grade: '10. sınıf' },
      { name: 'Ufuk Yıldırım', grade: '10. sınıf' },
      { name: 'Şevval Durusoy', grade: '10. sınıf' },
      { name: 'Tuana Dereli', grade: '10. sınıf' },
      { name: 'Eslem Elif Aydoğdu', grade: '10. sınıf' },
      { name: 'Betül Pelit', grade: '10. sınıf' },
    ],
  },
  {
    id: 'online-11a-mat',
    gradeClass: '11/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'berat sarıca',
    rawStudents: [
      { name: 'Şükran Ravza Kaya', grade: '11. sınıf' },
      { name: 'Medine Erat', grade: '11. sınıf' },
      { name: 'İremsu Gençtürk', grade: '11. sınıf' },
      { name: 'Zeynep Orman', grade: '11. sınıf' },
      { name: 'Havva Solak', grade: '11. sınıf' },
      { name: 'Sedef Balaban', grade: '11. sınıf' },
      { name: 'Dua Yağmur Akgeyik', grade: '11. sınıf' },
      { name: 'Miray Denli', grade: '11. sınıf' },
      { name: 'Nurşin Emen', grade: '11. sınıf' },
      { name: 'Diren Evran', grade: '11. sınıf' },
      { name: 'Reyyan Irmak Cantimur', grade: '11. sınıf' },
      { name: 'Fatma Cemre Kıllı', grade: '11. sınıf' },
      { name: 'Sıdıka Nur Sürmeli', grade: '11. sınıf' },
      { name: 'Gözde Naz Sağ', grade: '11. sınıf' },
      { name: 'Zeynep Güzel', grade: '11. sınıf' },
      { name: 'Sude Akgün', grade: '11. sınıf' },
      { name: 'Havin Okur', grade: '11. sınıf' },
      { name: 'Büşra Şimşek', grade: '11. sınıf' },
      { name: 'Nisanur Çakas', grade: '11. sınıf' },
      { name: 'Kübra Varol', grade: '11. sınıf' },
      { name: 'İlim Rüzgar Akcan', grade: '11. sınıf' },
      { name: 'Hiranur Özen', grade: '11. sınıf' },
      { name: 'Necati Dağ', grade: '11. sınıf' },
      { name: 'Fatıma Sena Böyük', grade: '11. sınıf' },
      { name: 'Melek Necmiye Kaş', grade: '11. sınıf' },
      { name: 'Meryem Tekin', grade: '11. sınıf' },
      { name: 'Melisa Aktan', grade: '11. sınıf' },
    ],
  },
  {
    id: 'online-11a-edb',
    gradeClass: '11/a',
    subject: 'türk dili ve edebiyatı',
    modality: 'online',
    instructorName: 'cem yağız tolun',
    rawStudents: [
      { name: 'Sedef Balaban', grade: '11. sınıf' },
      { name: 'Miray Denli', grade: '11. sınıf' },
      { name: 'Kübra Varol', grade: '11. sınıf' },
      { name: 'İlim Rüzgar Akcan', grade: '11. sınıf' },
      { name: 'Fatıma Sena Böyük', grade: '11. sınıf' },
      { name: 'Meryem Tekin', grade: '11. sınıf' },
      { name: 'Melisa Aktan', grade: '11. sınıf' },
    ],
  },
  {
    id: 'online-11a-fiz',
    gradeClass: '11/a',
    subject: 'fizik',
    modality: 'online',
    instructorName: 'gülperi purtaş',
    rawStudents: [
      { name: 'Şükran Ravza Kaya', grade: '11. sınıf' },
      { name: 'İremsu Gençtürk', grade: '11. sınıf' },
      { name: 'Zeynep Orman', grade: '11. sınıf' },
      { name: 'Reyyan Irmak Cantimur', grade: '11. sınıf' },
      { name: 'Fatma Cemre Kıllı', grade: '11. sınıf' },
      { name: 'Sıdıka Nur Sürmeli', grade: '11. sınıf' },
      { name: 'Gözde Naz Sağ', grade: '11. sınıf' },
      { name: 'Zeynep Güzel', grade: '11. sınıf' },
      { name: 'Sude Akgün', grade: '11. sınıf' },
      { name: 'Havin Okur', grade: '11. sınıf' },
      { name: 'Büşra Şimşek', grade: '11. sınıf' },
      { name: 'Nisanur Çakas', grade: '11. sınıf' },
      { name: 'Kübra Varol', grade: '11. sınıf' },
      { name: 'Hiranur Özen', grade: '11. sınıf' },
      { name: 'Fatıma Sena Böyük', grade: '11. sınıf' },
      { name: 'Melek Necmiye Kaş', grade: '11. sınıf' },
    ],
  },
  {
    id: 'online-11a-kim',
    gradeClass: '11/a',
    subject: 'kimya',
    modality: 'online',
    instructorName: 'elif nur demir',
    rawStudents: [
      { name: 'Şükran Ravza Kaya', grade: '11. sınıf' },
      { name: 'İremsu Gençtürk', grade: '11. sınıf' },
      { name: 'Zeynep Orman', grade: '11. sınıf' },
      { name: 'Havva Solak', grade: '11. sınıf' },
      { name: 'Dua Yağmur Akgeyik', grade: '11. sınıf' },
      { name: 'Reyyan Irmak Cantimur', grade: '11. sınıf' },
      { name: 'Fatma Cemre Kıllı', grade: '11. sınıf' },
      { name: 'Sıdıka Nur Sürmeli', grade: '11. sınıf' },
      { name: 'Gözde Naz Sağ', grade: '11. sınıf' },
      { name: 'Zeynep Güzel', grade: '11. sınıf' },
      { name: 'Sude Akgün', grade: '11. sınıf' },
      { name: 'Havin Okur', grade: '11. sınıf' },
      { name: 'Büşra Şimşek', grade: '11. sınıf' },
      { name: 'Kübra Varol', grade: '11. sınıf' },
      { name: 'Hiranur Özen', grade: '11. sınıf' },
      { name: 'Fatıma Sena Böyük', grade: '11. sınıf' },
      { name: 'Melek Necmiye Kaş', grade: '11. sınıf' },
    ],
  },
  {
    id: 'online-11a-biy',
    gradeClass: '11/a',
    subject: 'biyoloji',
    modality: 'online',
    instructorName: 'yusuf enes aktepe',
    rawStudents: [
      { name: 'Şükran Ravza Kaya', grade: '11. sınıf' },
      { name: 'İremsu Gençtürk', grade: '11. sınıf' },
      { name: 'Sedef Balaban', grade: '11. sınıf' },
      { name: 'Fatma Cemre Kıllı', grade: '11. sınıf' },
      { name: 'Sıdıka Nur Sürmeli', grade: '11. sınıf' },
      { name: 'Gözde Naz Sağ', grade: '11. sınıf' },
      { name: 'Zeynep Güzel', grade: '11. sınıf' },
      { name: 'Sude Akgün', grade: '11. sınıf' },
      { name: 'Havin Okur', grade: '11. sınıf' },
      { name: 'Büşra Şimşek', grade: '11. sınıf' },
      { name: 'Kübra Varol', grade: '11. sınıf' },
      { name: 'Reyyan Irmak Cantimur', grade: '11. sınıf' },
      { name: 'Fatıma Sena Böyük', grade: '11. sınıf' },
    ],
  },
  {
    id: 'online-12a-mat',
    gradeClass: '12/a',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'kaan zeybel',
    rawStudents: [
      { name: 'Esranur Köksal', grade: '12. sınıf' },
      { name: 'Azra Yapıcı', grade: '12. sınıf' },
      { name: 'Emine Elif Gündüz', grade: '12. sınıf' },
      { name: 'İrem Adsız', grade: '12. sınıf' },
      { name: 'Kubilay Yapıcı', grade: '12. sınıf' },
      { name: 'Pınar Öğle', grade: '12. sınıf' },
      { name: 'Zeynep Araz', grade: '12. sınıf' },
      { name: 'Sultan Karasungur', grade: '12. sınıf' },
      { name: 'Beril Tuana Ateş', grade: '12. sınıf' },
      { name: 'Hatice Aysima Gözen', grade: '12. sınıf' },
      { name: 'Hira Burgi', grade: '12. sınıf' },
      { name: 'Ayşe Kaya', grade: '12. sınıf' },
      { name: 'Sudenaz Yalçın', grade: '12. sınıf' },
      { name: 'Miraç Mustafa Şişman', grade: '12. sınıf' },
    ],
  },
  {
    id: 'online-12a-edb',
    gradeClass: '12/a',
    subject: 'türk dili ve edebiyatı',
    modality: 'online',
    instructorName: 'büşra tenbel',
    rawStudents: [
      { name: 'Hatice Aysima Gözen', grade: '12. sınıf' },
      { name: 'Ayşe Kaya', grade: '12. sınıf' },
      { name: 'Miraç Mustafa Şişman', grade: '12. sınıf' },
      { name: 'İkra Nur Oğuz', grade: 'mezun' },
      { name: 'Yakup Şafak Söğüt', grade: 'mezun' },
    ],
  },
  {
    id: 'online-12a-fiz',
    gradeClass: '12/a',
    subject: 'fizik',
    modality: 'online',
    instructorName: 'sena zorla',
    rawStudents: [
      { name: 'Esranur Köksal', grade: '12. sınıf' },
      { name: 'Azra Yapıcı', grade: '12. sınıf' },
      { name: 'İrem Adsız', grade: '12. sınıf' },
      { name: 'Kubilay Yapıcı', grade: '12. sınıf' },
      { name: 'Pınar Öğle', grade: '12. sınıf' },
      { name: 'Zeynep Araz', grade: '12. sınıf' },
      { name: 'Sultan Karasungur', grade: '12. sınıf' },
      { name: 'Beril Tuana Ateş', grade: '12. sınıf' },
      { name: 'Ayşe Kaya', grade: '12. sınıf' },
      { name: 'Sudenaz Yalçın', grade: '12. sınıf' },
      { name: 'Miraç Mustafa Şişman', grade: '12. sınıf' },
    ],
  },
  {
    id: 'online-12a-kim',
    gradeClass: '12/a',
    subject: 'kimya',
    modality: 'online',
    instructorName: 'besim değirmenci',
    rawStudents: [
      { name: 'İrem Adsız', grade: '12. sınıf' },
      { name: 'Zeynep Araz', grade: '12. sınıf' },
      { name: 'Sultan Karasungur', grade: '12. sınıf' },
      { name: 'Beril Tuana Ateş', grade: '12. sınıf' },
      { name: 'Ayşe Kaya', grade: '12. sınıf' },
      { name: 'Sudenaz Yalçın', grade: '12. sınıf' },
      { name: 'Miraç Mustafa Şişman', grade: '12. sınıf' },
    ],
  },
  {
    id: 'online-12a-biy',
    gradeClass: '12/a',
    subject: 'biyoloji',
    modality: 'online',
    instructorName: 'sami kaya',
    rawStudents: [
      { name: 'İrem Adsız', grade: '12. sınıf' },
      { name: 'Zeynep Araz', grade: '12. sınıf' },
      { name: 'Sultan Karasungur', grade: '12. sınıf' },
      { name: 'Ayşe Kaya', grade: '12. sınıf' },
      { name: 'Sudenaz Yalçın', grade: '12. sınıf' },
      { name: 'Miraç Mustafa Şişman', grade: '12. sınıf' },
      { name: 'Havin Kaya', grade: 'mezun' },
      { name: 'Sevgi Elbuğa', grade: 'mezun' },
      { name: 'İkbal Kara', grade: 'mezun' },
      { name: 'Merve Tekin', grade: 'mezun' },
      { name: 'Ceren Çaptuğ', grade: 'mezun' },
      { name: 'Cansu Özörnek', grade: 'mezun' },
      { name: 'Nurcan Burgi', grade: 'mezun' },
      { name: 'Melisa Özlener', grade: 'mezun' },
      { name: 'Helin İrem Karaman', grade: 'mezun' },
      { name: 'Fatma Yaren Pınar', grade: 'mezun' },
    ],
  },
  {
    id: 'online-mezun-mat',
    gradeClass: 'mezun',
    subject: 'matematik',
    modality: 'online',
    instructorName: 'hanımnur ılgın',
    rawStudents: [
      { name: 'Halime Alatay', grade: 'mezun' },
      { name: 'Havin Kaya', grade: 'mezun' },
      { name: 'İrem Rümeysa Ersan', grade: 'mezun' },
      { name: 'İkbal Kara', grade: 'mezun' },
      { name: 'Merve Tekin', grade: 'mezun' },
      { name: 'Ceren Çaptuğ', grade: 'mezun' },
      { name: 'Cansu Özörnek', grade: 'mezun' },
      { name: 'Aleyna Cepni', grade: 'mezun' },
      { name: 'Nurcan Burgi', grade: 'mezun' },
      { name: 'İkra Nur Oğuz', grade: 'mezun' },
      { name: 'Melisa Özlener', grade: 'mezun' },
      { name: 'Yakup Şafak Söğüt', grade: 'mezun' },
      { name: 'Fatma Yaren Pınar', grade: 'mezun' },
    ],
  },
  {
    id: 'online-mezun-fiz',
    gradeClass: 'mezun',
    subject: 'fizik',
    modality: 'online',
    instructorName: 'eymen er',
    rawStudents: [
      { name: 'İclal Acar', grade: 'mezun' },
      { name: 'Havin Kaya', grade: 'mezun' },
      { name: 'Sevgi Elbuğa', grade: 'mezun' },
      { name: 'Zilan Amara Carus', grade: 'mezun' },
      { name: 'İkbal Kara', grade: 'mezun' },
      { name: 'Merve Tekin', grade: 'mezun' },
      { name: 'Ceren Çaptuğ', grade: 'mezun' },
      { name: 'Cansu Özörnek', grade: 'mezun' },
      { name: 'Aleyna Cepni', grade: 'mezun' },
      { name: 'Nurcan Burgi', grade: 'mezun' },
      { name: 'Melisa Özlener', grade: 'mezun' },
      { name: 'Helin İrem Karaman', grade: 'mezun' },
      { name: 'Fatma Yaren Pınar', grade: 'mezun' },
    ],
  },
  {
    id: 'online-mezun-kim',
    gradeClass: 'mezun',
    subject: 'kimya',
    modality: 'online',
    instructorName: 'elanur şanda',
    rawStudents: [
      { name: 'Havin Kaya', grade: 'mezun' },
      { name: 'Sevgi Elbuğa', grade: 'mezun' },
      { name: 'İkbal Kara', grade: 'mezun' },
      { name: 'Merve Tekin', grade: 'mezun' },
      { name: 'Ceren Çaptuğ', grade: 'mezun' },
      { name: 'Cansu Özörnek', grade: 'mezun' },
      { name: 'Nurcan Burgi', grade: 'mezun' },
      { name: 'Melisa Özlener', grade: 'mezun' },
      { name: 'Helin İrem Karaman', grade: 'mezun' },
      { name: 'Yakup Şafak Söğüt', grade: 'mezun' },
      { name: 'Fatma Yaren Pınar', grade: 'mezun' },
    ],
  },
  {
    id: 'online-tyt-tur',
    gradeClass: 'tyt',
    subject: 'türkçe',
    modality: 'online',
    instructorName: 'bos4',
    alias: 'bos4',
    rawStudents: [
      { name: 'Fidan Kaya', grade: '9. sınıf' },
      { name: 'Ayberk Şalgam', grade: '9. sınıf' },
      { name: 'Barış Yıldızbaş', grade: '9. sınıf' },
      { name: 'Ufuk Yıldırım', grade: '10. sınıf' },
      { name: 'Şevval Durusoy', grade: '10. sınıf' },
      { name: 'Tuana Dereli', grade: '10. sınıf' },
      { name: 'Eslem Elif Aydoğdu', grade: '10. sınıf' },
      { name: 'Şükran Ravza Kaya', grade: '11. sınıf' },
      { name: 'Medine Erat', grade: '11. sınıf' },
      { name: 'İremsu Gençtürk', grade: '11. sınıf' },
      { name: 'Dua Yağmur Akgeyik', grade: '11. sınıf' },
      { name: 'Büşra Şimşek', grade: '11. sınıf' },
      { name: 'Kübra Varol', grade: '11. sınıf' },
      { name: 'Fatma Cemre Kıllı', grade: '11. sınıf' },
      { name: 'Reyyan Irmak Cantimur', grade: '11. sınıf' },
      { name: 'Hiranur Özen', grade: '11. sınıf' },
      { name: 'Fatıma Sena Böyük', grade: '11. sınıf' },
      { name: 'Hatice Aysima Gözen', grade: '12. sınıf' },
      { name: 'Ayşe Kaya', grade: '12. sınıf' },
      { name: 'Miraç Mustafa Şişman', grade: '12. sınıf' },
      { name: 'Havin Kaya', grade: 'mezun' },
      { name: 'Zeynep Taymur', grade: 'mezun' },
      { name: 'Merve Tekin', grade: 'mezun' },
      { name: 'Ceren Çaptuğ', grade: 'mezun' },
      { name: 'İkra Nur Oğuz', grade: 'mezun' },
      { name: 'Yakup Şafak Söğüt', grade: 'mezun' },
      { name: 'Hazal Burus', grade: '9. sınıf' },
      { name: 'Talha Berk Ünsal', grade: '9. sınıf' },
      { name: 'Recep Aras Şahbazer', grade: '9. sınıf' },
    ],
  },
];

// ================= YÜZ YÜZE CLASSES (UNION OF ALL STUDENTS PER CLASS) =================
// Rule: "yüz yüzedeki öğrenciler sadece seçtiği dersleri değil, bütün dersleri alıyorlar.
// her sınıf için (5a 5b 6a 6b 7a 7b 8a) o sınıfın altında yazan bütün öğrencileri birleştir."

const YUZYUZE_5A_STUDENTS = [
  'Arda Deniz Bal',
  'Begüm Ece Uluçay',
  'Beren Apaydın',
  'Defne Çiçek Özorman',
  'Defne Gür',
  'Defne Nil Aksu',
  'Defne Zeynep Memiş',
  'Dilara Tehik',
  'Elif Duran',
  'Eymen Akbıyık',
  'Eymen Bozkurt',
  'Görkem Yavuz',
  'İbrahim Atasoy',
  'Miray Ada Kuyucu',
  'Muhammed Ali Karaca',
  'Yusufhan Ekren',
].map(name => ({ name, grade: '5/a yüz yüze' }));

const YUZYUZE_5B_STUDENTS = [
  'Beren Apaydın',
  'Dilara Tehik',
  'Kadriye Zid',
  'Mustafa Yağız Vergili',
  'Nefes Özen',
  'Nisanur Varol',
  'Robin Polat',
  'Ruken Yağız',
  'Rüzgar Gedik',
  'Sevde Teke',
  'Şerife Sena Süzmeçelik',
  'Tarık Pars Bulut',
  'Yiğit Ali Gezer',
  'Yusuf Kerem Bulduk',
  'Yusuf Varol',
  'Yusufhan Ekren',
].map(name => ({ name, grade: '5/b yüz yüze' }));

const YUZYUZE_6A_STUDENTS = [
  'Ali Kerem Türkmenli',
  'Alya Mina Hasbal',
  'Ayaz Yankı Günel',
  'Emir Aksoy',
  'Havin Salman',
  'Hüseyin Poyraz Güneş',
  'Irmak Sevde Aksu',
  'İncisu Baytar',
  'Kahraman Timur Tehik',
  'Kenan Öz',
  'Lorin Erdal',
  'Mert Yılmaz',
  'Murat Yüksek',
].map(name => ({ name, grade: '6/a yüz yüze' }));

const YUZYUZE_6B_STUDENTS = [
  'Nisa Tahhuşoğlu',
  'Nisaderin Çapan',
  'Ömer Aras Karadağ',
  'Poyraz Durkut',
  'Safa Genç',
  'Ümmü Gülsüm Bayrak',
  'Yaprak Zeyneb Aksu',
  'Yusuf Ali Cantürk',
  'Zeynep Sare Atasoy',
  'Zümra Beril Varol',
].map(name => ({ name, grade: '6/b yüz yüze' }));

const YUZYUZE_7A_STUDENTS = [
  'Anıl Abdal',
  'Asya Özekin',
  'Azra Melek Ecevit',
  'Beren Çetinkaya',
  'Cemre Akkuş',
  'Çınar Sofuoğlu',
  'Deniz Burçin Argın',
  'Derin Savaş',
  'Elis Arhın',
  'F. Mira Gün',
  'Güneş Dua Akcan',
  'Hazal Rüya Yılmaz',
  'Kerem Günel',
  'Mina İnal',
  'Miran Bayram',
].map(name => ({ name, grade: '7/a yüz yüze' }));

const YUZYUZE_7B_STUDENTS = [
  'Müslüm Ekren',
  'Nail Tunç',
  'Nazlı Navruz',
  'Nisa Aydın',
  'Nisa Yağmur Dirilmiş',
  'Özge Nil Kendir',
  'Suden Şekerci',
  'Şahin Onur Gökçe',
  'Taner Özcan',
  'Yiğit Efe Kılıç',
  'Yusuf Ayaz Mercan',
  'Zeynep Bulduk',
  'Zeynep Mira Top',
  'Zeynep Navruz',
  'Zümra Karaman',
].map(name => ({ name, grade: '7/b yüz yüze' }));

const YUZYUZE_8A_STUDENTS = [
  'Alya Duru Dündar',
  'Beren Asya Ayra',
  'Damla Karabacak',
  'Derin Nazlı Sarıyar',
  'Dilem Nudem Doğan',
  'Elif Neva Zor',
  'Elif Nisa Cantürk',
  'Emir Ali Bayram',
  'Esila Tanem Kavutcu',
  'Eylül Duru Acar',
  'Halil İbrahim Bayram',
  'Kuzey Doğan',
  'Liva Nur Yılmaz',
  'Mehmet Fettah Salman',
  'Nehir Teber',
  'Sude Nil İpek',
  'Talha Yıldırım',
  'Tanem Gedleç',
].map(name => ({ name, grade: '8/a yüz yüze' }));

const YUZYUZE_COURSES: RawCourseDef[] = [
  // 5/A
  { id: 'yy-5a-mat', gradeClass: '5/a', subject: 'matematik', modality: 'yuzyuze', instructorName: 'habil demirtaş', rawStudents: YUZYUZE_5A_STUDENTS },
  {
    id: 'yy-5a-tur',
    gradeClass: '5/a',
    subject: 'türkçe',
    modality: 'yuzyuze',
    instructorName: 'sümeyye nur yıldırım',
    rawStudents: YUZYUZE_5A_STUDENTS,
    initialWeek1Tracked: true,
    initialWeek1Absents: ['Arda Deniz Bal', 'Defne Gür', 'Defne Nil Aksu', 'Dilara Tehik', 'Eymen Bozkurt'],
  },
  { id: 'yy-5a-fen', gradeClass: '5/a', subject: 'fen bilimleri', modality: 'yuzyuze', instructorName: 'rana bıyıklıoğlu', rawStudents: YUZYUZE_5A_STUDENTS },
  { id: 'yy-5a-sos', gradeClass: '5/a', subject: 'sosyal bilgiler', modality: 'yuzyuze', instructorName: 'rabia kılbaş', rawStudents: YUZYUZE_5A_STUDENTS },
  { id: 'yy-5a-ing', gradeClass: '5/a', subject: 'ingilizce', modality: 'yuzyuze', instructorName: 'betül nazlı uçmaz', rawStudents: YUZYUZE_5A_STUDENTS },
  // 5/B
  { id: 'yy-5b-mat', gradeClass: '5/b', subject: 'matematik', modality: 'yuzyuze', instructorName: 'fatma nisa akdoğan', rawStudents: YUZYUZE_5B_STUDENTS },
  { id: 'yy-5b-tur', gradeClass: '5/b', subject: 'türkçe', modality: 'yuzyuze', instructorName: 'ayşegül zümra', rawStudents: YUZYUZE_5B_STUDENTS },
  { id: 'yy-5b-fen', gradeClass: '5/b', subject: 'fen bilimleri', modality: 'yuzyuze', instructorName: 'selvinaz nalbantoğlu', rawStudents: YUZYUZE_5B_STUDENTS },
  { id: 'yy-5b-sos', gradeClass: '5/b', subject: 'sosyal bilgiler', modality: 'yuzyuze', instructorName: 'rabia kılbaş', rawStudents: YUZYUZE_5B_STUDENTS },
  { id: 'yy-5b-ing', gradeClass: '5/b', subject: 'ingilizce', modality: 'yuzyuze', instructorName: 'betül nazlı uçmaz', rawStudents: YUZYUZE_5B_STUDENTS },
  // 6/A
  { id: 'yy-6a-mat', gradeClass: '6/a', subject: 'matematik', modality: 'yuzyuze', instructorName: 'merve arslan', rawStudents: YUZYUZE_6A_STUDENTS },
  { id: 'yy-6a-tur', gradeClass: '6/a', subject: 'türkçe', modality: 'yuzyuze', instructorName: 'nurbanu aksu', rawStudents: YUZYUZE_6A_STUDENTS },
  { id: 'yy-6a-fen', gradeClass: '6/a', subject: 'fen bilimleri', modality: 'yuzyuze', instructorName: 'abdülselam kılınç', rawStudents: YUZYUZE_6A_STUDENTS },
  { id: 'yy-6a-sos', gradeClass: '6/a', subject: 'sosyal bilgiler', modality: 'yuzyuze', instructorName: 'berra sarı', rawStudents: YUZYUZE_6A_STUDENTS },
  { id: 'yy-6a-ing', gradeClass: '6/a', subject: 'ingilizce', modality: 'yuzyuze', instructorName: 'berra nur kutuzman', rawStudents: YUZYUZE_6A_STUDENTS },
  // 6/B
  { id: 'yy-6b-mat', gradeClass: '6/b', subject: 'matematik', modality: 'yuzyuze', instructorName: 'seldanur imrek', rawStudents: YUZYUZE_6B_STUDENTS },
  { id: 'yy-6b-tur', gradeClass: '6/b', subject: 'türkçe', modality: 'yuzyuze', instructorName: 'elif özkan', rawStudents: YUZYUZE_6B_STUDENTS },
  { id: 'yy-6b-fen', gradeClass: '6/b', subject: 'fen bilimleri', modality: 'yuzyuze', instructorName: 'zeynep sönmez', rawStudents: YUZYUZE_6B_STUDENTS },
  { id: 'yy-6b-sos', gradeClass: '6/b', subject: 'sosyal bilgiler', modality: 'yuzyuze', instructorName: 'zeynep uzun', rawStudents: YUZYUZE_6B_STUDENTS },
  { id: 'yy-6b-ing', gradeClass: '6/b', subject: 'ingilizce', modality: 'yuzyuze', instructorName: 'nehir yumurtacı', rawStudents: YUZYUZE_6B_STUDENTS },
  // 7/A
  { id: 'yy-7a-mat', gradeClass: '7/a', subject: 'matematik', modality: 'yuzyuze', instructorName: 'meldanur okumuş', rawStudents: YUZYUZE_7A_STUDENTS },
  { id: 'yy-7a-tur', gradeClass: '7/a', subject: 'türkçe', modality: 'yuzyuze', instructorName: 'melek yılmaz', rawStudents: YUZYUZE_7A_STUDENTS },
  { id: 'yy-7a-fen', gradeClass: '7/a', subject: 'fen bilimleri', modality: 'yuzyuze', instructorName: 'rukiye dağcı', rawStudents: YUZYUZE_7A_STUDENTS },
  { id: 'yy-7a-sos', gradeClass: '7/a', subject: 'sosyal bilgiler', modality: 'yuzyuze', instructorName: 'zeynep çetin', rawStudents: YUZYUZE_7A_STUDENTS },
  { id: 'yy-7a-ing', gradeClass: '7/a', subject: 'ingilizce', modality: 'yuzyuze', instructorName: 'şevval arıcı', rawStudents: YUZYUZE_7A_STUDENTS },
  // 7/B
  { id: 'yy-7b-mat', gradeClass: '7/b', subject: 'matematik', modality: 'yuzyuze', instructorName: 'begüm su kökçü', rawStudents: YUZYUZE_7B_STUDENTS },
  {
    id: 'yy-7b-tur',
    gradeClass: '7/b',
    subject: 'türkçe',
    modality: 'yuzyuze',
    instructorName: 'zehra bağır',
    rawStudents: YUZYUZE_7B_STUDENTS,
    initialWeek1Tracked: true,
    initialWeek1Absents: ['Nail Tunç', 'Nazlı Navruz', 'Nisa Aydın', 'Şahin Onur Gökçe', 'Yiğit Efe Kılıç', 'Yusuf Ayaz Mercan', 'Zeynep Navruz', 'Zümra Karaman'],
  },
  {
    id: 'yy-7b-fen',
    gradeClass: '7/b',
    subject: 'fen bilimleri',
    modality: 'yuzyuze',
    instructorName: 'ebru yıldırım',
    rawStudents: YUZYUZE_7B_STUDENTS,
    initialWeek1Tracked: true,
    initialWeek1Absents: ['Nail Tunç', 'Nazlı Navruz', 'Nisa Aydın', 'Yiğit Efe Kılıç', 'Zeynep Navruz'],
  },
  { id: 'yy-7b-sos', gradeClass: '7/b', subject: 'sosyal bilgiler', modality: 'yuzyuze', instructorName: 'vedat fidan', rawStudents: YUZYUZE_7B_STUDENTS },
  { id: 'yy-7b-ing', gradeClass: '7/b', subject: 'ingilizce', modality: 'yuzyuze', instructorName: 'sündüz yaren turan', rawStudents: YUZYUZE_7B_STUDENTS },
  // 8/A
  {
    id: 'yy-8a-mat',
    gradeClass: '8/a',
    subject: 'matematik',
    modality: 'yuzyuze',
    instructorName: 'ayşegül kayacık',
    rawStudents: YUZYUZE_8A_STUDENTS,
    initialWeek1Tracked: true,
    initialWeek1Absents: ['Esila Tanem Kavutcu', 'Beren Asya Ayra', 'Emir Ali Bayram', 'Halil İbrahim Bayram', 'Sude Nil İpek', 'Derin Nazlı Sarıyar', 'Mehmet Fettah Salman', 'Damla Karabacak'],
  },
  { id: 'yy-8a-tur', gradeClass: '8/a', subject: 'türkçe', modality: 'yuzyuze', instructorName: 'bekir toprak bilgin', rawStudents: YUZYUZE_8A_STUDENTS },
  { id: 'yy-8a-fen', gradeClass: '8/a', subject: 'fen bilimleri', modality: 'yuzyuze', instructorName: 'elifnur meriç', rawStudents: YUZYUZE_8A_STUDENTS },
  { id: 'yy-8a-sos', gradeClass: '8/a', subject: 'sosyal bilgiler', modality: 'yuzyuze', instructorName: 'kaan orhan', rawStudents: YUZYUZE_8A_STUDENTS },
  { id: 'yy-8a-ing', gradeClass: '8/a', subject: 'ingilizce', modality: 'yuzyuze', instructorName: 'jana abdullah', rawStudents: YUZYUZE_8A_STUDENTS },
];

/**
 * Tek merkezi isim normalizasyon fonksiyonu (Requirement 1):
 * - Unicode NFC
 * - Görünmez karakterleri (zero-width, soft-hyphen, BOM) temizler
 * - NBSP ve özel boşlukları standart boşluğa çevirir
 * - tr-TR kurallarıyla küçük harf (I -> ı, İ -> i)
 * - Noktalama işaretlerini ve çift boşlukları sadeleştirir
 * - Baştaki ve sondaki boşlukları kırpar
 */
export function normalizeName(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/i\u0307/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/[.,…!?;:()[\]"'«»„“”’‘`~@#$%^&*+=<>|\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Genel metin normalizasyonu (sınıf/şube etiketlerinde "/" karakterini koruyarak normalizeName kurallarını uygular).
 */
export function normalizeTurkish(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/i\u0307/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Türkçe karakterleri doğru dönüştüren (ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c) ve belge kimliği için güvenli slug üreten fonksiyon.
 */
export function slugifyTurkish(str: string): string {
  return normalizeName(str)
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * KURAL: Öğrenci kimliği = "stu-" + slug(normalizeName(ad))
 */
export function buildStudentIdFromName(rawName: string): string {
  const slug = slugifyTurkish(normalizeName(rawName));
  return slug ? `stu-${slug}` : '';
}

/**
 * KURAL 2b: "bos1, bos2…" veya "adını öğrenip giricem" gibi yer tutucu kayıtlar gerçek öğrenci sayılmaz;
 * bunlara isim eşleştirme kuralı uygulanmaz.
 */
export function isPlaceholderStudentName(rawName: string): boolean {
  const norm = normalizeName(rawName);
  if (!norm) return true;
  if (/^bos\d+$/i.test(norm)) return true;
  if (
    norm.includes('adını öğrenip giricem') ||
    norm.includes('soyadını bilmiyorum') ||
    norm.includes('soya adı') ||
    norm === 'isimsiz'
  ) {
    return true;
  }
  return false;
}

// Yerleşik PDF listelerinde bilinen eksik ikinci ad / birleşik yazım eşleştirmeleri
const BUILTIN_CANONICAL_NAME_MAP: Record<string, string> = {
  'aynurnisa ipek': 'aynur nisa ipek',
  'abdullah kaya': 'abdullah muhammed kaya',
  'miraç çetinkaya': 'mirac ali çetinkaya',
  'zeynep öykü': 'zeynep öykü ören',
  'reyyan cantimur': 'reyyan ırmak cantimur',
  'cemre kıllı': 'fatma cemre kıllı',
  'şerife sena süzme çelik': 'şerife sena süzmeçelik',
  'damla karacabacak': 'damla karabacak',
  'buse çubukçu': 'ecrin buse çubukcu',
  'buse çubukcu': 'ecrin buse çubukcu',
  'ecrin buse çubukçu': 'ecrin buse çubukcu',
  'f mira gün': 'f. mira gün',
  'mira gün': 'f. mira gün',
  'bahar nas eruğ': 'bahar nas eruz',
  'derin sofuğlu': 'derin sofuoğlu',
  'poyraz durgut': 'poyraz durkut',
};

export function getCanonicalStudentName(rawName: string, useBuiltinMap = false): string {
  const norm = normalizeName(rawName);
  if (!norm) return '';
  if (useBuiltinMap && BUILTIN_CANONICAL_NAME_MAP[norm]) {
    return BUILTIN_CANONICAL_NAME_MAP[norm];
  }
  return norm;
}

// Build complete normalized database
function buildDatabase() {
  const studentsMap = new Map<string, Student>();
  const instructorsMap = new Map<string, Instructor>();
  const coursesList: Course[] = [];
  const initialAttendanceRecords: AttendanceRecord[] = [];

  const allRawCourses = [...RAW_COURSES, ...YUZYUZE_COURSES];

  for (const rc of allRawCourses) {
    const instNormName = normalizeName(rc.instructorName);
    const instId = `inst-${slugifyTurkish(instNormName)}`;

    let instructor = instructorsMap.get(instId);
    if (!instructor) {
      const parts = instNormName.split(' ');
      const firstName = parts[0];
      const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
      instructor = {
        id: instId,
        name: instNormName,
        firstName,
        lastName,
        modality: rc.modality,
        courseIds: [],
        alias: rc.alias,
      };
      instructorsMap.set(instId, instructor);
    }
    if (!instructor.courseIds.includes(rc.id)) {
      instructor.courseIds.push(rc.id);
    }

    const courseStudentIds: string[] = [];

    for (const rs of rc.rawStudents) {
      if (/^bos\d+$/i.test(normalizeName(rs.name))) continue;
      const canonicalDisplay = getCanonicalStudentName(rs.name, true);
      const normName = normalizeName(canonicalDisplay);
      const studentId = buildStudentIdFromName(normName);
      if (!studentId) continue;

      let student = studentsMap.get(studentId);
      if (!student) {
        student = {
          id: studentId,
          name: canonicalDisplay === 'f. mira gün' ? 'f. mira gün' : normName,
          grade: normalizeTurkish(rs.grade),
          modality: rc.modality,
          enrolledCourseIds: [],
          notes: rs.note ? normalizeTurkish(rs.note) : undefined,
        };
        studentsMap.set(studentId, student);
      }

      if (!student.enrolledCourseIds.includes(rc.id)) {
        student.enrolledCourseIds.push(rc.id);
      }
      if (!courseStudentIds.includes(studentId)) {
        courseStudentIds.push(studentId);
      }
    }

    // Sort students alphabetically in each course
    courseStudentIds.sort((a, b) => {
      const sa = studentsMap.get(a)?.name || '';
      const sb = studentsMap.get(b)?.name || '';
      return sa.localeCompare(sb, 'tr-TR');
    });

    const modalityLabel = rc.modality === 'online' ? 'çevrim içi' : 'yüz yüze';
    coursesList.push({
      id: rc.id,
      title: `${rc.gradeClass} ${rc.subject} (${modalityLabel})`,
      shortTitle: `${rc.gradeClass} ${rc.subject}`,
      gradeClass: rc.gradeClass,
      subject: rc.subject,
      modality: rc.modality,
      instructorId: instId,
      instructorName: instNormName,
      studentIds: courseStudentIds,
    });
  }

  return {
    students: Array.from(studentsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR')),
    instructors: Array.from(instructorsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR')),
    courses: coursesList,
    initialAttendanceRecords,
  };
}

export const BASE_DB = buildDatabase();
export const DB = buildDatabase();

// Global runtime alias map from legacy/duplicate IDs (e.g. stu_<random>) to canonical stu-<slug>
export const STUDENT_ID_ALIAS_MAP = new Map<string, string>();

export function resolveCanonicalStudentId(studentId: string): string {
  if (!studentId) return studentId;
  return STUDENT_ID_ALIAS_MAP.get(studentId) || studentId;
}

export function canonicalizeAttendanceRecordIds(record: AttendanceRecord): AttendanceRecord {
  const mappedIds = Array.from(
    new Set((record.absentStudentIds || []).map(id => resolveCanonicalStudentId(id)))
  );
  return {
    ...record,
    absentStudentIds: mappedIds,
  };
}

function toCanonicalStudentIdForPair(idOrName: string): string {
  const trimmed = (idOrName || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('stu-') || trimmed.startsWith('stu_')) {
    return resolveCanonicalStudentId(trimmed);
  }
  return buildStudentIdFromName(trimmed);
}

/**
 * Requirement 1 & 6:
 * Her kayıt iki öğrenci kimliğinin sıralı çiftidir (belge kimliği: küçük kimlik + "__" + büyük kimlik;
 * böylece A-B ile B-A aynı kayıt olur).
 */
export function buildNotDuplicatePairId(
  idOrName1: string,
  idOrName2: string
): { id: string; studentIdA: string; studentIdB: string } | null {
  const a = toCanonicalStudentIdForPair(idOrName1);
  const b = toCanonicalStudentIdForPair(idOrName2);
  if (!a || !b || a === b) return null;
  const studentIdA = a < b ? a : b;
  const studentIdB = a < b ? b : a;
  return {
    id: `${studentIdA}__${studentIdB}`,
    studentIdA,
    studentIdB,
  };
}

/**
 * Bir çift not_duplicates listesindeyse true döner.
 * Kural 3: Birebir aynı kimlik veya aynı normalize isim için asla true dönmez.
 */
export function isPairIgnoredAsNotDuplicate(
  idOrName1: string,
  idOrName2: string,
  notDuplicatePairs: NotDuplicatePairRecord[] = []
): boolean {
  if (!notDuplicatePairs || notDuplicatePairs.length === 0) return false;
  const pair = buildNotDuplicatePairId(idOrName1, idOrName2);
  if (!pair) return false;
  for (const rec of notDuplicatePairs) {
    if (rec.id === pair.id) return true;
    const recPair = buildNotDuplicatePairId(rec.studentIdA, rec.studentIdB);
    if (recPair && recPair.id === pair.id) return true;
  }
  return false;
}

/**
 * İki cihazdan aynı çifti aynı anda yoksayma veya A-B / B-A kayıtlarını tekilleştirme.
 */
export function deduplicateNotDuplicatePairs(
  pairs: NotDuplicatePairRecord[]
): NotDuplicatePairRecord[] {
  const map = new Map<string, NotDuplicatePairRecord>();
  for (const p of pairs) {
    const built = buildNotDuplicatePairId(p.studentIdA, p.studentIdB);
    if (!built) continue;
    const existing = map.get(built.id);
    if (!existing || (p.createdAt && p.createdAt < existing.createdAt)) {
      map.set(built.id, {
        id: built.id,
        studentIdA: built.studentIdA,
        studentIdB: built.studentIdB,
        createdAt: p.createdAt,
        ...(p.note ? { note: p.note } : existing?.note ? { note: existing.note } : {}),
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Requirement 3:
 * Bir öğrenci birleştirilirse (aynı kişi çıkarsa) o öğrencinin not_duplicates kayıtlarını asıl kimliğe taşı;
 * birleşen kimlik içeren çiftleri güncelle, kendisiyle eşleşen çifti sil.
 */
export function reconcileNotDuplicatesOnMerge(
  pairs: NotDuplicatePairRecord[],
  fromStudentId: string,
  intoStudentId: string,
  nowIso = new Date().toISOString()
): {
  nextPairs: NotDuplicatePairRecord[];
  toUpsert: NotDuplicatePairRecord[];
  toDeleteIds: string[];
} {
  const cleanFrom = (fromStudentId || '').trim();
  const cleanInto = toCanonicalStudentIdForPair(intoStudentId) || (intoStudentId || '').trim();
  if (!cleanFrom || !cleanInto || cleanFrom === cleanInto) {
    return { nextPairs: [...pairs], toUpsert: [], toDeleteIds: [] };
  }

  const nextMap = new Map<string, NotDuplicatePairRecord>();
  const toUpsertMap = new Map<string, NotDuplicatePairRecord>();
  const toDeleteSet = new Set<string>();

  // First keep all unaffected pairs
  for (const p of pairs) {
    const matchesFrom =
      p.studentIdA === cleanFrom ||
      p.studentIdB === cleanFrom ||
      toCanonicalStudentIdForPair(p.studentIdA) === cleanFrom ||
      toCanonicalStudentIdForPair(p.studentIdB) === cleanFrom;
    if (!matchesFrom) {
      nextMap.set(p.id, { ...p });
    }
  }

  // Now process affected pairs
  for (const p of pairs) {
    const isAFrom =
      p.studentIdA === cleanFrom || toCanonicalStudentIdForPair(p.studentIdA) === cleanFrom;
    const isBFrom =
      p.studentIdB === cleanFrom || toCanonicalStudentIdForPair(p.studentIdB) === cleanFrom;
    if (!isAFrom && !isBFrom) continue;

    toDeleteSet.add(p.id);
    const mappedA = isAFrom ? cleanInto : toCanonicalStudentIdForPair(p.studentIdA) || p.studentIdA;
    const mappedB = isBFrom ? cleanInto : toCanonicalStudentIdForPair(p.studentIdB) || p.studentIdB;

    if (mappedA === mappedB) {
      // Self-pair (kendisiyle eşleşen çift): delete and do not recreate!
      continue;
    }

    const studentIdA = mappedA < mappedB ? mappedA : mappedB;
    const studentIdB = mappedA < mappedB ? mappedB : mappedA;
    const newId = `${studentIdA}__${studentIdB}`;

    // If the newId was somehow the same as p.id, don't delete it
    if (newId === p.id) {
      toDeleteSet.delete(p.id);
    }

    if (!nextMap.has(newId)) {
      const migratedRec: NotDuplicatePairRecord = {
        id: newId,
        studentIdA,
        studentIdB,
        createdAt: p.createdAt || nowIso,
        ...(p.note ? { note: p.note } : {}),
      };
      nextMap.set(newId, migratedRec);
      toUpsertMap.set(newId, migratedRec);
    }
  }

  return {
    nextPairs: Array.from(nextMap.values()),
    toUpsert: Array.from(toUpsertMap.values()),
    toDeleteIds: Array.from(toDeleteSet),
  };
}

/**
 * Requirement 3:
 * Bir öğrenci silinirse onunla ilgili not_duplicates kayıtlarını da temizle.
 */
export function reconcileNotDuplicatesOnDelete(
  pairs: NotDuplicatePairRecord[],
  deletedStudentId: string
): {
  nextPairs: NotDuplicatePairRecord[];
  toDeleteIds: string[];
} {
  const cleanDel = (deletedStudentId || '').trim();
  const canonDel = toCanonicalStudentIdForPair(cleanDel) || cleanDel;
  const nextPairs: NotDuplicatePairRecord[] = [];
  const toDeleteIds: string[] = [];

  for (const p of pairs) {
    const matches =
      p.studentIdA === cleanDel ||
      p.studentIdB === cleanDel ||
      p.studentIdA === canonDel ||
      p.studentIdB === canonDel ||
      toCanonicalStudentIdForPair(p.studentIdA) === canonDel ||
      toCanonicalStudentIdForPair(p.studentIdB) === canonDel;
    if (matches) {
      toDeleteIds.push(p.id);
    } else {
      nextPairs.push({ ...p });
    }
  }

  return { nextPairs, toDeleteIds };
}

export function syncDatabaseMutations(
  customStudents: Student[],
  removedStudentIds: string[],
  instructorAssignments: InstructorAssignmentRecord[] = []
): { students: Student[]; courses: Course[]; instructors: Instructor[] } {
  for (const baseSt of BASE_DB.students) {
    STUDENT_ID_ALIAS_MAP.set(baseSt.id, baseSt.id);
  }
  for (const custom of customStudents) {
    const canonicalId = buildStudentIdFromName(custom.name);
    if (canonicalId && custom.id) {
      STUDENT_ID_ALIAS_MAP.set(custom.id, canonicalId);
    }
  }

  const removedSet = new Set(removedStudentIds.map(id => resolveCanonicalStudentId(id)));
  for (const rawId of removedStudentIds) {
    removedSet.add(rawId);
  }

  const studentsMap = new Map<string, Student>();
  const assignmentMap = new Map<string, string>();

  for (const assign of instructorAssignments) {
    if (assign.courseId && assign.instructorName) {
      assignmentMap.set(assign.courseId, normalizeName(assign.instructorName));
    }
  }

  // 1. Copy base students excluding removed ones
  for (const baseStudent of BASE_DB.students) {
    if (!removedSet.has(baseStudent.id)) {
      studentsMap.set(baseStudent.id, {
        ...baseStudent,
        enrolledCourseIds: [...baseStudent.enrolledCourseIds],
      });
    }
  }

  // 2. Add or merge custom students by canonical stu-<slug> ID (Requirement 1, 2, 4)
  for (const custom of customStudents) {
    if (custom.deletedAt) continue;
    if (isPlaceholderStudentName(custom.name)) continue;

    const normName = normalizeName(custom.name);
    const canonicalId = buildStudentIdFromName(normName);
    if (!canonicalId) continue;
    if (removedSet.has(canonicalId) || removedSet.has(custom.id)) continue;

    const existing = studentsMap.get(canonicalId);
    const isBaseStudent = BASE_DB.students.some(b => b.id === canonicalId);

    if (existing) {
      const mergedCourses = Array.from(
        new Set([...existing.enrolledCourseIds, ...(custom.enrolledCourseIds || [])])
      );

      const minWeek =
        existing.addedAtWeek !== undefined && custom.addedAtWeek !== undefined
          ? Math.min(existing.addedAtWeek, custom.addedAtWeek)
          : existing.addedAtWeek ?? custom.addedAtWeek;

      const earliestAddedAt =
        existing.addedAt && custom.addedAt
          ? existing.addedAt <= custom.addedAt
            ? existing.addedAt
            : custom.addedAt
          : existing.addedAt ?? custom.addedAt;

      // Prefer name with rich Turkish characters if slug is identical (e.g. "ahmet emir çelikcan" over "ahmet emir celikcan")
      const countTurkishChars = (s: string) => (s.match(/[çğıöşü]/g) || []).length;
      const bestName =
        existing.name === 'f. mira gün'
          ? 'f. mira gün'
          : countTurkishChars(normName) > countTurkishChars(existing.name)
          ? normName
          : existing.name;

      studentsMap.set(canonicalId, {
        ...existing,
        ...custom,
        id: canonicalId,
        name: bestName,
        grade: existing.grade || normalizeTurkish(custom.grade),
        modality: existing.modality || custom.modality,
        addedAtWeek: isBaseStudent ? existing.addedAtWeek : minWeek,
        addedAt: isBaseStudent ? existing.addedAt : earliestAddedAt,
        enrolledCourseIds: mergedCourses,
      });
    } else {
      studentsMap.set(canonicalId, {
        ...custom,
        id: canonicalId,
        name: normName,
        grade: normalizeTurkish(custom.grade),
        enrolledCourseIds: Array.from(new Set(custom.enrolledCourseIds || [])),
      });
    }
  }

  // 3. Rebuild courses with updated studentIds and instructor assignments
  const baseCourseIdSet = new Set(BASE_DB.courses.map(c => c.id));
  const updatedCourses: Course[] = BASE_DB.courses.map(baseCourse => {
    const activeIds = new Set<string>();

    for (const st of studentsMap.values()) {
      if (st.enrolledCourseIds.includes(baseCourse.id)) {
        activeIds.add(st.id);
      }
    }

    const sortedStudentIds = Array.from(activeIds).sort((a, b) => {
      const sa = studentsMap.get(a)?.name || '';
      const sb = studentsMap.get(b)?.name || '';
      return sa.localeCompare(sb, 'tr-TR');
    });

    const assignedInstName = assignmentMap.get(baseCourse.id) || baseCourse.instructorName;
    const assignedInstId = `inst-${slugifyTurkish(assignedInstName)}`;

    return {
      ...baseCourse,
      instructorId: assignedInstId,
      instructorName: assignedInstName,
      studentIds: sortedStudentIds,
    };
  });

  // 3b. Add any newly created courses from instructorAssignments
  for (const assign of instructorAssignments) {
    if (!baseCourseIdSet.has(assign.courseId) && assign.gradeClass && assign.subject && assign.modality) {
      const assignedInstName = normalizeTurkish(assign.instructorName);
      const assignedInstId = `inst-${slugifyTurkish(assignedInstName)}`;
      const gradeClass = normalizeTurkish(assign.gradeClass);
      const subject = normalizeTurkish(assign.subject);
      const modality = assign.modality;
      const modalityLabel = modality === 'online' ? 'çevrim içi' : 'yüz yüze';

      const activeIds = new Set<string>();
      for (const st of studentsMap.values()) {
        if (st.enrolledCourseIds.includes(assign.courseId)) {
          activeIds.add(st.id);
        } else if (modality === 'yuzyuze' && st.modality === 'yuzyuze') {
          // For yüz yüze, students in the same gradeClass automatically take all courses of that branch
          const sameBranchCourse = BASE_DB.courses.find(
            c => c.modality === 'yuzyuze' && c.gradeClass === gradeClass
          );
          if (sameBranchCourse && st.enrolledCourseIds.includes(sameBranchCourse.id)) {
            activeIds.add(st.id);
            if (!st.enrolledCourseIds.includes(assign.courseId)) {
              st.enrolledCourseIds.push(assign.courseId);
            }
          }
        }
      }

      const sortedStudentIds = Array.from(activeIds).sort((a, b) => {
        const sa = studentsMap.get(a)?.name || '';
        const sb = studentsMap.get(b)?.name || '';
        return sa.localeCompare(sb, 'tr-TR');
      });

      updatedCourses.push({
        id: assign.courseId,
        title: `${gradeClass} ${subject} (${modalityLabel})`,
        shortTitle: `${gradeClass} ${subject}`,
        gradeClass,
        subject,
        modality,
        instructorId: assignedInstId,
        instructorName: assignedInstName,
        studentIds: sortedStudentIds,
      });
    }
  }

  // 4. Rebuild active instructors from updatedCourses
  const instructorsMap = new Map<string, Instructor>();
  for (const course of updatedCourses) {
    const instNormName = course.instructorName;
    const instId = course.instructorId;

    let instructor = instructorsMap.get(instId);
    if (!instructor) {
      const parts = instNormName.split(' ');
      const firstName = parts[0];
      const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
      const isBosAlias = /^bos\d+$/.test(instNormName);
      instructor = {
        id: instId,
        name: instNormName,
        firstName,
        lastName,
        modality: course.modality,
        courseIds: [],
        alias: isBosAlias ? instNormName : undefined,
      };
      instructorsMap.set(instId, instructor);
    }

    if (!instructor.courseIds.includes(course.id)) {
      instructor.courseIds.push(course.id);
    }
  }

  const sortedStudents = Array.from(studentsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'tr-TR')
  );
  const sortedInstructors = Array.from(instructorsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'tr-TR')
  );

  DB.students = sortedStudents;
  DB.courses = updatedCourses;
  DB.instructors = sortedInstructors;

  return {
    students: sortedStudents,
    courses: updatedCourses,
    instructors: sortedInstructors,
  };
}

export interface DiscrepancyReportItem {
  category: string;
  detail: string;
}

export const DATA_DISCREPANCIES: DiscrepancyReportItem[] = [
  {
    category: 'çift kayıt / isim birleştirmeleri',
    detail: 'aynurnisa ipek / aynur nisa ipek (5/a), abdullah kaya / abdullah muhammed kaya (6/a), miraç çetinkaya / mirac ali çetinkaya (6/a), zeynep öykü / zeynep öykü ören (8/a), reyyan cantimur / reyyan ırmak cantimur (11/a), cemre kıllı / fatma cemre kıllı (11/a) ve damla karacabacak / damla karabacak (8/a yüz yüze) aynı soyisim ve telefon bilgileri doğrulandığı için tek öğrenci kaydında birleştirildi (ders kümelerinin birleşimi alındı).',
  },
  {
    category: 'eğitmeni belirtilmeyen çevrim içi sınıflar',
    detail: 'çevrim içi pdf listesinde eğitmeni "-" olarak görünen 4 derse sınıf düzeyine göre küçükten büyüğe bos1 (5/a türkçe), bos2 (7/a ingilizce), bos3 (8/a sosyal bilgiler) ve bos4 (tyt türkçe) atandı.',
  },
  {
    category: 'eksik öğrenci ismi notu',
    detail: '3. sınıf çevrim içi matematik listesinde (çağdaş şahin) bir öğrencinin ismi "adını öğrenip giricem:)" olarak yer alıyor; ana öğrenci doğrulama listesinde bu kayıt bulunmuyor.',
  },
  {
    category: 'hem çevrim içi hem yüz yüze listesinde yer alan öğrenciler',
    detail: 'şerife sena süzmeçelik (5. sınıf) ve azra melek ecevit (7. sınıf) hem çevrim içi yoklama listelerinde hem de yüz yüze sınıf yoklama listelerinde yer alıyor; her iki sistemdeki dersleri birleştirildi.',
  },
  {
    category: 'yüz yüze 5/a ve 5/b sınıf geçişleri',
    detail: 'murat yüksek hem 5/a hem 6/a yüz yüze yoklama listesinde; beren apaydın, dilara tehik ve yusufhan ekren ise yüz yüze yoklama listesinde bazı derslerde 5/a, bazı derslerde 5/b altında listelenmiş.',
  },
  {
    category: 'ana doğrulama listesinde olup sınıf listesinde olmayanlar',
    detail: 'fatma zehra karacalı (4. sınıf) ve zeynep saniye karacalı (6. sınıf) genel öğrenci listesinde kayıtlı ancak çevrim içi ders yoklama sayfalarında yer almıyor.',
  },
];
