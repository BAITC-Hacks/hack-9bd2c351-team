# EKT.kz AI Catalog Assistant

A hackathon prototype for grounded product consultation, explainable alternatives, and confirmation-safe cart updates.

## Run locally

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your EKT partner API credentials.
npm run dev
```

The server-side catalog adapter uses `EKT_API_BASE_URL` (default
`https://ekt.kz/api`) with `EKT_API_USERNAME` and `EKT_API_PASSWORD` for HTTP
Basic Authentication. The credentials are only read by server code and are
never logged or sent to the browser. Keep real values in `.env.local`; `.env*`
files are ignored by git. Never use `NEXT_PUBLIC_*` for credentials or commit
them.

Open [http://localhost:3000](http://localhost:3000).

Useful demo prompts:

- `Show 200300285_`
- `Is 200300285_ available?`
- `What are the delivery terms?`
- `Add 1 200300285_`, followed by `yes, add it`

When the live API is unavailable, try the synthetic fallback SKU `EKT-CB-16A`.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Architecture

- Next.js App Router and TypeScript frontend
- Server-side chat and cart API routes
- Server-side EKT.kz product list/detail adapter with runtime validation and pagination
- Synthetic in-repository product data as a clearly labeled fallback when the API is unavailable
- Deterministic catalog matching, alternative ranking, and cart confirmation services
- In-memory session store for the prototype

The language layer never owns cart safety. A cart change is prepared first, requires an explicit confirmation, then re-checks price and stock before applying once. Live stock is requested from product detail data; fallback stock is always labeled as demo data and is never represented as live availability. Replace the in-memory session store with Redis or a database before production use.

## Data and limitations

EKT product list responses contain `page`, `per_page`, `count`, and `items`; the observed page size is 20, and `count` is the current page's item count rather than a total. The API provides no total-page field. The adapter stops when a page repeats, is empty/partial, the lookup budget expires, or its safety page limit is reached. A product detail response provides fields such as `article`, `name`, `description`, `price`, `quantity`, `stores`, and `properties`. Category and certificate data are mapped when present; if absent, the assistant treats them as unavailable rather than inventing values.

When live lookup fails, matching local sample products can still be used for demos. Their displayed stock is explicitly labeled as demo stock, and users are told that live availability could not be verified. Policies remain synthetic demonstration data. The current skeleton supports text input; document/image extraction, persistent sessions, and an LLM language layer remain future work.
