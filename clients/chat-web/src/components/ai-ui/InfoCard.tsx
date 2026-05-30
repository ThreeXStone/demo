'use client';

interface Props {
  title: string;
  sections: { label: string; value: string }[];
  status?: { label: string; color: string };
}

const statusColors: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function InfoCard({ title, sections, status }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        {status && (
          <span className={`text-xs px-2 py-0.5 rounded-md border ${statusColors[status.color] || statusColors.gray}`}>
            {status.label}
          </span>
        )}
      </div>
      <div className="p-4 space-y-2">
        {sections.map((s, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-500">{s.label}</span>
            <span className="text-gray-800 text-right max-w-[60%] font-medium">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
