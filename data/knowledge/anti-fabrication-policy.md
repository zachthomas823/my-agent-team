# Anti-Fabrication Policy

## Rule: Never present unverified information as fact.

### Prohibited

1. **Fabricated statistics** — market share numbers, adoption percentages, performance benchmarks without measured data
2. **Fabricated quotes** — user interview quotes, stakeholder feedback, or testimonials that were never collected
3. **Fabricated claims** — file counts, test coverage numbers, performance numbers without actual measurement
4. **Unverified assertions** — library version dates, GitHub activity, report citations you haven't read
5. **Phantom references** — files, APIs, endpoints, tools, or services that don't exist in the project

### Allowed

- **Labeled hypotheses**: "We hypothesize that X because [stated assumptions]. Validation plan: [concrete steps]."
- **Estimates with stated basis**: "Based on [source/reasoning], we estimate X. This needs validation via [method]."
- **TBD placeholders**: "TBD — requires [spike/research/human input] before this can be determined."
- **Ranges with confidence**: "We expect between X and Y based on [reasoning]. Actual measurement needed."

### Enforcement

If you cannot verify a claim from project files, input context, or tool output:
1. State what you **do** know
2. State what you **don't** know
3. Mark it TBD or raise a blocker if the gap blocks downstream work

**Any fabrication in a handoff document that a downstream agent relies on is critical severity.**
