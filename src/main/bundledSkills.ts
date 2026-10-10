/** Expose shipped skills where Codex and Gemini discover workspace skills. */
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';
import { writeFileAtomic } from './atomicFile';
import { parseSkillFrontmatter } from './skills';

interface Installation {
  kind: 'link' | 'copy';
  value: string;
}
type Installations = Record<string, Installation>;
const STATE_FILE = '.dontbemichael-bundled.json';
const LINK_UNAVAILABLE = new Set(['EPERM', 'EACCES', 'ENOTSUP', 'ENOSYS']);

function entry(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/** Include names and links, without following links an owner adds to a copy. */
function fingerprint(root: string): string {
  const hash = createHash('sha256');
  function walk(dir: string, prefix: string): void {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      const key = join(prefix, name);
      if (stat.isDirectory()) {
        hash.update(JSON.stringify([key, 'dir']));
        walk(path, key);
      } else {
        if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Unsupported skill entry: ${path}`);
        const data = stat.isSymbolicLink() ? Buffer.from(readlinkSync(path)) : readFileSync(path);
        hash.update(JSON.stringify([key, stat.isSymbolicLink() ? 'link' : 'file', data.length]));
        hash.update(data);
      }
    }
  }
  walk(root, '');
  return hash.digest('hex');
}

function readInstallations(path: string): Installations {
  const stat = entry(path);
  if (!stat) return Object.create(null) as Installations;
  if (!stat.isFile()) throw new Error('Bundled skills ownership file is not a regular file');
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid bundled skills ownership file');
  for (const [name, value] of Object.entries(data)) {
    const item = value as Installation | null;
    if (!name || name === '.' || name === '..' || /[/\\\0]/.test(name) || !item
      || typeof item.value !== 'string'
      || !(item.kind === 'link' && item.value || item.kind === 'copy' && /^[a-f0-9]{64}$/.test(item.value))) {
      throw new Error('Invalid bundled skills ownership file');
    }
  }
  return Object.assign(Object.create(null), data) as Installations;
}

function isOwned(path: string, previous: Installation | undefined): boolean {
  if (!previous) return false;
  const stat = entry(path);
  if (previous.kind === 'link') return !!stat?.isSymbolicLink() && readlinkSync(path) === previous.value;
  return !!stat?.isDirectory() && fingerprint(path) === previous.value;
}

function install(source: string, destination: string): Installation {
  try {
    symlinkSync(source, destination, process.platform === 'win32' ? 'junction' : 'dir');
    return { kind: 'link', value: readlinkSync(destination) };
  } catch (e) {
    if (!LINK_UNAVAILABLE.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
  }
  mkdirSync(destination);
  cpSync(source, destination, { recursive: true, force: false, errorOnExist: true });
  return { kind: 'copy', value: fingerprint(destination) };
}

function skillName(md: string): string | undefined {
  if (!/^---\r?\n/.test(md)) return undefined;
  const name = parseSkillFrontmatter(md).name?.replace(/[ \t]+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  // Ownership needs an unambiguous name; the UI parser also accepts raw YAML.
  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) throw new Error('Cannot safely resolve workspace skill name');
  return name;
}

function ownerSkillNames(directory: string, managed: Installations): Set<string> {
  const names = new Set<string>();
  if (!existsSync(directory)) return names;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (isOwned(path, managed[name])) continue;
    names.add(name);
    const md = join(path, 'SKILL.md');
    if (existsSync(md) && statSync(md).isFile()) {
      const declared = skillName(readFileSync(md, 'utf8'));
      if (declared) names.add(declared);
    }
  }
  const rootMd = join(directory, 'SKILL.md');
  if (existsSync(rootMd) && statSync(rootMd).isFile()) {
    const declared = skillName(readFileSync(rootMd, 'utf8'));
    if (declared) names.add(declared);
  }
  return names;
}

/** Prepare outside the discovery directory; retain the old entry until its
 *  replacement and ownership record are both ready. */
function replaceInstallation(
  source: string | undefined, destination: string, previous: Installation | undefined,
  commit: (installed: Installation | undefined) => void
): void {
  const stage = mkdtempSync(join(dirname(dirname(destination)), '.dontbemichael-skill-'));
  const prepared = join(stage, 'new');
  const backup = join(stage, 'old');
  let installed: Installation | undefined;
  let movedOld = false;
  let movedNew = false;
  let committed = false;
  try {
    if (source) installed = install(source, prepared);
    if (entry(destination)) {
      if (!isOwned(destination, previous)) throw new Error(`Skill changed during provisioning: ${destination}`);
      renameSync(destination, backup);
      movedOld = true;
    }
    if (installed) {
      if (entry(destination)) throw new Error(`Skill appeared during provisioning: ${destination}`);
      renameSync(prepared, destination);
      movedNew = true;
    }
    commit(installed);
    committed = true;
  } catch (e) {
    if (movedNew && isOwned(destination, installed)) {
      if (installed?.kind === 'link') unlinkSync(destination);
      else rmSync(destination, { recursive: true });
    }
    if (movedOld && !entry(destination)) {
      renameSync(backup, destination);
      movedOld = false;
    }
    if (movedOld) throw new Error(`${String(e)}; previous skill retained at ${backup}`);
    throw e;
  } finally {
    if (committed || !movedOld) rmSync(stage, { recursive: true, force: true });
  }
}

/** Best effort: a read-only business folder must not prevent worker startup.
 *  Only entries recorded here and still unchanged belong to the app. */
export function provisionBundledSkills(source: string, cwd: string): string[] {
  const issues: string[] = [];
  try {
    if (!isAbsolute(cwd) || !statSync(cwd).isDirectory() || !existsSync(source)) return issues;
    const bundle = realpathSync(source);
    const names = readdirSync(bundle, { withFileTypes: true })
      .filter(item => item.isDirectory() && entry(join(bundle, item.name, 'SKILL.md'))?.isFile())
      .map(item => item.name);
    if (!names.length) return issues;

    let directory = cwd;
    for (const name of ['.agents', 'skills']) {
      directory = join(directory, name);
      const stat = entry(directory);
      // A linked root can belong to another project or the owner's global skills.
      if (stat && !stat.isDirectory()) throw new Error(`Native skills folder is not a regular directory: ${directory}`);
      if (!stat) mkdirSync(directory);
    }

    const statePath = join(directory, STATE_FILE);
    const previous = readInstallations(statePath);
    let next: Installations = Object.assign(Object.create(null), previous);
    let persisted = JSON.stringify(previous);
    // Gemini reads both roots, with .agents taking precedence over .gemini.
    const legacy = join(cwd, '.gemini', 'skills');
    const ownerNames = new Set([
      ...ownerSkillNames(directory, previous),
      ...(existsSync(legacy) && realpathSync(legacy) !== realpathSync(directory)
        ? ownerSkillNames(legacy, Object.create(null) as Installations) : [])
    ]);
    const shipped = new Set(names);
    for (const name of new Set([...Object.keys(previous), ...names])) {
      const destination = join(directory, name);
      try {
        let target = shipped.has(name) ? join(bundle, name) : undefined;
        if (target) {
          const declared = skillName(readFileSync(join(target, 'SKILL.md'), 'utf8')) ?? name;
          if (ownerNames.has(name) || ownerNames.has(declared)) target = undefined;
        }
        if (entry(destination)) {
          if (!isOwned(destination, previous[name])) {
            delete next[name];
            continue;
          }
          if (target && (previous[name].kind === 'link'
            ? existsSync(destination) && realpathSync(destination) === target
            : fingerprint(target) === previous[name].value)) continue;
        }
        if (!target && !next[name]) continue;
        replaceInstallation(target, destination, previous[name], installed => {
          const saved: Installations = Object.assign(Object.create(null), next);
          delete saved[name];
          if (installed) saved[name] = installed;
          writeFileAtomic(statePath, JSON.stringify(saved, null, 2) + '\n');
          next = saved;
          persisted = JSON.stringify(saved);
        });
      } catch (e) {
        issues.push(`${name}: ${String(e)}`);
      }
    }
    if (persisted !== JSON.stringify(next)) {
      writeFileAtomic(statePath, JSON.stringify(next, null, 2) + '\n');
    }
  } catch (e) {
    issues.push(String(e));
  }
  return issues;
}
