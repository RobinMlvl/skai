# SkAI

Local flight-scan tool: several departure and arrival airports × a date range on Google Flights,
trap detection, price/duration frontier, and preference checks by Jev (TypeSafe).

## Run

```bash
cp .env.example .env   # then set TYPESAFE_API_KEY
npm install
npm run dev            # API on 127.0.0.1:4317, web app on http://127.0.0.1:5173
```

SkAI opens its own Chrome window (profile in `~/.skai/chrome-profile`). If Google shows a
block page, the scan stops; SkAI never retries or bypasses it.

## Known limits

- Separate tickets (self-transfer) and overnight layovers are not detected until a real Google
  label showing them is captured, so "Hide separate tickets" has no effect yet.
- Ports: the API uses `SKAI_PORT` (4317) and the web app `SKAI_WEB_PORT` (5173); set both in the shell to run a second copy.
- Stop the server before running `npm run capture -w @skai/server`: both use the same Chrome profile,
  which Chrome locks.
- The airport list only holds large and medium airports with scheduled service; smaller airports
  cannot be picked.

## Test

```bash
npm test
npm run typecheck
```
