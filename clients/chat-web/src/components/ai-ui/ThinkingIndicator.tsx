'use client';

interface Props {
  progress?: { agentDisplayName: string; step: number; totalSteps: number; status: string } | null;
}

export default function ThinkingIndicator({ progress }: Props) {
  const pct = progress ? Math.round((progress.step / progress.totalSteps) * 100) : 0;

  return (
    <div className="flex items-center gap-3 ml-8">
      <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center">
        <span className="text-xs text-indigo-400">AI</span>
      </div>
      <div className="flex-1 max-w-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-zinc-400">
            {progress ? progress.agentDisplayName : 'AI 正在思考中'}
          </span>
          {progress && <span className="text-xs text-zinc-600">{pct}%</span>}
        </div>
        {progress ? (
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : (
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-indigo-500/50 rounded-full animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
