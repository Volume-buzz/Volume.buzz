# Repository Guidelines

## Project Structure & Module Organization
- Backend (Node/Express/Discord): `src/` — API routes in `src/routes`, Discord commands in `src/commands`, services in `src/services`, utilities in `src/utils`, middleware in `src/middleware`, entrypoints `src/app.ts`, `src/server.ts`, `src/bot.ts`. Prisma client: `src/database/prisma.ts` and schema in `prisma/schema.prisma`.
- Frontend (Next.js App Router): `volume/` — pages in `volume/src/app`, UI components in `volume/src/components`, shared libs in `volume/src/lib`, global styles `volume/src/app/globals.css`.
- Assets: `volume/public/**`.

## Build, Test, and Development Commands
- Backend dev: `npm run dev` (app), `npm run dev:api`, `npm run dev:bot`.
- Backend build/start: `npm run build` then `npm run start` (app) or `npm run start:api` / `start:bot`.
- Prisma: `npm run db:push`, `npm run db:generate`, `npm run db:studio`.
- Frontend dev (from `volume/`): `npm run dev`.
- Frontend build/start (from `volume/`): `npm run build`, `npm start`.
- Package manager: repository includes `pnpm-lock.yaml`; pnpm is preferred, but npm works with the scripts shown.

## Coding Style & Naming Conventions
- Language: TypeScript across backend and frontend.
- Linting: ESLint configured for the Next app (`volume/eslint.config.mjs`). Run `npm run lint` in `volume/`.
- Formatting: follow ESLint/Next defaults; use 2‑space indentation, semicolons optional but be consistent.
- Filenames: kebab-case for files (e.g., `add-artist.ts`, `beams-background.tsx`); React components use PascalCase for component names.

## Testing Guidelines
- No test framework is configured yet. If adding tests, use Jest or Vitest with TS, colocated as `*.test.ts` near sources (e.g., `src/services/wallet.test.ts`). Keep unit tests fast and deterministic.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat: add wallet transfer validation`, `fix: handle rate limit errors`).
- PRs: include a clear description, linked issues, screenshots for UI changes, and steps to validate (commands, env vars). Scope PRs narrowly and keep them reviewable (<300 lines when possible).

## Security & Configuration Tips
- Secrets: use `.env` (backend) and `.env.local` (frontend). Never commit secrets.
- Prisma: after editing `prisma/schema.prisma`, run `npm run db:generate` and `npm run db:push`.
- Rate limiting and headers are configured via `src/middleware/rateLimiter.ts` and `helmet`.
