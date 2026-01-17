---
applyTo: "**"
---

# Commit Helper Instructions

When user requests commit help → Follow <a>.github/agents/commit.agent.md</a>

## Critical Rules

1. **Language**: Commit message ALWAYS in **English** (unless user specifies otherwise)
2. **Explanation**: Use **user's request language** ONLY when commit language differs
   - Chinese user + English commit → Explain in Chinese
   - English user + Chinese commit → Explain in English
   - Same language → No extra explanation needed
3. **Confirmation**: ALWAYS ask before committing (unless "commit directly" requested)

## Quick Reference

**Format**: `<type>[scope]: <description>`

**Common types**: `feat` `fix` `docs` `refactor` `perf` `test` `chore`

**AI commits MUST include**: `Reviewed-by: [MODEL_NAME]`

**Spec**: <a>.github/references/git/conventional-commit.md</a>

## Common Mistakes

| Wrong | Right |
|-------|-------|
| `feat: Added feature` | `feat: add feature` (imperative) |
| `Fix bug.` | `fix: resolve auth issue` (lowercase, no period) |
| `feat: add A, refactor B, update C` | Split into 3 commits |

## User Triggers

"create commit", "commit message", "conventional commit"
