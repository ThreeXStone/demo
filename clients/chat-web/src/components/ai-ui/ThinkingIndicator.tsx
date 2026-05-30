'use client';

interface Props {
  progress?: { agentDisplayName: string; step: number; totalSteps: number; status: string } | null;
}

export default function ThinkingIndicator({ progress }: Props) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div className="flex-1 max-w-sm">
        <div className="flex items-center gap-2 mb-1.5">
          {progress ? (
            <span className="text-sm text-gray-700">{progress.agentDisplayName}</span>
          ) : (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
          {progress && (
            <span className="text-xs text-gray-400 tabular-nums">
              {progress.step}/{progress.totalSteps}
            </span>
          )}
        </div>
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
          {progress ? (
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.round((progress.step / progress.totalSteps) * 100)}%` }}
            />
          ) : (
            <div className="h-full w-1/3 bg-gray-200 rounded-full animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}
