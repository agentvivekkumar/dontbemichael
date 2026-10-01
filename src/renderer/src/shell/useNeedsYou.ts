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
