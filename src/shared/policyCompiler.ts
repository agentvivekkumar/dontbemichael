/**
 * Provider-neutral policy compiler and enforcement matrix (issue #48).
 *
 * Compiles an agent's unified access boundaries (folder privacy, shell
 * sandboxing, connector isolation, MCP scoping, network rules) into
 * provider-specific CLI arguments, environment variables and configuration files.
 *
 * Where an engine or operating system cannot natively enforce a required boundary,
 * the agent is gracefully downgraded:
 *  - Outgoing email is restricted to Draft only (direct send disabled).
 *  - Connectors are switched off for that agent.
 *  - The Access tab explains why ("same rules, or fewer powers").
 */

import type { AgentProvider } from './agentProvider';
import type { AgentFolderPolicy, FolderLayout } from './folderAccess';
import type { SandboxNetwork } from './webAccess';

export interface PolicyEnforcementCapabilities {
  /** Does the engine/tool layer prevent file reading outside permitted folders? */
  fileToolsRead: boolean;
  /** Does the engine/tool layer prevent file writing outside permitted folders? */
  fileToolsWrite: boolean;
  /** Does the engine sandbox prevent shell commands from reading outside permitted folders? */
  shellRead: boolean;
  /** Does the engine sandbox prevent shell commands from writing outside permitted folders? */
  shellWrite: boolean;
  /** Does the engine natively reject ungranted connectors at spawn? */
  connectorDeny: boolean;
  /** Does the engine isolate MCP servers per agent? */
  mcpScoping: boolean;
}

/**
 * Native enforcement capabilities for each engine × OS combination.
 *
 * - Claude Code:
 *   - POSIX: Full sandbox and permission deny rules (files, shell read/write, connectors).
 *   - Windows: File tools obey deny rules, but shell commands have no OS sandbox.
 * - OpenAI Codex:
 *   - Sandbox (`-s workspace-write` + `--add-dir`) confines shell writes, but reads
 *     outside the workspace are NOT prevented by the sandbox. Connectors are not native.
 * - Gemini CLI:
 *   - Starts with `--yolo` and no native sandbox today; `--include-directories` specifies context.
 */
export function providerEnforcementFor(
  provider: AgentProvider,
  platform: NodeJS.Platform = process.platform
): PolicyEnforcementCapabilities {
  switch (provider) {
    case 'claude':
      if (platform === 'win32') {
        return {
          fileToolsRead: true,
          fileToolsWrite: true,
          shellRead: false,
          shellWrite: false,
          connectorDeny: true,
          mcpScoping: true
        };
      }
      return {
        fileToolsRead: true,
        fileToolsWrite: true,
        shellRead: true,
        shellWrite: true,
        connectorDeny: true,
        mcpScoping: true
      };

    case 'codex':
      return {
        fileToolsRead: true,
        fileToolsWrite: true,
        shellRead: false, // Codex workspace-write limits writes, not reads
        shellWrite: true,  // Fenced by -s workspace-write and --add-dir
        connectorDeny: false,
        mcpScoping: true
      };

    case 'gemini':
    case 'antigravity':
      return {
        fileToolsRead: false,
        fileToolsWrite: false,
        shellRead: false,
        shellWrite: false,
        connectorDeny: false,
        mcpScoping: false
      };

    default:
      return {
        fileToolsRead: false,
        fileToolsWrite: false,
        shellRead: false,
        shellWrite: false,
        connectorDeny: false,
        mcpScoping: false
      };
  }
}

export interface PolicyDowngradeResult {
  downgraded: boolean;
  mailDraftOnly: boolean;
  connectorsOff: boolean;
  reasons: string[];
}

export interface PolicyDowngradeInput {
  isGod: boolean;
  hasPeersOrSensitive: boolean;
  requestedConnectorsCount: number;
}

/**
 * Determine if an agent must be downgraded because the provider/platform
 * cannot enforce one of the required office security boundaries.
 */
export function evaluatePolicyDowngrade(
  input: PolicyDowngradeInput,
  enforcement: PolicyEnforcementCapabilities,
  provider: AgentProvider,
  platform: NodeJS.Platform = process.platform
): PolicyDowngradeResult {
  const reasons: string[] = [];
  let mailDraftOnly = false;
  let connectorsOff = false;

  if (!input.isGod) {
    // Boundary 1: Shell Read Privacy
    // If peer team folders or sensitive folders exist, but shell read cannot be fenced:
    if (input.hasPeersOrSensitive && !enforcement.shellRead) {
      mailDraftOnly = true;
      reasons.push(`${provider} does not enforce shell read isolation on ${platform}; email restricted to Draft only.`);
    }

    // Boundary 2: Shell Write Sandboxing
    // If shell write cannot be fenced to the agent's own folder:
    if (!enforcement.shellWrite) {
      mailDraftOnly = true;
      reasons.push(`${provider} does not sandbox shell writes on ${platform}; email restricted to Draft only.`);
    }
  }

  // Boundary 3: Connector Access Gate
  // If the engine cannot enforce connector deny at startup, connectors are disabled:
  if (!enforcement.connectorDeny) {
    connectorsOff = true;
    if (input.requestedConnectorsCount > 0) {
      reasons.push(`${provider} cannot enforce connector isolation; connectors disabled.`);
    }
  }

  const actuallyDowngraded = reasons.length > 0
    || mailDraftOnly
    || (connectorsOff && input.requestedConnectorsCount > 0);

  return {
    downgraded: actuallyDowngraded,
    mailDraftOnly,
    connectorsOff,
    reasons
  };
}

export interface UnifiedAccessPolicy {
  agentId: string;
  isGod: boolean;
  cwd: string;
  layout?: FolderLayout;
  writableDirs?: string[];
  folderPolicy?: AgentFolderPolicy;
  connectors?: {
    allowed?: string[];
    deny?: string[];
  };
  network?: SandboxNetwork;
}

export interface CompiledProviderPolicy {
  provider: AgentProvider;
  args: string[];
  env: Record<string, string>;
  enforcement: PolicyEnforcementCapabilities;
  downgrade: PolicyDowngradeResult;
}

/**
 * Compile a declarative access policy for a specific engine and platform.
 */
export function compilePolicy(
  policy: UnifiedAccessPolicy,
  provider: AgentProvider,
  platform: NodeJS.Platform = process.platform
): CompiledProviderPolicy {
  const enforcement = providerEnforcementFor(provider, platform);

  const teamFolders = policy.layout?.teamFolders ?? [];
  const hasPeers = teamFolders.some((f) => f !== policy.cwd);
  const hasPeersOrSensitive = hasPeers || !!policy.layout?.appPrivate || !!policy.layout?.business
    || (policy.folderPolicy?.sandbox?.denyRead?.length ?? 0) > 0
    || (policy.folderPolicy?.deny?.length ?? 0) > 0;

  const requestedConnectorsCount = (policy.connectors?.allowed?.length ?? 0)
    + (policy.connectors?.deny?.length ? 1 : 0);

  const downgrade = evaluatePolicyDowngrade(
    {
      isGod: policy.isGod,
      hasPeersOrSensitive,
      requestedConnectorsCount
    },
    enforcement,
    provider,
    platform
  );

  const args: string[] = [];
  const env: Record<string, string> = {};

  switch (provider) {
    case 'codex': {
      // In auto mode Codex uses `-a never -s workspace-write`.
      // Extra writable directories are passed via `--add-dir`.
      for (const d of policy.writableDirs ?? []) {
        args.push('--add-dir', d);
      }
      break;
    }

    case 'gemini': {
      // Gemini CLI uses `--include-directories` for extra context directories.
      for (const d of policy.writableDirs ?? []) {
        args.push('--include-directories', d);
      }
      break;
    }

    case 'claude':
    default: {
      // Claude args are attached in HiveManager via `--settings`.
      break;
    }
  }

  return {
    provider,
    args,
    env,
    enforcement,
    downgrade
  };
}
