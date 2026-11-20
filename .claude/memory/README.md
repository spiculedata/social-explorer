# Correction capture

An append-only record of corrections: things a human, CI or a failure told an agent that
turned out to matter, so the next session does not have to be told again.

`corrections.jsonl` at the repo root is the log. One JSON object per line; never edited,
reordered or deleted. A correction that stopped being true gets a new entry that supersedes
it.

```json
{"id":"corr-0001","date":"2026-11-20","scope":"repo","signal":"human","area":"secrets","correction":"What was wrong, stated plainly.","rule":"The durable instruction.","evidence":"PR, file:line or command","supersedes":null,"status":"active"}
```

- `signal`: `human`, `ci`, `review` or `incident`.
- A promoted entry has `"status":"promoted"`, `"supersedes"` naming the old id and `"promoted_to"` (`AGENTS.md#section` or a skill path). See "Docs are the model" in `AGENTS.md`.
- `rule` is the instruction, not the story. The story belongs in a short note under `docs/reflections/` if it
  is worth keeping.
- Keep it small. A log nobody reads looks like coverage and is worse than none.

Related: `.claude/memory/decisions.md` (why the code is shaped this way),
`.claude/session-summary.md` (where the work stands).
