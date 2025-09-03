# Repository Guidelines

## Project Structure & Module Organization
- Backend (Node/Express/Discord): `src/` — API routes `src/routes`, Discord commands `src/commands`, services `src/services`, utilities `src/utils`, middleware `src/middleware`, entrypoints `src/app.ts`, `src/server.ts`, `src/bot.ts`. Prisma client `src/database/prisma.ts`; schema `prisma/schema.prisma`.
- Frontend (Next.js App Router): `volume/` — pages `volume/src/app`, UI components `volume/src/components`, shared libs `volume/src/lib`, global styles `volume/src/app/globals.css`.
- Assets: `volume/public/**`.
- Tests: colocate as `*.test.ts` beside sources (e.g., `src/services/wallet.test.ts`).

## Build, Test, and Development Commands
- Backend dev: `npm run dev` (app), `npm run dev:api`, `npm run dev:bot`.
- Backend build/start: `npm run build` then `npm run start` (app) or `npm run start:api` / `npm run start:bot`.
- Prisma: `npm run db:push`, `npm run db:generate`, `npm run db:studio`.
- Frontend (from `volume/`): `npm run dev` (dev server), `npm run build`, `npm start`.
- Package manager: `pnpm` preferred (`pnpm-lock.yaml` present); `npm` works with the provided scripts.

## Coding Style & Naming Conventions
- Language: TypeScript across backend and frontend.
- Formatting/linting: Next/ESLint defaults; run `npm run lint` in `volume/`. Use 2‑space indentation; semicolons optional but be consistent within a file.
- Filenames: kebab-case for files (e.g., `add-artist.ts`, `beams-background.tsx`); React component names use PascalCase.

## Testing Guidelines
- Framework: none configured. If adding tests, prefer Jest or Vitest with TypeScript.
- Location: colocate as `*.test.ts` near the code under test.
- Practices: keep unit tests fast and deterministic; avoid real network/time dependencies.

## Commit & Pull Request Guidelines
- Commits: use Conventional Commits (e.g., `feat: add wallet transfer validation`, `fix: handle rate limit errors`).
- PRs: include a clear description, linked issues, screenshots for UI changes, and validation steps (commands, env vars). Keep scope narrow and under ~300 LOC when possible.

## Security & Configuration Tips
- Secrets: store in `.env` (backend) and `.env.local` (frontend). Never commit secrets.
- Prisma: after editing `prisma/schema.prisma`, run `npm run db:generate` and `npm run db:push`.
- Security middleware: rate limiting via `src/middleware/rateLimiter.ts`; headers via `helmet`.

