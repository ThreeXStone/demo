'use client';

import { useState } from 'react';
import type { UIFormField } from '@/lib/types';

interface Props {
  title: string;
  fields: UIFormField[];
  submitLabel?: string;
  onAction: (action: Record<string, unknown>) => void;
}

export default function DynamicForm({ title, fields, submitLabel, onAction }: Props) {
  const [formData, setFormData] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAction({ type: 'submit', formData });
  };

  const setField = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h4 className="text-sm font-medium text-zinc-200">{title}</h4>
      </div>
      <div className="p-4 space-y-4">
        {fields.map((f) => (
          <div key={f.name}>
            <label className="block text-sm text-zinc-400 mb-1.5">
              {f.label}
              {f.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            {f.fieldType === 'select' ? (
              <select
                value={formData[f.name] || ''}
                onChange={(e) => setField(f.name, e.target.value)}
                required={f.required}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="" disabled>{f.placeholder || '请选择'}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : f.fieldType === 'textarea' ? (
              <textarea
                value={formData[f.name] || ''}
                onChange={(e) => setField(f.name, e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
                rows={3}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors resize-none placeholder:text-zinc-600"
              />
            ) : (
              <input
                type={f.fieldType === 'number' ? 'number' : 'text'}
                value={formData[f.name] || ''}
                onChange={(e) => setField(f.name, e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600"
              />
            )}
          </div>
        ))}
        <button
          type="submit"
          className="w-full py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-400 transition-colors text-sm font-medium"
        >
          {submitLabel || '提交'}
        </button>
      </div>
    </form>
  );
}
