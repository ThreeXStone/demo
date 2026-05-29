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
    case 'text':
      return (
        <div className="prose prose-invert prose-sm max-w-none">
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {component.content}
          </p>
        </div>
      );
    default:
      return null;
  }
}
