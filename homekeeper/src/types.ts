export type Category =
  | 'Appliances'
  | 'Exterior'
  | 'Safety'
  | 'Systems'
  | 'Water'
  | 'Cleaning'
  | 'Planning'
  | 'Seasonal';

export type TaskSource = 'sheet' | 'custom';

export interface MaintenanceTask {
  id: string;
  title: string;
  description: string;
  months: number[];
  category: Category;
  effortMinutes: number;
  points: number;
  source: TaskSource;
  tools?: string[];
}

export interface Completion {
  taskId: string;
  month: number;
  year: number;
  completedAt: string;
}

export interface Preferences {
  reminderLeadDays: number;
  notificationsEnabled: boolean;
  lastReminderDate?: string;
}

export interface StoredState {
  customTasks: MaintenanceTask[];
  completions: Completion[];
  preferences: Preferences;
}
