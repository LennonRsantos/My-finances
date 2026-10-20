import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
  verifyPasswordResetCode,
  type User,
} from 'firebase/auth'
import { useAuthStore } from '@/store/auth-store'
import { deleteAllUserData } from './cloud'
import { getFirebase, isFirebaseConfigured } from './firebase'

export function signInWithGoogle() {
  const { auth } = getFirebase()
  return signInWithPopup(auth, new GoogleAuthProvider())
}

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(getFirebase().auth, email, password)
}

export async function signUpWithEmail(name: string, email: string, password: string) {
  const { user } = await createUserWithEmailAndPassword(getFirebase().auth, email, password)
  await updateProfile(user, { displayName: name })
  // onAuthStateChanged dispara antes do updateProfile; corrige o nome exibido.
  const { user: current, set } = useAuthStore.getState()
  if (current?.uid === user.uid) set({ user: { ...current, name } })
}

/**
 * Links dos e-mails voltam para o próprio app (tela `AuthActionScreen`), não
 * para a página padrão do Firebase. Funciona sem editar os modelos no Console
 * (bloqueado em projeto novo no plano gratuito). O domínio precisa estar em
 * Authentication > Configurações > Domínios autorizados.
 */
const appLinkSettings = () => ({ url: `${window.location.origin}/`, handleCodeInApp: true })

export function resetPassword(email: string) {
  return sendPasswordResetEmail(getFirebase().auth, email, appLinkSettings())
}

// ---------------------------------------------------------------------------
// Links de e-mail (redefinir senha, confirmar troca de e-mail)
// ---------------------------------------------------------------------------

export type AuthActionMode = 'resetPassword' | 'verifyEmail' | 'verifyAndChangeEmail' | 'recoverEmail'

/** Link do e-mail do Firebase aberto no app (`?mode=...&oobCode=...`); `null` se não é um. */
export function readAuthAction(search = window.location.search): { mode: AuthActionMode; code: string } | null {
  const q = new URLSearchParams(search)
  const mode = q.get('mode')
  const code = q.get('oobCode')
  if (!code || !mode) return null
  return ['resetPassword', 'verifyEmail', 'verifyAndChangeEmail', 'recoverEmail'].includes(mode) ? { mode: mode as AuthActionMode, code } : null
}

/** Confere o link de redefinição; devolve o e-mail da conta. */
export function checkResetLink(code: string) {
  return verifyPasswordResetCode(getFirebase().auth, code)
}

export function saveNewPassword(code: string, password: string) {
  return confirmPasswordReset(getFirebase().auth, code, password)
}

/** Confirma e-mail, troca de e-mail ou volta do e-mail anterior; devolve o e-mail envolvido. */
export async function applyEmailLink(code: string) {
  const info = await checkActionCode(getFirebase().auth, code)
  await applyActionCode(getFirebase().auth, code)
  return info.data.email ?? info.data.previousEmail ?? null
}

export function signOut() {
  return fbSignOut(getFirebase().auth)
}

// ---------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------

function currentUser(): User {
  const user = getFirebase().auth.currentUser
  if (!user) throw Object.assign(new Error('Sem usuário logado'), { code: 'auth/no-current-user' })
  return user
}

/** Entra com e-mail e senha (pode ter Google também). */
const providers = () => (isFirebaseConfigured ? (getFirebase().auth.currentUser?.providerData ?? []) : [])

export function hasPassword(): boolean {
  return providers().some((p) => p.providerId === 'password')
}

export function hasGoogle(): boolean {
  return providers().some((p) => p.providerId === 'google.com')
}

/**
 * Operações sensíveis (senha, e-mail, excluir conta) exigem login recente.
 * Com senha: confirma a senha atual. Só Google: abre o popup do Google.
 */
async function reauthenticate(user: User, currentPassword?: string) {
  if (currentPassword !== undefined && user.email) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))
  } else {
    await reauthenticateWithPopup(user, new GoogleAuthProvider())
  }
}

export async function updateDisplayName(name: string) {
  const user = currentUser()
  await updateProfile(user, { displayName: name })
  const { user: current, set } = useAuthStore.getState()
  if (current?.uid === user.uid) set({ user: { ...current, name } })
}

/** Troca a senha; sem `currentPassword` (conta só Google) cria uma senha nova. */
export async function changePassword(newPassword: string, currentPassword?: string) {
  const user = currentUser()
  await reauthenticate(user, currentPassword)
  if (currentPassword !== undefined) await updatePassword(user, newPassword)
  else await linkWithCredential(user, EmailAuthProvider.credential(user.email ?? '', newPassword))
}

/** Envia link de confirmação ao novo e-mail; a troca vale quando a pessoa clicar. */
export async function changeEmail(newEmail: string, currentPassword?: string) {
  const user = currentUser()
  await reauthenticate(user, currentPassword)
  await verifyBeforeUpdateEmail(user, newEmail, appLinkSettings())
}

/** Apaga todos os dados no Firestore e depois a conta. */
export async function deleteAccount(currentPassword?: string) {
  const user = currentUser()
  await reauthenticate(user, currentPassword)
  await deleteAllUserData(user.uid)
  await deleteUser(user)
}

/** Códigos que significam "o usuário desistiu"; não exibem erro. */
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/invalid-login-credentials': 'Senha incorreta.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
  'auth/weak-password': 'Senha fraca. Use pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/popup-blocked': 'O navegador bloqueou o popup. Permita popups para este site.',
  'auth/account-exists-with-different-credential': 'Este e-mail já usa outro método de login.',
  'auth/operation-not-allowed': 'Este método de login não está ativado no Firebase (Authentication > Método de login).',
  'auth/requires-recent-login': 'Por segurança, entre de novo e repita a operação.',
  'auth/missing-password': 'Informe sua senha atual.',
  'auth/user-mismatch': 'Use a mesma conta Google com que você entrou.',
  'auth/provider-already-linked': 'Esta conta já tem senha.',
  'auth/credential-already-in-use': 'Este e-mail já está ligado a outra conta.',
  'auth/expired-action-code': 'Este link expirou. Peça um novo.',
  'auth/invalid-action-code': 'Este link não vale mais: já foi usado ou foi substituído por um mais novo.',
  'auth/unauthorized-domain': 'Domínio não autorizado. Adicione-o em Authentication > Configurações > Domínios autorizados.',
}

/** Traduz erro do Firebase Auth; `null` quando não deve exibir nada. */
export function authErrorMessage(error: unknown): string | null {
  const code = (error as { code?: string })?.code ?? ''
  if (SILENT.has(code)) return null
  return MESSAGES[code] ?? 'Não foi possível concluir. Tente de novo.'
}
