import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  const writeFile = vi.fn();
  const mkdir = vi.fn();
  return { ...actual, default: { ...actual, writeFile, mkdir }, writeFile, mkdir };
});

import { writeFile, mkdir } from 'fs/promises';
import { pythonDaprWorkflowGenerator } from './pythonDaprWorkflowGenerator';
import type { PythonDaprWorkflow } from './pythonDaprWorkflowGenerator';

const workflow = {
  pythonScript: 'print(1)',
  requirements: '',
  virtualEnvPath: '/tmp/venv'
} as unknown as PythonDaprWorkflow;

describe('pythonDaprWorkflowGenerator.deployPythonDaprWorkflow', () => {
  it.each(['../../etc', 'a/b', 'x;id', '$(whoami)', ''])(
    'rejects unsafe workflowId %j before touching the filesystem',
    async (workflowId) => {
      await expect(
        pythonDaprWorkflowGenerator.deployPythonDaprWorkflow(workflowId, workflow)
      ).rejects.toThrow(/Invalid workflowId/);

      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    }
  );
});

type Step = { id: string; type: string; name: string; description: string; config: Record<string, unknown>; position: { x: number; y: number } };

const makeStep = (id: string, type: string, name: string, config: Record<string, unknown> = {}, description = ''): Step => ({
  id,
  type,
  name,
  description,
  config,
  position: { x: 0, y: 0 }
});

const ALL_STEP_TYPES = [
  'text_preprocessing',
  'sentiment_analysis',
  'topic_modeling',
  'clustering',
  'remove_duplicates',
  'handle_missing'
];

const makeWorkflow = (name: string, steps: Step[]) => ({
  name,
  description: 'A test workflow',
  steps,
  connections: []
});

describe('pythonDaprWorkflowGenerator.generatePythonDaprWorkflow (generated output)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(ALL_STEP_TYPES)('pins the generated script for a single %s step', async (type) => {
    const wf = makeWorkflow('Step Under Test', [
      makeStep('s1', type, 'My Step 1', { columns: ['a', 'b'], keep: 'last' }, 'does a thing')
    ]);

    const result = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(wf);

    expect(result.pythonScript).toMatchSnapshot();
  });

  it('pins the full script, requirements and metadata for a mixed workflow', async () => {
    const wf = makeWorkflow('Full Pipeline!', [
      makeStep('in', 'dataset_input', 'Input'),
      makeStep('a', 'text_preprocessing', 'Clean Text'),
      makeStep('b', 'sentiment_analysis', '2nd Sentiment'),
      makeStep('c', 'topic_modeling', 'Topics'),
      makeStep('d', 'clustering', 'Cluster'),
      makeStep('e', 'remove_duplicates', 'Dedupe', { columns: ['text'], keep: 'first' }),
      makeStep('f', 'filter_rows', 'Weird step'),
      makeStep('out', 'dataset_output', 'Output')
    ]);

    const result = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(wf);

    expect(result.pythonScript).toMatchSnapshot();
    expect(result.requirements).toBe(
      [
        'dapr>=1.15.0',
        'dapr-ext-workflow>=1.15.0',
        'pandas>=2.0.0',
        'numpy>=1.24.0',
        'polars>=0.20.0',
        'scikit-learn>=1.3.0',
        'textblob>=0.17.1',
        'nltk>=3.8.1',
        'vaderSentiment>=3.3.2',
        'gensim>=4.3.0'
      ].join('\n')
    );
    expect(result.workflowName).toBe('fullPipeline');
    expect(result.workflowPattern).toBe('pure-python-dapr-sdk');
    expect(result.executionOrder).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(result.workflowCode).toBe('');
    expect(result.activityCode).toBe('');
    expect(result.appCode).toBe('');
    expect(result.virtualEnvPath).toMatch(/workflow-venvs\/fullPipeline_\d+$/);
    expect(result.activationScript).toBe(
      `#!/bin/bash\n# Virtual environment activation script\nsource "${result.virtualEnvPath}/bin/activate"\necho "Virtual environment activated: ${result.virtualEnvPath}"\n`
    );
  });

  it('emits step calls and decorated activities named from the step name', async () => {
    const wf = makeWorkflow('Names', [makeStep('x1', 'clustering', '9 weird-name!!', {}, 'desc')]);

    const { pythonScript } = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(wf);

    expect(pythonScript).toContain('@wfr.activity(name="_9_weird_name_activity")');
    expect(pythonScript).toContain('yield ctx.call_activity("_9_weird_name_activity", input=input_data)');
    expect(pythonScript).toContain('results["x1"] = step_result');
    // The activity docstring is static; the step's own name and description reach the script only
    // as escaped string literals.
    expect(pythonScript).toContain('"""Activity for one workflow step."""');
    expect(pythonScript).toContain('logger.info("Executing activity: %s", "9 weird-name!!")');
    expect(pythonScript).toContain("'step_name': \"9 weird-name!!\"");
  });

  it('falls back to defaultWorkflow and UntitledWorkflow naming', async () => {
    const empty = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(makeWorkflow('!!!', []));
    expect(empty.workflowName).toBe('defaultWorkflow');
    const blank = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(makeWorkflow('', []));
    expect(blank.workflowName).toBe('untitledworkflow');
  });

  it('omits optional requirements when those step types are absent', async () => {
    const result = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(
      makeWorkflow('Plain', [makeStep('c', 'clustering', 'C')])
    );
    expect(result.requirements).not.toContain('vaderSentiment');
    expect(result.requirements).not.toContain('gensim');
  });
});

describe('pythonDaprWorkflowGenerator workflow-field injection hardening', () => {
  // Payloads that try to close the module docstring / a quoted string and run Python code.
  const injectionPayloads = [
    'Triple quote """\nimport os; os.system("id")',
    'Quote and newline "\nraise RuntimeError(1)',
    'Backslash \\\\ and \' quote\' and \\n escape'
  ];

  it.each(injectionPayloads)('escapes a hostile workflow name/description as string literals: %j', async payload => {
    const wf = makeWorkflow(`Proof ${payload}`, [
      makeStep('a1', 'clustering', `Step ${payload}`, {}, `Description: ${payload}`)
    ]);
    wf.description = `Description: ${payload}`;

    const { pythonScript } = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(wf);

    // The raw payload never appears in the script; it only appears JSON-escaped, which is a valid
    // single-line Python string literal.
    expect(pythonScript).not.toContain(payload);
    expect(pythonScript).toContain(`WORKFLOW_NAME = ${JSON.stringify(`Proof ${payload}`)}`);
    expect(pythonScript).toContain(`WORKFLOW_DESCRIPTION = ${JSON.stringify(wf.description)}`);
    expect(pythonScript).toContain(`logger.info("Executing step: %s", ${JSON.stringify(`Step ${payload}`)})`);

    // The module docstring is static and exactly one line, so a payload cannot close it and inject code.
    const docOpen = pythonScript.indexOf('"""');
    const docClose = pythonScript.indexOf('"""', docOpen + 3);
    expect(pythonScript.slice(docOpen, docClose + 3)).toBe(
      '"""Generated Python Dapr workflow script (pure Dapr Python SDK)."""'
    );
  });

  it('escapes hostile keep strategies and columns inside the dedupe step', async () => {
    const wf = makeWorkflow('Dedupe', [
      makeStep('d1', 'remove_duplicates', 'Dedupe', { keep: 'last', columns: ['a"b', "c'd", 'd"""e'] })
    ]);

    const { pythonScript } = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(wf);

    expect(pythonScript).toContain('keep_strategy = "last"');
    expect(pythonScript).toContain(`columns_config = ${JSON.stringify(JSON.stringify(['a"b', "c'd", 'd"""e']))}`);
    // No single-quoted raw column literal survives (the old template emitted one).
    expect(pythonScript).not.toMatch(/columns_config = '[^']*'/);
  });

  it('rejects unsafe step ids, unsupported step types and keep strategies before generating code', async () => {
    const badIds = [
      makeStep('id;import os', 'clustering', 'x'),
      makeStep('id\"""\nimport os', 'clustering', 'x'),
      makeStep('', 'clustering', 'x'),
      makeStep('../escape', 'clustering', 'x')
    ];
    for (const wf of badIds) {
      await expect(pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(makeWorkflow('W', [wf]))).rejects.toThrow(
        /Invalid steps\[0\] id/
      );
    }

    const badTypes = [
      makeStep('a', 'clustering\"""\nimport os', 'x'),
      makeStep('a', 'not_a_real_type', 'x'),
      makeStep('a', 'custom_unknown', 'x')
    ];
    for (const wf of badTypes) {
      await expect(pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(makeWorkflow('W', [wf]))).rejects.toThrow(
        /unsupported type/
      );
    }

    const badKeeps = [makeStep('a', 'remove_duplicates', 'x', { keep: 'first\"""\nimport os' }), makeStep('a', 'remove_duplicates', 'x', { keep: 'FIRST' })];
    for (const wf of badKeeps) {
      await expect(pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(makeWorkflow('W', [wf]))).rejects.toThrow(
        /config\.keep/
      );
    }
  });

  it('rejects steps whose name, description or columns are not strings/string lists', async () => {
    const junk = makeWorkflow('W', [makeStep('a', 'clustering', 'x')]);
    (junk.steps[0] as unknown as Record<string, unknown>).name = 42;
    await expect(pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(junk)).rejects.toThrow(/name must be a string/);

    const junk2 = makeWorkflow('W', [makeStep('a', 'clustering', 'x')]);
    (junk2.steps[0] as unknown as Record<string, unknown>).description = { a: 1 };
    await expect(pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(junk2)).rejects.toThrow(/description must be a string/);

    const junk3 = makeWorkflow('W', [makeStep('a', 'remove_duplicates', 'x')]);
    (junk3.steps[0].config as Record<string, unknown>).columns = 'text';
    await expect(pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(junk3)).rejects.toThrow(/config\.columns/);
  });

  it('escapes a hostile workflow name in the generated identifier and metadata', async () => {
    // "123 demo" previously produced the invalid Python identifier "123demo".
    const digit = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(makeWorkflow('123 demo', []));
    expect(digit.workflowName).toBe('wf_123Demo');
    expect(digit.pythonScript).toContain('def wf_123Demo(ctx: DaprWorkflowContext, input_data: dict):');

    const hostile = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(
      makeWorkflow('Quote\" and \""" triple', [])
    );
    // The identifier is sanitised; the raw name only appears escaped in WORKFLOW_NAME.
    expect(hostile.workflowName).toBe('quoteAndTriple');
    expect(hostile.pythonScript).toContain(`WORKFLOW_NAME = ${JSON.stringify('Quote" and """ triple')}`);
    expect(hostile.pythonScript).toContain("@wfr.workflow(name='quoteAndTriple')");
  });

  // A hostile workflow must produce Python that actually parses: verify with CPython's ast when a
  // python3 interpreter is available (it is on the CI runner; skipped where it is not).
  const python3Available = (() => {
    try {
      execFileSync('python3', ['-c', 'import ast'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!python3Available)('generated script for hostile fields parses as Python (ast.parse)', async () => {
    const payload = 'name\"\"\"\nimport os\nos.system(\"id\")\n# ';
    const wf = makeWorkflow(payload, [
      makeStep('s1', 'remove_duplicates', `Step ${payload}`, { keep: 'none', columns: ['a\'b', 'c"d'] }, `Desc ${payload}`),
      makeStep('s2', 'sentiment_analysis', '2nd Sentiment', {}, 'Second pass')
    ]);
    wf.description = `Description with \"\"\" and ' quotes\nand newlines`;

    const { pythonScript } = await pythonDaprWorkflowGenerator.generatePythonDaprWorkflow(wf);

    const scriptPath = join(tmpdir(), `se-workflow-ast-${process.pid}-${Date.now()}.py`);
    try {
      writeFileSync(scriptPath, pythonScript, 'utf8');
      const stdout = execFileSync('python3', ['-c', 'import ast, sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())', scriptPath], {
        encoding: 'utf8'
      });
      expect(stdout).toBe('');
    } finally {
      rmSync(scriptPath, { force: true });
    }
  });
});
