'use client';

interface Props {
  title?: string;
  buttons: { label: string; value: string; style?: string }[];
  onAction: (action: Record<string, unknown>) => void;
}

const btnStyle: Record<string, string> = {
  primary: 'bg-gray-900 text-white hover:bg-gray-800',
  secondary: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
  danger: 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100',
};

export default function ActionButtons({ title, buttons, onAction }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {title && (
        <div className="px-4 py-3 border-b border-gray-100">
          <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
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
