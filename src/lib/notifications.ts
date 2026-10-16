/**
 * Avisos do sino: convites e recusas de contas compartilhadas, contas a
 * vencer/atrasadas e manutenções (veículo e casa) perto do vencimento.
 */
import type { Cents, ISODate, MaintenanceReminder, SharedBill, Transaction, Vehicle } from '@/types/finance'
import { computeDueAlerts } from './finance'
import { displayName, partnerOf, pendingInvites, unseenRejections } from './shared'
import { currentOdometer, reminderStatus } from './vehicle'

export type NotificationKind = 'invite' | 'rejection' | 'handle' | 'rules' | 'overdue' | 'today' | 'soon' | 'maintenance'

export interface AppNotification {
  id: string
  kind: NotificationKind
  /** Mais alto aparece primeiro */
  priority: number
  title: string
  detail: string
  tone: 'expense' | 'warning' | 'info'
  bill?: SharedBill
  /** Tela para abrir ao tocar */
  view?: 'lancamentos' | 'calendario' | 'veiculo' | 'casa' | 'configuracoes'
}

const sum = (list: Transaction[]): Cents => list.reduce((a, t) => a + t.amount, 0)

export function buildNotifications(input: {
  uid: string | null
  bills: SharedBill[]
  handle: string | null
  handleLoaded: boolean
  rulesMissing: boolean
  transactions: Transaction[]
  maintenance: MaintenanceReminder[]
  vehicles: Vehicle[]
  today: ISODate
  dueSoonDays: number
  formatMoney: (c: Cents) => string
}): AppNotification[] {
  const { uid, bills, transactions, today, formatMoney } = input
  const out: AppNotification[] = []

  if (uid) {
    for (const b of pendingInvites(bills, uid)) {
      const creator = b.participants[0]
      out.push({
        id: `invite-${b.id}-${b.version}`,
        kind: 'invite',
        priority: 100,
        title: `${displayName(creator)} está te convidando para divisão de uma conta: ${b.title}`,
        detail: `Sua parte: ${b.participants[1].splitPercentage}% de ${formatMoney(b.totalAmount)} em ${b.installments}x`,
        tone: 'info',
        bill: b,
      })
    }
    for (const b of unseenRejections(bills, uid)) {
      const partner = partnerOf(b, uid)
      out.push({
        id: `rejection-${b.id}`,
        kind: 'rejection',
        priority: 90,
        title: `${partner ? displayName(partner) : 'O convidado'} recusou a divisão de “${b.title}”`,
        detail: 'Edite a conta para reenviar ou cancele.',
        tone: 'expense',
        bill: b,
        view: 'lancamentos',
      })
    }
    if (input.rulesMissing) {
      out.push({
        id: 'rules',
        kind: 'rules',
        priority: 10,
        title: 'Contas compartilhadas indisponíveis',
        detail: 'Publique o arquivo firestore.rules em Firebase Console > Firestore > Regras.',
        tone: 'warning',
      })
    } else if (input.handleLoaded && !input.handle) {
      out.push({
        id: 'handle',
        kind: 'handle',
        priority: 5,
        title: 'Escolha seu @',
        detail: 'Para dividir contas com outras pessoas e receber convites.',
        tone: 'info',
      })
    }
  }

  // Contas: só despesas não pagas e fora de espera (conta compartilhada alterada).
  const alerts = computeDueAlerts(
    transactions.filter((t) => !t.sharedSuspended),
    today,
    input.dueSoonDays,
  )
  if (alerts.overdue.length)
    out.push({
      id: `overdue-${alerts.overdue.length}-${sum(alerts.overdue)}`,
      kind: 'overdue',
      priority: 80,
      title: `${alerts.overdue.length} ${alerts.overdue.length === 1 ? 'conta atrasada' : 'contas atrasadas'}: ${formatMoney(sum(alerts.overdue))}`,
      detail: alerts.overdue
        .slice(0, 3)
        .map((t) => t.description)
        .join(', '),
      tone: 'expense',
      view: 'lancamentos',
    })
  if (alerts.dueToday.length)
    out.push({
      id: `today-${today}-${alerts.dueToday.length}`,
      kind: 'today',
      priority: 70,
      title: `${alerts.dueToday.length === 1 ? 'Vence hoje' : `${alerts.dueToday.length} vencem hoje`}: ${formatMoney(sum(alerts.dueToday))}`,
      detail: alerts.dueToday
        .slice(0, 3)
        .map((t) => t.description)
        .join(', '),
      tone: 'warning',
      view: 'calendario',
    })
  if (alerts.dueSoon.length)
    out.push({
      id: `soon-${today}-${alerts.dueSoon.length}`,
      kind: 'soon',
      priority: 40,
      title: `${alerts.dueSoon.length} ${alerts.dueSoon.length === 1 ? 'conta vence' : 'contas vencem'} nos próximos ${input.dueSoonDays} dias: ${formatMoney(sum(alerts.dueSoon))}`,
      detail: alerts.dueSoon
        .slice(0, 3)
        .map((t) => t.description)
        .join(', '),
      tone: 'info',
      view: 'calendario',
    })

  // Manutenções do veículo (por km e tempo) e da casa (por tempo).
  for (const r of input.maintenance) {
    const vehicle = r.vehicleId ? input.vehicles.find((v) => v.id === r.vehicleId && v.active) : null
    if (r.vehicleId && !vehicle) continue
    const km = vehicle ? currentOdometer(vehicle, transactions) : 0
    const s = reminderStatus(r, km, today)
    if (s.level === 'ok') continue
    const where = vehicle ? vehicle.name : 'Casa'
    out.push({
      id: `maint-${r.id}-${s.level}`,
      kind: 'maintenance',
      priority: s.level === 'atrasado' ? 60 : 30,
      title: `${r.name} (${where}) ${s.level === 'atrasado' ? 'está atrasada' : 'vence em breve'}`,
      detail:
        [
          s.kmLeft !== null && (s.kmLeft >= 0 ? `faltam ${Math.round(s.kmLeft).toLocaleString('pt-BR')} km` : `passou ${Math.round(-s.kmLeft).toLocaleString('pt-BR')} km`),
          s.daysLeft !== null && (s.daysLeft >= 0 ? `faltam ${s.daysLeft} dias` : `venceu há ${-s.daysLeft} dias`),
        ]
          .filter(Boolean)
          .join(' ou ') || 'Confira o lembrete',
      tone: s.level === 'atrasado' ? 'expense' : 'warning',
      view: vehicle ? 'veiculo' : 'casa',
    })
  }

  return out.sort((a, b) => b.priority - a.priority)
}
