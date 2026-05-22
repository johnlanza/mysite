import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  Archive,
  Bell,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  CloudOff,
  Droplets,
  Fan,
  Filter,
  Hammer,
  Home,
  KeyRound,
  Leaf,
  Paintbrush,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Undo2,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { defaultTasks, monthNames } from './data/defaultTasks';
import type { Category, Completion, MaintenanceTask, Preferences, StoredState } from './types';

const STORAGE_KEY = 'homekeeper-state-v1';
const SYNC_STORAGE_KEY = 'homekeeper-sync-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>;

const categories: Category[] = [
  'Appliances',
  'Exterior',
  'Safety',
  'Systems',
  'Water',
  'Cleaning',
  'Planning',
  'Seasonal',
];

const categoryMeta: Record<
  Category,
  {
    Icon: LucideIcon;
    color: string;
    soft: string;
  }
> = {
  Appliances: { Icon: Fan, color: '#2866d2', soft: '#dce9ff' },
  Exterior: { Icon: Leaf, color: '#227144', soft: '#dff2e6' },
  Safety: { Icon: ShieldCheck, color: '#9d2149', soft: '#ffe0eb' },
  Systems: { Icon: Wrench, color: '#6c4a20', soft: '#f5e8d3' },
  Water: { Icon: Droplets, color: '#167a8c', soft: '#d9f2f6' },
  Cleaning: { Icon: Sparkles, color: '#7252bd', soft: '#ece4ff' },
  Planning: { Icon: ClipboardCheck, color: '#7b4b00', soft: '#ffedd0' },
  Seasonal: { Icon: Paintbrush, color: '#c24e1c', soft: '#ffe4d7' },
};

const monthAccents = [
  '#2866d2',
  '#2866d2',
  '#2866d2',
  '#5a9f27',
  '#5a9f27',
  '#5a9f27',
  '#d46a1f',
  '#d46a1f',
  '#d46a1f',
  '#7f2639',
  '#7f2639',
  '#7f2639',
];

const defaultPreferences: Preferences = {
  reminderLeadDays: 5,
  notificationsEnabled: false,
};

interface ScheduledTask {
  task: MaintenanceTask;
  month: number;
  year: number;
  dueDate: Date;
}

interface TaskFormState {
  title: string;
  description: string;
  month: number;
  cadence: 'yearly' | 'twice' | 'quarterly' | 'monthly';
  category: Category;
  effortMinutes: number;
}

interface SyncSettings {
  enabled: boolean;
  syncKeyHash?: string;
}

interface SyncStatus {
  tone: 'idle' | 'syncing' | 'success' | 'error';
  message: string;
}

const defaultSyncSettings: SyncSettings = {
  enabled: false,
};

function normalizeStoredState(parsed?: Partial<StoredState> | null): StoredState {
  const preferences = {
    ...defaultPreferences,
    ...(parsed?.preferences ?? {}),
  };

  if (
    typeof window !== 'undefined' &&
    (!('Notification' in window) || Notification.permission !== 'granted')
  ) {
    preferences.notificationsEnabled = false;
  }

  return {
    customTasks: Array.isArray(parsed?.customTasks) ? parsed.customTasks : [],
    completions: Array.isArray(parsed?.completions) ? parsed.completions : [],
    archivedTaskIds: Array.isArray(parsed?.archivedTaskIds) ? parsed.archivedTaskIds : [],
    preferences,
  };
}

function readStoredState(): StoredState {
  if (typeof window === 'undefined') {
    return normalizeStoredState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return normalizeStoredState();
    }

    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return normalizeStoredState(parsed);
  } catch {
    return normalizeStoredState();
  }
}

function readSyncSettings(): SyncSettings {
  if (typeof window === 'undefined') {
    return defaultSyncSettings;
  }

  try {
    const raw = window.localStorage.getItem(SYNC_STORAGE_KEY);
    if (!raw) {
      return defaultSyncSettings;
    }

    const parsed = JSON.parse(raw) as Partial<SyncSettings>;
    return {
      enabled: parsed.enabled === true && typeof parsed.syncKeyHash === 'string',
      syncKeyHash: typeof parsed.syncKeyHash === 'string' ? parsed.syncKeyHash : undefined,
    };
  } catch {
    return defaultSyncSettings;
  }
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

function isComplete(completions: Completion[], taskId: string, month: number, year: number) {
  return completions.some(
    (completion) =>
      completion.taskId === taskId && completion.month === month && completion.year === year,
  );
}

function scheduleForYear(tasks: MaintenanceTask[], year: number): ScheduledTask[] {
  return tasks
    .flatMap((task) =>
      task.months.map((month) => ({
        task,
        month,
        year,
        dueDate: new Date(year, month, 15),
      })),
    )
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

function formatCompactDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function monthCadence(startMonth: number, cadence: TaskFormState['cadence']) {
  if (cadence === 'monthly') {
    return monthNames.map((_, index) => index);
  }

  if (cadence === 'quarterly') {
    return [0, 3, 6, 9].map((offset) => (startMonth + offset) % 12).sort((a, b) => a - b);
  }

  if (cadence === 'twice') {
    return [startMonth, (startMonth + 6) % 12].sort((a, b) => a - b);
  }

  return [startMonth];
}

function escapeIcs(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');
}

function formatIcsDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function buildCalendarFile(tasks: MaintenanceTask[], year: number) {
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const events = scheduleForYear(tasks, year)
    .map(({ task, dueDate, month }) => {
      const start = formatIcsDate(dueDate);
      const end = formatIcsDate(new Date(year, month, 16));
      return [
        'BEGIN:VEVENT',
        `UID:${year}-${month}-${task.id}@homekeeper.local`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeIcs(`Home maintenance: ${task.title}`)}`,
        `DESCRIPTION:${escapeIcs(task.description)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcs(task.title)}`,
        'TRIGGER:-P2D',
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    })
    .join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Homekeeper//Maintenance Calendar//EN',
    'CALSCALE:GREGORIAN',
    events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadCalendar(tasks: MaintenanceTask[], year: number) {
  const blob = new Blob([buildCalendarFile(tasks, year)], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `homekeeper-${year}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function hashSyncKey(value: string) {
  if (!window.crypto?.subtle) {
    throw new Error('Secure sync is unavailable in this browser.');
  }

  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchRemoteState(syncKeyHash: string) {
  const response = await fetch(`/api/homekeeper-sync?key=${encodeURIComponent(syncKeyHash)}`);
  if (!response.ok) {
    throw new Error('Backup unavailable.');
  }

  return (await response.json()) as {
    exists: boolean;
    state?: Partial<StoredState>;
    updatedAt?: string;
  };
}

async function saveRemoteState(syncKeyHash: string, state: StoredState, signal?: AbortSignal) {
  const response = await fetch('/api/homekeeper-sync', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ syncKeyHash, state }),
    signal,
  });

  if (!response.ok) {
    throw new Error('Backup failed.');
  }

  return (await response.json()) as { ok: true; updatedAt?: string };
}

function formatSyncTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function App() {
  const stored = useMemo(readStoredState, []);
  const storedSyncSettings = useMemo(readSyncSettings, []);
  const today = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [customTasks, setCustomTasks] = useState<MaintenanceTask[]>(stored.customTasks);
  const [completions, setCompletions] = useState<Completion[]>(stored.completions);
  const [archivedTaskIds, setArchivedTaskIds] = useState<string[]>(stored.archivedTaskIds);
  const [preferences, setPreferences] = useState<Preferences>(stored.preferences);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(storedSyncSettings);
  const [syncKeyInput, setSyncKeyInput] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    tone: 'idle',
    message: storedSyncSettings.enabled ? 'Ready to sync' : 'Local only',
  });
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [isAdding, setIsAdding] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);
  const monthButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [form, setForm] = useState<TaskFormState>({
    title: '',
    description: '',
    month: today.getMonth(),
    cadence: 'yearly',
    category: 'Seasonal',
    effortMinutes: 20,
  });

  const allTasks = useMemo(() => [...defaultTasks, ...customTasks], [customTasks]);
  const archivedIdSet = useMemo(() => new Set(archivedTaskIds), [archivedTaskIds]);
  const tasks = useMemo(
    () => allTasks.filter((task) => !archivedIdSet.has(task.id)),
    [allTasks, archivedIdSet],
  );
  const archivedTasks = useMemo(
    () =>
      allTasks
        .filter((task) => archivedIdSet.has(task.id))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [allTasks, archivedIdSet],
  );
  const stateSnapshot = useMemo<StoredState>(
    () => ({
      customTasks,
      completions,
      archivedTaskIds,
      preferences,
    }),
    [archivedTaskIds, completions, customTasks, preferences],
  );
  const selectedMonthTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.months.includes(selectedMonth))
        .filter((task) => {
          const searchText = `${task.title} ${task.description} ${task.category}`.toLowerCase();
          const matchesQuery = searchText.includes(query.trim().toLowerCase());
          const matchesCategory = categoryFilter === 'All' || task.category === categoryFilter;
          return matchesQuery && matchesCategory;
        }),
    [categoryFilter, query, selectedMonth, tasks],
  );

  const rawMonthTasks = useMemo(
    () => tasks.filter((task) => task.months.includes(selectedMonth)),
    [selectedMonth, tasks],
  );

  const completedThisMonth = rawMonthTasks.filter((task) =>
    isComplete(completions, task.id, selectedMonth, selectedYear),
  ).length;
  const monthProgress =
    rawMonthTasks.length > 0 ? Math.round((completedThisMonth / rawMonthTasks.length) * 100) : 0;

  const thisYearSchedule = useMemo(
    () => scheduleForYear(tasks, selectedYear),
    [selectedYear, tasks],
  );

  const upcoming = useMemo(() => {
    const nextYearSchedule = scheduleForYear(tasks, selectedYear + 1);
    return [...thisYearSchedule, ...nextYearSchedule]
      .filter((scheduled) => {
        const isDone = isComplete(completions, scheduled.task.id, scheduled.month, scheduled.year);
        return !isDone && daysBetween(today, scheduled.dueDate) >= -20;
      })
      .sort((a, b) => {
        const aDistance = Math.abs(daysBetween(today, a.dueDate));
        const bDistance = Math.abs(daysBetween(today, b.dueDate));
        return aDistance - bDistance;
      })
      .slice(0, 7);
  }, [completions, selectedYear, tasks, thisYearSchedule, today]);

  const pointsThisYear = useMemo(
    () =>
      completions
        .filter((completion) => completion.year === selectedYear)
        .reduce((total, completion) => {
          const task = tasks.find((item) => item.id === completion.taskId);
          return total + (task?.points ?? 0);
        }, 0),
    [completions, selectedYear, tasks],
  );

  const doneMonths = useMemo(
    () =>
      monthNames.filter((_, month) => {
        const monthTasks = tasks.filter((task) => task.months.includes(month));
        return (
          monthTasks.length > 0 &&
          monthTasks.every((task) => isComplete(completions, task.id, month, selectedYear))
        );
      }).length,
    [completions, selectedYear, tasks],
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateSnapshot));
  }, [stateSnapshot]);

  useEffect(() => {
    window.localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(syncSettings));
  }, [syncSettings]);

  useEffect(() => {
    if (!syncSettings.enabled || !syncSettings.syncKeyHash) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSyncStatus({ tone: 'syncing', message: 'Saving...' });
      saveRemoteState(syncSettings.syncKeyHash!, stateSnapshot, controller.signal)
        .then((result) => {
          setSyncStatus({
            tone: 'success',
            message: `Synced ${formatSyncTime(result.updatedAt)}`,
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          setSyncStatus({ tone: 'error', message: 'Sync failed' });
        });
    }, 900);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [stateSnapshot, syncSettings]);

  useEffect(() => {
    monthButtonRefs.current[selectedMonth]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedMonth]);

  useEffect(() => {
    if (!celebration) {
      return;
    }

    const timer = window.setTimeout(() => setCelebration(null), 1800);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  useEffect(() => {
    if (!preferences.notificationsEnabled || !('Notification' in window)) {
      return;
    }

    if (Notification.permission !== 'granted') {
      return;
    }

    const dateKey = startOfDay(today).toISOString();
    if (preferences.lastReminderDate === dateKey) {
      return;
    }

    const dueSoon = scheduleForYear(tasks, today.getFullYear())
      .filter((scheduled) => {
        const distance = daysBetween(today, scheduled.dueDate);
        return (
          distance >= -7 &&
          distance <= preferences.reminderLeadDays &&
          !isComplete(completions, scheduled.task.id, scheduled.month, scheduled.year)
        );
      })
      .slice(0, 4);

    if (dueSoon.length > 0) {
      const first = dueSoon[0];
      new Notification(`${dueSoon.length} home task${dueSoon.length > 1 ? 's' : ''} ready`, {
        body: `${first.task.title}${dueSoon.length > 1 ? ` and ${dueSoon.length - 1} more` : ''}`,
      });
    }

    setPreferences((current) => ({
      ...current,
      lastReminderDate: dateKey,
    }));
  }, [completions, preferences, tasks, today]);

  function moveMonth(direction: -1 | 1) {
    setSelectedMonth((current) => {
      const next = current + direction;
      if (next < 0) {
        setSelectedYear((year) => year - 1);
        return 11;
      }
      if (next > 11) {
        setSelectedYear((year) => year + 1);
        return 0;
      }
      return next;
    });
  }

  function toggleTask(task: MaintenanceTask, month = selectedMonth, year = selectedYear) {
    const alreadyDone = isComplete(completions, task.id, month, year);
    if (!alreadyDone) {
      setCelebration(`+${task.points}`);
    }

    setCompletions((current) =>
      alreadyDone
        ? current.filter(
            (completion) =>
              !(
                completion.taskId === task.id &&
                completion.month === month &&
                completion.year === year
              ),
          )
        : [
            ...current,
            {
              taskId: task.id,
              month,
              year,
              completedAt: new Date().toISOString(),
            },
          ],
    );
  }

  function archiveTask(task: MaintenanceTask) {
    setArchivedTaskIds((current) =>
      current.includes(task.id) ? current : [...current, task.id],
    );
    setCelebration('Archived');
  }

  function restoreTask(taskId: string) {
    setArchivedTaskIds((current) => current.filter((id) => id !== taskId));
  }

  async function enableNotifications() {
    if (!('Notification' in window)) {
      return;
    }

    const permission = await Notification.requestPermission();
    setPreferences((current) => ({
      ...current,
      notificationsEnabled: permission === 'granted',
      lastReminderDate: undefined,
    }));
  }

  async function connectSync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const syncKey = syncKeyInput.trim();
    if (syncKey.length < 6) {
      setSyncStatus({ tone: 'error', message: 'Use 6+ characters' });
      return;
    }

    try {
      setSyncStatus({ tone: 'syncing', message: 'Checking backup...' });
      const syncKeyHash = await hashSyncKey(syncKey);
      const remote = await fetchRemoteState(syncKeyHash);

      if (remote.exists) {
        const remoteState = normalizeStoredState(remote.state);
        setCustomTasks(remoteState.customTasks);
        setCompletions(remoteState.completions);
        setArchivedTaskIds(remoteState.archivedTaskIds);
        setPreferences(remoteState.preferences);
        setSyncStatus({
          tone: 'success',
          message: `Restored ${formatSyncTime(remote.updatedAt)}`,
        });
      } else {
        const result = await saveRemoteState(syncKeyHash, stateSnapshot);
        setSyncStatus({
          tone: 'success',
          message: `Synced ${formatSyncTime(result.updatedAt)}`,
        });
      }

      setSyncSettings({ enabled: true, syncKeyHash });
      setSyncKeyInput('');
    } catch {
      setSyncStatus({ tone: 'error', message: 'Sync unavailable' });
    }
  }

  function disconnectSync() {
    setSyncSettings(defaultSyncSettings);
    setSyncStatus({ tone: 'idle', message: 'Local only' });
    setSyncKeyInput('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      return;
    }

    const newTask: MaintenanceTask = {
      id: `custom-${Date.now()}`,
      title,
      description: form.description.trim() || 'Custom maintenance item.',
      months: monthCadence(form.month, form.cadence),
      category: form.category,
      effortMinutes: Math.max(5, Number(form.effortMinutes) || 20),
      points: Math.min(100, Math.max(15, Math.round((Number(form.effortMinutes) || 20) * 1.4))),
      source: 'custom',
    };

    setCustomTasks((current) => [...current, newTask]);
    setForm({
      title: '',
      description: '',
      month: selectedMonth,
      cadence: 'yearly',
      category: 'Seasonal',
      effortMinutes: 20,
    });
    setSelectedMonth(newTask.months[0]);
    setIsAdding(false);
  }

  function removeCustomTask(taskId: string) {
    setCustomTasks((current) => current.filter((task) => task.id !== taskId));
    setCompletions((current) => current.filter((completion) => completion.taskId !== taskId));
    setArchivedTaskIds((current) => current.filter((id) => id !== taskId));
  }

  function resetMonth() {
    setCompletions((current) =>
      current.filter(
        (completion) =>
          !(completion.month === selectedMonth && completion.year === selectedYear),
      ),
    );
  }

  return (
    <main className="app-shell">
      {celebration && (
        <div className="celebration" aria-live="polite">
          <Sparkles size={18} />
          <span>{celebration}</span>
        </div>
      )}

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Home size={24} />
          </div>
          <div>
            <p className="eyebrow">Local schedule</p>
            <h1>Homekeeper</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="icon-button" onClick={() => moveMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={20} />
          </button>
          <button className="icon-button" onClick={() => moveMonth(1)} aria-label="Next month">
            <ChevronRight size={20} />
          </button>
          <button className="primary-button" onClick={() => setIsAdding(true)}>
            <Plus size={18} />
            New item
          </button>
        </div>
      </header>

      <section
        className="hero-panel"
        style={{ '--accent': monthAccents[selectedMonth] } as CSSVarStyle}
      >
        <div className="hero-copy">
          <p className="eyebrow">{selectedYear}</p>
          <h2>{monthNames[selectedMonth]}</h2>
          <p className="hero-subtitle">
            {completedThisMonth} of {rawMonthTasks.length} complete
          </p>
        </div>

        <div className="hero-metrics">
          <div
            className="progress-orb"
            style={{ '--progress': `${monthProgress}%` } as CSSVarStyle}
            aria-label={`${monthProgress}% complete`}
          >
            <span>{monthProgress}%</span>
          </div>
          <div className="stat">
            <Trophy size={18} />
            <strong>{pointsThisYear}</strong>
            <span>points</span>
          </div>
          <div className="stat">
            <CalendarDays size={18} />
            <strong>{doneMonths}</strong>
            <span>perfect months</span>
          </div>
        </div>
      </section>

      <nav className="month-strip" aria-label="Months">
        {monthNames.map((month, index) => {
          const count = tasks.filter((task) => task.months.includes(index)).length;
          const done = tasks.filter(
            (task) =>
              task.months.includes(index) && isComplete(completions, task.id, index, selectedYear),
          ).length;
          return (
            <button
              key={month}
              ref={(node) => {
                monthButtonRefs.current[index] = node;
              }}
              className={`month-pill ${selectedMonth === index ? 'is-active' : ''}`}
              onClick={() => setSelectedMonth(index)}
              style={{ '--month-color': monthAccents[index] } as CSSVarStyle}
            >
              <span>{month.slice(0, 3)}</span>
              <small>
                {done}/{count}
              </small>
            </button>
          );
        })}
      </nav>

      <section className="content-grid">
        <aside className="side-panel">
          <div className="panel-section reminder-box">
            <div className="panel-title">
              <Bell size={18} />
              <h3>Reminders</h3>
            </div>
            <label className="compact-label" htmlFor="lead-days">
              Lead time
            </label>
            <select
              id="lead-days"
              value={preferences.reminderLeadDays}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  reminderLeadDays: Number(event.target.value),
                  lastReminderDate: undefined,
                }))
              }
            >
              <option value={2}>2 days</option>
              <option value={5}>5 days</option>
              <option value={10}>10 days</option>
              <option value={14}>14 days</option>
            </select>
            <button className="secondary-button full-width" onClick={enableNotifications}>
              <Bell size={17} />
              {preferences.notificationsEnabled ? 'Reminders on' : 'Enable reminders'}
            </button>
            <button
              className="secondary-button full-width"
              onClick={() => downloadCalendar(tasks, selectedYear)}
            >
              <CalendarPlus size={17} />
              Calendar file
            </button>
          </div>

          <div className="panel-section sync-box">
            <div className="panel-title">
              {syncSettings.enabled ? <Cloud size={18} /> : <CloudOff size={18} />}
              <h3>Backup</h3>
            </div>
            {syncSettings.enabled ? (
              <div className="sync-connected">
                <div className={`sync-status is-${syncStatus.tone}`}>
                  <span>{syncStatus.message}</span>
                </div>
                <button className="secondary-button full-width" onClick={disconnectSync}>
                  <CloudOff size={17} />
                  Disconnect
                </button>
              </div>
            ) : (
              <form className="sync-form" onSubmit={connectSync}>
                <label className="compact-label" htmlFor="sync-key">
                  Sync key
                </label>
                <div className="sync-key-row">
                  <KeyRound size={17} />
                  <input
                    id="sync-key"
                    type="password"
                    value={syncKeyInput}
                    onChange={(event) => setSyncKeyInput(event.target.value)}
                    placeholder="Private key"
                    autoComplete="off"
                  />
                </div>
                <button className="secondary-button full-width" type="submit">
                  <Cloud size={17} />
                  Start backup
                </button>
                <div className={`sync-status is-${syncStatus.tone}`}>
                  <span>{syncStatus.message}</span>
                </div>
              </form>
            )}
          </div>

          <div className="panel-section">
            <div className="panel-title">
              <Sparkles size={18} />
              <h3>Up next</h3>
            </div>
            <div className="up-next-list">
              {upcoming.map((scheduled) => {
                const distance = daysBetween(today, scheduled.dueDate);
                return (
                  <button
                    key={`${scheduled.year}-${scheduled.month}-${scheduled.task.id}`}
                    className="up-next-item"
                    onClick={() => {
                      setSelectedMonth(scheduled.month);
                      setSelectedYear(scheduled.year);
                    }}
                  >
                    <span className="date-chip">{formatCompactDate(scheduled.dueDate)}</span>
                    <span>{scheduled.task.title}</span>
                    <small>
                      {distance < 0
                        ? `${Math.abs(distance)}d late`
                        : distance === 0
                          ? 'today'
                          : `${distance}d`}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>

          {archivedTasks.length > 0 && (
            <div className="panel-section">
              <div className="panel-title">
                <Archive size={18} />
                <h3>Archived</h3>
              </div>
              <div className="archived-list">
                {archivedTasks.map((task) => (
                  <div className="archived-item" key={task.id}>
                    <span>{task.title}</span>
                    <button
                      className="small-icon-button restore-button"
                      onClick={() => restoreTask(task.id)}
                      aria-label={`Restore ${task.title}`}
                      title="Restore task"
                    >
                      <Undo2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="task-board">
          <div className="board-toolbar">
            <div className="search-wrap">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks"
              />
            </div>
            <div className="filter-wrap">
              <Filter size={18} />
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as Category | 'All')}
              >
                <option value="All">All</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <button className="ghost-button" onClick={resetMonth}>
              <RotateCcw size={17} />
              Reset
            </button>
          </div>

          <div className="task-grid">
            {selectedMonthTasks.map((task) => {
              const meta = categoryMeta[task.category];
              const done = isComplete(completions, task.id, selectedMonth, selectedYear);
              const Icon = meta.Icon;
              return (
                <article
                  className={`task-card ${done ? 'is-done' : ''}`}
                  key={`${task.id}-${selectedMonth}`}
                  style={{ '--task-color': meta.color, '--task-soft': meta.soft } as CSSVarStyle}
                >
                  <div className="task-card-top">
                    <div className="task-icon">
                      <Icon size={20} />
                    </div>
                    <div className="task-actions">
                      {task.source === 'custom' && (
                        <button
                          className="small-icon-button"
                          onClick={() => removeCustomTask(task.id)}
                          aria-label={`Delete ${task.title}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <button
                        className="small-icon-button archive-button"
                        onClick={() => archiveTask(task)}
                        aria-label={`Archive ${task.title}`}
                        title="Archive task"
                      >
                        <Archive size={16} />
                      </button>
                      <button
                        className={`check-button ${done ? 'is-checked' : ''}`}
                        onClick={() => toggleTask(task)}
                        aria-label={done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
                      >
                        <Check size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="task-copy">
                    <p className="task-category">{task.category}</p>
                    <h3>{task.title}</h3>
                    <p>{task.description}</p>
                  </div>

                  <div className="task-meta">
                    <span>{task.effortMinutes} min</span>
                    <span>{task.points} pts</span>
                    {task.tools?.slice(0, 1).map((tool) => <span key={tool}>{tool}</span>)}
                  </div>
                </article>
              );
            })}
          </div>

          {selectedMonthTasks.length === 0 && (
            <div className="empty-state">
              <Hammer size={32} />
              <h3>No matching tasks</h3>
              <button className="primary-button" onClick={() => setIsAdding(true)}>
                <Plus size={18} />
                Add item
              </button>
            </div>
          )}
        </section>
      </section>

      {isAdding && (
        <div className="modal-backdrop" role="presentation">
          <section className="task-modal" aria-label="Add maintenance item">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Custom item</p>
                <h2>Add maintenance</h2>
              </div>
              <button className="icon-button" onClick={() => setIsAdding(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <form className="task-form" onSubmit={handleSubmit}>
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Clean patio cushions"
                  autoFocus
                />
              </label>

              <label>
                Notes
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="What should future you remember?"
                  rows={4}
                />
              </label>

              <div className="form-row">
                <label>
                  Month
                  <select
                    value={form.month}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, month: Number(event.target.value) }))
                    }
                  >
                    {monthNames.map((month, index) => (
                      <option value={index} key={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Cadence
                  <select
                    value={form.cadence}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cadence: event.target.value as TaskFormState['cadence'],
                      }))
                    }
                  >
                    <option value="yearly">Yearly</option>
                    <option value="twice">Twice yearly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Category
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        category: event.target.value as Category,
                      }))
                    }
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Effort
                  <input
                    type="number"
                    min="5"
                    max="480"
                    step="5"
                    value={form.effortMinutes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        effortMinutes: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setIsAdding(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Plus size={18} />
                  Add item
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
