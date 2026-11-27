// Name helpers for generated workflows and activities

import type { WorkflowDefinition } from './pythonDaprWorkflowTypes';

export function generateWorkflowName(workflow: WorkflowDefinition): string {
  const baseName = workflow.name || 'UntitledWorkflow';
  const name = baseName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('') || 'defaultWorkflow';
  // The name becomes a Python function identifier in the generated script, so it must not start
  // with a digit (a workflow called "123 demo" would otherwise render the invalid name "123demo").
  return /^[A-Za-z_]/.test(name) ? name : `wf_${name}`;
}

export function toPythonMethodName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
  // A leading digit would make the generated def invalid Python ("2nd Sentiment" became
  // "2nd_sentiment"); keep the underscore guard that the cleanup above would otherwise strip.
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}
