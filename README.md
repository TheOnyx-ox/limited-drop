# Limited Drop

A small shop for a limited product drop. There are only a few units of each item, and lots of people may try to grab the same one at the same moment. The one thing this project has to get right is the stock: it must never go negative, and a unit must never be sold twice.

- Live demo: [limited-drop-six.vercel.app](https://limited-drop-six.vercel.app) > _The backend runs on a free tier that sleeps after inactivity, so the first load can take up to a minute. Refresh once if the products don't appear straight away._
- Video walkthrough (5 min): _add link_

## What it does

You can browse the products and see how many units are left. When you reserve one, it's held for you for a short time. If you check out in that window, you get an order. If you don't, the hold expires and the unit goes back on sale. You can also release a hold yourself.

It's built with NestJS and TypeScript on the backend, PostgreSQL for the data, and React with TypeScript on the frontend.

## Running it locally

You'll need Node.js 20 or newer, and either Docker or a local PostgreSQL 13+.

### 1. The database

The easiest way is Docker:

```bash
docker compose up -d db
```

That starts Postgres 16 on `localhost:5433` with a `limited_drop` database, plus a second `limited_drop_test` database that the tests use (they wipe their tables, so they get their own). I used port 5433 so it doesn't clash with a Postgres you might already have on 5432. Set `DB_PORT` if you want something else. The credentials live in `docker-compose.yml` and are for local development only.

`docker compose down` stops it and keeps your data. `docker compose down -v` stops it and deletes the data.

If you'd rather use your own Postgres, create a user and the two databases:

```bash
sudo -u postgres psql -c "CREATE USER your_user WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "CREATE DATABASE limited_drop OWNER your_user;"
sudo -u postgres psql -c "CREATE DATABASE limited_drop_test OWNER your_user;"
```

Stick to letters, digits and underscores in the password so it's safe inside a connection URL, then put the matching URLs in `backend/.env`.

### 2. The backend

```bash
cd backend
cp .env.example .env     # the defaults match the Docker setup
npm install
npm run start:dev        # http://localhost:3000
```

On startup it creates the tables (through a migration) and, if the products table is empty, adds three demo products.

### 3. The frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev              # http://localhost:5173
```

### Settings

Backend, in `backend/.env`:

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | none | Postgres connection URL |
| `TEST_DATABASE_URL` | none | Database for the tests. Its name must contain "test" |
| `RESERVATION_TTL_MS` | `30000` | How long a reservation holds stock |
| `SWEEPER_ENABLED` | `true` | The background job that returns expired stock |
| `SWEEP_INTERVAL_MS` | `5000` | How often that job runs |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin(s), comma separated |
| `SEED_ON_BOOT` | `true` | Add demo products when the table is empty |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |

Frontend, in `frontend/.env`:

| Variable | What it does |
|---|---|
| `VITE_API_URL` | Where the backend lives. Vite reads it at build time |
| `VITE_USE_MOCK` | Set to `true` to run against an in-memory mock instead of the backend |

## The API

There's no login. Each browser makes up an id and sends it in an `x-user-id` header, and that's how the backend knows whose reservation is whose.

| Method | Route | What it does |
|---|---|---|
| GET | `/products` | Lists products with their available stock |
| POST | `/reservations` | Reserves a unit. Body: `{ productId, quantity? }` |
| GET | `/reservations/active` | Your live holds (this is how a page refresh keeps your countdown) |
| GET | `/reservations/:id` | One reservation. A hold that's past its deadline already reads as `EXPIRED` |
| POST | `/reservations/:id/checkout` | Turns a hold into an order. Safe to repeat |
| DELETE | `/reservations/:id` | Releases a hold early. Safe to repeat |

Errors come back as `{ code, message }`:

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_USER` or validation text | Missing or malformed `x-user-id`, or bad input |
| 404 | `PRODUCT_NOT_FOUND`, `RESERVATION_NOT_FOUND` | It doesn't exist, or it isn't yours. Both look the same on purpose, so ids can't be probed |
| 409 | `SOLD_OUT` | Someone else got the last unit |
| 409 | `ALREADY_RESERVED` | You already hold this product |
| 409 | `ALREADY_COMPLETED` | A finished purchase can't be released |
| 410 | `RESERVATION_EXPIRED` | The hold ran out, or was released |

## How the stock stays correct

### The data

There are three tables: `products` (with `total_stock` and `available_stock`), `reservations` (who holds what, its status, and when it expires), and `orders`. A reservation is `ACTIVE` until it becomes `COMPLETED` (checked out), `EXPIRED` (ran out) or `CANCELLED` (released).

The idea I built everything around is that every unit is always in exactly one place:

```
total_stock = available_stock + units held in ACTIVE reservations + units sold in orders
```

Each operation moves units between those three buckets and never creates or destroys one. The tests check this after almost every scenario.

### Reserving

The obvious way to write this is to read the stock, check it in code, then write the new number. That has a gap. Two requests can both read "1 left" before either one writes. So the check and the change are a single statement:

```sql
UPDATE products
   SET available_stock = available_stock - $qty
 WHERE id = $id AND available_stock >= $qty
RETURNING id;
```

Postgres locks the row while that runs, so competing buyers queue up, and each one re-checks against the latest value. If a row comes back, you got the unit. If nothing comes back, it's sold out. The reservation is inserted in the same transaction, so if the insert is refused (for example, because you already hold one), the stock change is undone along with it.

### Checking out

Checkout locks the reservation, confirms it's still active and not past its deadline, marks it `COMPLETED`, and creates the order. It doesn't touch the stock at all: the unit already left `available_stock` when it was reserved, and it counts as sold simply because an order exists. If you call checkout again, it sees `COMPLETED` and hands back the same order, so a double click can't charge anyone twice.

### Expiry

A hold shouldn't last forever, and the unit has to come back. I didn't want that to depend on a single timer, so there are three layers:

1. Checkout checks the deadline itself. An expired hold can never be bought, even if nothing has cleaned it up yet. This is what actually guarantees correctness.
2. If a reserve attempt fails, because it's sold out or because your own old hold is in the way, it releases any expired holds and tries once more. So a sold-out product reopens the moment a hold lapses.
3. A background job runs every few seconds and returns expired units, so the stock shown on the page recovers even when nobody is buying.

### A few other decisions in the same area

All the time comparisons use the database's clock, not the app server's, so several backend instances can't disagree about whether something expired. Operations that touch both tables always lock the product row first and the reservation second, which keeps them from deadlocking each other, and the background job skips any reservation that a checkout is holding at that moment. The database also refuses impossible states on its own: stock can't go below zero or above the edition size, one reservation can only ever produce one order, and one user can hold only one live reservation per product.

Logging is one line per request plus one line per business event (reserved, checked out, released, expired). Events are logged after the transaction commits, so a rolled-back transaction never claims something happened, and secrets are never logged.

## Why I built it this way

I chose PostgreSQL because the whole problem is correctness under concurrency, and it gives me transactions, row locks, conditional updates and constraints without extra machinery. A key-value store would make consistent order data harder, and a document database makes it awkward to keep stock, reservations and orders in step.

Stock is a counter on the product rather than something I calculate by counting reservations. That makes reserving one cheap update, at the cost of the counter being derived data that could in theory drift. The constraints and the tests are there to catch that.

I used TypeORM for the connection and migrations, but the statements that decide who gets a unit are hand-written SQL, so the locking is explicit and easy to review. There are no entities, and `synchronize` is off, so the schema belongs to migrations.

On the frontend, components only talk to a small `DropApi` interface. There's a mock version and a real one, and one line chooses between them. That let me build and test the whole interface before the backend existed. React Query handles loading, errors and caching, and every action refetches afterwards, even a failed one, so if you lose a race the screen corrects itself right away. The countdown is calculated from the server's `expiresAt` deadline instead of counting down from a number, so it can't drift, stall in a sleeping tab, or reset on refresh.

## Assumptions

- There's no real authentication. The browser-generated id stands in for a login, and the `@UserId()` decorator is the one place to replace it.
- The brief doesn't say how long a hold should last, so I picked 2 minutes as the default (`RESERVATION_TTL_MS`). Shorter holds free stock faster but rush buyers, and longer ones let abandoned holds block scarce items.
- There's no payment step. Checkout succeeds as long as the hold is valid.
- A buyer can hold one reservation per product at a time, for at most 2 units. That's a basic guard against hoarding.
- Demo products are added on first start. There's no admin screen.
- There's no order history page. After checkout, the buyer gets a confirmation message.

## Trade-offs

The page polls `/products` every 3 seconds. It's simple and needs no persistent connections, but it adds a little delay and constant read traffic. Background tabs stop polling and catch up when you come back to them.

Everyone buying the same product queues on that product's row. For one scarce item, that's the behavior I want: correctness matters more than throughput.

Stock can look held for a few seconds after a hold ends, until the background job runs or someone's reserve attempt cleans it up. It never affects who can buy what.

The countdown uses the browser's clock against the server's deadline, so a badly wrong device clock could skew what the buyer sees.

## What I'd do with more time

- Add real authentication, per-user rate limiting and bot protection, since a drop is exactly what scalpers go after.
- Use Server-Sent Events for live stock instead of polling.
- Base the countdown on the server's `serverTime`, so a wrong device clock can't mislead it.
- Show held units and sold units differently in the stock meter. Right now both look "taken".
- Add an order history endpoint and page.
- Add idempotency keys to reserve, and a real payment provider with webhooks.
- Put a queue or waiting room in front of the API for traffic far beyond what one Postgres row can serialise.
- Add a scheduled check that alerts if `available_stock` ever stops matching `total − held − sold`.
- Switch to structured JSON logs with request ids, and add metrics such as reservations per minute and expiry rate.
- Containerize the backend and frontend as well. Today only the database runs in Docker.
- Add Playwright tests for the main screens.

## Tests

```bash
cd backend && npm run test:e2e     # needs Postgres and TEST_DATABASE_URL
cd frontend && npm test
```

The backend tests run against a real Postgres rather than mocks, because the bugs that matter here live in the database. They cover:

- **Overselling.** 50 simultaneous buyers for 5 units give exactly 5 winners and 45 `SOLD_OUT` responses, and the stock ends at 0. One user firing 8 requests at once ends up with a single hold. Multi-unit reservations can't take more than what's left.
- **Checkout.** It creates an order and keeps the unit out of stock. Five parallel checkouts produce one order. Other people's reservations return 404. Checking out after the deadline returns 410, even before the background job has run.
- **Expiry.** The job returns expired stock and leaves completed purchases alone, and running it many times at once never releases a unit twice. A sold-out product reopens as soon as a hold lapses. A buyer can reserve again after their own hold expired. A checkout racing the job on an expired hold produces no order and fully restored stock.
- **Release, reads and validation.** Releasing is immediate, repeatable, and can't undo a purchase. `/reservations/active` shows only your own holds. Bad ids, bad quantities and a missing identity are rejected. The database constraints refuse impossible stock values.

The frontend tests cover the time formatting and the mock API's stock and expiry rules.


## Deployment

The backend needs `DATABASE_URL`, `CORS_ORIGIN` (the frontend's URL, without a trailing slash), `RESERVATION_TTL_MS` and `LOG_LEVEL`. The frontend needs `VITE_API_URL` pointing at the backend before it's built, because Vite reads it at build time. Migrations run automatically when the backend starts.
