import 'dotenv/config';

function getNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getDataStore(value: string | undefined): 'file' | 'firestore' {
  if (value === 'firestore') {
    return 'firestore';
  }
  return 'file';
}

export const env = {
  port: getNumber(process.env.PORT, 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    process.env.CLIENT_ORIGIN ??
    'http://localhost:5173',
  dataStore: getDataStore(process.env.DATA_STORE),
  firestoreProjectId: process.env.FIRESTORE_PROJECT_ID ?? '',
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID ?? '',
  firestoreBoardsCollection: process.env.FIRESTORE_BOARDS_COLLECTION ?? 'boards',
  isProduction: process.env.NODE_ENV === 'production'
};
