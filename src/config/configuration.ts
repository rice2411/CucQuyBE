/** Đọc & validate biến môi trường. Ném lỗi sớm nếu thiếu service account. */
export interface AppConfig {
  port: number;
  allowedOrigins: string[];
  firebase: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
}

export function loadConfig(): AppConfig {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // private_key trong env thường có "\n" literal → đổi về xuống dòng thật
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Thiếu cấu hình Firebase Admin: cần FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY',
    );
  }

  return {
    port: Number(process.env.PORT) || 3000,
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    firebase: { projectId, clientEmail, privateKey },
  };
}
