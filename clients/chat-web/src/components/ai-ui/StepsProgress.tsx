'use client';

interface Props {
  steps: { label: string; status: 'completed' | 'current' | 'pending' }[];
}

const dotColors: Record<string, string> = {
  completed: 'bg-emerald-500 border-emerald-500',
  current: 'bg-indigo-500 border-indigo-500',
  pending: 'bg-zinc-800 border-zinc-700',
};

const textColors: Record<string, string> = {
  completed: 'text-emerald-400',
  current: 'text-indigo-400',
  pending: 'text-zinc-600',
};

export default function StepsProgress({ steps }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h4 className="text-sm font-medium text-zinc-200">分析进度</h4>
      </div>
      <div className="p-4">
        <div className="space-y-0">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full border-2 ${dotColors[s.status]}`} />
                {i < steps.length - 1 && (
                  <div className={`w-0.5 h-7 ${s.status === 'completed' ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
                )}
              </div>
              <span className={`text-sm pb-5 ${textColors[s.status]}`}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
