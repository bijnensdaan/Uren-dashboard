"use client";

import {
  useState,
  useEffect,
  useTransition,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Play,
  Coffee,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Target,
  X,
} from "lucide-react";
import { createTrackerSession, updateTimeEntrySession, deleteTimeEntry } from "@/app/actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, inputClass } from "@/components/ui/form-fields";
import { formatHours, cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmployeeOpt = { id: string; name: string; profileCategoryId: string; profileName: string };
type ContractOpt = { id: string; code: string; name: string };
type TaskOpt = { id: string; name: string; contractId: string };
type EntryDTO = {
  id: string;
  date: string; // ISO
  hours: number;
  notes: string | null;
  clockIn: string | null;
  clockOut: string | null;
  pauseMinutes: number | null;
  employeeId: string;
  employeeName: string;
  contractId: string;
  contractCode: string;
  taskId: string;
  taskName: string;
  profileName: string;
};
type Props = {
  employees: EmployeeOpt[];
  contracts: ContractOpt[];
  tasks: TaskOpt[];
  entries: EntryDTO[];
};

// De lopende sessie kent (bewust) géén medewerker/contract/taak meer:
// die worden pas bij het uitklokken bevraagd.
type ActiveSession = {
  startTs: number;
  pausedAccumMs: number;
  isPaused: boolean;
  pauseStartedTs: number | null;
};

const ACTIVE_KEY = "tracker_active";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad2(n: number) {
  return String(Math.floor(n)).padStart(2, "0");
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function hhmmToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToHHMM(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function msToHHMMSS(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function toLocalDateStr(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function tsToHHMM(ts: number) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function calcHours(clockInHHMM: string, clockOutHHMM: string, pauseMin: number) {
  const inMin = hhmmToMinutes(clockInHHMM);
  const outMin = hhmmToMinutes(clockOutHHMM);
  return round2(Math.max(0, (outMin - inMin) / 60 - pauseMin / 60));
}

function isoToYMD(iso: string) {
  return iso.slice(0, 10);
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 1=Mon,...
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Group entries by day (YYYY-MM-DD), newest first
function groupByDay(entries: EntryDTO[]) {
  const map = new Map<string, EntryDTO[]>();
  for (const e of entries) {
    const day = isoToYMD(e.date);
    const arr = map.get(day) ?? [];
    arr.push(e);
    map.set(day, arr);
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}

function formatDayLabel(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" });
}

function monthLabel(year: number, month: number) {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-base font-bold text-slate-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--muted)] hover:bg-slate-100"
            aria-label="Sluiten"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Session form (gedeeld door toevoegen + bewerken) ─────────────────────────

type SessionFormProps = {
  mode: "create" | "edit";
  entry?: EntryDTO;
  employees: EmployeeOpt[];
  contracts: ContractOpt[];
  tasks: TaskOpt[];
  defaultEmployeeId?: string;
  defaultContractId?: string;
  defaultTaskId?: string;
  onClose: () => void;
};

function SessionForm({
  mode,
  entry,
  employees,
  contracts,
  tasks,
  defaultEmployeeId,
  defaultContractId,
  defaultTaskId,
  onClose,
}: SessionFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const initEmployee = entry?.employeeId ?? defaultEmployeeId ?? employees[0]?.id ?? "";
  const initContract = entry?.contractId ?? defaultContractId ?? contracts[0]?.id ?? "";
  const initTask = entry?.taskId ?? defaultTaskId ?? "";

  const [employeeId, setEmployeeId] = useState(initEmployee);
  const [contractId, setContractId] = useState(initContract);
  const [taskId, setTaskId] = useState(initTask);
  const [date, setDate] = useState(entry ? isoToYMD(entry.date) : toLocalDateStr(Date.now()));
  const [clockIn, setClockIn] = useState(entry?.clockIn ?? "09:00");
  const [clockOut, setClockOut] = useState(entry?.clockOut ?? "17:00");
  const [pauseMinutes, setPauseMinutes] = useState(String(entry?.pauseMinutes ?? 30));
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [error, setError] = useState("");

  const filteredTasks = tasks.filter((t) => t.contractId === contractId);

  useEffect(() => {
    const filtered = tasks.filter((t) => t.contractId === contractId);
    if (filtered.length > 0 && !filtered.find((t) => t.id === taskId)) {
      setTaskId(filtered[0].id);
    }
  }, [contractId, tasks, taskId]);

  const computedHours = (() => {
    const pause = parseInt(pauseMinutes, 10);
    if (!clockIn || !clockOut || isNaN(pause)) return null;
    const h = calcHours(clockIn, clockOut, pause);
    return h > 0 ? h : null;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const pause = parseInt(pauseMinutes, 10);
    if (isNaN(pause) || pause < 0) { setError("Pauze in minuten moet 0 of meer zijn."); return; }
    if (hhmmToMinutes(clockOut) <= hhmmToMinutes(clockIn)) { setError("Uitkloktijd moet na inkloktijd liggen."); return; }
    const hours = calcHours(clockIn, clockOut, pause);
    if (hours <= 0) { setError("Berekende uren zijn 0 of negatief. Controleer tijden en pauze."); return; }
    if (!taskId) { setError("Kies een taak."); return; }

    const fd = new FormData();
    if (mode === "edit" && entry) fd.append("id", entry.id);
    fd.append("employeeId", employeeId);
    fd.append("contractId", contractId);
    fd.append("taskId", taskId);
    fd.append("date", date);
    fd.append("clockIn", clockIn);
    fd.append("clockOut", clockOut);
    fd.append("pauseMinutes", String(pause));
    fd.append("hours", String(hours));
    fd.append("notes", notes);

    startTransition(async () => {
      if (mode === "edit") {
        await updateTimeEntrySession(fd);
      } else {
        await createTrackerSession(fd);
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Medewerker" className="min-w-0">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Datum" className="min-w-0">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required />
        </Field>
        <Field label="Contract" className="min-w-0">
          <select value={contractId} onChange={(e) => setContractId(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Taak" className="min-w-0">
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required>
            {filteredTasks.length === 0
              ? <option value="">— Geen taken voor dit contract —</option>
              : filteredTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))
            }
          </select>
        </Field>
        <Field label="Inkloktijd" className="min-w-0">
          <input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required />
        </Field>
        <Field label="Uitkloktijd" className="min-w-0">
          <input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required />
        </Field>
        <Field label="Pauze (minuten)" className="min-w-0">
          <input
            type="number"
            min={0}
            value={pauseMinutes}
            onChange={(e) => setPauseMinutes(e.target.value)}
            className={cn(inputClass, "w-full min-w-0")}
            required
          />
        </Field>
        <Field label="Berekende uren" className="min-w-0">
          <div className={cn(inputClass, "flex w-full min-w-0 items-center font-semibold", computedHours ? "text-[var(--primary)]" : "text-[var(--muted)]")}>
            {computedHours != null ? formatHours(computedHours) : "—"}
          </div>
        </Field>
      </div>
      <Field label="Notities" className="min-w-0">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={cn(inputClass, "w-full min-w-0")}
          placeholder="Optioneel"
        />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
        <Button type="submit" variant="primary">
          {mode === "edit" ? "Opslaan" : "Sessie toevoegen"}
        </Button>
      </div>
    </form>
  );
}

// ─── Uitklok-bevestiging (vraagt nu medewerker/contract/taak) ─────────────────

type ClockOutModalProps = {
  open: boolean;
  session: ActiveSession | null;
  employees: EmployeeOpt[];
  contracts: ContractOpt[];
  tasks: TaskOpt[];
  defaultEmployeeId: string;
  onClose: () => void;
  onConfirmed: (employeeId: string) => void;
};

function ClockOutModal({
  open,
  session,
  contracts,
  tasks,
  employees,
  defaultEmployeeId,
  onClose,
  onConfirmed,
}: ClockOutModalProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState("");
  const [contractId, setContractId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [pauseMinutes, setPauseMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  // Init bij openen: tijden uit de sessie, M/C/T uit localStorage (laatste keuze).
  useEffect(() => {
    if (!open || !session) return;
    setClockIn(tsToHHMM(session.startTs));
    setClockOut(tsToHHMM(Date.now()));
    const pauseMs = session.pausedAccumMs + (session.isPaused && session.pauseStartedTs ? Date.now() - session.pauseStartedTs : 0);
    setPauseMinutes(String(Math.round(pauseMs / 60000)));
    setNotes("");
    setError("");

    const ls = typeof window !== "undefined" ? window.localStorage : null;
    const storedEmp = ls?.getItem("tracker_employee") ?? "";
    const storedCon = ls?.getItem("tracker_contract") ?? "";
    const storedTask = ls?.getItem("tracker_task") ?? "";

    const emp = employees.find((e) => e.id === storedEmp)?.id
      ?? employees.find((e) => e.id === defaultEmployeeId)?.id
      ?? employees[0]?.id
      ?? "";
    const con = contracts.find((c) => c.id === storedCon)?.id ?? contracts[0]?.id ?? "";
    const firstTask = tasks.filter((t) => t.contractId === con)[0]?.id ?? "";
    const task = tasks.find((t) => t.id === storedTask && t.contractId === con)?.id ?? firstTask;

    setEmployeeId(emp);
    setContractId(con);
    setTaskId(task);
  }, [open, session, employees, contracts, tasks, defaultEmployeeId]);

  // Taak resetten wanneer contract wijzigt
  useEffect(() => {
    if (!contractId) return;
    const filtered = tasks.filter((t) => t.contractId === contractId);
    if (filtered.length > 0 && !filtered.find((t) => t.id === taskId)) {
      setTaskId(filtered[0].id);
    }
  }, [contractId, tasks, taskId]);

  if (!session) return null;

  const filteredTasks = tasks.filter((t) => t.contractId === contractId);
  const pause = parseInt(pauseMinutes, 10);
  const computedHours = (() => {
    if (!clockIn || !clockOut || isNaN(pause)) return null;
    const h = calcHours(clockIn, clockOut, pause);
    return h > 0 ? h : null;
  })();

  const date = toLocalDateStr(session.startTs);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!session) return;

    const pauseMin = parseInt(pauseMinutes, 10);
    if (!employeeId) { setError("Kies een medewerker."); return; }
    if (!taskId) { setError("Kies een taak."); return; }
    if (isNaN(pauseMin) || pauseMin < 0) { setError("Pauze moet 0 of meer minuten zijn."); return; }
    if (hhmmToMinutes(clockOut) <= hhmmToMinutes(clockIn)) { setError("Uitkloktijd moet na inkloktijd liggen."); return; }
    const hours = calcHours(clockIn, clockOut, pauseMin);
    if (hours <= 0) { setError("Berekende uren zijn 0 of negatief. Pas tijden aan."); return; }

    if (typeof window !== "undefined") {
      localStorage.setItem("tracker_employee", employeeId);
      localStorage.setItem("tracker_contract", contractId);
      localStorage.setItem("tracker_task", taskId);
    }

    const fd = new FormData();
    fd.append("employeeId", employeeId);
    fd.append("contractId", contractId);
    fd.append("taskId", taskId);
    fd.append("date", date);
    fd.append("clockIn", clockIn);
    fd.append("clockOut", clockOut);
    fd.append("pauseMinutes", String(pauseMin));
    fd.append("hours", String(hours));
    fd.append("notes", notes);

    const chosenEmp = employeeId;
    startTransition(async () => {
      await createTrackerSession(fd);
      router.refresh();
      onConfirmed(chosenEmp);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Sessie afsluiten">
      <form onSubmit={(e) => void handleConfirm(e)} className="grid gap-4">
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>
        )}
        <div className="rounded border border-[var(--border)] bg-slate-50 p-3 text-sm">
          <span className="text-[var(--muted)]">Datum: </span>
          <span className="font-medium capitalize">{formatDayLabel(date)}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Medewerker" className="min-w-0">
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required>
              {employees.length === 0 && <option value="">— geen medewerkers —</option>}
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Contract" className="min-w-0">
            <select value={contractId} onChange={(e) => setContractId(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Taak" className="min-w-0">
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required>
            {filteredTasks.length === 0
              ? <option value="">— geen taken —</option>
              : filteredTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)
            }
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Inkloktijd" className="min-w-0">
            <input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required />
          </Field>
          <Field label="Uitkloktijd" className="min-w-0">
            <input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required />
          </Field>
          <Field label="Pauze (min)" className="min-w-0">
            <input type="number" min={0} value={pauseMinutes} onChange={(e) => setPauseMinutes(e.target.value)} className={cn(inputClass, "w-full min-w-0")} required />
          </Field>
        </div>
        <Field label="Berekende uren" className="min-w-0">
          <div className={cn(inputClass, "flex w-full min-w-0 items-center font-semibold", computedHours ? "text-[var(--primary)]" : "text-red-600")}>
            {computedHours != null ? formatHours(computedHours) : "Ongeldige tijden"}
          </div>
        </Field>
        <Field label="Notities" className="min-w-0">
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(inputClass, "w-full min-w-0")} placeholder="Wat heb je gedaan?" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button type="submit" variant="primary">Opslaan</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────

export function HoursTracker({ employees, contracts, tasks, entries }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // ── Klok ──────────────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());

  // ── Lopende sessie ──────────────────────────────────────────────────────────
  const [session, setSession] = useState<ActiveSession | null>(null);

  // ── Overzicht: medewerker voor stats / weekdoel / werklog ──────────────────
  const [viewEmployeeId, setViewEmployeeId] = useState("");

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [editEntry, setEditEntry] = useState<EntryDTO | null>(null);

  // ── Werklog ─────────────────────────────────────────────────────────────────
  const today = new Date();
  const [logYear, setLogYear] = useState(today.getFullYear());
  const [logMonth, setLogMonth] = useState(today.getMonth());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // ── Weekdoel ────────────────────────────────────────────────────────────────
  const [weekGoal, setWeekGoal] = useState<string>("40");

  // ── Laden uit localStorage bij mount ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Lopende sessie (globaal, niet per medewerker)
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw) {
      try { setSession(JSON.parse(raw) as ActiveSession); } catch { /* corrupt: negeren */ }
    }

    // Overzicht-medewerker
    const storedEmp = localStorage.getItem("tracker_employee") ?? "";
    const emp = employees.find((e) => e.id === storedEmp)?.id ?? employees[0]?.id ?? "";
    setViewEmployeeId(emp);
    if (emp) {
      const goal = localStorage.getItem(`tracker_goal_${emp}`);
      if (goal) setWeekGoal(goal);
    }
  }, [employees]);

  // ── Tik elke seconde ─────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleViewEmployeeChange = useCallback((id: string) => {
    setViewEmployeeId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("tracker_employee", id);
      const goal = localStorage.getItem(`tracker_goal_${id}`);
      setWeekGoal(goal ?? "40");
    }
  }, []);

  // ── Netto verstreken sessietijd (ms) ────────────────────────────────────────
  const netElapsedMs = (() => {
    if (!session) return 0;
    const currentPause = session.isPaused && session.pauseStartedTs ? now - session.pauseStartedTs : 0;
    return Math.max(0, now - session.startTs - session.pausedAccumMs - currentPause);
  })();

  // ── Pauzeduur (ms) ──────────────────────────────────────────────────────────
  const pauseElapsedMs = (() => {
    if (!session) return 0;
    const current = session.isPaused && session.pauseStartedTs ? now - session.pauseStartedTs : 0;
    return session.pausedAccumMs + current;
  })();

  function persistSession(s: ActiveSession | null) {
    if (typeof window === "undefined") return;
    if (s) localStorage.setItem(ACTIVE_KEY, JSON.stringify(s));
    else localStorage.removeItem(ACTIVE_KEY);
  }

  // ── Inklokken ────────────────────────────────────────────────────────────────
  function handleClockIn() {
    const newSession: ActiveSession = {
      startTs: Date.now(),
      pausedAccumMs: 0,
      isPaused: false,
      pauseStartedTs: null,
    };
    setSession(newSession);
    persistSession(newSession);
  }

  // ── Pauze aan/uit ────────────────────────────────────────────────────────────
  function handleTogglePause() {
    if (!session) return;
    let updated: ActiveSession;
    if (session.isPaused) {
      const elapsed = session.pauseStartedTs ? now - session.pauseStartedTs : 0;
      updated = { ...session, isPaused: false, pauseStartedTs: null, pausedAccumMs: session.pausedAccumMs + elapsed };
    } else {
      updated = { ...session, isPaused: true, pauseStartedTs: now };
    }
    setSession(updated);
    persistSession(updated);
  }

  // ── Uitklokken → bevestig-modal ──────────────────────────────────────────────
  function handleClockOut() {
    setShowClockOutModal(true);
  }

  function handleClockOutConfirmed(employeeId: string) {
    persistSession(null);
    setSession(null);
    setShowClockOutModal(false);
    if (employeeId) handleViewEmployeeChange(employeeId);
  }

  // ── Sessie verwijderen ───────────────────────────────────────────────────────
  function handleDeleteEntry(entry: EntryDTO) {
    if (!confirm(`Sessie van ${entry.employeeName} op ${isoToYMD(entry.date)} verwijderen?`)) return;
    const fd = new FormData();
    fd.append("id", entry.id);
    fd.append("contractId", entry.contractId);
    startTransition(async () => {
      await deleteTimeEntry(fd);
      router.refresh();
    });
  }

  // ── Stats (op basis van overzicht-medewerker) ───────────────────────────────
  const empEntries = entries.filter((e) => e.employeeId === viewEmployeeId);

  const todayStr = toLocalDateStr(now);
  const todayHours = empEntries.filter((e) => isoToYMD(e.date) === todayStr).reduce((s, e) => s + e.hours, 0);

  const weekStart = startOfWeekMonday(new Date(now));
  const weekStartStr = toLocalDateStr(weekStart.getTime());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekEndStr = toLocalDateStr(weekEnd.getTime());
  const weekHours = empEntries.filter((e) => {
    const d = isoToYMD(e.date);
    return d >= weekStartStr && d <= weekEndStr;
  }).reduce((s, e) => s + e.hours, 0);

  const monthNow = new Date(now);
  const monthStr = `${monthNow.getFullYear()}-${pad2(monthNow.getMonth() + 1)}`;
  const monthEntries = empEntries.filter((e) => isoToYMD(e.date).slice(0, 7) === monthStr);
  const monthHours = monthEntries.reduce((s, e) => s + e.hours, 0);
  const uniqueWorkDays = new Set(monthEntries.map((e) => isoToYMD(e.date))).size;
  const avgPerDay = uniqueWorkDays > 0 ? round2(monthHours / uniqueWorkDays) : 0;

  // ── Weekdoel ─────────────────────────────────────────────────────────────────
  const goalHours = parseFloat(weekGoal) || 0;
  const goalPct = goalHours > 0 ? Math.min(100, Math.round((weekHours / goalHours) * 100)) : 0;
  const goalMet = goalPct >= 100;

  // ── Werklog voor gekozen maand ───────────────────────────────────────────────
  const logMonthStr = `${logYear}-${pad2(logMonth + 1)}`;
  const logEntries = empEntries.filter((e) => isoToYMD(e.date).slice(0, 7) === logMonthStr);
  const grouped = groupByDay(logEntries);

  function toggleDay(day: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  // ── Statusbadge ──────────────────────────────────────────────────────────────
  const statusBadge = (() => {
    if (!session) return <Badge className="border-slate-200 bg-slate-100 text-slate-600">Uitgeklokt</Badge>;
    if (session.isPaused) return <Badge className="border-amber-200 bg-amber-50 text-[var(--warning)]">Pauze</Badge>;
    return <Badge className="border-emerald-200 bg-emerald-50 text-[var(--success)]">Bezig</Badge>;
  })();

  const d = new Date(now);
  const liveClock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  const liveDate = d.toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" });

  const showPauseTimer = !!session && (session.isPaused || pauseElapsedMs > 0);

  return (
    <div className="grid gap-5">
      {/* ── Hero / klok-kaart (helemaal bovenaan) ──────────────────────────── */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Links: klok + status */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-4xl font-bold tracking-tight text-slate-950">{liveClock}</span>
              {statusBadge}
            </div>
            <span className="text-sm capitalize text-[var(--muted)]">{liveDate}</span>
            {session && (
              <div className="mt-1 flex items-center gap-2 text-[var(--muted)]">
                <Clock size={14} />
                <span className="text-sm">
                  Ingeklokt om {tsToHHMM(session.startTs)}
                  {session.isPaused && " · In pauze"}
                </span>
              </div>
            )}
          </div>

          {/* Midden: sessietimer (+ pauzetimer) */}
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Sessietimer</span>
              <span
                className={cn(
                  "font-mono text-3xl font-bold tracking-tight",
                  session && !session.isPaused ? "text-[var(--primary)]" : "text-slate-300",
                )}
              >
                {msToHHMMSS(netElapsedMs)}
              </span>
            </div>
            {showPauseTimer && (
              <div className="flex flex-col items-center gap-1">
                <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-[var(--warning)]">
                  <Coffee size={12} /> Pauze
                </span>
                <span
                  className={cn(
                    "font-mono text-3xl font-bold tracking-tight",
                    session?.isPaused ? "text-[var(--warning)]" : "text-amber-300",
                  )}
                >
                  {msToHHMMSS(pauseElapsedMs)}
                </span>
              </div>
            )}
          </div>

          {/* Rechts: actieknoppen */}
          <div className="flex flex-wrap items-center gap-2">
            {!session ? (
              <Button variant="primary" onClick={handleClockIn} className="gap-2">
                <Play size={16} />
                Inklokken
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={handleTogglePause} className="gap-2">
                  <Coffee size={16} />
                  {session.isPaused ? "Hervatten" : "Pauze"}
                </Button>
                <Button variant="danger" onClick={handleClockOut} className="gap-2">
                  <Clock size={16} />
                  Uitklokken
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* ── Overzicht-medewerker ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-slate-950">Overzicht</h2>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          Medewerker
          <select
            value={viewEmployeeId}
            onChange={(e) => handleViewEmployeeChange(e.target.value)}
            className={cn(inputClass, "h-9 w-56 min-w-0")}
          >
            {employees.length === 0 && <option value="">— geen medewerkers —</option>}
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Vandaag", value: formatHours(todayHours), helper: todayStr },
          {
            label: "Deze week",
            value: formatHours(weekHours),
            helper: `ma ${weekStartStr.slice(8)} — zo ${weekEndStr.slice(8)}`,
          },
          {
            label: "Deze maand",
            value: formatHours(monthHours),
            helper: `${uniqueWorkDays} werkdag${uniqueWorkDays !== 1 ? "en" : ""}`,
          },
          { label: "Gem. per werkdag", value: formatHours(avgPerDay), helper: "deze maand" },
        ].map((stat) => (
          <Card key={stat.label}>
            <div className="text-sm font-medium text-[var(--muted)]">{stat.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950">{stat.value}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{stat.helper}</div>
          </Card>
        ))}
      </div>

      {/* ── Weekdoel ────────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-[var(--primary)]" />
            <span className="font-semibold text-slate-950">Weekdoel</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">{formatHours(weekHours)} / </span>
            <input
              type="number"
              min={1}
              max={80}
              value={weekGoal}
              onChange={(e) => {
                setWeekGoal(e.target.value);
                if (typeof window !== "undefined" && viewEmployeeId) {
                  localStorage.setItem(`tracker_goal_${viewEmployeeId}`, e.target.value);
                }
              }}
              className="h-8 w-20 rounded border border-[var(--border)] px-2 text-sm"
              aria-label="Weekdoel in uren"
            />
            <span className="text-sm text-[var(--muted)]">u doel</span>
            <span className={cn("ml-2 text-sm font-semibold", goalMet ? "text-[var(--success)]" : "text-slate-950")}>
              {goalPct}%
            </span>
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded bg-slate-100">
          <div
            className={cn("h-full rounded transition-all", goalMet ? "bg-emerald-500" : "bg-[var(--primary)]")}
            style={{ width: `${goalPct}%` }}
          />
        </div>
      </Card>

      {/* ── Werklog ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Werklog"
          description={`${logEntries.length} sessie${logEntries.length !== 1 ? "s" : ""} in ${monthLabel(logYear, logMonth)}`}
          action={
            <Button
              variant="secondary"
              onClick={() => { setEditEntry(null); setShowSessionModal(true); }}
              className="h-9 gap-1.5"
            >
              <Plus size={15} />
              Sessie toevoegen
            </Button>
          }
        />
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (logMonth === 0) { setLogYear((y) => y - 1); setLogMonth(11); }
              else setLogMonth((m) => m - 1);
            }}
            className="rounded p-1.5 text-[var(--muted)] hover:bg-slate-100"
            aria-label="Vorige maand"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-32 text-center text-sm font-semibold capitalize text-slate-950">
            {monthLabel(logYear, logMonth)}
          </span>
          <button
            type="button"
            onClick={() => {
              if (logMonth === 11) { setLogYear((y) => y + 1); setLogMonth(0); }
              else setLogMonth((m) => m + 1);
            }}
            className="rounded p-1.5 text-[var(--muted)] hover:bg-slate-100"
            aria-label="Volgende maand"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-[var(--muted)]">
            <Clock size={28} className="opacity-30" />
            <p className="text-sm">Geen sessies in {monthLabel(logYear, logMonth)}.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)] rounded border border-[var(--border)]">
            {grouped.map(([day, dayEntries]) => {
              const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
              const isOpen = expandedDays.has(day);
              return (
                <div key={day}>
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="text-sm font-semibold capitalize text-slate-950">
                      {formatDayLabel(day)}
                    </span>
                    <div className="flex items-center gap-3">
                      <Badge className="border-teal-100 bg-teal-50 text-[var(--primary)]">
                        {formatHours(dayTotal)}
                      </Badge>
                      <ChevronDown
                        size={16}
                        className={cn("text-[var(--muted)] transition-transform", isOpen && "rotate-180")}
                      />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-slate-100 bg-slate-50">
                      {dayEntries.map((entry) => (
                        <div key={entry.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            {entry.clockIn && entry.clockOut ? (
                              <span className="font-medium text-slate-800">
                                {entry.clockIn} – {entry.clockOut}
                              </span>
                            ) : (
                              <span className="text-[var(--muted)]">—</span>
                            )}
                            {entry.pauseMinutes != null && entry.pauseMinutes > 0 && (
                              <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                                <Coffee size={12} />
                                {minutesToHHMM(entry.pauseMinutes)} pauze
                              </span>
                            )}
                            <Badge className="border-teal-100 bg-teal-50 text-[var(--primary)]">
                              {formatHours(entry.hours)}
                            </Badge>
                            <span className="text-[var(--muted)]">{entry.taskName}</span>
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                              {entry.contractCode}
                            </span>
                            {entry.notes && (
                              <span className="max-w-xs truncate text-xs text-[var(--muted)]">{entry.notes}</span>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <Button
                              variant="secondary"
                              className="h-8 px-2"
                              title="Bewerken"
                              onClick={() => { setEditEntry(entry); setShowSessionModal(true); }}
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button
                              variant="danger"
                              className="h-8 px-2"
                              title="Verwijderen"
                              onClick={() => handleDeleteEntry(entry)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Uitklok-bevestiging ────────────────────────────────────────────── */}
      <ClockOutModal
        open={showClockOutModal}
        session={session}
        employees={employees}
        contracts={contracts}
        tasks={tasks}
        defaultEmployeeId={viewEmployeeId}
        onClose={() => setShowClockOutModal(false)}
        onConfirmed={handleClockOutConfirmed}
      />

      {/* ── Sessie toevoegen / bewerken ────────────────────────────────────── */}
      <Modal
        open={showSessionModal}
        onClose={() => { setShowSessionModal(false); setEditEntry(null); }}
        title={editEntry ? "Sessie bewerken" : "Sessie toevoegen"}
      >
        <SessionForm
          mode={editEntry ? "edit" : "create"}
          entry={editEntry ?? undefined}
          employees={employees}
          contracts={contracts}
          tasks={tasks}
          defaultEmployeeId={viewEmployeeId}
          onClose={() => { setShowSessionModal(false); setEditEntry(null); }}
        />
      </Modal>
    </div>
  );
}
