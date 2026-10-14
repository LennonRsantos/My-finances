import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, MailCheck, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { FormAlert, PasswordInput } from '@/components/ui/password-input'
import { authErrorMessage, resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/lib/auth'
import { cn } from '@/lib/utils'

type Mode = 'login' | 'signup' | 'reset'

const email = z.string().trim().min(1, 'Informe seu e-mail').email('E-mail inválido')

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe sua senha'),
})

const signupSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome').max(60, 'Máximo de 60 caracteres'),
    email,
    password: z.string().min(6, 'Mínimo de 6 caracteres').max(128, 'Senha muito longa'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' })

const resetSchema = z.object({ email })

type LoginValues = z.infer<typeof loginSchema>
type SignupValues = z.infer<typeof signupSchema>
type ResetValues = z.infer<typeof resetSchema>

// ---------------------------------------------------------------------------

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

/** Envolve chamada de auth: controla erro exibido. */
function useAuthAction() {
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(authErrorMessage(e))
    }
  }
  return { error, setError, run }
}

// ---------------------------------------------------------------------------

function LoginForm({ onForgot, defaultEmail }: { onForgot: (email: string) => void; defaultEmail: string }) {
  const { error, run } = useAuthAction()
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: defaultEmail, password: '' } })

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((v) => run(() => signInWithEmail(v.email, v.password)))}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">E-mail</Label>
        <Input id="login-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Senha</Label>
          <button type="button" onClick={() => onForgot(getValues('email'))} className="text-sm font-medium text-primary hover:underline">
            Esqueci a senha
          </button>
        </div>
        <PasswordInput id="login-password" autoComplete="current-password" aria-invalid={!!errors.password} {...register('password')} />
        <FieldError message={errors.password?.message} />
      </div>
      <FormAlert message={error} />
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Entrar
      </Button>
    </form>
  )
}

function SignupForm() {
  const { error, run } = useAuthAction()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', confirm: '' },
    mode: 'onTouched',
  })

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((v) => run(() => signUpWithEmail(v.name, v.email, v.password)))}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-name">Nome</Label>
        <Input id="signup-name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-email">E-mail</Label>
        <Input id="signup-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-password">Senha</Label>
        <PasswordInput id="signup-password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
        {errors.password ? (
          <FieldError message={errors.password.message} />
        ) : (
          <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-confirm">Confirmar senha</Label>
        <PasswordInput id="signup-confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
        <FieldError message={errors.confirm?.message} />
      </div>
      <FormAlert message={error} />
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Criar conta
      </Button>
    </form>
  )
}

function ResetForm({ defaultEmail, onBack }: { defaultEmail: string; onBack: () => void }) {
  const { error, run } = useAuthAction()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { email: defaultEmail } })

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar para o login
      </button>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Recuperar senha</h2>
        <p className="text-sm text-muted-foreground">Enviaremos um link para você criar uma nova senha.</p>
      </div>

      {sentTo ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-income-soft p-4 text-center text-income">
          <MailCheck className="size-6" />
          <p className="text-sm">
            Se houver uma conta para <strong>{sentTo}</strong>, o link chega em instantes. Confira também o spam.
          </p>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((v) =>
            run(async () => {
              await resetPassword(v.email)
              setSentTo(v.email)
            }),
          )}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-email">E-mail</Label>
            <Input id="reset-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
            <FieldError message={errors.email?.message} />
          </div>
          <FormAlert message={error} />
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Enviar link
          </Button>
        </form>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [resetEmail, setResetEmail] = useState('')
  const google = useAuthAction()
  const [googlePending, setGooglePending] = useState(false)

  const loginWithGoogle = async () => {
    setGooglePending(true)
    await google.run(signInWithGoogle)
    setGooglePending(false)
  }

  return (
    <main className="grid min-h-dvh place-items-center p-4 sm:p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Wallet className="size-7" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Finanças</h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'signup' ? 'Crie sua conta para começar a organizar seu dinheiro.' : 'Acesse seus dados em qualquer aparelho.'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          {mode === 'reset' ? (
            <ResetForm defaultEmail={resetEmail} onBack={() => setMode('login')} />
          ) : (
            <div className="flex flex-col gap-5">
              <div role="tablist" aria-label="Acesso" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                {(
                  [
                    ['login', 'Entrar'],
                    ['signup', 'Criar conta'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'h-10 rounded-lg text-sm font-medium transition-colors',
                      mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === 'login' ? (
                <LoginForm
                  defaultEmail={resetEmail}
                  onForgot={(email) => {
                    setResetEmail(email)
                    setMode('reset')
                  }}
                />
              ) : (
                <SignupForm />
              )}

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                ou
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" size="lg" onClick={loginWithGoogle} disabled={googlePending}>
                {googlePending ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
                Continuar com Google
              </Button>
              <FormAlert message={google.error} />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
