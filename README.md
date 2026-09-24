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

## Test

```bash
npm test
npm run typecheck
```
