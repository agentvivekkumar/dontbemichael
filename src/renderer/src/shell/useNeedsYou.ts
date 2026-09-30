import { useEffect, useState } from 'react';
import { parseTasks, waitsOnHuman } from '@/components/TasksKanban';
import { useScheduleRequests } from '@/components/ScheduleRequestCards';

const POLL_MS = 5000;

/**
 * How many things wait on the owner: the Ask me cards Michael raised (tasks with
 * an open question for the owner) plus the schedule requests he passed on. The
 * same two sources the Needs you board lists (branding/DESIGN.md 7.5 and 7.6).
 */
export function useNeedsYouCount(): number {
  const [asks, setAsks] = useState(0);
  const { requests } = useScheduleRequests();

  useEffect(() => {
    let alive = true;
    const poll = () => {
      if (document.hidden) return;
      void window.cth.hiveTasks()
        .then((raw) => { if (alive) setAsks(parseTasks(raw).filter(waitsOnHuman).length); })
        .catch(() => { /* keep the last count */ });
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  return asks + requests.length;
}

/** Tasks board counts, for the Tasks tab badge (blocked) and Michael's hub card. */
export function useTaskCounts(): { todo: number; doing: number; blocked: number; done: number } {
  const [counts, setCounts] = useState({ todo: 0, doing: 0, blocked: 0, done: 0 });
  useEffect(() => {
    let alive = true;
    const poll = () => {
      if (document.hidden) return;
      void window.cth.hiveTasks()
        .then((raw) => {
          if (!alive) return;
          const c = { todo: 0, doing: 0, blocked: 0, done: 0 };
          for (const t of parseTasks(raw)) {
            if (t.status === 'todo' || t.status === 'doing' || t.status === 'blocked' || t.status === 'done') c[t.status]++;
          }
          setCounts(c);
        })
        .catch(() => { /* keep the last counts */ });
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return counts;
}
