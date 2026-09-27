import { useEffect, useState } from 'react';
import type { HarnessConfig } from '@/store/config';

/** The saved config, kept current: loaded once, then refreshed on every
 *  `config:changed` from main (which fires on each write, including the
 *  mailbox status changes the broker makes in the background). */
export function useHarnessConfig(): HarnessConfig | null {
  const [config, setConfig] = useState<HarnessConfig | null>(null);
  useEffect(() => {
    let alive = true;
    void window.cth.getConfig().then((c) => { if (alive) setConfig(c); });
    const off = window.cth.onConfigChanged((c) => { if (alive) setConfig(c); });
    return () => { alive = false; off(); };
  }, []);
  return config;
}
