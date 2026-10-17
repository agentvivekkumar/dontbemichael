import { useCallback, useEffect, useRef, useState } from 'react';
import { RESEARCH_ID } from '@shared/research';
import { useStore } from '@/store/store';
import { TaskDetail, parseTasks, type HiveTask } from './TasksKanban';

/**
 * App-wide host for the task detail: whoever calls store.openTaskDetail(id) —
 * a kanban card, the sticky note on an agent's strip card, a floor prop —
 * gets the SAME big overlay rendered over the office floor. Keeps its own
 * 5s ledger poll so an open detail stays fresh while the god edits cards.
 */

const POLL_MS = 5000;

export function TaskDetailOverlay() {
  const taskDetailId = useStore((s) => s.taskDetailId);
  const closeTaskDetail = useStore((s) => s.closeTaskDetail);
  const agents = useStore((s) => s.agents);
  const restorable = useStore((s) => s.restorableAgents);
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    // parseTasks NORMALIZES (the ledger is a hand-written file; cards may lack
    // dependsOn/priority/etc.) — a raw card without dependsOn crashed the
    // detail once. Never feed TaskDetail unparsed ledger entries.
    try { setTasks(parseTasks(await window.cth.hiveTasks())); } catch { /* keep last good */ }
  }, []);

  useEffect(() => {
    if (!taskDetailId) return;
    void refresh();
    timer.current = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [taskDetailId, refresh]);

  if (!taskDetailId) return null;
  const task = tasks.find((t) => t.id === taskDetailId);
  if (!task) return null;

  const nameFor = (id?: string): string | undefined =>
    id ? (agents.find((a) => a.id === id)?.name ?? restorable.find((a) => a.id === id)?.name ?? id) : undefined;

  // Moving a card writes ONE field. Operate on the RAW ledger (the same pattern
  // as TasksKanban.dismissTask), never on the display-parsed state: parseTasks
  // NORMALIZES, so re-serializing it turns a hand-written `priority: "high"`
  // into the number 3 and grafts `dependsOn: []` onto a card that spells the key
  // `deps`. Those are real values, so they survive the merge in hive.writeTasks
  // and land on disk — a status change quietly rewriting the god's cards.
  //
  // The owner's move goes through hiveMoveTask: Done is their decision to end
  // the card (closedBy owner), and Michael is told of every move
  // (card-lifecycle.md section 4).
  const move = async (status: HiveTask['status']) => {
    const next = tasks.map((t) => (t.id === task.id
      ? { ...t, status, closedBy: status === 'done' ? (t.status === 'done' ? t.closedBy : 'owner' as const) : undefined }
      : t));
    setTasks(next); // optimistic
    try {
      const result = await window.cth.hiveMoveTask(task.id, status);
      if (!result.ok) void refresh();
    } catch { void refresh(); }
  };

  const reopen = async (reason: string) => {
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: 'todo' as const, closedBy: undefined } : t))); // optimistic
    try {
      const result = await window.cth.hiveMoveTask(task.id, 'todo', reason);
      if (!result.ok) void refresh();
    } catch { void refresh(); }
  };

  const assign = () => {
    // Route through the Command Center's dispatch box (which mails the god —
    // the human never writes into a worker's inbox directly).
    const st = useStore.getState();
    const god = st.agents.find((a) => a.isGod);
    if (god) st.select(god.id);
    const desc = task.description?.trim() || '(no description)';
    st.requestDispatchSeed(`Task: ${task.title}\nContext: ${desc}\n`);
    st.requestCommandCenterTab('floor');
    closeTaskDetail();
  };

  const reassign = async (assigneeId: string, reason?: string) => {
    setTasks(tasks.map((t) => (t.id === task.id
      ? { ...t, assignee: assigneeId, assignReason: reason || t.assignReason }
      : t)));
    try {
      const result = await window.cth.hiveReassignTask(task.id, assigneeId, reason);
      if (!result.ok) void refresh();
      else void refresh();
    } catch { void refresh(); }
  };

  const teammates = agents
    .filter((a) => !a.isGod && a.id !== RESEARCH_ID && !a.archived)
    .map((a) => ({ id: a.id, name: a.name || a.id }));

  return (
    <TaskDetail
      task={task}
      all={tasks}
      assigneeName={nameFor(task.assignee)}
      teammates={teammates}
      onMove={(s) => void move(s)}
      onReopen={(reason) => void reopen(reason)}
      onReassign={(id, reason) => void reassign(id, reason)}
      onAssign={assign}
      onClose={closeTaskDetail}
    />
  );
}
