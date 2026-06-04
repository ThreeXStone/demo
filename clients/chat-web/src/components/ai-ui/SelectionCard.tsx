'use client';

interface Props {
  title: string;
  options: { label: string; value: string; description?: string }[];
  allowMultiple?: boolean;
  selectedValue?: string;
  onAction: (action: Record<string, unknown>) => void;
}

export default function SelectionCard({ title, options, selectedValue, onAction }: Props) {
  const hasSelection = !!selectedValue;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        {hasSelection && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
            已选
          </span>
        )}
      </div>
      <div className="p-3 space-y-1">
        {options.map((opt) => {
          const isSelected = selectedValue === opt.value;
          return (
            <button
              key={opt.value}
              disabled={hasSelection}
              onClick={() => onAction({ type: 'select', selectedId: opt.value, value: opt.value })}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                isSelected
                  ? 'border-blue-300 bg-blue-50'
                  : hasSelection
                    ? 'border-gray-100 bg-gray-50 cursor-not-allowed'
                    : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className={`text-sm font-medium ${
                isSelected ? 'text-blue-700' : hasSelection ? 'text-gray-400' : 'text-gray-800'
              }`}>
                {isSelected && <span className="mr-1.5">&#10003;</span>}
                {opt.label}
              </div>
              {opt.description && (
                <div className={`text-xs mt-0.5 ${isSelected ? 'text-blue-500' : hasSelection ? 'text-gray-300' : 'text-gray-500'}`}>
                  {opt.description}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
