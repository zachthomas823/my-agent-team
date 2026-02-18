# Design Principles

## 1. Simplicity Over Cleverness
Choose the straightforward solution. Code should be readable by someone unfamiliar with the project. Avoid premature optimization and unnecessary abstraction.

## 2. Convention Over Configuration
Follow established patterns. Use standard project structures, naming conventions, and tooling defaults. Reduce decisions that don't matter.

## 3. Separation of Concerns
Each module, function, or component should have a single, clear responsibility. Avoid mixing data access, business logic, and presentation.

## 4. Fail Fast, Fail Loudly
Validate inputs early. Surface errors immediately rather than letting them propagate. Use typed errors and meaningful error messages.

## 5. Data as the Source of Truth
The filesystem and database are the authoritative sources. Derived state (caches, UI state) should be rebuildable from the source of truth.

## 6. Human-Readable Artifacts
All agent output should be readable by a human browsing the filesystem. Use Markdown for documents, JSON for structured data, and clear directory hierarchies.

## 7. Autonomous with Guardrails
Agents work independently and make decisions within their domain. They only escalate when genuinely blocked. The orchestrator coordinates, not micromanages.

## 8. Incremental Delivery
Build working software in small increments. Each phase should produce a testable, usable system. Avoid big-bang integration.
