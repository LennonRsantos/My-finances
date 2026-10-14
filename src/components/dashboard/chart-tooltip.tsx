interface Row {
  color: string
  label: string
  value: string
}

export function ChartTooltip({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="min-w-40 rounded-xl border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: r.color }} />
          <span className="flex-1 text-muted-foreground">{r.label}</span>
          <span className="font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  )
}
