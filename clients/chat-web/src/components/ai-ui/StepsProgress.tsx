'use client';

interface Props {
  steps: { label: string; status: 'completed' | 'current' | 'pending' }[];
}

const dotColors: Record<string, string> = {
  completed: 'bg-gray-900 border-gray-900',
  current: 'bg-gray-900 border-gray-900',
  pending: 'bg-white border-gray-300',
};

const textColors: Record<string, string> = {
  completed: 'text-gray-800 font-medium',
  current: 'text-gray-800 font-medium',
  pending: 'text-gray-400',
};

export default function StepsProgress({ steps }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-800">分析进度</h4>
      </div>
      <div className="p-4">
        <div className="space-y-0">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full border-2 ${dotColors[s.status]}`} />
                {i < steps.length - 1 && (
                  <div className={`w-0.5 h-7 ${s.status === 'completed' ? 'bg-gray-300' : 'bg-gray-100'}`} />
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
