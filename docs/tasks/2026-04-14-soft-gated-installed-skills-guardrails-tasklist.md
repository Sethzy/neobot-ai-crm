# Soft-Gated Installed Skills Guardrails

Goal: strengthen the current shipped Managed Agents skills model for production by making install state explicit in prompt + kickoff, without changing the underlying architecture or adding meaningful latency.

## Scope

- Keep the current shipped model:
  - all catalog skills remain attached to the Anthropic managed agent
  - per-client install state remains a soft gate, not hard enforcement
- Add stronger context engineering so the model is told, explicitly and repeatedly:
  - installed skills may be used
  - not-installed skills must not be used
  - install state overrides frontmatter trigger relevance
- Core document-processing skills (`docx`, `pdf`, `pptx`, `xlsx`) remain installed by default so every client has a base document toolchain active.

## Non-Goals

- Do not move to backend-enforced `load_skill()` gating
- Do not add user-editable skills or fork flows
- Do not add extra DB queries or storage reads on the hot path
- Do not change the `/skills` product model already shipped

## Implementation Tasks

- [x] Update the static managed-agent system prompt in `scripts/managed-agents/create-agent.ts`
  - Clarify that the listed skills are the global catalog
  - State that the kickoff message is the authority for install state
  - State that not-installed skills must not be used even if the request matches their description
  - State that install state overrides frontmatter trigger relevance
  - State that if no skills are installed, no skill may be used

- [x] Extend kickoff payload generation in `src/lib/managed-agents/session-kickoff.ts`
  - Always emit an installed-skills block
  - Always emit a not-installed-skills block

- [x] Expand the default installed set
  - Add `docx`, `pdf`, `pptx`, and `xlsx` to the default installed skill list
  - Preserve the assumption that every client starts with at least these four core skills active

- [x] Compute `notInstalledSkillSlugs`
  - Reuse the existing in-memory/global catalog source
  - Reuse the existing installed-skills query
  - Compute `notInstalled = catalog - installed` in-process
  - Avoid extra network round trips on the hot path

- [x] Wire the new not-installed set through the adapter
  - Pass installed + not-installed skill lists into kickoff builder
  - Keep existing latency characteristics intact

- [x] Tighten explicit slash-command behavior in prompt guidance
  - If the user invokes `/skill-name` for a not-installed skill, the agent should refuse and explain that the skill is not active for this client

- [x] Add tests
  - System prompt contains the new install-state override rules
  - Kickoff includes installed + not-installed lists
  - Adapter passes the computed sets into kickoff

- [ ] Manual QA
  - Installed skill request still triggers normally
  - Request matching an uninstalled skill is refused or handled without using that skill

- [x] Republish the managed agent
  - Run `create-agent.ts`
  - Bump pinned agent version
  - Update deployment envs to the new pinned version

## Acceptance Criteria

- The system prompt clearly states that install state overrides frontmatter matching
- Every new session kickoff contains explicit installed and not-installed skill state
- Zero-installed clients receive a direct “do not use any skill” instruction
- No additional DB or storage round trips are added to chat startup
- Targeted tests pass

## Notes

- This is a production guardrail improvement, not true enforcement.
- True enforcement remains future work in `docs/tasks/2026-04-14-enforced-skill-bundles-and-editable-skills-tasklist.md`.
