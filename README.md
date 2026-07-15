# Olio Mail Assignment

Small email marketing app built as a monorepo with:

- `apps/web`: Next.js frontend
- `apps/api`: Express API
- `apps/worker`: BullMQ worker for queued and scheduled sends
- `packages/db`: Sequelize models, schema sync, and seed data
- `packages/shared`: shared validation and helpers

## What is implemented

- Cookie-based auth with server-side workspace isolation
- Contact CRUD with duplicate checks on email and phone
- CSV contact import with user-facing added/skipped counts
- Flexible custom fields stored as JSON
- Saved audiences built from filter rules
- Campaign creation with audience, tag, or manual-recipient targeting
- Manual recipient lookup against saved contacts
- BullMQ-backed immediate and scheduled campaign sends
- Provider abstraction with `console` mode and Brevo webhook support
- Live campaign analytics polling from the frontend
- Campaign duplication endpoint

## Local run

1. Copy `.env.example` to `.env`.
2. Start infrastructure:

```bash
docker compose up -d
```

3. Install dependencies:

```bash
npm install
```

4. Sync the schema and seed demo data:

```bash
npm run db:push
npm run db:seed
```

5. Start the services in separate terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

Frontend: `http://localhost:3000`
API: `http://localhost:4000`

Demo login after seeding:

- `demo@olio.app`
- `password123`

## Environment variables

- `DATABASE_URL`: Postgres connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: session signing secret
- `APP_URL`: frontend origin for CORS
- `API_URL`: API base URL
- `NEXT_PUBLIC_API_URL`: frontend-visible API URL
- `EMAIL_PROVIDER`: `console` or `brevo`
- `EMAIL_FROM`: sender string, for example `Demo Sender <demo@example.com>`
- `BREVO_API_KEY`: required when using Brevo
- `BREVO_WEBHOOK_SECRET`: optional shared secret for webhook validation

## Notes and tradeoffs

- The default `console` provider makes the app runnable without external email credentials; switching to Brevo enables real sends and open/delivery webhook events.
- Audience filters currently support a compact rule model rather than a full visual builder.
- The frontend, API, PostgreSQL, and Redis can be deployed independently. The BullMQ worker is designed to run as a separate background service. Due to free-tier hosting limitations for background workers, the worker should be run locally (`npm run dev:worker`) or deployed to a platform that supports long-running background processes. Without the worker, campaign jobs will remain queued and email delivery processing will not occur.
