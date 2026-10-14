# Finanças

Web app de gestão financeira pessoal (React + TypeScript + Vite + Tailwind v4).

```bash
npm install
npm run dev
```

## Estrutura

- `src/types/finance.ts`: entidades do domínio (valores em centavos, datas `YYYY-MM-DD`)
- `src/lib/finance.ts`: cálculos puros (resumo do mês, alertas, gráficos, geração de parcelas)
- `src/lib/schemas.ts`: validação Zod do formulário de lançamentos
- `src/store/`: estado global (Zustand, persistido em `localStorage`)
- `src/components/dashboard/`: cards, alertas e gráficos (Recharts)
- `src/components/transactions/`: formulário e diálogo de lançamento
- `src/data/mock.ts`: dados de exemplo dos últimos 12 meses
