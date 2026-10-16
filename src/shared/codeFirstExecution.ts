/**
 * Code-First Execution — deterministic handler layer for repetitive office tasks.
 *
 * Implements the proposal from issue #250:
 * For office tasks that follow clear deterministic rules (checking data, finding
 * duplicates, doing calculations, and checking task status), execute them directly
 * with structured TypeScript code rather than invoking a full LLM agent session.
 *
 * Design principles:
 *   1. Safety & Sandboxing: Pure deterministic TypeScript logic, no eval or arbitrary code.
 *   2. Strict Input Validation: Validate input data structure before running.
 *   3. Transparent Fallback: If intent does not match, input is invalid, or execution fails,
 *      seamlessly fall back to the LLM agent / God orchestrator workflow.
 *   4. Policy Preservation: Trigger permissions, approvals, and schedules remain fully intact.
 */

export type CodeFirstTaskType =
  | 'find_duplicates'
  | 'check_data'
  | 'calculate'
  | 'task_status';

export interface CodeFirstRequest {
  /** Natural prompt, command, or message body. */
  text: string;
  /** Optional task or card title. */
  title?: string;
  /** Explicit task type override if specified. */
  taskType?: CodeFirstTaskType;
  /** Structured data payload (records, arrays, CSV text, etc.). */
  data?: unknown;
  /** Key, column, or field name to inspect or aggregate. */
  key?: string;
  /** Specific mathematical operation for calculations. */
  operation?: 'sum' | 'average' | 'mean' | 'min' | 'max' | 'count' | 'all';
}

export interface TaskLedgerItem {
  id: string;
  title: string;
  status: string;
  assignee?: string;
  result?: string;
  createdAt?: string;
  waitingOn?: string;
  dependsOn?: string[];
}

export interface CodeFirstContext {
  /** Active tasks ledger for status queries. */
  tasks?: TaskLedgerItem[];
}

export interface DuplicateItem {
  value: string;
  count: number;
  indices: number[];
  sample?: unknown;
}

export interface FindDuplicatesResultData {
  total: number;
  uniqueCount: number;
  duplicateCount: number;
  duplicateRecordsCount: number;
  duplicates: DuplicateItem[];
}

export interface DataCheckIssue {
  row: number;
  field?: string;
  issue: string;
}

export interface CheckDataResultData {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  issueCount: number;
  issues: DataCheckIssue[];
}

export interface CalculationStats {
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
  median: number;
  operation?: string;
  resultValue?: number;
}

export interface TaskStatusResultData {
  found: boolean;
  query: string;
  task?: TaskLedgerItem;
}

export interface CodeFirstExecutionSuccess {
  matched: true;
  handled: true;
  taskType: CodeFirstTaskType;
  result: string;
  summary: string;
  data: FindDuplicatesResultData | CheckDataResultData | CalculationStats | TaskStatusResultData;
}

export interface CodeFirstExecutionFallback {
  matched: boolean;
  handled: false;
  taskType?: CodeFirstTaskType;
  fallbackReason: 'unsupported' | 'invalid_input' | 'execution_error';
  error?: string;
}

export type CodeFirstResult = CodeFirstExecutionSuccess | CodeFirstExecutionFallback;

/** Detect whether a request represents a supported deterministic task. */
export function detectCodeFirstIntent(request: CodeFirstRequest): {
  type: CodeFirstTaskType;
  key?: string;
  operation?: string;
} | null {
  if (request.taskType) {
    const valid: CodeFirstTaskType[] = ['find_duplicates', 'check_data', 'calculate', 'task_status'];
    if (valid.includes(request.taskType)) {
      return { type: request.taskType, key: request.key, operation: request.operation };
    }
  }

  const combined = `${request.title ?? ''} ${request.text ?? ''}`.toLowerCase().trim();
  if (!combined) return null;

  // 1. Task status query
  const statusPatterns = [
    /\b(?:task\s+status\s+of|status\s+of\s+task|status\s+of\s+card|check\s+status\s+of|status\s+of)\s+["']?([a-zA-Z0-9_-]+)["']?\b/,
    /\bcheck\s+["']?([a-zA-Z0-9_-]+)["']?\s+status\b/,
    /\b(task status|status of task|status of card|check status of|is task done|lookup task|track task)\b/
  ];
  for (const pat of statusPatterns) {
    const m = combined.match(pat);
    if (m) {
      const extractedKey = m[1] && !m[1].startsWith('task') && !m[1].startsWith('card') && !m[1].startsWith('status') ? m[1] : request.key;
      return { type: 'task_status', key: extractedKey };
    }
  }

  // 2. Finding duplicates
  const dupPatterns = [
    /\b(find|detect|check for|identify|get|list|look for|show)\s+(duplicate|duplicated|dups)\b/,
    /\bduplicate\s+([a-zA-Z0-9_]+)\b/,
    /\b(check|find)\s+duplicates\b/,
    /\bdedup(licate)?\b/
  ];
  for (const pat of dupPatterns) {
    if (pat.test(combined)) {
      let key = request.key;
      if (!key) {
        const keyMatch = combined.match(/\b(?:by|on|for|in|field|column)\s+["']?([a-zA-Z0-9_]+)["']?\b/);
        if (keyMatch && !['duplicate', 'duplicates', 'duplicated', 'dups', 'records', 'data', 'rows', 'this', 'the', 'these'].includes(keyMatch[1])) {
          key = keyMatch[1];
        }
      }
      if (!key) {
        const directField = combined.match(/\bduplicates?\s+([a-zA-Z0-9_]+)\b/);
        if (directField && !['records', 'rows', 'entries', 'items', 'values', 'data', 'in', 'of', 'from', 'found'].includes(directField[1])) {
          key = directField[1].replace(/s$/, '');
        }
      }
      return { type: 'find_duplicates', key };
    }
  }

  // 3. Data checking / validation
  const checkPatterns = [
    /\b(check|validate|verify|audit|inspect)\s+(data|records|dataset|table|csv|rows|file)\b/,
    /\bdata\s+(validation|check|quality|verification|audit)\b/,
    /\b(missing|null|empty)\s+(values|fields|records|check)\b/,
    /\bcheck for missing (fields|values|data)\b/
  ];
  for (const pat of checkPatterns) {
    if (pat.test(combined)) {
      return { type: 'check_data', key: request.key };
    }
  }

  // 4. Calculations / aggregations
  const calcPatterns = [
    /\b(calculate|compute)\s+(sum|total|average|mean|min|max|amount|expenses|revenue|numbers)\b/,
    /\b(sum|total|average|mean|min|max)\s+of\b/,
    /\b(total|sum)\s+(amount|expenses|revenue|values|numbers|cost)\b/,
    /\badd up (the |these )?(numbers|amounts|expenses|totals)\b/
  ];
  for (const pat of calcPatterns) {
    if (pat.test(combined)) {
      let op: string = request.operation ?? 'all';
      if (/\b(sum|total)\b/.test(combined)) op = 'sum';
      else if (/\b(average|mean)\b/.test(combined)) op = 'average';
      else if (/\bmin(imum)?\b/.test(combined)) op = 'min';
      else if (/\bmax(imum)?\b/.test(combined)) op = 'max';
      return { type: 'calculate', key: request.key, operation: op };
    }
  }

  return null;
}

/** Robust, lightweight CSV parser for tabular office data. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const lines: string[][] = [];
  let currentField = '';
  let inQuotes = false;
  let currentRow: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',' || char === '\t') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.length > 0 && currentRow.some((f) => f.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.length > 0 && currentRow.some((f) => f.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.length > 0 && currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length < 2) return [];

  const headers = lines[0].map((h) => h.trim());
  const records: Array<Record<string, string>> = [];

  for (let r = 1; r < lines.length; r++) {
    const row = lines[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c] || `col_${c}`;
      obj[header] = row[c] ?? '';
    }
    records.push(obj);
  }

  return records;
}

/** Extract tabular or record data from request payload or natural text. */
export function extractDataRecords(request: CodeFirstRequest): unknown[] | null {
  if (Array.isArray(request.data)) {
    return request.data;
  }

  if (typeof request.data === 'string' && request.data.trim()) {
    const trimmed = request.data.trim();
    // Try JSON
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* not valid JSON, try CSV */ }
    }
    // Try CSV
    const csvParsed = parseCsv(trimmed);
    if (csvParsed.length > 0) return csvParsed;
  }

  // Look for JSON or CSV blocks in natural text
  const text = request.text || '';
  const jsonBlock = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1]);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }

  const rawJsonArray = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (rawJsonArray) {
    try {
      const parsed = JSON.parse(rawJsonArray[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }

  const csvBlock = text.match(/```(?:csv)?\s*([\s\S]*?)\s*```/);
  if (csvBlock) {
    const csvParsed = parseCsv(csvBlock[1]);
    if (csvParsed.length > 0) return csvParsed;
  }

  // Check if text has multiple CSV-like lines
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.includes(',') || l.includes('\t'));
  if (lines.length >= 2) {
    const csvParsed = parseCsv(lines.join('\n'));
    if (csvParsed.length > 0) return csvParsed;
  }

  return null;
}

/** Extract list of numbers from request data or natural text. */
export function extractNumbers(request: CodeFirstRequest, targetKey?: string): number[] | null {
  const records = extractDataRecords(request);
  if (records && records.length > 0) {
    const nums: number[] = [];
    for (const item of records) {
      if (typeof item === 'number' && !Number.isNaN(item)) {
        nums.push(item);
      } else if (typeof item === 'string') {
        const cleaned = item.replace(/[$€£,\s]/g, '');
        const val = parseFloat(cleaned);
        if (!Number.isNaN(val)) nums.push(val);
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (targetKey && targetKey in obj) {
          const raw = obj[targetKey];
          const cleaned = typeof raw === 'number' ? raw : String(raw).replace(/[$€£,\s]/g, '');
          const val = typeof cleaned === 'number' ? cleaned : parseFloat(cleaned);
          if (!Number.isNaN(val)) nums.push(val);
        } else {
          // If no key specified, find first numeric field
          for (const k of Object.keys(obj)) {
            const raw = obj[k];
            const cleaned = typeof raw === 'number' ? raw : String(raw).replace(/[$€£,\s]/g, '');
            const val = typeof cleaned === 'number' ? cleaned : parseFloat(cleaned);
            if (!Number.isNaN(val)) {
              nums.push(val);
              break;
            }
          }
        }
      }
    }
    if (nums.length > 0) return nums;
  }

  // Extract numbers from natural text
  const text = request.text || '';
  const numMatches = text.match(/[-+]?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?|[-+]?\$?\d+(?:\.\d+)?/g);
  if (numMatches && numMatches.length > 0) {
    const parsed = numMatches
      .map((s) => parseFloat(s.replace(/[\$,]/g, '')))
      .filter((n) => !Number.isNaN(n));
    if (parsed.length > 0) return parsed;
  }

  return null;
}

/** Handler 1: Find duplicates in records. */
export function executeFindDuplicates(
  records: unknown[],
  key?: string
): { success: true; data: FindDuplicatesResultData; summary: string } {
  const total = records.length;
  const groups = new Map<string, { key: string; indices: number[]; sample?: unknown }>();

  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    let compKey: string;

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      if (key) {
        // Case-insensitive key lookup fallback
        const actualKey = Object.keys(rec).find((k) => k.toLowerCase() === key.toLowerCase()) || key;
        const val = rec[actualKey];
        compKey = val === undefined || val === null ? '(empty)' : String(val).trim();
      } else {
        const sortedKeys = Object.keys(rec).sort();
        compKey = JSON.stringify(sortedKeys.map((k) => [k, rec[k]]));
      }
    } else {
      compKey = item === undefined || item === null ? '(empty)' : String(item).trim();
    }

    const norm = compKey.toLowerCase();
    const existing = groups.get(norm);
    if (existing) {
      existing.indices.push(i);
    } else {
      groups.set(norm, { key: compKey, indices: [i], sample: item });
    }
  }

  const duplicates: DuplicateItem[] = [];
  let duplicateRecordsCount = 0;

  for (const g of groups.values()) {
    if (g.indices.length > 1) {
      duplicates.push({
        value: g.key,
        count: g.indices.length,
        indices: g.indices,
        sample: g.sample
      });
      duplicateRecordsCount += g.indices.length;
    }
  }

  const uniqueCount = groups.size;
  const duplicateCount = duplicates.length;

  let summary: string;
  if (duplicateCount === 0) {
    summary = `No duplicate records found across ${total} items${key ? ` for field "${key}"` : ''}.`;
  } else {
    const previewList = duplicates
      .slice(0, 5)
      .map((d) => `"${d.value}" (seen ${d.count} times at rows ${d.indices.map((n) => n + 1).join(', ')})`)
      .join('; ');
    const more = duplicateCount > 5 ? `, and ${duplicateCount - 5} more` : '';
    summary = `Found ${duplicateCount} duplicate ${duplicateCount === 1 ? 'value' : 'values'} across ${total} records${key ? ` for field "${key}"` : ''}: ${previewList}${more}. Total affected rows: ${duplicateRecordsCount}.`;
  }

  return {
    success: true,
    data: {
      total,
      uniqueCount,
      duplicateCount,
      duplicateRecordsCount,
      duplicates
    },
    summary
  };
}

/** Handler 2: Check data quality and schema consistency. */
export function executeCheckData(
  records: unknown[],
  targetKey?: string
): { success: true; data: CheckDataResultData; summary: string } {
  const totalRows = records.length;
  const issues: DataCheckIssue[] = [];

  // Determine standard keys from first few non-null objects
  const expectedKeys = new Set<string>();
  if (targetKey) {
    expectedKeys.add(targetKey);
  } else {
    for (let i = 0; i < Math.min(10, records.length); i++) {
      const row = records[i];
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        for (const k of Object.keys(row as Record<string, unknown>)) {
          expectedKeys.add(k);
        }
      }
    }
  }

  let invalidRowsCount = 0;

  for (let r = 0; r < records.length; r++) {
    const row = records[r];
    const rowNum = r + 1;
    let rowHasIssue = false;

    if (row === null || row === undefined) {
      issues.push({ row: rowNum, issue: 'Row is null or undefined' });
      rowHasIssue = true;
    } else if (typeof row !== 'object' || Array.isArray(row)) {
      if (typeof row === 'string' && !row.trim()) {
        issues.push({ row: rowNum, issue: 'Row is empty string' });
        rowHasIssue = true;
      }
    } else {
      const obj = row as Record<string, unknown>;
      for (const k of expectedKeys) {
        const val = obj[k];
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
          issues.push({ row: rowNum, field: k, issue: `Missing or empty value for "${k}"` });
          rowHasIssue = true;
        }
      }
    }

    if (rowHasIssue) invalidRowsCount++;
  }

  const validRows = totalRows - invalidRowsCount;
  const issueCount = issues.length;

  let summary: string;
  if (issueCount === 0) {
    summary = `Data check passed: all ${totalRows} records are valid with no missing fields.`;
  } else {
    const preview = issues
      .slice(0, 5)
      .map((iss) => `Row ${iss.row}${iss.field ? ` (${iss.field})` : ''}: ${iss.issue}`)
      .join('; ');
    const more = issueCount > 5 ? `, and ${issueCount - 5} more issues` : '';
    summary = `Data check identified ${issueCount} issues across ${invalidRowsCount} of ${totalRows} records: ${preview}${more}.`;
  }

  return {
    success: true,
    data: {
      totalRows,
      validRows,
      invalidRows: invalidRowsCount,
      issueCount,
      issues
    },
    summary
  };
}

/** Handler 3: Mathematical and statistical calculation. */
export function executeCalculate(
  numbers: number[],
  operation: string = 'all'
): { success: true; data: CalculationStats; summary: string } {
  const count = numbers.length;
  let sum = 0;
  let min = numbers[0];
  let max = numbers[0];

  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i];
    sum += n;
    if (n < min) min = n;
    if (n > max) max = n;
  }

  const average = count > 0 ? sum / count : 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Format with up to 2 decimal places if float
  const round2 = (v: number) => (Number.isInteger(v) ? v : Math.round(v * 100) / 100);

  let resultValue: number | undefined;
  let summary: string;

  if (operation === 'sum' || operation === 'total') {
    resultValue = round2(sum);
    summary = `Calculation result: sum is ${resultValue} across ${count} values (average: ${round2(average)}, min: ${round2(min)}, max: ${round2(max)}).`;
  } else if (operation === 'average' || operation === 'mean') {
    resultValue = round2(average);
    summary = `Calculation result: average is ${resultValue} across ${count} values (sum: ${round2(sum)}, min: ${round2(min)}, max: ${round2(max)}).`;
  } else if (operation === 'min') {
    resultValue = round2(min);
    summary = `Calculation result: minimum is ${resultValue} across ${count} values.`;
  } else if (operation === 'max') {
    resultValue = round2(max);
    summary = `Calculation result: maximum is ${resultValue} across ${count} values.`;
  } else {
    summary = `Calculation results across ${count} values: sum = ${round2(sum)}, average = ${round2(average)}, min = ${round2(min)}, max = ${round2(max)}, median = ${round2(median)}.`;
  }

  return {
    success: true,
    data: {
      count,
      sum: round2(sum),
      average: round2(average),
      min: round2(min),
      max: round2(max),
      median: round2(median),
      operation,
      resultValue
    },
    summary
  };
}

/** Handler 4: Query task status from the active task ledger. */
export function executeCheckTaskStatus(
  query: string,
  tasks: TaskLedgerItem[] = []
): { success: true; data: TaskStatusResultData; summary: string } {
  const qClean = query.trim().toLowerCase();
  let foundTask: TaskLedgerItem | undefined;

  // Match by exact ID
  foundTask = tasks.find((t) => t.id && t.id.toLowerCase() === qClean);

  // Match by ID prefix / substring
  if (!foundTask) {
    foundTask = tasks.find((t) => t.id && t.id.toLowerCase().includes(qClean));
  }

  // Match by title substring
  if (!foundTask) {
    foundTask = tasks.find((t) => t.title && t.title.toLowerCase().includes(qClean));
  }

  if (!foundTask) {
    return {
      success: true,
      data: { found: false, query },
      summary: `No task found matching "${query}" in the active task ledger (${tasks.length} total tasks checked).`
    };
  }

  const parts = [
    `Task "${foundTask.title}" (${foundTask.id}) status is ${foundTask.status}.`
  ];
  if (foundTask.assignee) {
    parts.push(`Assigned to: ${foundTask.assignee}.`);
  }
  if (foundTask.status === 'done' && foundTask.result) {
    parts.push(`Result: ${foundTask.result}.`);
  }
  if (foundTask.status === 'waiting' && foundTask.waitingOn) {
    parts.push(`Waiting on: ${foundTask.waitingOn}.`);
  }

  return {
    success: true,
    data: { found: true, query, task: foundTask },
    summary: parts.join(' ')
  };
}

/**
 * Main Code-First execution entrypoint.
 *
 * Inspects the request, verifies input validity, deterministically executes supported
 * tasks without an LLM agent, or transparently falls back to the agent workflow.
 */
export function tryCodeFirstExecution(
  request: CodeFirstRequest,
  context?: CodeFirstContext
): CodeFirstResult {
  try {
    const detected = detectCodeFirstIntent(request);
    if (!detected) {
      return {
        matched: false,
        handled: false,
        fallbackReason: 'unsupported'
      };
    }

    const { type, key, operation } = detected;

    switch (type) {
      case 'find_duplicates': {
        const records = extractDataRecords(request);
        if (!records || records.length === 0) {
          return {
            matched: true,
            handled: false,
            taskType: type,
            fallbackReason: 'invalid_input',
            error: 'No valid records or tabular data found to check for duplicates'
          };
        }
        const outcome = executeFindDuplicates(records, key);
        return {
          matched: true,
          handled: true,
          taskType: type,
          result: outcome.summary,
          summary: outcome.summary,
          data: outcome.data
        };
      }

      case 'check_data': {
        const records = extractDataRecords(request);
        if (!records || records.length === 0) {
          return {
            matched: true,
            handled: false,
            taskType: type,
            fallbackReason: 'invalid_input',
            error: 'No valid records found to validate'
          };
        }
        const outcome = executeCheckData(records, key);
        return {
          matched: true,
          handled: true,
          taskType: type,
          result: outcome.summary,
          summary: outcome.summary,
          data: outcome.data
        };
      }

      case 'calculate': {
        const numbers = extractNumbers(request, key);
        if (!numbers || numbers.length === 0) {
          return {
            matched: true,
            handled: false,
            taskType: type,
            fallbackReason: 'invalid_input',
            error: 'No valid numbers found to calculate'
          };
        }
        const outcome = executeCalculate(numbers, operation);
        return {
          matched: true,
          handled: true,
          taskType: type,
          result: outcome.summary,
          summary: outcome.summary,
          data: outcome.data
        };
      }

      case 'task_status': {
        let query = key;
        if (!query) {
          // Extract task identifier from text (e.g. "status of task-123" or "check webhook-abc")
          const m = (request.text || '').match(/\b(?:task|card|status of|check)\s+["']?([a-zA-Z0-9_-]+)["']?\b/i);
          if (m && !['status', 'of', 'a', 'the', 'card'].includes(m[1].toLowerCase())) {
            query = m[1];
          } else {
            query = (request.text || '').replace(/\b(check|status|of|task|card|what is the)\b/gi, '').trim();
          }
        }
        if (!query) {
          return {
            matched: true,
            handled: false,
            taskType: type,
            fallbackReason: 'invalid_input',
            error: 'No task reference or ID specified to check status'
          };
        }
        const tasks = context?.tasks || [];
        const outcome = executeCheckTaskStatus(query, tasks);
        return {
          matched: true,
          handled: true,
          taskType: type,
          result: outcome.summary,
          summary: outcome.summary,
          data: outcome.data
        };
      }

      default:
        return {
          matched: false,
          handled: false,
          fallbackReason: 'unsupported'
        };
    }
  } catch (err) {
    return {
      matched: false,
      handled: false,
      fallbackReason: 'execution_error',
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
