import { Check, CircleAlert, Loader2, MailCheck, ShieldCheck, Wallet } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'
import { FormAlert, PasswordInput } from '@/components/ui/password-input'
import { applyEmailLink, authErrorMessage, checkResetLink, saveNewPassword, signInWithEmail, type AuthActionMode } from '@/lib/auth'
import { cn } from '@/lib/utils'

/** Volta para o app sem os parâmetros do link (`recuperar` abre "Recuperar senha" já com o e-mail). */
function leave(params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params)}` : ''
  window.location.replace(`${window.location.origin}/${q}`)
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4 sm:p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Wallet className="size-7" />
          </span>
          <h1 className="text-2xl font-semibold">Finanças</h1>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">{children}</div>
      </div>
    </main>
  )
}

/** Resultado final (sucesso ou link inválido), com uma ação clara. */
function Outcome({ tone, title, text, action }: { tone: 'ok' | 'error'; title: string; text: ReactNode; action: ReactNode }) {
  const Icon = tone === 'ok' ? ShieldCheck : CircleAlert
  return (
    <div className="flex flex-col items-center gap-4 text-center" role={tone === 'error' ? 'alert' : 'status'}>
      <span className={cn('grid size-12 place-items-center rounded-full', tone === 'ok' ? 'bg-income-soft text-income' : 'bg-expense-soft text-expense')}>
        <Icon className="size-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <div className="flex w-full flex-col gap-2">{action}</div>
    </div>
  )
}

/** Por que o link não serve, sem repetir "link" do título. */
function linkReason(e: unknown) {
  const code = (e as { code?: string })?.code
  if (code === 'auth/expired-action-code') return 'Ele expirou.'
  if (code === 'auth/invalid-action-code') return 'Ele já foi usado, ou um mais novo foi enviado depois.'
  return authErrorMessage(e) ?? 'Ele não vale mais.'
}

function Checking() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" aria-busy>
      <Loader2 className="size-4 animate-spin" />
      Conferindo o link…
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nova senha
// ---------------------------------------------------------------------------

/** 0–3: tamanho, letras com números, e algo além (maiúscula ou símbolo) com 10+ caracteres. */
function strength(p: string) {
  if (p.length < 6) return 0
  let s = 1
  if (/[a-zA-Z]/.test(p) && /\d/.test(p)) s++
  if (p.length >= 10 && (/[A-Z]/.test(p) || /[^a-zA-Z0-9]/.test(p))) s++
  return s
}
const STRENGTH = [
  { label: 'Curta demais', color: 'bg-muted' },
  { label: 'Fraca', color: 'bg-expense' },
  { label: 'Boa', color: 'bg-warning' },
  { label: 'Forte', color: 'bg-income' },
] as const

function Rule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={cn('flex items-center gap-2 text-sm transition-colors', ok ? 'text-foreground' : 'text-muted-foreground')}>
      <span
        aria-hidden
        className={cn('grid size-4 shrink-0 place-items-center rounded-full border transition-colors', ok && 'border-income bg-income text-background')}
      >
        {ok && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span>
        {children}
        <span className="sr-only">{ok ? ' (ok)' : ' (falta)'}</span>
      </span>
    </li>
  )
}

function ResetPassword({ code }: { code: string }) {
  const [email, setEmail] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    checkResetLink(code)
      .then(setEmail)
      .catch((e) => setLinkError(linkReason(e)))
  }, [code])

  if (linkError) {
    return (
      <Outcome
        tone="error"
        title="Este link não abre mais"
        text={`${linkError} Cada link vale uma vez e por pouco tempo; peça outro e abra logo que chegar.`}
        action={
          <Button size="lg" onClick={() => leave({ recuperar: '1' })}>
            Pedir novo link
          </Button>
        }
      />
    )
  }
  if (!email) return <Checking />

  if (done) {
    return (
      <Outcome
        tone="ok"
        title="Senha alterada"
        text={
          <>
            A conta <strong className="text-foreground">{email}</strong> já usa a nova senha.
          </>
        }
        action={
          <Button
            size="lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await signInWithEmail(email, password)
                leave()
              } catch {
                // Não entrou sozinho (ex.: conexão): vai para o login com o e-mail.
                leave({ email })
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />}
            Entrar no Finanças
          </Button>
        }
      />
    )
  }

  const level = strength(password)
  const long = password.length >= 6
  const same = confirm.length > 0 && confirm === password
  const ready = long && same

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ready) return setError(!long ? 'A senha precisa de pelo menos 6 caracteres.' : 'As duas senhas precisam ser iguais.')
        setBusy(true)
        setError(null)
        try {
          await saveNewPassword(code, password)
          setDone(true)
        } catch (err) {
          setError(authErrorMessage(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Criar nova senha</h2>
        <p className="text-sm text-muted-foreground">
          Para a conta <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="new-password">Nova senha</Label>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
        />
        <div className="flex items-center gap-3" aria-live="polite">
          <div className="grid flex-1 grid-cols-3 gap-1" aria-hidden>
            {[1, 2, 3].map((i) => (
              <span key={i} className={cn('h-1.5 rounded-full transition-colors duration-300', i <= level ? STRENGTH[level]!.color : 'bg-muted')} />
            ))}
          </div>
          <span className="w-24 text-right text-xs text-muted-foreground">{password ? STRENGTH[level]!.label : ''}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-password">Repita a nova senha</Label>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setError(null)
          }}
        />
      </div>

      <ul className="flex flex-col gap-1.5">
        <Rule ok={long}>Pelo menos 6 caracteres</Rule>
        <Rule ok={/[a-zA-Z]/.test(password) && /\d/.test(password)}>Letras e números (recomendado)</Rule>
        <Rule ok={same}>As duas senhas iguais</Rule>
      </ul>

      <FormAlert message={error} />
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        Salvar nova senha
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Links de e-mail
// ---------------------------------------------------------------------------

const EMAIL_COPY: Record<Exclude<AuthActionMode, 'resetPassword'>, { title: string; text: (email: string | null) => string }> = {
  verifyEmail: { title: 'E-mail confirmado', text: (e) => `${e ?? 'Seu e-mail'} está confirmado.` },
  verifyAndChangeEmail: { title: 'E-mail alterado', text: (e) => `Agora você entra com ${e ?? 'o novo e-mail'}.` },
  recoverEmail: {
    title: 'E-mail anterior de volta',
    text: (e) => `A conta voltou a usar ${e ?? 'o e-mail anterior'}. Se não foi você quem pediu a troca, crie uma senha nova.`,
  },
}

function EmailLink({ mode, code }: { mode: Exclude<AuthActionMode, 'resetPassword'>; code: string }) {
  const [state, setState] = useState<{ ok: true; email: string | null } | { ok: false; error: string } | null>(null)
  useEffect(() => {
    applyEmailLink(code)
      .then((email) => setState({ ok: true, email }))
      .catch((e) => setState({ ok: false, error: linkReason(e) }))
  }, [code])

  if (!state) return <Checking />
  if (!state.ok) {
    return <Outcome tone="error" title="Este link não abre mais" text={state.error} action={<Button size="lg" onClick={() => leave()}>Voltar ao Finanças</Button>} />
  }
  const copy = EMAIL_COPY[mode]
  return (
    <Outcome
      tone="ok"
      title={copy.title}
      text={copy.text(state.email)}
      action={
        <>
          <Button size="lg" onClick={() => leave()}>
            <MailCheck />
            Abrir o Finanças
          </Button>
          {mode === 'recoverEmail' && state.email && (
            <Button size="lg" variant="outline" onClick={() => leave({ recuperar: '1', email: state.email! })}>
              Criar senha nova
            </Button>
          )}
        </>
      }
    />
  )
}

/** Página dos links enviados por e-mail (substitui a tela padrão do Firebase). */
export function AuthActionScreen({ mode, code }: { mode: AuthActionMode; code: string }) {
  return <Shell>{mode === 'resetPassword' ? <ResetPassword code={code} /> : <EmailLink mode={mode} code={code} />}</Shell>
}
