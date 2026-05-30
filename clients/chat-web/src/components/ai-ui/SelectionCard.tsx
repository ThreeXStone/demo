'use client';

interface Props {
  title: string;
  options: { label: string; value: string; description?: string }[];
  allowMultiple?: boolean;
  onAction: (action: Record<string, unknown>) => void;
}

export default function SelectionCard({ title, options, onAction }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      </div>
      <div className="p-3 space-y-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onAction({ type: 'select', selectedId: opt.value, value: opt.value })}
            className="w-full text-left px-4 py-3 rounded-lg border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all"
          >
            <div className="text-sm font-medium text-gray-800">{opt.label}</div>
            {opt.description && (
              <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
