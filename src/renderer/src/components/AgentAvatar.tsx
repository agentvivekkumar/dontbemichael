import type { CSSProperties } from 'react';
import { useStore } from '@/store/store';
import { PersonAvatar } from '@/scene/office/props';

/** A teammate's avatar by id, for places that hold only an id and a name (a
 *  task's assignee, a request's sender). Someone no longer on the team keeps
 *  their avatar from the restorable roster, else the initial of the name. */
export function AgentAvatar({ id, name, size, style }: { id?: string; name: string; size: number; style?: CSSProperties }) {
  const agent = useStore((s) => (id ? s.agents.find((a) => a.id === id) ?? s.restorableAgents.find((a) => a.id === id) : undefined));
  return <PersonAvatar who={agent ?? { id: id ?? name, name }} size={size} style={style} />;
}
