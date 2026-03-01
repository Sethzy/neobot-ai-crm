# Observed Artifact Issues

This file records obvious corruption/truncation artifacts in the pasted source so future cleanup can distinguish source errors from interpretation errors.

## Building Preview Apps Skill

Examples observed in source capture:
- `index.h` appears instead of `index.html` in one rule line.
- `cdnjsloudflare.com` appears instead of `cdnjs.cloudflare.com` in one script URL.
- Snippet fragment `awERT INTO todos...` appears malformed.
- Fragment `returnsync function sqlExec(query)` appears malformed.
- Fragment `runhe full prefixed name` appears truncated.
- Final React line appears malformed: `ReactDOM.createRoot(document.getElementById('root'.render(<App />);`

## Interpretation Policy Used

- `00-source-skills-verbatim.md` preserves pasted text as provided.
- Normalized docs translate intent without silently fixing source artifacts.

## Follow-Up

If you want, I can create a "clean-room corrected" version of the same skill docs in a separate file set for implementation use.

