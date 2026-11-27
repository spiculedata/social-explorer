// Guards for the generated Python Dapr workflow scripts. Workflow definitions are user input, so
// every field that reaches generated Python is either validated against an allow-list here or
// rendered as a single string literal with `pythonStringLiteral` — never interpolated raw.

import { assertSafeIdentifier } from '#lib/utils/pathSafety.ts';
import type { WorkflowStep } from './pythonDaprWorkflowTypes';

/**
 * Step types that have a dedicated generated implementation in `pythonDaprStepTemplates.ts`.
 */
export const IMPLEMENTED_STEP_TYPES: ReadonlySet<string> = new Set([
  'text_preprocessing',
  'sentiment_analysis',
  'topic_modeling',
  'clustering',
  'remove_duplicates'
]);

/**
 * Step types the workflow builder offers that are filtered out of the script
 * (`dataset_input`/`dataset_output`) or fall through to the generic implementation.
 */
const GENERIC_STEP_TYPES: ReadonlySet<string> = new Set([
  'dataset_input',
  'dataset_output',
  'handle_missing',
  'filter_rows',
  'feature_extraction',
  'datetime_features'
]);

/** Only these step types may be published; anything else is rejected before code generation. */
export const ALLOWED_STEP_TYPES: ReadonlySet<string> = new Set([
  ...IMPLEMENTED_STEP_TYPES,
  ...GENERIC_STEP_TYPES
]);

/** Only these duplicate-keeping strategies may reach the generated dedupe step. */
export const ALLOWED_KEEP_STRATEGIES: ReadonlySet<string> = new Set(['first', 'last', 'none']);

/**
 * Renders a value as a Python double-quoted string literal. JSON string escaping is a subset of
 * Python's (quotes, backslashes and control characters are escaped, `\\uXXXX` is valid in both),
 * so `JSON.stringify` output is a valid single-line Python literal for any string.
 */
export function pythonStringLiteral(value: unknown): string {
  return JSON.stringify(value == null ? '' : String(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rejects a step whose fields would end up in generated Python outside a string literal:
 * `id` must be a safe identifier, `type` and `config.keep` must be allow-listed, and `name`,
 * `description` and `config.columns` must be strings/array-of-strings so they can only ever be
 * emitted as literals. Returns the step with those fields normalised.
 */
export function assertStepSafeForCodegen(step: unknown, index: number): WorkflowStep {
  const where = `steps[${index}]`;
  if (!isPlainObject(step)) {
    throw new Error(`Workflow ${where} must be an object`);
  }

  const id = assertSafeIdentifier(step.id, `${where} id`);

  if (typeof step.type !== 'string' || !ALLOWED_STEP_TYPES.has(step.type)) {
    throw new Error(`Workflow ${where} (${id}) has unsupported type: ${JSON.stringify(step.type)}`);
  }

  if (typeof step.name !== 'string') {
    throw new Error(`Workflow ${where} (${id}) name must be a string`);
  }
  if (typeof step.description !== 'string') {
    throw new Error(`Workflow ${where} (${id}) description must be a string`);
  }

  if (!isPlainObject(step.config)) {
    throw new Error(`Workflow ${where} (${id}) config must be an object`);
  }

  const keep = step.config.keep ?? 'first';
  if (typeof keep !== 'string' || !ALLOWED_KEEP_STRATEGIES.has(keep)) {
    throw new Error(
      `Workflow ${where} (${id}) config.keep must be one of first, last or none, got ${JSON.stringify(keep)}`
    );
  }

  const columns = step.config.columns ?? [];
  if (!Array.isArray(columns) || columns.some(c => typeof c !== 'string')) {
    throw new Error(`Workflow ${where} (${id}) config.columns must be a list of column names`);
  }

  return { ...(step as unknown as WorkflowStep), id, type: step.type, name: step.name, description: step.description, config: { ...step.config, keep, columns } };
}
