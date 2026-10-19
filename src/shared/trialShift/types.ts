/**
 * Types for Employee Trial Shift (testing AI employees safely before deployment).
 * Small business owners test an employee against realistic business scenarios
 * in an isolated environment with simulated tools and fictional data.
 *
 * Standing rule: no dashes in any user facing string.
 */

import type { AgentProvider } from '../agentProvider';

export type TrialIndustry = 'care' | 'food' | 'hiring' | 'office';

export interface TrialAgentInput {
  id: string;
  name: string;
  role: string;
  summary?: string;
  does?: string[];
  wontDo?: string[];
  workStyle?: string;
  command?: string;
  provider?: AgentProvider;
  model?: string;
}

export interface SimulatedToolParameter {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
}

export interface SimulatedToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, SimulatedToolParameter>;
  mockResult: Record<string, unknown> | string;
}

export interface SimulatedToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  output: unknown;
  timestamp: number;
}

export type AssertionCategory = 'policy' | 'tool' | 'safety';
export type AssertionSeverity = 'critical' | 'warning';

export type AssertionRuleType =
  | 'tool_called'
  | 'tool_not_called'
  | 'tool_argument_matches'
  | 'no_unauthorized_tools'
  | 'text_includes_any'
  | 'text_excludes_all';

export interface TrialAssertionRule {
  id: string;
  title: string;
  description: string;
  category: AssertionCategory;
  severity: AssertionSeverity;
  ruleType: AssertionRuleType;
  targetTool?: string;
  targetArgument?: { name: string; expectedValue: unknown };
  phrases?: string[];
}

export interface FictionalDocument {
  filename: string;
  title: string;
  content: string;
}

export interface TrialScenario {
  id: string;
  name: string;
  industry: TrialIndustry;
  summary: string;
  targetRoles: string[];
  prompt: string;
  documents: FictionalDocument[];
  simulatedTools: SimulatedToolDefinition[];
  assertions: TrialAssertionRule[];
  tipsForOwner: string[];
}

export interface TrialEvaluationContext {
  agentResponse: string;
  toolCalls: SimulatedToolCall[];
  unauthorizedToolAttempts: string[];
  documents: Record<string, string>;
}

export interface AssertionResult {
  id: string;
  title: string;
  category: AssertionCategory;
  severity: AssertionSeverity;
  passed: boolean;
  evidence: string;
}

export type TrialStatus = 'passed' | 'needs_attention' | 'failed';

export interface TrialReport {
  scenarioId: string;
  scenarioName: string;
  agentId: string;
  agentName: string;
  status: TrialStatus;
  summary: string;
  results: AssertionResult[];
  toolCalls: SimulatedToolCall[];
  recommendations: string[];
  durationMs: number;
  timestamp: number;
}
