import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Affix, bodyClass, Choices, Field, FormActions, formClass } from '@/components/ui/form-kit'
import { Input, Label } from '@/components/ui/input'
import { useGoalPlan } from '@/hooks/use-goal-plan'
import { cents, optionalMoney } from '@/lib/form-fields'
import { formatMoney, fromCents } from '@/lib/money'
import { DEFAULT_GOAL_PLAN, SLICE_SHORT } from '@/lib/plan'
import { parseMoneyInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/store/settings-store'
import { BUDGET_SLICES, type GoalPlan } from '@/types/finance'

const moneyText = (c: number | null) => (c ? fromCents(c).toFixed(2).replace('.', ',') : '')
const whole = (min: number, max: number, msg: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, msg)

const planSchema = z
  .object({
    incomeMode: z.enum(['media', 'manual']),
    income: optionalMoney,
    essencial: whole(0, 100, 'De 0 a 100'),
    investir: whole(0, 100, 'De 0 a 100'),
    lazer: whole(0, 100, 'De 0 a 100'),
    curto: whole(0, 100, 'De 0 a 100'),
    reserveMonths: whole(1, 24, 'De 1 a 24 meses'),
    reserveBase: z.enum(['custo', 'renda']),
    freedomIncome: optionalMoney,
    freedomMultiplier: whole(50, 600, 'Entre 50 e 600'),
    incomeGrowth: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= 200), 'De 0 a 200'),
  })
  .refine((v) => v.incomeMode === 'media' || parseMoneyInput(v.income) > 0, { path: ['income'], message: 'Informe a renda' })
  .refine((v) => BUDGET_SLICES.reduce((a, s) => a + Number(v[s]), 0) === 100, { path: ['curto'], message: 'A divisão precisa somar 100%' })

const toForm = (p: GoalPlan) => ({
  incomeMode: (p.income ? 'manual' : 'media') as 'media' | 'manual',
  income: moneyText(p.income),
  essencial: String(p.split.essencial),
  investir: String(p.split.investir),
  lazer: String(p.split.lazer),
  curto: String(p.split.curto),
  reserveMonths: String(p.reserveMonths),
  reserveBase: p.reserveBase,
  freedomIncome: moneyText(p.freedomIncome),
  freedomMultiplier: String(p.freedomMultiplier),
  incomeGrowth: p.incomeGrowth === null ? '' : String(p.incomeGrowth),
})

function PlanForm({ onDone }: { onDone: () => void }) {
  const update = useSettingsStore((s) => s.update)
  const { plan, diagnosis, targets } = useGoalPlan()
  const { register, handleSubmit, control, setValue, reset, formState } = useForm({ resolver: zodResolver(planSchema), defaultValues: toForm(plan) })
  const [incomeMode, reserveBase, essencial, investir, lazer, curto] = useWatch({
    control,
    name: ['incomeMode', 'reserveBase', 'essencial', 'investir', 'lazer', 'curto'],
  })
  const sum = [essencial, investir, lazer, curto].reduce((a, v) => a + (Number(v) || 0), 0)
  const living = diagnosis.groups.essencial + diagnosis.groups.dividas
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        update({
          goalPlan: {
            income: v.incomeMode === 'manual' ? cents(v.income) : null,
            split: { essencial: Number(v.essencial), investir: Number(v.investir), lazer: Number(v.lazer), curto: Number(v.curto) },
            reserveMonths: Number(v.reserveMonths),
            reserveBase: v.reserveBase,
            freedomIncome: v.freedomIncome && cents(v.freedomIncome) > 0 ? cents(v.freedomIncome) : null,
            freedomMultiplier: Number(v.freedomMultiplier),
            incomeGrowth: v.incomeGrowth === '' ? null : Number(v.incomeGrowth),
          },
        })
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="flex flex-col gap-2">
          <Label>Renda mensal</Label>
          <Choices
            label="Renda mensal"
            value={incomeMode}
            onChange={(v) => setValue('incomeMode', v)}
            options={[
              { value: 'media', label: diagnosis.income > 0 ? `Média: ${formatMoney(diagnosis.income)}` : 'Média dos lançamentos' },
              { value: 'manual', label: 'Informar valor' },
            ]}
          />
          {incomeMode === 'media' ? (
            <p className="text-xs text-muted-foreground">Receitas lançadas nos últimos 3 meses. Muda sozinha quando a renda muda.</p>
          ) : (
            <Field id="p-income" label="Renda líquida por mês" error={e.income?.message}>
              <Affix before="R$">
                <Input id="p-income" inputMode="decimal" className="pl-10" aria-invalid={!!e.income} {...register('income')} />
              </Affix>
            </Field>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Label>Divisão da renda</Label>
          <div className="grid grid-cols-2 gap-3">
            {BUDGET_SLICES.map((s) => (
              <Field key={s} id={`p-${s}`} label={SLICE_SHORT[s]} error={e[s]?.message}>
                <Affix after="%">
                  <Input id={`p-${s}`} inputMode="numeric" className="pr-8" aria-invalid={!!e[s]} {...register(s)} />
                </Affix>
              </Field>
            ))}
          </div>
          <p role="status" className={cn('text-xs', sum === 100 ? 'text-muted-foreground' : 'font-medium text-expense')}>
            Soma: {sum}%{sum === 100 ? '' : ' (precisa dar 100%)'}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Reserva de emergência</Label>
          <Choices
            label="Base da reserva"
            value={reserveBase}
            onChange={(v) => setValue('reserveBase', v)}
            options={[
              { value: 'custo', label: living > 0 ? `Custo de vida: ${formatMoney(living)}` : 'Custo de vida' },
              { value: 'renda', label: targets.income.value > 0 ? `Renda: ${formatMoney(targets.income.value)}` : 'Renda' },
            ]}
          />
          <Field id="p-months" label="Quantos meses guardar" error={e.reserveMonths?.message} hint="Custo de vida = essenciais + parcelas, média de 3 meses.">
            <Affix after="meses">
              <Input id="p-months" inputMode="numeric" className="pr-16" aria-invalid={!!e.reserveMonths} {...register('reserveMonths')} />
            </Affix>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="p-freedom" label="Renda sem trabalhar" error={e.freedomIncome?.message} hint="Vazio = sua renda atual">
            <Affix before="R$">
              <Input id="p-freedom" inputMode="decimal" className="pl-10" aria-invalid={!!e.freedomIncome} {...register('freedomIncome')} />
            </Affix>
          </Field>
          <Field id="p-mult" label="Multiplicador" error={e.freedomMultiplier?.message} hint="200x ≈ retirar 0,5% ao mês">
            <Affix after="x">
              <Input id="p-mult" inputMode="numeric" className="pr-8" aria-invalid={!!e.freedomMultiplier} {...register('freedomMultiplier')} />
            </Affix>
          </Field>
        </div>

        <Field id="p-growth" label="Aumento de renda no ano (opcional)" error={e.incomeGrowth?.message} hint="Compara janeiro até hoje com o mesmo período do ano passado.">
          <Affix after="%">
            <Input id="p-growth" inputMode="numeric" className="pr-8" placeholder="Ex.: 10" aria-invalid={!!e.incomeGrowth} {...register('incomeGrowth')} />
          </Affix>
        </Field>

        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => reset(toForm(DEFAULT_GOAL_PLAN))}>
          Voltar ao padrão (60/10/20/10)
        </Button>
      </div>
      <FormActions submitLabel="Salvar plano" />
    </form>
  )
}

export function PlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar plano</DialogTitle>
          <DialogDescription>Renda, divisão do mês e fórmulas das metas.</DialogDescription>
        </DialogHeader>
        {open && <PlanForm onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
