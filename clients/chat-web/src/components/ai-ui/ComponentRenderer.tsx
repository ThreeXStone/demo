'use client';

import type { UIComponent } from '@/lib/types';
import SelectionCard from './SelectionCard';
import DynamicForm from './DynamicForm';
import ConfirmationDialog from './ConfirmationDialog';
import InfoCard from './InfoCard';
import StepsProgress from './StepsProgress';
import DataTable from './DataTable';
import ActionButtons from './ActionButtons';

interface Props {
  component: UIComponent;
  onAction: (action: Record<string, unknown>) => void;
}

export default function ComponentRenderer({ component, onAction }: Props) {
  switch (component.type) {
    case 'selection':
      return (
        <SelectionCard
          title={component.title}
          options={component.options}
          allowMultiple={component.allowMultiple}
          onAction={onAction}
        />
      );
    case 'form':
      return (
        <DynamicForm
          title={component.title}
          fields={component.fields}
          submitLabel={component.submitLabel}
          onAction={onAction}
        />
      );
    case 'confirmation':
      return (
        <ConfirmationDialog
          title={component.title}
          summary={component.summary}
          confirmLabel={component.confirmLabel}
          cancelLabel={component.cancelLabel}
          severity={component.severity}
          onAction={onAction}
        />
      );
    case 'card':
      return (
        <InfoCard
          title={component.title}
          sections={component.sections}
          status={component.status}
        />
      );
    case 'steps':
      return <StepsProgress steps={component.steps} />;
    case 'table':
      return <DataTable columns={component.columns} rows={component.rows} />;
    case 'action_buttons':
      return (
        <ActionButtons
          title={component.title}
          buttons={component.buttons}
          onAction={onAction}
        />
      );
    case 'clarify_question':
      return (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-800">{component.question}</h4>
          </div>
          <div className="p-3 space-y-1">
            {component.options.map((opt) => (
              <button
                key={opt}
                onClick={() => onAction({
                  type: 'clarify_answer',
                  questionId: component.questionId,
                  answer: opt,
                  source: 'chip',
                })}
                className="w-full text-left px-4 py-3 rounded-lg border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all"
              >
                <span className="text-sm font-medium text-gray-800">{opt}</span>
              </button>
            ))}
          </div>
        </div>
      );
    case 'text':
      return (
        <div className="prose prose-invert prose-sm max-w-none">
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {component.content}
          </p>
        </div>
      );
    default:
      console.warn(`Unknown component type: ${(component as any).type}`);
      return (
        <div className="px-3 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-500">
          [不支持的组件类型: {(component as any).type}]
        </div>
      );
  }
}
