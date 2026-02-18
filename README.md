# apmen-hook

Serverless webhook handler deployed on [Vercel](https://vercel.com).

## Project Structure

```
apmen-hook/
├── api/
│   ├── index.js      # GET /api — service info
│   └── webhook.js    # POST /api/webhook — webhook handler
├── vercel.json       # Vercel deployment config
├── package.json
└── .gitignore
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`)

### Local Development

```bash
npm run dev
```

This starts a local development server at `http://localhost:3000`.

### Endpoints

| Method | Path            | Description              |
| ------ | --------------- | ------------------------ |
| GET    | `/api`          | Service info             |
| GET    | `/api/webhook`  | Health check             |
| POST   | `/api/webhook`  | Receive webhook payloads |

### Test Locally

```bash
# Health check
curl http://localhost:3000/api/webhook

# Send a test webhook
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"event": "test", "data": {"message": "hello"}}'
```

## Deployment

```bash
# Preview deployment
vercel

# Production deployment
npm run deploy
```

## Environment Variables

Add any secrets via the Vercel dashboard or CLI:

```bash
vercel env add SECRET_NAME
```

## License

MIT
