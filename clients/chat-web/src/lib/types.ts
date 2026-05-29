// --- UI Components ---

export interface UIText {
  type: 'text';
  content: string;
}

export interface UISelection {
  type: 'selection';
  title: string;
  options: { label: string; value: string; description?: string }[];
  allowMultiple?: boolean;
}

export interface UIDynamicForm {
  type: 'form';
  title: string;
  fields: UIFormField[];
  submitLabel?: string;
}

export interface UIFormField {
  name: string;
  label: string;
  fieldType: 'input' | 'select' | 'textarea' | 'date' | 'number';
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  defaultValue?: string;
}

export interface UIConfirmation {
  type: 'confirmation';
  title: string;
  summary: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: 'info' | 'warning' | 'danger';
}

export interface UICard {
  type: 'card';
  title: string;
  sections: { label: string; value: string }[];
  status?: { label: string; color: 'green' | 'yellow' | 'red' | 'blue' | 'gray' };
}

export interface UISteps {
  type: 'steps';
  steps: { label: string; status: 'completed' | 'current' | 'pending' }[];
}

export interface UITable {
  type: 'table';
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
}

export interface UIActionBtns {
  type: 'action_buttons';
  title?: string;
  buttons: { label: string; value: string; style?: 'primary' | 'secondary' | 'danger' }[];
}

export type UIComponent =
  | UIText
  | UISelection
  | UIDynamicForm
  | UIConfirmation
  | UICard
  | UISteps
  | UITable
  | UIActionBtns;

export interface AIUIResponse {
  message: string;
  components: UIComponent[];
}

export interface UIAction {
  componentType?: string;
  payload?: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  components?: UIComponent[];
}
