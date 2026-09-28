---
description: 'Comment and documentation standards for TypeScript and Astro'
applyTo: '**/*.{ts,astro}'
---

# Comment and Documentation Standards

## Comment Philosophy

- Explain **why** code exists or why a non-obvious decision was made; do not restate **what** the code already expresses.
- Add comments only when names, types, and structure are not enough to make the intent clear.
- Keep comments accurate as code changes. Update or remove a comment in the same change if its reasoning or behavior is no longer current.
- Prefer API documentation (TSDoc/JSDoc) for exported contracts over inline comments that narrate implementation steps.

## Documentation by File Type

- For exported functions in `db/` and `src/lib/`, follow the documentation requirements in [`drizzle.instructions.md`](drizzle.instructions.md).
- For Astro component `Props` interfaces, follow the component contract requirements in [`astro.instructions.md`](astro.instructions.md).
- Use inline comments sparingly for non-obvious implementation details; explain the constraint or decision rather than paraphrasing the next statement.
