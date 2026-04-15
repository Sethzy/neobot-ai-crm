# Enforced Skill Bundles + Editable Skills

Goal: move from soft-gated Managed Agents skills to Sunder-owned enforced skill loading, while preserving the skill-as-folder model and opening a clean path to forks and user-created skills.

## Product Position

- Short term production path remains the shipped soft-gated model:
  - all catalog skills are attached to the Anthropic managed agent
  - install state is communicated via context engineering
  - system prompt says installed skills are active and non-installed skills must not be used
  - skill frontmatter descriptions remain the second soft gate for triggering behavior
- This tasklist is the clean follow-on for hard enforcement and editable skills.

## Target Architecture

- Skills remain folders:
  - `SKILL.md`
  - optional `scripts/`
  - optional `references/`
  - optional `assets/`
- Source layers:
  - platform defaults: public catalog bundles authored by Sunder
  - shared/org bundles: optional later
  - private/client bundles: forks and custom skills
- Runtime discovers skills via SQL metadata, not by mounting every skill folder into the sandbox.
- Runtime lazily hydrates only the selected bundle into the session filesystem.
- Enforcement boundary moves to Sunder:
  - the backend resolves whether a skill is installed and accessible
  - the agent cannot load a non-installed skill bundle

## Task Breakdown

- [ ] Define canonical bundle resolution model:
  - public > shared > private visibility set
  - shadowing priority: private wins over shared, shared wins over public
  - slug, version, and lineage rules for catalog, fork, and custom bundles

- [ ] Create bundle metadata/index layer in Postgres:
  - catalog rows for public bundles
  - client-installed rows
  - client-owned bundle rows for forks/custom skills
  - parsed frontmatter metadata for discovery and filtering

- [ ] Add bundle sync/index pipeline:
  - repo-authored public skills sync into metadata
  - client bundle writes update metadata
  - drift detection between repo bundles, Anthropic registry, and DB index

- [ ] Add enforced skill-loading tool boundary:
  - `list_active_skills`
  - `load_skill(slug)` or equivalent
  - tool checks install state and resolves winning bundle before returning content
  - non-installed skills are rejected at the backend

- [ ] Hydrate selected skill bundle into the session filesystem:
  - mount or copy one bundle at a time into `/mnt/session/skills/<slug>/...`
  - keep progressive disclosure:
    - frontmatter metadata for discovery
    - `SKILL.md` for primary instructions
    - references/scripts/assets loaded only as needed

- [ ] Route explicit slash invocation through enforced loading first:
  - `/skill-name` resolves only against installed skills
  - no fallback to non-installed catalog skills

- [ ] Add bundle-native fork flow:
  - duplicate catalog skill into private/client storage as a full folder bundle
  - preserve lineage to source catalog bundle + source version
  - keep install state separate from ownership/edit state

- [ ] Add user-created skill flow powered by `skill-creator`:
  - guided authoring instead of raw textarea editing
  - output is a valid folder bundle, not just markdown text
  - validate frontmatter, folder structure, and optional resources before install

- [ ] Update skills UI for future v2 model:
  - catalog view
  - installed view
  - forks/custom skills view
  - clear distinction between “installed”, “forked”, and “created by you”

- [ ] Add evals and QA for the hard gate:
  - non-installed skills cannot be loaded
  - private/shared/public shadowing resolves correctly
  - slash invocation respects install state
  - forks override catalog bundles

## Non-Goals

- Do not replace the current shipped soft-gated production behavior in this tasklist.
- Do not require combinatorial managed-agent variants per install set.
- Do not mount the entire skill library into every sandbox/session.

## Notes

- Fintool pattern to follow: SQL discovery + lazy bundle loading, not “mount all skills”.
- Claude skills guidance to preserve: skills are portable folder bundles with progressive disclosure.
- `skill-creator` should be the preferred workflow for future client-authored skills.
