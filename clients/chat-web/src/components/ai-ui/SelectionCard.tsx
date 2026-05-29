'use client';

interface Props {
  title: string;
  options: { label: string; value: string; description?: string }[];
  allowMultiple?: boolean;
  onAction: (action: Record<string, unknown>) => void;
}

export default function SelectionCard({ title, options, allowMultiple, onAction }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h4 className="text-sm font-medium text-zinc-200">{title}</h4>
      </div>
      <div className="p-3 space-y-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() =>
              onAction({ type: 'select', selectedId: opt.value, value: opt.value })
            }
            className="w-full text-left px-4 py-3 rounded-lg border border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all"
          >
            <div className="text-sm font-medium text-zinc-200">{opt.label}</div>
            {opt.description && (
              <div className="text-xs text-zinc-500 mt-1">{opt.description}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
