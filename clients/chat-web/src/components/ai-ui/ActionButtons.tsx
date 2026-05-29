'use client';

interface Props {
  title?: string;
  buttons: { label: string; value: string; style?: string }[];
  onAction: (action: Record<string, unknown>) => void;
}

const btnStyle: Record<string, string> = {
  primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
  secondary: 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800',
  danger: 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20',
};

export default function ActionButtons({ title, buttons, onAction }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {title && (
        <div className="px-4 py-3 border-b border-zinc-800">
          <h4 className="text-sm font-medium text-zinc-200">{title}</h4>
        </div>
      )}
      <div className="p-3 flex flex-wrap gap-2">
        {buttons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => onAction({ type: 'button_click', selectedId: btn.value, value: btn.value, buttonValue: btn.value })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${btnStyle[btn.style || 'secondary']}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
