# IBC Rules

This folder contains soft-warning constraints inspired by the International Building Code (IBC)
and related accessibility/egress standards. These are **advisory** — they do not block generation
or override the hard geometry checks in the validator. They surface as `info` or `warning`
violations in the `ValidationResult.violations` array.

## Schema

Each rule in `ibc-v0.json` has the following shape:

```jsonc
{
  "id": "ibc-XXX",           // Unique rule identifier
  "description": "...",      // Human-readable description
  "severity": "info|warn",   // How serious a violation is
  "appliesTo": ["roomType"], // Room types this rule targets (empty = all)
  "params": { ... },         // Rule-specific numeric thresholds
  "source": "IBC §XXXX"      // Citation / placeholder
}
```

## Adding a rule

1. Add an entry to `ibc-v0.json`.
2. Implement the check in `packages/core/src/rules.ts` using the `applyIbcRules` function.
3. Add a unit test in `packages/core/src/validator.test.ts`.

## Sources

Rules are currently placeholders referencing IBC 2021 section numbers.
Always verify the exact threshold against the adopted local code version before enforcement.
