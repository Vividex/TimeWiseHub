# Contributing

## Prerequisites

- Node.js 20+
- pnpm
- Git

## Clone And Install

```bash
git clone https://github.com/Vividex/TimeWiseHub.git
cd TimeWiseHub
pnpm install
```

## Environment Setup

Copy the local environment example and fill in the required values:

```bash
cp .env.local.example .env.local
```

Use real values for local development, but never commit `.env.local` or any real secrets.

## Run Locally

```bash
pnpm dev
```

Open http://localhost:3000 in your browser.

## Branching Strategy

`master` is the production branch. Create feature branches from `master` using one of these naming patterns:

- `feature/description`
- `fix/description`

Open a pull request to merge changes back into `master`. Vercel automatically deploys production when changes are merged to `master`.

## Build Check

Run the production build before opening a pull request:

```bash
pnpm build
```
