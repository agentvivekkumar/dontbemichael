import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { Icon } from './Icon';
import { ProviderLogo } from './ProviderLogo';
import { useStore, type Agent } from '@/store/store';
import { OFFICE_CAST, CAST_BY_NAME, CAST_GROUPS, DEFAULT_CHARACTER, type OfficeCharacterName } from '@/scene/office/cast';
import { type AccentColorName } from '@/design/tokens';
import type { HireManifest } from '@shared/hire';
import { hireQueueProgress } from '@shared/hireQueue';
import { MCP_CATALOG } from '@shared/mcpCatalog';
import {
  type AgentProvider,
  type HarnessConfig,
  AGENT_PROVIDER_PRESETS,
  buildSpawnCommand,
  tokenizeCommand,
  modelsForProvider,
  inferAgentProvider,
  isClaudeProvider
} from '@/store/config';
import { BUILD_ENGINES } from '@shared/agentProvider';
import { splitAgentRole } from '@shared/agentRole';
import { teamAccent } from '@shared/teamPlan';
import { mailboxHolder } from '@shared/mailboxes';
import { Select } from './triggers/ui';
import {
  NEW_JOB_KEY,
  activeTeam,
  appendOnce,
  bindingLines,
  cardJobs,
  hireFolderName,
  hireRole,
  jobFor,
  overlapsByRules,
  ownJob,
  sameFamily,
  CHARACTER_CARD,
  teamJobs,
  type DistinctVerdict,
  type HireJob,
  type JobProfile
} from '@shared/hireTemplates';
import { useRtl } from '@/i18n/useDirection';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { SHOW_IMPORT_HIRE, SHOW_ENGINE_PICKER } from '@shared/buildFeatures';

const ACCENTS: AccentColorName[] = ['coral', 'mint', 'sky', 'lemon', 'lilac', 'peach'];

// Copy-paste prompt the user hands to any AI to generate a hire manifest. It pins
// the exact JSON shape the importer accepts (src/shared/hire.ts). Shown only with
// SHOW_IMPORT_HIRE.
const HIRE_PROMPT = `You are designing a "hire": a ready to spawn AI agent for Don't Be Michael, an app that runs a team of AI agents. Output ONE JSON object (a hire manifest) and nothing else.

Return EXACTLY this shape (omit optional fields you don't need; keep the spec string verbatim):

{
  "spec": "munder-difflin/hire@1",
  "name": "Jim",
  "description": "Job title: what to send this agent",
  "goal": "work style: how the agent does the job",
  "provider": "claude",
  "tokenCap": 2000000,
  "author": "your name"
}

--- ADD YOUR DETAILS BELOW (the AI should use these) ---
Role / what I want this agent to do:
`;

/**
 * Hire a team member (docs/designs/hire-redesign.md). Three steps:
 *
 *   Who     the character tiles, grouped by job; the name follows the tile.
 *   Job     the character's own job (a teammate doing it today, else the pack
 *           card), every teammate's job ("Your office"), every pack's jobs, or
 *           a new one.
 *   Review  everything editable: name, job title, what to send, work style,
 *           folder (its own, suffixed on a clash) and model (Best or Fast).
 *           The job is checked against every teammate before Hire (D6): it is
 *           allowed only when distinct, or bound to its own mailbox or topic.
 *
 * A queued hire (deep link, import) opens on Review, prefilled from its manifest.
 */
type Step = 'who' | 'job' | 'review';
const STEPS: Step[] = ['who', 'job', 'review'];

/** Same folder, ignoring a trailing slash and (as macOS and Windows do) case. */
function samePath(a: string, b: string): boolean {
  const n = (p: string) => p.trim().replace(/[\\/]+$/, '').toLowerCase();
  return n(a) === n(b);
}
const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const joinPath = (root: string, name: string) => `${root.replace(/[\\/]+$/, '')}/${name}`;

function uniqueId(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
}

const TOPIC_MAX = 120;

/** A binding that makes an overlapping job particular (D6). */
interface Binding { scope: string; mailboxId?: string; others: string[] }

export interface AddAgentModalProps {
  onClose: () => void;
  config: HarnessConfig;
  /** Lift config changes back up to App so the rest of the UI sees them. */
  onConfigChange?: (config: HarnessConfig) => void;
}

export function AddAgentModal({ onClose, config, onConfigChange }: AddAgentModalProps) {
  const { t: tr } = useTranslation();
  const rtl = useRtl();
  const godName = useResolvedGodName();
  const addAgent = useStore(s => s.addAgent);
  const updateAgent = useStore(s => s.updateAgent);
  const setSidebarTab = useStore(s => s.setSidebarTab);
  const agents = useStore(s => s.agents);
  // Deep links and file batches share one FIFO. The head alone seeds the form;
  // every item still requires an explicit hire or skip.
  const hireQueue = useStore(s => s.hireQueue);
  const enqueuePendingHires = useStore(s => s.enqueuePendingHires);
  const finishPendingHire = useStore(s => s.finishPendingHire);
  const pendingHire = hireQueue.pending[0];
  const reviewProgress = hireQueueProgress(hireQueue);

  const knownCharacter = (c?: string): OfficeCharacterName =>
    (OFFICE_CAST.some(m => m.name === c) ? (c as OfficeCharacterName) : DEFAULT_CHARACTER);
  const knownAccent = (a?: string): AccentColorName | undefined =>
    (ACCENTS.includes(a as AccentColorName) ? (a as AccentColorName) : undefined);
  /** The cast member a typed name refers to, if any (typing "Meredith" picks her
   *  tile; no match leaves the pick alone). */
  const characterForName = (n: string): OfficeCharacterName | null => {
    const q = n.trim().toLowerCase();
    if (!q) return null;
    const hit = OFFICE_CAST.find(c => c.displayName.toLowerCase() === q || c.name === q);
    return hit ? hit.name : null;
  };

  const team = useMemo(() => activeTeam(agents), [agents]);
  const michaelFolder = config.businessFolder;
  const business = useMemo(() => ({ name: config.businessName, city: config.businessCity }), [config.businessName, config.businessCity]);

  // ── Engine: the Settings engine; Best or Fast model on Review (D3) ──
  const initialProvider = inferAgentProvider(config.defaultCommand);
  const [provider, setProvider] = useState<AgentProvider>(pendingHire?.provider ?? initialProvider);
  // The model starts on the default for agents set in Settings, and the owner
  // can pick any other from the same list (owner, 2026-09-27: Best or Fast told
  // them nothing).
  const defaultModel = isClaudeProvider(provider) ? config.defaultModel : config.providerDefaultModels?.[provider];
  const [customModel, setCustomModel] = useState<string | undefined>(pendingHire?.model);
  const model = customModel ?? defaultModel;
  const modelOptions = (() => {
    const known = modelsForProvider(provider).filter((m) => !!m.id) as Array<{ id: string; label: string }>;
    const extra = [defaultModel, customModel].filter((id): id is string => !!id && !known.some((m) => m.id === id));
    return [...known, ...extra.map((id) => ({ id, label: id }))];
  })();
  const hireCommand = (m: HireManifest): string => {
    const prov: AgentProvider = m.provider ?? initialProvider;
    const base = buildSpawnCommand(config, m.model, prov);
    return m.commandFlags?.length ? `${base} ${m.commandFlags.join(' ')}` : base;
  };
  const [commandEdit, setCommandEdit] = useState<string | undefined>(pendingHire ? hireCommand(pendingHire) : undefined);
  const command = commandEdit ?? buildSpawnCommand(config, model, provider);

  // ── Who ──
  const firstCharacter = pendingHire?.character
    ? knownCharacter(pendingHire.character)
    : (characterForName(pendingHire?.name ?? '') ?? DEFAULT_CHARACTER);
  const [step, setStep] = useState<Step>(pendingHire ? 'review' : 'who');
  const [character, setCharacter] = useState<OfficeCharacterName>(firstCharacter);
  const [name, setName] = useState(pendingHire?.name ?? CAST_BY_NAME[firstCharacter].displayName);
  const [hireMeta, setHireMeta] = useState<HireManifest | null>(pendingHire ?? null);

  // ── Job ──
  const [cards, setCards] = useState<HireJob[]>([]);
  useEffect(() => {
    let alive = true;
    window.cth.packsList()
      .then((res) => { if (alive) setCards(cardJobs(res.packs.map((p) => p.pack), res.core, config.businessType, business)); })
      .catch(() => { /* the owner can still write a new job */ });
    return () => { alive = false; };
  }, [config.businessType, business]);
  const officeJobs = useMemo(() => teamJobs(team, cards), [team, cards]);
  const theirJob = useMemo(() => ownJob(character, officeJobs, cards), [character, officeJobs, cards]);
  // Every job list opens on the character's own family, office and packs alike;
  // "show all jobs" opens the rest (owner, 2026-09-27). A character with no
  // family shows everything.
  const family = CHARACTER_CARD[character];
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setShowAll(false); }, [character]);
  const listAll = showAll || !family;
  const inFamily = (j: HireJob) => !family || sameFamily(j, character);
  const familyJobs = useMemo(
    () => officeJobs.filter((j) => j.key !== theirJob?.key && (listAll || sameFamily(j, character))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [officeJobs, theirJob, character, listAll]
  );
  const hiddenCount = family
    ? officeJobs.filter((j) => j.key !== theirJob?.key && !sameFamily(j, character)).length
      + cards.filter((j) => j.key !== theirJob?.key && !sameFamily(j, character)).length
    : 0;
  const [jobKey, setJobKey] = useState<string | null>(null);
  const allJobs = useMemo(() => [...officeJobs, ...cards], [officeJobs, cards]);
  const chosenKey = jobKey ?? theirJob?.key ?? NEW_JOB_KEY;
  const chosenJob = allJobs.find((j) => j.key === chosenKey);

  // ── Review fields; filled from the chosen job each time the job or the name
  //    changes, so edits survive going back and forth otherwise ──
  const [title, setTitle] = useState(() => splitAgentRole(pendingHire?.description).role);
  const [routing, setRouting] = useState(() => splitAgentRole(pendingHire?.description).roleDescription);
  const [workStyle, setWorkStyle] = useState(pendingHire?.goal ?? '');
  const [sourceCard, setSourceCard] = useState<string | undefined>(undefined);
  const applied = useRef<string | null>(pendingHire ? 'manifest' : null);
  const applyJob = (): void => {
    const sig = `${chosenKey}|${name.trim()}`;
    if (applied.current === sig) return;
    // A queued hire keeps its manifest's job until the owner picks another.
    if (applied.current === 'manifest' && jobKey === null) return;
    applied.current = sig;
    setBinding(null);
    if (!chosenJob) { setTitle(''); setRouting(''); setWorkStyle(''); setSourceCard(undefined); return; }
    const copy = jobFor(chosenJob, name.trim());
    setTitle(copy.title);
    setRouting(copy.routing);
    setWorkStyle(copy.workStyle);
    setSourceCard(chosenJob.sourceCard);
  };

  // ── Folder: its own, suffixed with the name on a clash (point 2) ──
  const [folderName, setFolderName] = useState('');
  const [customCwd, setCustomCwd] = useState<string | undefined>(
    michaelFolder ? undefined : (config.registeredRepos[0] ?? '')
  );
  const cwd = customCwd ?? (michaelFolder && folderName.trim() ? joinPath(michaelFolder, folderName.trim()) : '');
  const suggestFolder = async (): Promise<void> => {
    if (!michaelFolder) return;
    const base = (chosenJob?.folder ?? title).trim() || name.trim();
    const n = name.trim();
    const candidates = [base, `${base}_${n}`, ...Array.from({ length: 8 }, (_, i) => `${base}_${n}_${i + 2}`)];
    const onDisk = await window.cth.foldersExist(michaelFolder, candidates).catch(() => ({} as Record<string, boolean>));
    const used = new Set(team.map((a) => basename(a.cwd ?? '').toLowerCase()));
    setFolderName(hireFolderName(base, n, (f) => !!onDisk[f] || used.has(f.toLowerCase())));
  };

  // ── The distinct job check (D6) ──
  const mailboxes = config.mailboxes ?? [];
  const mailboxAddress = (id?: string) => mailboxes.find((m) => m.id === id)?.address;
  const teamProfiles: JobProfile[] = useMemo(() => team.map((a) => {
    const split = splitAgentRole(a.description);
    const email = config.agentCapabilities?.[a.id]?.email;
    return {
      name: a.name,
      title: split.role,
      routing: split.roleDescription,
      workStyle: a.goal,
      mailbox: email?.enabled ? mailboxAddress(email.mailboxes[0]) : undefined
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [team, config.agentCapabilities, mailboxes]);
  const [binding, setBinding] = useState<Binding | null>(null);
  const profile: JobProfile = {
    name: name.trim(), title: title.trim(), routing: routing.trim(), workStyle,
    mailbox: mailboxAddress(binding?.mailboxId)
  };
  // The check judges what to send, never the title: renaming "Sales Director"
  // to "Sales Director1" must not clear an overlap (owner, 2026-09-27).
  const checkSig = `${profile.name}\n${profile.routing}`;
  const [check, setCheck] = useState<{ sig: string; verdict: DistinctVerdict } | null>(null);
  const [checking, setChecking] = useState(false);
  const checkSeq = useRef(0);
  const ruleOverlaps = overlapsByRules(profile, teamProfiles);
  const verdict = check && check.sig === checkSig ? check.verdict : null;
  const runCheck = async (): Promise<DistinctVerdict | null> => {
    const seq = ++checkSeq.current;
    const sig = checkSig;
    setChecking(true);
    try {
      const v = await window.cth.hireCheckDistinct(profile, teamProfiles);
      if (seq !== checkSeq.current) return null;
      setCheck({ sig, verdict: v });
      return v;
    } catch {
      const v: DistinctVerdict = { distinct: ruleOverlaps.length === 0, overlapsWith: ruleOverlaps, why: '', source: 'rules' };
      if (seq === checkSeq.current) setCheck({ sig, verdict: v });
      return v;
    } finally {
      if (seq === checkSeq.current) setChecking(false);
    }
  };
  // Run once when Review opens with a job to check.
  useEffect(() => {
    if (step === 'review' && profile.name && (profile.title || profile.routing) && !verdict && !checking) void runCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  // The instant rules always count, live on every edit, so a job whose what to
  // send reads like a teammate's is flagged even before or after the AI check.
  const overlapNames = [...new Set([...(verdict?.overlapsWith ?? []), ...ruleOverlaps])];
  const cleared = !!verdict && (overlapNames.length === 0 || !!binding);

  const [bindMode, setBindMode] = useState<'mailbox' | 'topic' | null>(null);
  const [topic, setTopic] = useState('');
  const [bindMailbox, setBindMailbox] = useState('');
  const freeMailboxes = mailboxes.filter((m) => !mailboxHolder(config.agentCapabilities, m.id));
  const applyBinding = (scope: string, mailboxId?: string): void => {
    const s = scope.trim().slice(0, TOPIC_MAX);
    if (!s) return;
    const lines = bindingLines(s, name.trim());
    setRouting((r) => appendOnce(binding ? r.replace(bindingLines(binding.scope, name.trim()).own, '').trim() : r, lines.own));
    setBinding({ scope: s, mailboxId, others: overlapNames });
    setBindMode(null);
  };
  const clearBinding = (): void => {
    if (binding) setRouting((r) => r.replace(bindingLines(binding.scope, name.trim()).own, '').trim());
    setBinding(null);
  };
  // The routing line changes when a binding is applied; keep the verdict that
  // led to it so the overlap box stays in view.
  const [shownVerdict, setShownVerdict] = useState<DistinctVerdict | null>(null);
  useEffect(() => { if (verdict) setShownVerdict(verdict); }, [verdict]);

  // ── Queue: re-seed every field when the queue head changes ──
  const applyManifest = (m: HireManifest) => {
    setHireMeta(m);
    setName(m.name);
    setCharacter(m.character ? knownCharacter(m.character) : (characterForName(m.name ?? '') ?? knownCharacter(undefined)));
    setProvider(m.provider ?? initialProvider);
    setCustomModel(m.model);
    setCommandEdit(hireCommand(m));
    const split = splitAgentRole(m.description);
    setTitle(split.role);
    setRouting(split.roleDescription);
    setWorkStyle(m.goal ?? '');
    setSourceCard(undefined);
    setBinding(null);
    applied.current = 'manifest';
    setStep('review');
  };
  useLayoutEffect(() => {
    if (pendingHire) applyManifest(pendingHire);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHire]);
  const advanceHireReview = () => {
    const next = hireQueue.pending[1];
    finishPendingHire();
    if (!next) onClose();
  };

  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [showHirePrompt, setShowHirePrompt] = useState(false);

  // Close only the modal on Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const importHire = async () => {
    setError(undefined);
    const res = await window.cth.importHireFiles();
    if (res.manifests.length > 0) enqueuePendingHires(res.manifests);
    if (res.errors.length > 0) {
      const noun = res.errors.length === 1 ? 'file' : 'files';
      setError(`Skipped ${res.errors.length} invalid ${noun}: ${res.errors.join(' · ')}`);
    } else if (!res.ok && res.error && res.error !== 'cancelled') {
      setError(res.error);
    }
  };

  const skipHire = () => {
    if (!pendingHire) return;
    setError(undefined);
    advanceHireReview();
  };

  const nameTaken = (n: string) => agents.some((a) => a.name.trim().toLowerCase() === n.trim().toLowerCase());
  const whoError = !name.trim() ? tr('addAgent.errName') : nameTaken(name) ? tr('addAgent.wizard.nameTaken', { name: name.trim() }) : undefined;

  const goTo = (next: Step): void => {
    setError(undefined);
    if (next !== 'who' && whoError) { setError(whoError); setStep('who'); return; }
    if (next === 'review' && step !== 'review') {
      applyJob();
      setFolderName('');
    }
    setStep(next);
  };
  // After the job is applied, suggest the folder for it.
  useEffect(() => { if (step === 'review') void suggestFolder(); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [step === 'review' ? `${title}|${chosenKey}|${name}` : '']);

  const pickFolder = async () => {
    setError(undefined);
    const res = await window.cth.chooseFolder();
    if (res.ok) setCustomCwd(res.path);
    else if (res.error !== 'cancelled') setError(res.error);
  };

  const submit = async () => {
    setError(undefined);
    if (whoError) { setError(whoError); setStep('who'); return; }
    if (!title.trim() && !routing.trim()) { setError(tr('addAgent.wizard.errJob')); return; }
    if (!cwd) { setError(tr('addAgent.errFolder')); return; }
    // Michael's folder is private to him (src/shared/folderAccess.ts).
    if (michaelFolder && samePath(michaelFolder, cwd)) { setError(tr('addAgent.errFolderShared', { godName })); return; }
    if (!command.trim()) { setError(tr('addAgent.errCommand')); return; }
    // The job must be distinct from every teammate's, or bound (D6). A job
    // edited since the last check is checked again first.
    let v = verdict;
    if (!v) v = await runCheck();
    if (!v) return;
    const overlaps = [...new Set([...v.overlapsWith, ...overlapsByRules(profile, teamProfiles)])];
    if (overlaps.length > 0 && !binding) { setError(tr('addAgent.wizard.errOverlap')); return; }

    setBusy(true);
    // The folder is made here, the first time it's needed; an existing one is
    // left exactly as it is.
    if (michaelFolder && !customCwd) {
      const [made] = await window.cth.foldersEnsure([cwd]).catch(() => [undefined]);
      if (!made || !made.ok) {
        setBusy(false);
        setError(made && !made.ok ? made.reason : tr('addAgent.errFolder'));
        return;
      }
    }
    const id = uniqueId(name);
    const ptyId = `pty-${id}`;
    const description = hireRole(title, routing);
    // A mailbox binding is set before the spawn, so the agent starts with it.
    if (binding?.mailboxId) {
      const res = await window.cth.mailSetCapabilities(id, { email: { enabled: true, mailboxes: [binding.mailboxId], send: false } }).catch(() => null);
      if (!res?.ok) { setBusy(false); setError(tr('capabilities.saveFailed')); return; }
    }
    const [exe, ...args] = tokenizeCommand(command.trim());
    const spawnRes = await window.cth.spawnPty({
      id: ptyId,
      cwd,
      command: exe,
      provider,
      args,
      cols: 100,
      rows: 30,
      isolate: false,
      hive: {
        id,
        name: name.trim(),
        provider,
        cwd,
        role: description || undefined,
        // A hire manifest may carry validated capability tags (routing hints).
        capabilities: hireMeta?.capabilities
      }
    });
    if (!spawnRes.ok) {
      // Give back a mailbox the failed hire was holding.
      if (binding?.mailboxId) void window.cth.mailSetCapabilities(id, { email: { enabled: false, mailboxes: [], send: false } }).catch(() => undefined);
      setBusy(false);
      setError(spawnRes.error ?? 'spawn failed');
      return;
    }
    const spawnedCwd = spawnRes.cwd || cwd;
    const agent: Agent = {
      id,
      name: name.trim(),
      character,
      accent: knownAccent(hireMeta?.accent) ?? teamAccent(team.length),
      description: description || 'a fresh harness',
      project: basename(spawnedCwd),
      tmuxTarget: '',
      cwd: spawnedCwd,
      goal: workStyle.trim() || undefined,
      sourceCard,
      status: 'idle',
      action: 'starting up',
      progress: 0,
      currentStation: 'desk',
      ptyId,
      command: command.trim(),
      provider,
      model,
      seedPrompt: spawnRes.seedPrompt,
      recentTextTs: Date.now()
    };
    addAgent(agent);
    // A binding hands the bound work back from every overlapping teammate:
    // their line gains "Not for ...; that goes to <Name>." (D6).
    if (binding) {
      const others = bindingLines(binding.scope, name.trim()).others;
      for (const mate of team) {
        if (!binding.others.includes(mate.name)) continue;
        const split = splitAgentRole(mate.description);
        const next = hireRole(split.role, appendOnce(split.roleDescription, others));
        if (next === mate.description) continue;
        updateAgent(mate.id, { description: next });
        void window.cth.hivePatchAgentRole(mate.id, next).catch(() => undefined);
      }
    }
    // A hire manifest may carry a per-agent token budget. Await it before
    // advancing a batch: the next hire reuses this mounted modal.
    if (hireMeta?.tokenCap) {
      try {
        const updated = await window.cth.setAgentTokenCap(id, hireMeta.tokenCap);
        onConfigChange?.(updated);
      } catch { /* best-effort */ }
    }
    setBusy(false);
    if (pendingHire) {
      advanceHireReview();
    } else {
      // The new hire opens on Capabilities: mailbox and schedules are not
      // copied from anyone, so that is the next thing to set (E4).
      setSidebarTab('capabilities');
      onClose();
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const jobGroups = useMemo(() => {
    const byTitle = new Map<string, HireJob[]>();
    for (const c of cards.filter((j) => listAll || inFamily(j))) {
      const list = byTitle.get(c.title) ?? [];
      list.push(c);
      byTitle.set(c.title, list);
    }
    return [...byTitle.entries()];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, listAll, character]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26, 19, 32, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Must sit above fullscreen terminal/file overlays (250/280).
        zIndex: 500
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 940, maxWidth: '95vw' }}>
        <PixelPanel variant="dialog" title={tr('addAgent.title')} style={{ padding: 16 }} noPadding>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxHeight: '86vh', overflowY: 'auto' }}>
            {hireMeta && (
              <div style={{
                padding: '6px 10px', background: 'var(--cth-lemon-light, #fdf3cf)',
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', fontSize: 12, color: 'var(--cth-ink-900)',
                display: 'flex', flexDirection: 'column', gap: 2
              }}>
                <span>
                  📋 {tr('addAgent.hireImported')} <strong>{hireMeta.name}</strong>
                  {hireMeta.author ? <> · {tr('addAgent.byAuthor', { author: hireMeta.author })}</> : null}
                  {reviewProgress ? <> · {tr('addAgent.hireProgress', { current: reviewProgress.current, total: reviewProgress.total })}</> : null}
                </span>
                <span>{tr('addAgent.reviewFields')}</span>
                {hireMeta.commandFlags && hireMeta.commandFlags.length > 0 && (
                  <span style={chipRow}>
                    <span style={{ fontSize: 12 }}>{tr('addAgent.hireFlags')}</span>
                    {hireMeta.commandFlags.map((f, i) => <code key={`${f}-${i}`} style={codeChip('paprika')}>{f}</code>)}
                  </span>
                )}
                {hireMeta.skills && hireMeta.skills.length > 0 && (
                  <span style={chipRow}>
                    <span style={{ fontSize: 12 }}>{tr('addAgent.hireSkills')}</span>
                    {hireMeta.skills.map((s) => <code key={s} style={codeChip('mint')}>{s}</code>)}
                  </span>
                )}
                {hireMeta.mcpServers && hireMeta.mcpServers.length > 0 && (() => {
                  const safe = hireMeta.mcpServers!.filter((mid) => MCP_CATALOG.find((e) => e.id === mid)?.tier === 'safe-readonly');
                  const consent = hireMeta.mcpServers!.filter((mid) => MCP_CATALOG.find((e) => e.id === mid)?.tier !== 'safe-readonly');
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                      {safe.length > 0 && <span style={chipRow}><span style={{ fontSize: 12 }}>{tr('addAgent.mcpSafe')}:</span>{safe.map((mid) => <code key={mid} style={codeChip('sky')}>{mid}</code>)}</span>}
                      {consent.length > 0 && (
                        <span style={chipRow}>
                          <span style={{ fontSize: 12 }}>{tr('addAgent.mcpConsent')}:</span>
                          {consent.map((mid) => <code key={mid} style={codeChip('paprika')}>{mid}</code>)}
                          <span style={{ fontSize: 11, color: 'var(--cth-ink-700)' }}>{tr('addAgent.mcpEnableInSettings')}</span>
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Step bar: go back to any step; forward through Next. */}
            <nav aria-label={tr('addAgent.wizard.steps')} style={{ display: 'flex', gap: 6 }}>
              {STEPS.map((s, i) => {
                const active = s === step;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-current={active ? 'step' : undefined}
                    disabled={i > stepIndex}
                    onClick={() => goTo(s)}
                    style={{
                      flex: 1, textAlign: 'start', padding: '6px 9px 5px', border: 'none',
                      cursor: i > stepIndex ? 'default' : 'pointer',
                      background: active ? 'var(--cth-sky-light)' : 'var(--cth-cream-100)',
                      boxShadow: active ? 'inset 0 0 0 1.5px var(--cth-ink-500)' : 'inset 0 0 0 1px var(--cth-ink-100)',
                      opacity: i > stepIndex ? 0.6 : 1
                    }}
                  >
                    <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '13px', textTransform: 'uppercase', color: 'var(--cth-ink-900)' }}>
                      {i + 1} {tr(`addAgent.wizard.step.${s}`)}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--cth-ink-500)' }}>{tr(`addAgent.wizard.stepHint.${s}`)}</span>
                  </button>
                );
              })}
            </nav>

            <div style={{ minHeight: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {step === 'who' && (
                <>
                  <Row label={tr('addAgent.character')}>
                    {/* Grouped by each character's job in the show (owner, 2026-09-27). */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 12, alignItems: 'flex-start' }}>
                      {CAST_GROUPS.map((g) => (
                        <div key={g.key} role="group" aria-label={tr(`addAgent.castGroup.${g.key}`)} style={{ flex: '0 0 auto' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cth-ink-700)', marginBottom: 4 }}>{tr(`addAgent.castGroup.${g.key}`)}</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {g.members.map((m) => CAST_BY_NAME[m]).map((c) => (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => { setCharacter(c.name); setName(c.displayName); setJobKey(null); }}
                                title={c.blurb}
                                aria-pressed={character === c.name}
                                style={{
                                  padding: 4,
                                  background: character === c.name ? 'var(--cth-sky-light)' : 'var(--cth-cream-100)',
                                  boxShadow: character === c.name ? 'inset 0 0 0 1.5px var(--cth-ink-500)' : 'inset 0 0 0 1px var(--cth-ink-100)',
                                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                  border: 'none', width: 72
                                }}
                              >
                                <div style={{ width: 44, height: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
                                  <SpritePortrait character={c.name} scale={2} />
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--cth-ink-900)' }}>{c.displayName}</span>
                                {/* Groups club related jobs, so each tile names its own (owner, 2026-09-27). */}
                                <span style={{ fontSize: 11, lineHeight: '13px', color: 'var(--cth-ink-500)', textAlign: 'center' }}>{tr(`addAgent.castRole.${c.name}`)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Row>
                  <Row label={tr('addAgent.name')}>
                    <input
                      value={name}
                      onChange={(e) => {
                        const next = e.target.value;
                        setName(next);
                        const match = characterForName(next);
                        if (match) { setCharacter(match); setJobKey(null); }
                      }}
                      placeholder={tr('addAgent.namePlaceholder')}
                      style={inputStyle}
                    />
                    {name.trim() && nameTaken(name) && <span role="alert" style={helperStyle}>{tr('addAgent.wizard.nameTaken', { name: name.trim() })}</span>}
                  </Row>
                </>
              )}

              {step === 'job' && (
                <div role="radiogroup" aria-label={tr('addAgent.wizard.step.job')} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '58vh', overflowY: 'auto', paddingInlineEnd: 4 }}>
                  {theirJob && (
                    <JobGroup label={tr('addAgent.wizard.theirJob', { name: name.trim() || CAST_BY_NAME[character].displayName })}>
                      <JobRow job={theirJob} tag={theirJob.source === 'team' ? tr('addAgent.wizard.likeTeammate', { name: theirJob.fromName }) : theirJob.business} selected={chosenKey === theirJob.key} onPick={() => setJobKey(theirJob.key)} />
                    </JobGroup>
                  )}
                  {familyJobs.length > 0 && (
                    <JobGroup label={tr('addAgent.wizard.yourOffice')}>
                      {familyJobs.map((j) => (
                        <JobRow key={j.key} job={j} tag={j.fromName} selected={chosenKey === j.key} onPick={() => setJobKey(j.key)} />
                      ))}
                    </JobGroup>
                  )}
                  <JobGroup label={tr('addAgent.wizard.newJob')}>
                    <JobRow job={{ key: NEW_JOB_KEY, source: 'new', title: tr('addAgent.wizard.newJobTitle'), routing: '', workStyle: '', summary: tr('addAgent.wizard.newJobSummary') }} selected={chosenKey === NEW_JOB_KEY} onPick={() => setJobKey(NEW_JOB_KEY)} />
                  </JobGroup>
                  <JobGroup label={listAll ? tr('addAgent.wizard.allJobs') : tr('addAgent.wizard.familyJobs', { role: tr(`addAgent.castRole.${character}`) })}>
                    {jobGroups.map(([jobTitle, list]) => (
                      <div key={jobTitle} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {list.filter((j) => j.key !== theirJob?.key).map((j) => (
                          <JobRow key={j.key} job={j} tag={j.business} selected={chosenKey === j.key} onPick={() => setJobKey(j.key)} />
                        ))}
                      </div>
                    ))}
                  </JobGroup>
                  {family && hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        // Closing the list again drops a pick it no longer shows.
                        if (showAll && chosenJob && !inFamily(chosenJob) && chosenJob.key !== theirJob?.key) setJobKey(null);
                        setShowAll(!showAll);
                      }}
                      style={{ ...linkStyle, alignSelf: 'flex-start' }}
                    >
                      {showAll
                        ? tr('addAgent.wizard.showFamily', { role: tr(`addAgent.castRole.${character}`) })
                        : tr('addAgent.wizard.showAll', { count: hiddenCount })}
                    </button>
                  )}
                </div>
              )}

              {step === 'review' && (
                <>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ width: 44, height: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      <SpritePortrait character={character} scale={2} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Row label={tr('addAgent.name')}>
                        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
                      </Row>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Row label={tr('addAgent.role')}>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('addAgent.rolePlaceholder')} style={inputStyle} />
                      </Row>
                    </div>
                  </div>

                  <Row label={tr('addAgent.wizard.whatToSend', { name: name.trim() })}>
                    <textarea
                      dir={rtl ? 'auto' : undefined}
                      value={routing}
                      onChange={(e) => setRouting(e.target.value)}
                      placeholder={tr('addAgent.roleDescriptionPlaceholder')}
                      rows={3}
                      style={{ ...inputStyle, fontFamily: 'var(--cth-font-ui)', resize: 'vertical' }}
                    />
                    <span style={helperStyle}>{tr('addAgent.roleHelp', { godName })}</span>
                  </Row>

                  <DistinctBox
                    checking={checking}
                    verdict={verdict ?? (binding ? shownVerdict : null)}
                    overlapNames={binding ? [...new Set([...overlapNames, ...binding.others])] : overlapNames}
                    binding={binding}
                    name={name.trim()}
                    team={team}
                    onRecheck={() => { void runCheck(); }}
                    bindMode={bindMode}
                    setBindMode={setBindMode}
                    freeMailboxes={freeMailboxes.map((m) => ({ id: m.id, address: m.address }))}
                    bindMailbox={bindMailbox}
                    setBindMailbox={setBindMailbox}
                    topic={topic}
                    setTopic={setTopic}
                    onBindMailbox={() => { const a = mailboxAddress(bindMailbox); if (a) applyBinding(tr('addAgent.wizard.mailboxScope', { address: a }), bindMailbox); }}
                    onBindTopic={() => applyBinding(topic)}
                    onClearBinding={clearBinding}
                  />

                  <Row label={tr('addAgent.workStyle')}>
                    <textarea
                      dir={rtl ? 'auto' : undefined}
                      value={workStyle}
                      onChange={(e) => setWorkStyle(e.target.value)}
                      placeholder={tr('addAgent.workStylePlaceholder')}
                      rows={6}
                      style={{ ...inputStyle, fontFamily: 'var(--cth-font-ui)', fontSize: 14, resize: 'vertical' }}
                    />
                    <span style={helperStyle}>{tr('addAgent.workStyleHelp', { godName })}</span>
                  </Row>

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 380px', minWidth: 0 }}>
                      <Row label={tr('addAgent.wizard.folder')}>
                        {michaelFolder && !customCwd ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} style={{ ...inputStyle, flex: 1 }} aria-label={tr('addAgent.wizard.folder')} />
                            <PixelButton variant="secondary" size="md" onClick={pickFolder}>
                              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="folder" /> {tr('addAgent.pick')}</span>
                            </PixelButton>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input value={customCwd ?? ''} onChange={(e) => setCustomCwd(e.target.value)} style={{ ...inputStyle, flex: 1, fontFamily: 'var(--cth-font-mono)', fontSize: 13 }} aria-label={tr('addAgent.wizard.folder')} />
                            <PixelButton variant="secondary" size="md" onClick={pickFolder}>
                              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="folder" /> {tr('addAgent.pick')}</span>
                            </PixelButton>
                            {michaelFolder && <button type="button" onClick={() => setCustomCwd(undefined)} style={linkStyle}>{tr('addAgent.wizard.folderDefault')}</button>}
                          </div>
                        )}
                        <span style={helperStyle}>
                          {michaelFolder && !customCwd
                            ? tr('addAgent.wizard.folderInside', { godName, path: cwd || michaelFolder })
                            : tr('addAgent.folderPrivate', { godName })}
                        </span>
                      </Row>
                    </div>
                    <div style={{ flex: '0 0 auto' }}>
                      <Row label={tr('addAgent.model')}>
                        <Select
                          label={tr('addAgent.model')}
                          value={model ?? ''}
                          onChange={(v) => { setCommandEdit(undefined); setCustomModel(v && v !== defaultModel ? v : undefined); }}
                          style={{ fontSize: 14, lineHeight: '20px' }}
                        >
                          {!defaultModel && <option value="">{tr('addAgent.wizard.modelDefault', { model: tr('addAgent.wizard.cliDefault') })}</option>}
                          {modelOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.id === defaultModel ? tr('addAgent.wizard.modelDefault', { model: m.label }) : m.label}
                            </option>
                          ))}
                        </Select>
                      </Row>
                    </div>
                  </div>

                  {/* Engine, model list and the raw command: developer options,
                      hidden with SHOW_ENGINE_PICKER (owner, 2026-09-27). */}
                  {SHOW_ENGINE_PICKER && <>
                    <Row label={tr('addAgent.provider')}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {AGENT_PROVIDER_PRESETS
                          .filter((p) => BUILD_ENGINES.includes(p.id) || p.id === provider)
                          .map((p) => (
                            <button key={p.id} type="button" onClick={() => { setProvider(p.id); setCustomModel(undefined); setCommandEdit(undefined); }} style={{ ...chip(provider === p.id), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <ProviderLogo provider={p.id} size={14} />
                              {p.label}
                            </button>
                          ))}
                      </div>
                    </Row>
                    <Row label={tr('addAgent.command')}>
                      <input value={command} onChange={(e) => setCommandEdit(e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--cth-font-mono)' }} />
                    </Row>
                  </>}
                </>
              )}
            </div>

            {error && (
              <div role="alert" style={{ padding: '6px 10px', background: 'var(--cth-coral-light)', boxShadow: 'inset 0 0 0 1px var(--cth-coral)', fontSize: 13, color: 'var(--cth-ink-900)' }}>
                {error}
              </div>
            )}

            {/* Import-hire explainer + AI prompt generator; hidden with
                SHOW_IMPORT_HIRE (owner, 2026-09-27). */}
            {SHOW_IMPORT_HIRE && <div style={{
              padding: '8px 10px', background: 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
              display: 'flex', flexDirection: 'column', gap: 6
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--cth-ink-700)', lineHeight: '17px' }}>{tr('addAgent.importHireDesc')}</span>
                <button type="button" onClick={() => setShowHirePrompt((v) => !v)} style={{ ...chip(showHirePrompt), flexShrink: 0 }}>
                  {showHirePrompt ? tr('addAgent.hideAIPrompt') : tr('addAgent.generateWithAI')}
                </button>
              </div>
              {showHirePrompt && (
                <textarea readOnly value={HIRE_PROMPT} onFocus={(e) => e.currentTarget.select()} rows={10}
                  style={{ ...inputStyle, width: '100%', fontFamily: 'var(--cth-font-mono)', fontSize: 12, lineHeight: '16px', resize: 'vertical' }} />
              )}
            </div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              {SHOW_IMPORT_HIRE && (
                <PixelButton
                  variant="secondary"
                  size="md"
                  onClick={importHire}
                  disabled={busy}
                  title={tr('addAgent.importHireBtnTitle')}
                >
                  {tr('addAgent.importHireBtn')}
                </PixelButton>
              )}
              <div style={{ flex: 1 }} />
              {pendingHire && (
                <PixelButton variant="secondary" size="md" onClick={skipHire} disabled={busy}>{tr('addAgent.skipHire')}</PixelButton>
              )}
              <PixelButton variant="ghost" size="md" onClick={onClose} disabled={busy}>{tr('common.cancel')}</PixelButton>
              {stepIndex > 0 && (
                <PixelButton variant="secondary" size="md" onClick={() => goTo(STEPS[stepIndex - 1])} disabled={busy}>{tr('addAgent.wizard.back')}</PixelButton>
              )}
              {step !== 'review' ? (
                <PixelButton variant="primary" size="md" onClick={() => goTo(STEPS[stepIndex + 1])} disabled={step === 'who' && !!whoError}>{tr('addAgent.wizard.next')}</PixelButton>
              ) : (
                <PixelButton variant="primary" size="md" onClick={submit} disabled={busy || checking || (overlapNames.length > 0 && !binding)}>
                  {busy ? tr('addAgent.spawning') : checking ? tr('addAgent.wizard.checking') : tr('addAgent.spawn')}
                </PixelButton>
              )}
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

function JobGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cth-ink-700)' }}>{label}</div>
      {children}
    </div>
  );
}

function JobRow({ job, tag, selected, onPick }: { job: HireJob; tag?: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      style={{
        textAlign: 'start', border: 'none', cursor: 'pointer', padding: '6px 10px',
        background: selected ? 'var(--cth-sky-light)' : 'var(--cth-paper-100)',
        boxShadow: selected ? 'inset 0 0 0 1.5px var(--cth-ink-500)' : 'inset 0 0 0 1px var(--cth-ink-100)',
        display: 'flex', flexDirection: 'column', gap: 2
      }}
    >
      <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cth-ink-900)' }}>{job.title}</span>
        {tag && <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{tag}</span>}
      </span>
      {job.summary && (
        <span style={{ fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-700)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {job.summary}
        </span>
      )}
    </button>
  );
}

interface DistinctBoxProps {
  checking: boolean;
  verdict: DistinctVerdict | null;
  overlapNames: string[];
  binding: Binding | null;
  name: string;
  team: Agent[];
  onRecheck: () => void;
  bindMode: 'mailbox' | 'topic' | null;
  setBindMode: (m: 'mailbox' | 'topic' | null) => void;
  freeMailboxes: Array<{ id: string; address: string }>;
  bindMailbox: string;
  setBindMailbox: (id: string) => void;
  topic: string;
  setTopic: (t: string) => void;
  onBindMailbox: () => void;
  onBindTopic: () => void;
  onClearBinding: () => void;
}

/** The distinct job check's result on Review (D6): checking, distinct, or the
 *  overlap with the ways to make the job particular. */
function DistinctBox(p: DistinctBoxProps) {
  const { t } = useTranslation();
  const listJoin = t('profile.listJoiner');
  if (p.checking) return <div aria-live="polite" style={{ ...box, background: 'var(--cth-paper-100)' }}>{t('addAgent.wizard.checkingTeam')}</div>;
  if (!p.verdict && p.overlapNames.length === 0) {
    return (
      <div aria-live="polite" style={{ ...box, background: 'var(--cth-paper-100)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{t('addAgent.wizard.notChecked')}</span>
        <button type="button" onClick={p.onRecheck} style={linkStyle}>{t('addAgent.wizard.checkNow')}</button>
      </div>
    );
  }
  const fallback = p.verdict?.source === 'rules' ? <div style={helperStyle}>{t('addAgent.wizard.fullCheckFailed')}</div> : null;
  if (p.overlapNames.length === 0) {
    return (
      <div aria-live="polite" style={{ ...box, background: 'var(--cth-mint-light)' }}>
        {t('addAgent.wizard.distinct')}
        {fallback}
      </div>
    );
  }
  const others = p.binding ? bindingLines(p.binding.scope, p.name).others : '';
  return (
    <div aria-live="polite" style={{ ...box, background: p.binding ? 'var(--cth-mint-light)' : 'var(--cth-lemon-light)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 13 }}>{t('addAgent.wizard.overlaps', { names: p.overlapNames.join(listJoin) })}</strong>
      <span>{p.verdict?.why || t('addAgent.wizard.sameWork')}</span>
      {p.binding ? (
        <>
          <span>{t('addAgent.wizard.boundTo', { name: p.name, scope: p.binding.scope })}</span>
          {p.team.filter((m) => p.binding!.others.includes(m.name)).map((m) => (
            <span key={m.id} style={helperStyle}>{t('addAgent.wizard.otherLine', { name: m.name, line: others })}</span>
          ))}
          <button type="button" onClick={p.onClearBinding} style={{ ...linkStyle, alignSelf: 'flex-start' }}>{t('addAgent.wizard.unbind')}</button>
        </>
      ) : (
        <>
          <span>{t('addAgent.wizard.makeParticular', { name: p.name })}</span>
          {p.verdict?.suggestion && <span style={helperStyle}>{t('addAgent.wizard.suggestion', { text: p.verdict.suggestion })}</span>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => p.setBindMode('mailbox')} style={chip(p.bindMode === 'mailbox')} disabled={p.freeMailboxes.length === 0} title={p.freeMailboxes.length === 0 ? t('addAgent.wizard.noFreeMailbox') : undefined}>{t('addAgent.wizard.bindMailbox')}</button>
            <button type="button" onClick={() => p.setBindMode('topic')} style={chip(p.bindMode === 'topic')}>{t('addAgent.wizard.bindTopic')}</button>
            <button type="button" onClick={p.onRecheck} style={chip(false)}>{t('addAgent.wizard.checkAgain')}</button>
          </div>
          {p.bindMode === 'mailbox' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={p.bindMailbox} onChange={(e) => p.setBindMailbox(e.target.value)} aria-label={t('addAgent.wizard.bindMailbox')} style={{ ...inputStyle, width: 'auto', fontSize: 14 }}>
                <option value="">{t('capabilities.pickMailbox')}</option>
                {p.freeMailboxes.map((m) => <option key={m.id} value={m.id}>{m.address}</option>)}
              </select>
              <PixelButton variant="secondary" size="sm" onClick={p.onBindMailbox} disabled={!p.bindMailbox}>{t('addAgent.wizard.bind')}</PixelButton>
            </div>
          )}
          {p.bindMode === 'topic' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={p.topic} maxLength={TOPIC_MAX} onChange={(e) => p.setTopic(e.target.value)} placeholder={t('addAgent.wizard.topicPlaceholder')} aria-label={t('addAgent.wizard.bindTopic')} style={{ ...inputStyle, flex: 1, fontSize: 14 }} />
              <PixelButton variant="secondary" size="sm" onClick={p.onBindTopic} disabled={!p.topic.trim()}>{t('addAgent.wizard.bind')}</PixelButton>
            </div>
          )}
          <span style={helperStyle}>{t('addAgent.wizard.editToFix')}</span>
        </>
      )}
      {fallback}
    </div>
  );
}

const chip = (active: boolean): CSSProperties => ({
  padding: '3px 8px 1px',
  background: active ? 'var(--cth-sky-light)' : 'var(--cth-cream-100)',
  boxShadow: active ? 'inset 0 0 0 1.5px var(--cth-ink-500)' : 'inset 0 0 0 1px var(--cth-ink-100)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 13,
  color: 'var(--cth-ink-900)', cursor: 'pointer', border: 'none'
});
const chipRow: CSSProperties = { display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2 };
const codeChip = (tone: 'paprika' | 'mint' | 'sky'): CSSProperties => ({
  fontFamily: 'var(--cth-font-mono)', fontSize: 12, padding: '0 4px',
  background: `var(--cth-${tone}-light)`, boxShadow: `inset 0 0 0 1px var(--cth-${tone}-700, var(--cth-ink-500))`,
  color: 'var(--cth-ink-900)'
});
const box: CSSProperties = { padding: '8px 10px', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-900)' };
const linkStyle: CSSProperties = { background: 'none', border: 'none', padding: 0, color: 'var(--cth-sky-700, var(--cth-ink-900))', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 };

/** A plain note under a field: what it is for, in the owner's words. */
const helperStyle: CSSProperties = {
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-500)'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px 4px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 16,
  color: 'var(--cth-ink-900)',
  outline: 'none'
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontFamily: 'var(--cth-font-display)',
        fontSize: 8, lineHeight: '12px',
        color: 'var(--cth-ink-700)',
        textTransform: 'uppercase'
      }}>{label}</span>
      {children}
    </label>
  );
}
