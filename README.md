# EKT.kz AI Catalog Assistant

A hackathon prototype for grounded product consultation, explainable alternatives, and confirmation-safe cart updates.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful demo prompts:

- `Show EKT-CB-16A`
- `Is EKT-CB-20A available?`
- `What are the delivery terms?`
- `Add 2 EKT-CB-16A`, followed by `yes, add it`

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Architecture

- Next.js App Router and TypeScript frontend
- Server-side chat and cart API routes
- Deterministic catalog, alternative ranking, and cart confirmation services
- Synthetic in-repository product and purchasing-policy data
- In-memory session store for the prototype

The language layer never owns cart safety. A cart change is prepared first, requires an explicit confirmation, then re-checks stock before applying once. Replace the in-memory session store with Redis or a database before production use.

## Data and limitations

All products, stock counts, prices, policies, and certificate URLs are synthetic demonstration data. The current skeleton supports text input. Document/image extraction, live EKT.kz integration, authentication, persistent sessions, and an LLM language layer remain future work.
