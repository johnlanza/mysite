<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Zette Working Mode

- Treat Zette like Poolarama for deployment flow: after scoped verification, commit and push changes to `johnlanza/mysite` `main` for the live site instead of stopping at local-server review.
- Use `npm run sync:questions` from `/Users/johnlanza/Dev/mySite` when publishing Zette content. Despite the legacy name, it rebuilds quotes, book notes, questions, embeddings, and the site before committing and pushing.
- Echoes depend on `src/data/embeddings.json`; refresh embeddings whenever source datasets change.
