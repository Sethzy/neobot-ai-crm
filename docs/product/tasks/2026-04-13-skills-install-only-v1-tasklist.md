# Skills Install-Only V1 Tasklist

Objective: reduce the unified skill infrastructure to the launch-ready version where Sunder authors all skills and users only install or uninstall them.

- [x] Remove user-edit customization affordances from `/skills`
- [x] Convert `/skills/[slug]` into a read-only predefined skill detail page
- [x] Remove runtime customization guidance from managed-agent prompt and kickoff
- [x] Keep per-client install state only for active-skill selection and slash autocomplete
- [x] Make first-use default skill bootstrap idempotent under concurrent requests
- [x] Refresh installed-skill client state after install/uninstall
- [x] Update targeted tests for the install-only model
