# Paint-by-Numbers Production — Agent Instructions

This repository and PR #1 are the persistent source of truth. Do **not** reconstruct the project from old chat history and do not restart a full audit on every session.

## Task authority
For the current session use, in order:
1. this `AGENTS.md`;
2. the **latest top-level PR #1 task comment** and its TRUSTED STATE;
3. only the specific code/docs/artifacts referenced by that task.

`docs/CURRENT_TASK.md`, `docs/GOLDEN_SPEC.md`, and `docs/DECISIONS.md` are background/history. **Do not read them automatically.** Read them only when the latest task explicitly requires them or when a changed dependency makes that section necessary.

## FAST START — default workflow
1. Read this file and the latest PR #1 task comment.
2. If the task is `DELTA-ONLY`, accept its trusted SHA/checkpoints/facts as already verified.
3. Inspect only the diff from the trusted SHA plus files directly touched/referenced by the task.
4. Start the requested work immediately; do not inventory the whole repository first.
5. Run only targeted tests first. Expand regression scope only when the delta can affect it or the task explicitly asks.

## NO RE-AUDIT rule
Do **not** repeat checks for site availability, production version, assets, secrets, D1, users/memberships, auth, deployment history, old fixtures, old hashes, or historical files when the latest task marks them trusted and nothing since that checkpoint could have changed them.

Re-check a trusted fact only when an explicit invalidator exists, for example:
- the relevant auth/deploy/DB/secret/asset code changed;
- branch/head/base is not the trusted SHA/tree;
- a required artifact is missing or has a mismatched hash;
- a runtime result directly contradicts the trusted fact;
- the task explicitly requests a fresh check.

Network/browser/session capability may be runtime-specific. Check it only when the task actually needs it, using the cheapest harmless preflight **before** deploy/AI/long work.

## Consequential-action capability gate
Before deploy, paid AI/API, D1 write, secret change, or other consequential action, verify only the capabilities required for that action. Do not turn the capability gate into a general environment audit. If the task already grants a safe fallback, use it in the same run instead of stopping for another instruction.

When a task explicitly grants commit/push/deploy/live permissions and defines hard-stop conditions, proceed through the complete task without requesting intermediate approval. Stop only on a stated hard-stop, an unexpected destructive action, or a capability that cannot be satisfied by an authorized fallback.

## Current architecture / invariants
- Approved preview quality is accepted; do not redesign the preview algorithm unless explicitly tasked.
- NEW174 is the frozen Golden regression reference.
- Production geometry remains deterministic; semantic AI is guidance/protection, not permission for arbitrary redraw.
- A final visible 4-connected production region must have exactly one internal readable number at >=5 pt; unlabeled regions are not accepted.
- Preserve identity-critical details such as eyes, facial features, text/logos, fingers/paws and key object details.
- Use one canonical Final Region Map for contours/numbering/vector export; do not independently re-segment outputs.
- Do not merge PR #1 into `main` without explicit user authorization.

## Efficiency
Prefer one complete experiment that compares all reasonable bounded variants over a chain of one-hypothesis microtasks. Save diagnostic outputs/checkpoints so later tasks can reuse them. Do not ask the user to re-explain information already recorded in the latest PR task or repository.
