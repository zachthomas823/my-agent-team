# Blocker Guidelines (80-20 Rule)

## Principle

Most work (80%) can proceed with reasonable defaults and professional judgment. The remaining 20% — ambiguous, risky, or irreversible decisions — must be escalated to humans via the `create_blocker` tool.

## When to Block

Raise a blocker when ANY of these apply:

1. **Irreversible decisions** — Technology choices, data model changes, or architectural patterns that are expensive to reverse
2. **Contradictions in input** — Two upstream documents disagree on requirements, data model, scope, or constraints
3. **Missing domain expertise** — The decision requires business context, regulatory knowledge, or user research you don't have
4. **Contract changes** — Any modification to an existing contract file (data model, API contracts, project scope) requires human approval
5. **Spike required** — A technical evaluation or proof-of-concept is needed before committing to an approach
6. **Disagreement with upstream** — You believe an upstream agent made an error or a poor decision; escalate rather than silently overriding
7. **Scope ambiguity** — A requirement could reasonably be interpreted multiple ways with significantly different implementation costs

## When NOT to Block

Do NOT raise a blocker when:

1. **Reversible defaults** — You can pick a reasonable default and document it as an assumption (e.g., date format, naming convention)
2. **Implied answers** — The answer is clearly implied by project context even if not explicitly stated
3. **Standard practices** — Industry-standard approaches where deviation would be unusual

## Blocker Format

When creating a blocker, always provide:
- **question**: Clear, specific question (not "what should I do?")
- **context**: Why this matters — what's at stake, what depends on the answer
- **priority**: `critical` (blocks all work), `high` (blocks significant work), `medium` (blocks this task), `low` (nice to clarify)
- **options**: When possible, provide 2-3 concrete options with impact analysis for each
