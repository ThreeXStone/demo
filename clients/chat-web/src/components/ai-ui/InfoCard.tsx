'use client';

interface Props {
  title: string;
  sections: { label: string; value: string }[];
  status?: { label: string; color: string };
}

const statusColors: Record<string, string> = {
  green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  gray: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

export default function InfoCard({ title, sections, status }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-200">{title}</h4>
        {status && (
          <span className={`text-xs px-2 py-0.5 rounded-md border ${statusColors[status.color] || statusColors.gray}`}>
            {status.label}
          </span>
        )}
      </div>
      <div className="p-4 space-y-2">
        {sections.map((s, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-zinc-500">{s.label}</span>
            <span className="text-zinc-200 text-right max-w-[60%]">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
