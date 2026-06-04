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
          selectedValue={component.selectedValue}
          onAction={onAction}
        />
      );
    case 'form':
      return (
        <DynamicForm
          title={component.title}
          fields={component.fields}
          submitLabel={component.submitLabel}
          submittedFormData={component.submittedFormData}
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
    case 'clarify_question': {
      const answered = component.answeredValue;
      const isDisabled = component.disabled || !!answered;
      return (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-800">{component.question}</h4>
            {answered && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                已选
              </span>
            )}
          </div>
          <div className="p-3 space-y-1">
            {component.options.map((opt) => {
              const isSelected = answered === opt;
              return (
                <button
                  key={opt}
                  disabled={isDisabled}
                  onClick={() => onAction({
                    type: 'clarify_answer',
                    questionId: component.questionId,
                    answer: opt,
                    source: 'chip',
                  })}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-blue-300 bg-blue-50'
                      : isDisabled
                        ? 'border-gray-100 bg-gray-50 cursor-not-allowed'
                        : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-sm font-medium ${
                    isSelected ? 'text-blue-700' : isDisabled ? 'text-gray-400' : 'text-gray-800'
                  }`}>
                    {isSelected && <span className="mr-1.5">&#10003;</span>}
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }
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
