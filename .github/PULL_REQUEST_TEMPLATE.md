## Summary
<!-- What changed and why? Link the issue: Refs #123. Never paste real posts, handles, transcripts,
     user data, secrets or tokens into this description. -->

## Risk
<!-- Does it touch authentication or the access guard, SQL or migrations, data sharing (IPFS),
     deployment, workflows, secrets or agent settings? Does it add an outbound destination or an AI
     feature? Say "no" explicitly if not. -->

## Test plan
- [ ] `npm run lint`
- [ ] `npm run test:unit` (or `npm run test:unit:coverage`; the coverage floor only goes up)
- [ ] `npm run build`
- [ ] Added or updated tests for the change
- [ ] Manually verified (describe below)

## Checklist
- [ ] The `ci` check is green
- [ ] No secrets, tokens or personal data in the diff, tests or fixtures
- [ ] User input is validated; SQL is parameterised; no shell built from user input
- [ ] Docs updated if behaviour or configuration changed
