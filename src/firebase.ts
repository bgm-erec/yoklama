import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
  Timestamp,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function initFirestoreInstance(): Firestore {
  const hasIndexedDb =
    typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

  if (hasIndexedDb) {
    try {
      return initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch (err) {
      console.warn(
        'Kalıcı çevrim dışı önbellek zaten başlatılmış veya desteklenmiyor, mevcut örnek kullanılıyor:',
        err
      );
    }
  }
  return getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = initFirestoreInstance();
export const auth = getAuth(app);

/**
 * Unique identifier for the current browser tab/session, used to distinguish
 * our own writes from concurrent writes by another device/tab.
 */
export const CLIENT_SESSION_ID = `sess_${Date.now().toString(36)}_${Math.random()
  .toString(36)
  .slice(2, 8)}`;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Normalizes a Firestore Timestamp, Date, serverTimestamp FieldValue placeholder,
 * or ISO string into a standard ISO-8601 string for UI sorting and comparison.
 */
export function formatFirestoreTimestamp(
  val: unknown,
  fallbackIso?: string
): string {
  if (!val) {
    return fallbackIso || new Date().toISOString();
  }
  if (typeof val === 'string') {
    return val;
  }
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    try {
      return (val as { toDate: () => Date }).toDate().toISOString();
    } catch (err) {
      console.warn('Timestamp dönüştürme hatası:', err);
    }
  }
  if (
    typeof val === 'object' &&
    val !== null &&
    'seconds' in val &&
    typeof (val as { seconds: number }).seconds === 'number'
  ) {
    return new Date((val as { seconds: number }).seconds * 1000).toISOString();
  }
  return fallbackIso || new Date().toISOString();
}

export interface AuditLogInput {
  actor: string;
  action: string;
  target: string;
  details: string;
}

/**
 * Writes an audit log record to Firestore `audit_log` collection with serverTimestamp().
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  const payload = {
    actor: (input.actor || 'bilinmeyen').slice(0, 120),
    action: (input.action || 'islem').slice(0, 100),
    target: (input.target || 'genel').slice(0, 200),
    details: (input.details || '-').slice(0, 2000),
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
  };
  try {
    await setDoc(doc(db, 'audit_log', logId), payload);
  } catch (error) {
    console.error('Audit log yazma hatası:', error);
  }
}

async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
