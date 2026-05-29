// --- UI Component Types ---

export interface UIText {
  type: 'text';
  content: string; // Markdown
}

export interface UISelection {
  type: 'selection';
  title: string;
  mode: 'single' | 'multiple';
  options: { label: string; value: string; description?: string }[];
}

export interface UIFormField {
  name: string;
  label: string;
  type: 'input' | 'select' | 'textarea' | 'date' | 'number';
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[]; // for select
  defaultValue?: string | number;
}

export interface UIForm {
  type: 'form';
  title: string;
  fields: UIFormField[];
  submitLabel?: string;
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

export interface UIActionButtons {
  type: 'action_buttons';
  buttons: { label: string; value: string; style?: 'primary' | 'secondary' | 'danger' }[];
}

export type UIResponse =
  | UIText
  | UISelection
  | UIForm
  | UIConfirmation
  | UICard
  | UISteps
  | UITable
  | UIActionButtons;

// --- AI Response ---

export interface AIUIResponse {
  message: string;
  components: UIResponse[];
}

// --- User Action ---

export interface UIAction {
  type: 'select' | 'form_submit' | 'confirm' | 'cancel' | 'button_click';
  componentId?: string;
  payload: Record<string, unknown>;
}
