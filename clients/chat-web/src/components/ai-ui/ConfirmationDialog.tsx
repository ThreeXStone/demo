'use client';

interface Props {
  title: string;
  summary: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: string;
  onAction: (action: Record<string, unknown>) => void;
}

const severityBg: Record<string, string> = {
  danger: 'border-red-800 bg-red-950/30',
  warning: 'border-yellow-800 bg-yellow-950/20',
  info: 'border-blue-800 bg-blue-950/20',
};

export default function ConfirmationDialog({
  title, summary, confirmLabel, cancelLabel, severity, onAction,
}: Props) {
  return (
    <div className={`rounded-xl border ${severityBg[severity || 'info'] || severityBg.info} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-zinc-800">
        <h4 className="text-sm font-medium text-zinc-200">{title}</h4>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-zinc-400 whitespace-pre-wrap">{summary}</p>
      </div>
      <div className="px-4 py-3 flex gap-2 border-t border-zinc-800">
        <button
          onClick={() => onAction({ type: 'cancel' })}
          className="flex-1 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors text-sm"
        >
          {cancelLabel || '取消'}
        </button>
        <button
          onClick={() => onAction({ type: 'confirm', confirmed: true })}
          className="flex-1 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-400 transition-colors text-sm font-medium"
        >
          {confirmLabel || '确认'}
        </button>
      </div>
    </div>
  );
}
