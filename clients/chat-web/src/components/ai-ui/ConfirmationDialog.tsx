'use client';

interface Props {
  title: string;
  summary: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: string;
  onAction: (action: Record<string, unknown>) => void;
}

export default function ConfirmationDialog({
  title, summary, confirmLabel, cancelLabel, severity, onAction,
}: Props) {
  const isDanger = severity === 'danger';

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{summary}</p>
      </div>
      <div className="px-4 py-3 flex gap-2 border-t border-gray-100">
        <button
          onClick={() => onAction({ type: 'cancel' })}
          className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          {cancelLabel || '取消'}
        </button>
        <button
          onClick={() => onAction({ type: 'confirm', confirmed: true })}
          className={`flex-1 py-2 text-white rounded-lg transition-colors text-sm font-medium ${
            isDanger ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-900 hover:bg-gray-800'
          }`}
        >
          {confirmLabel || '确认'}
        </button>
      </div>
    </div>
  );
}
