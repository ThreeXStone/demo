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

  const inputClass = 'w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900/10 transition-colors';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      </div>
      <div className="p-4 space-y-4">
        {fields.map((f) => (
          <div key={f.name}>
            <label className={labelClass}>
              {f.label}
              {f.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {f.fieldType === 'select' ? (
              <select
                id={f.name} name={f.name}
                value={formData[f.name] || ''}
                onChange={(e) => setField(f.name, e.target.value)}
                required={f.required}
                className={inputClass}
              >
                <option value="" disabled>{f.placeholder || '请选择'}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : f.fieldType === 'textarea' ? (
              <textarea
                id={f.name} name={f.name}
                value={formData[f.name] || ''}
                onChange={(e) => setField(f.name, e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            ) : (
              <input
                id={f.name} name={f.name}
                type={f.fieldType === 'number' ? 'number' : 'text'}
                value={formData[f.name] || ''}
                onChange={(e) => setField(f.name, e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
                className={inputClass}
              />
            )}
          </div>
        ))}
        <button
          type="submit"
          className="w-full py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          {submitLabel || '提交'}
        </button>
      </div>
    </form>
  );
}
