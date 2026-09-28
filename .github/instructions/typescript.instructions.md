---
description: 'TypeScript formatting conventions and ESLint enforcement'
applyTo: '**/*.ts'
---

# TypeScript Formatting

Use the formatting conventions established in the TypeScript source:

- Indent application, data-layer, and unit-test TypeScript with four spaces; E2E specs and `playwright.config.ts` use two spaces, matching the existing project style.
- Use single quotes for strings unless escaping would be needed.
- End statements with semicolons.
- Include trailing commas in multiline lists and object literals; E2E specs and `playwright.config.ts` allow either style.
- Keep one statement per line and use blank lines to separate logical sections.

ESLint enforces single quotes, semicolons, and multiline trailing commas through `@stylistic` rules. Indentation follows the conventions above; Astro template indentation follows [`astro.instructions.md`](astro.instructions.md). Run `npm run lint` to check TypeScript and Astro files.
