import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** Sem variáveis de ambiente o app funciona só com dados locais. */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (isFirebaseConfigured) {
  app = initializeApp(config)
  auth = getAuth(app)
  // E-mails do Firebase (recuperar senha) em português.
  auth.languageCode = 'pt-BR'
  db = initializeFirestore(app, {
    // Cache offline (IndexedDB): o app abre e grava sem internet e sincroniza depois.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Campos opcionais (ex.: `notes`) podem chegar como undefined.
    ignoreUndefinedProperties: true,
  })
}

export function getFirebase() {
  if (!auth || !db) throw new Error('Firebase não configurado')
  return { auth, db }
}
