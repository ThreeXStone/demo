'use client';

interface Props {
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
}

export default function DataTable({ columns, rows }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-2.5 text-zinc-300">
                    {row[col.key] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
