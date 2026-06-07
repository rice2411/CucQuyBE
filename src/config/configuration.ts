import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Đọc & validate biến môi trường. Ném lỗi sớm nếu thiếu service account. */
export interface AppConfig {
  port: number;
  allowedOrigins: string[];
  firebase: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
    storageBucket: string;
  };
}

interface FirebaseCreds {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Ưu tiên 1: 3 biến env rời (dùng khi deploy). */
function fromEnv(): FirebaseCreds | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  return null;
}

/** Ưu tiên 2: file JSON service account (local dev). */
function fromFile(): FirebaseCreds | null {
  const path =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || join(process.cwd(), 'service_account.json');
  if (!existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  if (!j.project_id || !j.client_email || !j.private_key) return null;
  return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
}

export function loadConfig(): AppConfig {
  const firebase = fromEnv() ?? fromFile();
  if (!firebase) {
    throw new Error(
      'Thiếu cấu hình Firebase Admin: đặt FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY ' +
        'hoặc để file service_account.json ở thư mục gốc (hoặc FIREBASE_SERVICE_ACCOUNT_PATH).',
    );
  }

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET || `${firebase.projectId}.firebasestorage.app`;

  return {
    port: Number(process.env.PORT) || 3000,
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    firebase: { ...firebase, storageBucket },
  };
}
