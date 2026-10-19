import {
  Bell,
  ChevronRight,
  Cloud,
  Database,
  Download,
  HardDrive,
  KeyRound,
  LogOut,
  Mail,
  AtSign,
  Monitor,
  Moon,
  Palette,
  SlidersHorizontal,
  Sun,
  Tags,
  Trash2,
  Upload,
  User,
  UserCheck,
  UserX,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AccountDialog, type AccountDialogKind } from '@/components/settings/account-dialogs'
import { AutoAcceptDialog, HandleDialog } from '@/components/shared/shared-ui'
import { CategoryManager } from '@/components/settings/category-manager'
import { Button } from '@/components/ui/button'
import { Affix } from '@/components/ui/form-kit'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/misc'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { backupCount, parseBackup, type ParsedBackup } from '@/lib/backup'
import { hasGoogle, hasPassword, signOut } from '@/lib/auth'
import { todayISO } from '@/lib/dates'
import { formatMoney, fromCents, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { setKeepFilters } from '@/hooks/use-saved-filters'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'
import { useSharedStore } from '@/store/shared-store'
import type { ThemePreference } from '@/types/finance'
import { PageHeader } from '@/components/layout/page-header'

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------

export type Section = 'conta' | 'preferencias' | 'categorias' | 'dados'

export const SETTINGS_SECTIONS: { id: Section; label: string; icon: LucideIcon; description: string }[] = [
  { id: 'conta', label: 'Conta', icon: User, description: 'Seus dados de acesso e segurança.' },
  { id: 'preferencias', label: 'Preferências', icon: Palette, description: 'Aparência, saldo inicial e avisos.' },
  { id: 'categorias', label: 'Categorias', icon: Tags, description: 'Como seus gastos e receitas são agrupados.' },
  { id: 'dados', label: 'Dados', icon: Database, description: 'Backup e limpeza dos seus lançamentos.' },
]

/** Grupo de linhas com título curto, no estilo de ajustes do celular. */
function Group({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {title && <h3 className="px-1 text-[13px] font-medium text-muted-foreground">{title}</h3>}
      <Card className="divide-y overflow-hidden">{children}</Card>
      {footer && <p className="px-1 text-xs text-muted-foreground">{footer}</p>}
    </section>
  )
}

/** Linha de ajuste. Com `onClick`, a linha inteira vira botão. */
function Row({
  icon: Icon,
  label,
  value,
  action,
  onClick,
  danger,
}: {
  icon: LucideIcon
  label: string
  value?: ReactNode
  action?: ReactNode
  onClick?: () => void
  danger?: boolean
}) {
  const content = (
    <>
      <Icon className={cn('size-[18px] shrink-0', danger ? 'text-expense' : 'text-muted-foreground')} strokeWidth={1.75} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('text-sm font-medium', danger && 'text-expense')}>{label}</span>
        {value && <span className="truncate text-sm text-muted-foreground">{value}</span>}
      </span>
      {action}
      {onClick && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  )
  const base = 'flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(base, 'transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted')}>
      {content}
    </button>
  ) : (
    <div className={base}>{content}</div>
  )
}

// ---------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------

function AccountSection() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const [dialog, setDialog] = useState<AccountDialogKind | null>(null)
  const [handleOpen, setHandleOpen] = useState(false)
  const [autoOpen, setAutoOpen] = useState(false)
  const autoAccept = useSettingsStore((s) => s.settings.autoAcceptFrom)
  const { handle, handleLoaded, rulesMissing } = useSharedStore()

  if (status !== 'signed_in' || !user) {
    return (
      <Group footer="Para usar em mais de um aparelho, configure o Firebase no arquivo .env.local.">
        <Row icon={HardDrive} label="Modo local" value="Seus dados ficam só neste navegador." />
      </Group>
    )
  }

  const password = hasPassword()
  const google = hasGoogle()
  const handleText = rulesMissing ? 'Indisponível: publique as regras do Firestore' : handle ? `@${handle}` : handleLoaded ? 'Não escolhido' : 'Carregando…'
  const initial = (user.name ?? user.email ?? '?').trim().charAt(0).toUpperCase()

  return (
    <>
      <div className="flex items-center gap-4 px-1">
        {user.photoURL ? (
          <img src={user.photoURL} alt="" width={56} height={56} referrerPolicy="no-referrer" className="size-14 rounded-full" />
        ) : (
          <span className="grid size-14 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">{initial}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{user.name ?? 'Sem nome'}</p>
          <p className="truncate text-sm text-muted-foreground">
            {handle && <span className="font-medium text-foreground">@{handle} · </span>}
            {user.email}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-income">
            <Cloud className="size-3.5" /> Sincronizado na nuvem
          </p>
        </div>
      </div>

      <Group title="Dados pessoais">
        <Row icon={User} label="Nome" value={user.name ?? 'Sem nome'} onClick={() => setDialog('name')} />
        <Row icon={Mail} label="E-mail" value={user.email} onClick={() => setDialog('email')} />
        <Row
          icon={AtSign}
          label="Seu @"
          value={handleText}
          onClick={rulesMissing ? undefined : () => setHandleOpen(true)}
        />
      </Group>

      {handle && !rulesMissing && (
        <Group title="Contas divididas">
          <Row
            icon={UserCheck}
            label="Aceitar automaticamente de"
            value={
              autoAccept?.length
                ? autoAccept.map((p) => `@${p.handle}`).join(', ')
                : 'Ninguém: toda conta dividida pede seu aceite'
            }
            onClick={() => setAutoOpen(true)}
          />
        </Group>
      )}

      <Group
        title="Acesso"
        footer={google && !password ? 'Crie uma senha para entrar também com e-mail, sem depender do Google.' : undefined}
      >
        <Row
          icon={KeyRound}
          label={password ? 'Senha' : 'Criar senha'}
          value={password ? 'Trocar a senha de acesso' : 'Você entra com o Google'}
          onClick={() => setDialog('password')}
        />
        <Row
          icon={Cloud}
          label="Formas de entrar"
          value={[google && 'Google', password && 'E-mail e senha'].filter(Boolean).join(' e ')}
        />
        <Row icon={LogOut} label="Sair da conta" value="Seus dados continuam salvos na nuvem." onClick={() => signOut()} />
      </Group>

      <Group title="Zona de perigo">
        <Row icon={UserX} label="Excluir conta" value="Apaga a conta e todos os dados." onClick={() => setDialog('delete')} danger />
      </Group>

      <AccountDialog kind={dialog} onClose={() => setDialog(null)} />
      <HandleDialog open={handleOpen} onClose={() => setHandleOpen(false)} />
      <AutoAcceptDialog open={autoOpen} onClose={() => setAutoOpen(false)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
]

const DUE_SOON_OPTIONS = [3, 5, 7, 10, 15]

function ThemePicker() {
  const theme = useSettingsStore((s) => s.settings.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  return (
    <div className="px-4 py-3">
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => setTheme(value)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-lg border py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              theme === value ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function OpeningBalanceForm() {
  const openingBalance = useSettingsStore((s) => s.settings.openingBalance)
  const update = useSettingsStore((s) => s.update)
  const [draft, setDraft] = useState(() => fromCents(openingBalance).toFixed(2).replace('.', ','))
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)

  return (
    <form
      className="flex flex-col gap-2 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        const negative = draft.trim().startsWith('-')
        const value = parseMoneyInput(draft)
        if (Number.isNaN(value)) return setError('Informe um valor válido')
        setError(undefined)
        update({ openingBalance: toCents(negative ? -value : value) })
        setSaved(true)
      }}
    >
      <Label htmlFor="openingBalance">Saldo em conta antes do primeiro lançamento</Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <Affix before="R$">
          <Input
            id="openingBalance"
            inputMode="decimal"
            className="pl-10"
            value={draft}
            aria-invalid={!!error}
            aria-describedby="openingBalance-hint"
            onChange={(e) => {
              setDraft(e.target.value)
              setSaved(false)
            }}
          />
          </Affix>
        </div>
        <Button type="submit" variant={saved ? 'outline' : 'default'}>
          {saved ? 'Salvo' : 'Salvar'}
        </Button>
      </div>
      <FieldError message={error} />
      <p id="openingBalance-hint" className="text-xs text-muted-foreground">
        Atual: {formatMoney(openingBalance)}. Use “-” se estiver negativo.
      </p>
    </form>
  )
}

function PreferencesSection() {
  const notifications = useSettingsStore((s) => s.settings.notifications)
  const keepFilters = useSettingsStore((s) => !!s.settings.keepFilters)
  const update = useSettingsStore((s) => s.update)

  return (
    <>
      <Group title="Aparência">
        <ThemePicker />
      </Group>

      <Group title="Saldo inicial">
        <OpeningBalanceForm />
      </Group>

      <Group title="Avisos" footer="Contas nesse prazo aparecem como “a vencer” no Dashboard.">
        <Row
          icon={Bell}
          label="Avisar vencimentos com antecedência de"
          action={
            <select
              aria-label="Dias de antecedência"
              value={notifications.dueSoonDays}
              onChange={(e) => update({ notifications: { ...notifications, dueSoonDays: Number(e.target.value) } })}
              className="h-9 rounded-lg border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {DUE_SOON_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          }
        />
      </Group>

      <Group title="Filtros" footer="Lançamentos e Relatórios abrem sempre com os últimos filtros usados, em todos os seus aparelhos.">
        <Row
          icon={SlidersHorizontal}
          label="Manter filtros salvos"
          value={keepFilters ? 'Abre com o último filtro usado' : 'Filtros voltam ao padrão ao reabrir'}
          action={<Switch checked={keepFilters} onCheckedChange={setKeepFilters} aria-label="Manter filtros salvos" />}
        />
      </Group>
    </>
  )
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

function downloadBackup() {
  const { categories, subcategories, transactions, installments, recurringCosts, debts, vehicles, maintenance } = useFinanceStore.getState()
  const { theme: _theme, ...settings } = useSettingsStore.getState().settings
  const data = { app: 'financas', exportedAt: new Date().toISOString(), settings, categories, subcategories, transactions, installments, recurringCosts, debts, vehicles, maintenance }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `financas-backup-${todayISO()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function ImportBackupRow() {
  const cloud = useAuthStore((s) => s.status === 'signed_in')
  const email = useAuthStore((s) => s.user?.email)
  const importData = useFinanceStore((s) => s.importData)
  const update = useSettingsStore((s) => s.update)
  const input = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedBackup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [withSettings, setWithSettings] = useState(false)
  const [done, setDone] = useState(false)

  const close = () => {
    setParsed(null)
    setError(null)
    setDone(false)
    setWithSettings(false)
  }

  const read = async (file: File) => {
    try {
      setParsed(parseBackup(await file.text()))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const d = parsed?.data
  const summary = d
    ? (
        [
          ['lançamentos', d.transactions.length],
          ['parcelamentos', d.installments.length],
          ['fixos', d.recurringCosts.length],
          ['dívidas', d.debts.length],
          ['veículos', d.vehicles.length],
          ['lembretes', d.maintenance.length],
          ['categorias', d.categories.length],
          ['subcategorias', d.subcategories.length],
        ] as const
      ).filter(([, n]) => n > 0)
    : []

  return (
    <>
      <Row icon={Upload} label="Importar backup" value="Traz um arquivo .json para esta conta, sem apagar nada." onClick={() => input.current?.click()} />
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void read(file)
        }}
      />
      <Dialog open={!!parsed || !!error} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{error ? 'Não deu para importar' : done ? 'Backup importado' : 'Importar backup?'}</DialogTitle>
            <DialogDescription>
              {error
                ? error
                : done
                  ? cloud
                    ? 'Os dados já estão na sua conta e aparecem em todos os aparelhos.'
                    : 'Os dados foram salvos neste navegador.'
                  : `Vai para ${cloud ? (email ?? 'sua conta') : 'este navegador'}. Itens com o mesmo id são atualizados; nada é apagado.`}
            </DialogDescription>
          </DialogHeader>
          {parsed && !done && (
            <div className="flex flex-col gap-4 px-5 pb-2">
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {summary.map(([label, n]) => (
                  <li key={label} className="rounded-xl bg-muted px-3 py-2">
                    <span className="font-semibold tabular-nums">{n}</span> {label}
                  </li>
                ))}
              </ul>
              {parsed.settings && (
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} className="size-4 accent-primary" />
                  Restaurar também saldo inicial e avisos
                </label>
              )}
            </div>
          )}
          <div className="flex gap-2 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">
                {parsed && !done ? 'Cancelar' : 'Fechar'}
              </Button>
            </DialogClose>
            {parsed && !done && (
              <Button
                className="flex-1"
                disabled={backupCount(parsed.data) === 0}
                onClick={() => {
                  importData(parsed.data)
                  if (withSettings && parsed.settings) update(parsed.settings)
                  setDone(true)
                }}
              >
                Importar
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DataSection() {
  const cloud = useAuthStore((s) => s.status === 'signed_in')
  const counts = useFinanceStore(
    useShallow((s) => ({
      transactions: s.transactions.length,
      recurring: s.recurringCosts.filter((r) => r.active).length,
      installments: s.installments.length,
      debts: s.debts.length,
      categories: s.categories.length,
    })),
  )
  const clear = useFinanceStore((s) => s.clearTransactions)
  const loadExample = useFinanceStore((s) => s.loadExampleData)
  const [confirm, setConfirm] = useState(false)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return (
    <>
      <Group title="O que está salvo" footer={cloud ? 'Na sua conta, disponível em qualquer aparelho.' : 'Só neste navegador.'}>
        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
          {(
            [
              ['Lançamentos', counts.transactions],
              ['Fixos ativos', counts.recurring],
              ['Parcelamentos', counts.installments],
              ['Dívidas', counts.debts],
              ['Categorias', counts.categories],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="flex flex-col gap-0.5 bg-card px-4 py-3 last:col-span-2 sm:last:col-span-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{n}</dd>
            </div>
          ))}
        </dl>
      </Group>

      <Group title="Backup">
        <Row
          icon={Download}
          label="Baixar backup"
          value="Arquivo .json com lançamentos, categorias, fixos e dívidas."
          onClick={downloadBackup}
        />
        <ImportBackupRow />
        {counts.transactions === 0 && (
          <Row icon={Wallet} label="Carregar dados de exemplo" value="Para explorar o app antes de lançar os seus." onClick={loadExample} />
        )}
      </Group>

      <Group title="Zona de perigo" footer="Categorias e dívidas são mantidas.">
        <Row
          icon={Trash2}
          label="Zerar lançamentos"
          value={plural(counts.transactions, 'lançamento', 'lançamentos')}
          onClick={counts.transactions ? () => setConfirm(true) : undefined}
          danger
        />
      </Group>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent aria-describedby="clear-desc">
          <DialogHeader>
            <DialogTitle>Zerar todos os lançamentos?</DialogTitle>
            <DialogDescription id="clear-desc">
              Apaga {plural(counts.transactions, 'lançamento', 'lançamentos')}, parcelamentos e fixos. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              variant="expense"
              className="flex-1"
              onClick={() => {
                clear()
                setConfirm(false)
              }}
            >
              Zerar lançamentos
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

/** Conteúdo de uma seção; usado na página (desktop) e no menu do cabeçalho (celular). */
export function SettingsSectionContent({ section }: { section: Section }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {section === 'conta' && <AccountSection />}
      {section === 'preferencias' && <PreferencesSection />}
      {section === 'categorias' && <CategoryManager />}
      {section === 'dados' && <DataSection />}
    </div>
  )
}

export function SettingsPage() {
  const [section, setSection] = useState<Section>('conta')
  const current = SETTINGS_SECTIONS.find((s) => s.id === section)!

  return (
    <>
      <PageHeader title="Configurações" />
      <main className="mx-auto grid w-full max-w-4xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-6 sm:px-6 md:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Seções" className="md:sticky md:top-20 md:self-start">
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {SETTINGS_SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={section === id ? 'page' : undefined}
                  className={cn(
                    'flex h-9 w-full items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    section === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-[-0.01em]">{current.label}</h2>
            <p className="text-sm text-muted-foreground">{current.description}</p>
          </header>
          <SettingsSectionContent section={section} />
        </div>
      </main>
    </>
  )
}
