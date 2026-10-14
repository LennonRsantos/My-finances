import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { FormAlert, PasswordInput } from '@/components/ui/password-input'
import { authErrorMessage, changeEmail, changePassword, deleteAccount, hasPassword, updateDisplayName } from '@/lib/auth'
import { useAuthStore } from '@/store/auth-store'

export type AccountDialogKind = 'name' | 'email' | 'password' | 'delete'

/** Senha atual errada aqui não é "e-mail ou senha": a pessoa já está logada. */
function errorMessage(e: unknown) {
  const code = (e as { code?: string })?.code
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials')
    return 'Senha atual incorreta.'
  return authErrorMessage(e)
}

function useAction() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, run }
}

function Actions({ submitLabel, busy, destructive }: { submitLabel: string; busy: boolean; destructive?: boolean }) {
  return (
    <div className="flex gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <DialogClose asChild>
        <Button type="button" variant="outline" className="flex-1">
          Cancelar
        </Button>
      </DialogClose>
      <Button type="submit" variant={destructive ? 'expense' : 'default'} className="flex-1" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  )
}

/** Campo de senha atual; contas só Google confirmam pelo popup do Google. */
function CurrentPassword({ field, error }: { field: UseFormRegisterReturn<'current'>; error?: string }) {
  if (!hasPassword())
    return <p className="text-sm text-muted-foreground">Para confirmar, vamos abrir o login do Google.</p>
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="current-password">Senha atual</Label>
      <PasswordInput id="current-password" autoComplete="current-password" aria-invalid={!!error} {...field} />
      <FieldError message={error} />
    </div>
  )
}

const currentField = z.string().refine((v) => !hasPassword() || v.length > 0, 'Informe sua senha atual')
const newPassword = z.string().min(6, 'Mínimo de 6 caracteres').max(128, 'Senha muito longa')
const current = (v: string) => (hasPassword() ? v : undefined)

// ---------------------------------------------------------------------------

const nameSchema = z.object({ name: z.string().trim().min(2, 'Informe seu nome').max(60, 'Máximo de 60 caracteres') })

function NameForm({ onDone }: { onDone: () => void }) {
  const name = useAuthStore((s) => s.user?.name ?? '')
  const { error, busy, run } = useAction()
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(nameSchema), defaultValues: { name } })
  return (
    <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(async (v) => (await run(() => updateDisplayName(v.name))) && onDone())}>
      <div className="flex flex-col gap-4 px-5 pb-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="account-name">Nome</Label>
          <Input id="account-name" autoComplete="name" aria-invalid={!!formState.errors.name} {...register('name')} />
          <FieldError message={formState.errors.name?.message} />
        </div>
        <FormAlert message={error} />
      </div>
      <Actions submitLabel="Salvar nome" busy={busy} />
    </form>
  )
}

const emailSchema = z.object({
  email: z.string().trim().min(1, 'Informe o novo e-mail').email('E-mail inválido'),
  current: currentField,
})

function EmailForm() {
  const currentEmail = useAuthStore((s) => s.user?.email ?? '')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const { error, busy, run } = useAction()
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email: '', current: '' } })

  if (sentTo)
    return (
      <div className="flex flex-col items-center gap-3 px-5 pb-6 pt-2 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-income-soft text-income">
          <MailCheck className="size-6" />
        </span>
        <p className="text-sm">
          Enviamos um link para <span className="font-medium">{sentTo}</span>. O e-mail muda quando você abrir o link. Até lá,
          continue entrando com {currentEmail}.
        </p>
        <DialogClose asChild>
          <Button variant="outline">Fechar</Button>
        </DialogClose>
      </div>
    )

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit(async (v) => {
        if (v.email.toLowerCase() === currentEmail.toLowerCase()) return
        if (await run(() => changeEmail(v.email, current(v.current)))) setSentTo(v.email)
      })}
    >
      <div className="flex flex-col gap-4 px-5 pb-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="account-email">Novo e-mail</Label>
          <Input id="account-email" type="email" autoComplete="email" spellCheck={false} aria-invalid={!!formState.errors.email} {...register('email')} />
          <FieldError message={formState.errors.email?.message} />
        </div>
        <CurrentPassword field={register('current')} error={formState.errors.current?.message} />
        <FormAlert message={error} />
      </div>
      <Actions submitLabel="Enviar confirmação" busy={busy} />
    </form>
  )
}

const passwordSchema = z
  .object({ current: currentField, password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' })

function Done({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 pb-6 pt-2 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-income-soft text-income">
        <CheckCircle2 className="size-6" />
      </span>
      <p role="status" className="text-sm">
        {message}
      </p>
      <DialogClose asChild>
        <Button variant="outline">Fechar</Button>
      </DialogClose>
    </div>
  )
}

function PasswordForm() {
  const [creating] = useState(() => !hasPassword())
  const [done, setDone] = useState(false)
  const { error, busy, run } = useAction()
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  })
  if (done) return <Done message={creating ? 'Senha criada. Agora você também entra com e-mail e senha.' : 'Senha alterada.'} />
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit(async (v) => setDone(await run(() => changePassword(v.password, current(v.current)))))}
    >
      <div className="flex flex-col gap-4 px-5 pb-4">
        <CurrentPassword field={register('current')} error={formState.errors.current?.message} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-password">{creating ? 'Senha' : 'Nova senha'}</Label>
          <PasswordInput id="new-password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register('password')} />
          <FieldError message={formState.errors.password?.message} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-password">Repita a senha</Label>
          <PasswordInput id="confirm-password" autoComplete="new-password" aria-invalid={!!formState.errors.confirm} {...register('confirm')} />
          <FieldError message={formState.errors.confirm?.message} />
        </div>
        <FormAlert message={error} />
      </div>
      <Actions submitLabel={creating ? 'Criar senha' : 'Trocar senha'} busy={busy} />
    </form>
  )
}

const deleteSchema = z.object({
  current: currentField,
  confirm: z.string().refine((v) => v.trim().toUpperCase() === 'EXCLUIR', 'Digite EXCLUIR para confirmar'),
})

function DeleteForm() {
  const { error, busy, run } = useAction()
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(deleteSchema), defaultValues: { current: '', confirm: '' } })
  return (
    <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit((v) => run(() => deleteAccount(current(v.current))))}>
      <div className="flex flex-col gap-4 px-5 pb-4">
        <p className="rounded-xl bg-expense-soft px-3 py-2 text-sm text-expense">
          Apaga a conta e todos os lançamentos, categorias, fixos e dívidas da nuvem. Não dá para desfazer. Baixe um backup antes,
          em Dados.
        </p>
        <CurrentPassword field={register('current')} error={formState.errors.current?.message} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-confirm">Digite EXCLUIR para confirmar</Label>
          <Input id="delete-confirm" autoComplete="off" aria-invalid={!!formState.errors.confirm} {...register('confirm')} />
          <FieldError message={formState.errors.confirm?.message} />
        </div>
        <FormAlert message={error} />
      </div>
      <Actions submitLabel="Excluir minha conta" busy={busy} destructive />
    </form>
  )
}

// ---------------------------------------------------------------------------

const titles: Record<AccountDialogKind, { title: string; description: string }> = {
  name: { title: 'Alterar nome', description: 'É como o app chama você.' },
  email: { title: 'Alterar e-mail', description: 'Você recebe um link no novo endereço para confirmar.' },
  password: { title: 'Senha', description: 'Use pelo menos 6 caracteres. Evite senhas que usa em outros sites.' },
  delete: { title: 'Excluir conta', description: 'Remove seu acesso e todos os seus dados.' },
}

export function AccountDialog({ kind, onClose }: { kind: AccountDialogKind | null; onClose: () => void }) {
  const meta = kind ? titles[kind] : null
  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === 'password' && !hasPassword() ? 'Criar senha' : meta?.title}</DialogTitle>
          <DialogDescription>
            {kind === 'password' && !hasPassword()
              ? 'Com uma senha, você também entra com e-mail, além do Google.'
              : meta?.description}
          </DialogDescription>
        </DialogHeader>
        {kind === 'name' && <NameForm onDone={onClose} />}
        {kind === 'email' && <EmailForm />}
        {kind === 'password' && <PasswordForm />}
        {kind === 'delete' && <DeleteForm />}
      </DialogContent>
    </Dialog>
  )
}
