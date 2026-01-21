---
name: TanStack Start Project Setup
overview: Initialize a new TanStack Start project using the official CLI with TypeScript, Tailwind CSS, Biome, TanStack Router, SQLite, and Drizzle ORM configured and ready to use.
todos:
  - id: scaffold-project
    content: Run TanStack Start CLI to scaffold project with --tailwind and --toolchain biome flags
    status: completed
  - id: install-drizzle
    content: Install Drizzle ORM, SQLite driver (better-sqlite3), and drizzle-kit dependencies
    status: completed
    dependencies:
      - scaffold-project
  - id: configure-drizzle
    content: Create drizzle.config.ts, database schema file, and database connection instance
    status: completed
    dependencies:
      - install-drizzle
  - id: setup-env
    content: Create .env file with DATABASE_URL and .env.example template
    status: completed
    dependencies:
      - configure-drizzle
  - id: add-db-scripts
    content: Add database management scripts (db:push, db:generate, db:studio) to package.json
    status: completed
    dependencies:
      - configure-drizzle
  - id: verify-biome
    content: Verify Biome configuration and add lint/format scripts to package.json
    status: completed
    dependencies:
      - scaffold-project
  - id: verify-tailwind
    content: Verify Tailwind CSS is properly configured with correct content paths
    status: completed
    dependencies:
      - scaffold-project
  - id: create-example
    content: Create a simple example route/API that demonstrates database integration
    status: completed
    dependencies:
      - configure-drizzle
---

# TanStack Start Project Setup

## Overview

Set up a new TanStack Start project in the current directory with TypeScript, Tailwind CSS, TanStack Router, Biome, SQLite, and Drizzle ORM using the official TanStack Start CLI and manual configuration for database tools.

## Implementation Steps

### 1. Initialize TanStack Start Project

- Run `pnpm create @tanstack/start@latest .` with flags:
- `--tailwind` for Tailwind CSS support
- `--toolchain biome` for Biome instead of ESLint/Prettier
- `--package-manager pnpm`
- This will scaffold the project structure with TypeScript, TanStack Router (built-in), and Vite configuration

### 2. Install Drizzle ORM and SQLite Dependencies

- Install runtime dependencies using pnpm: `pnpm add drizzle-orm better-sqlite3 dotenv`
- Install dev dependencies: `pnpm add -D drizzle-kit @types/better-sqlite3`

### 3. Configure Drizzle ORM

- Create `drizzle.config.ts` at project root with SQLite dialect configuration
- Create `src/db/schema.ts` with example table schema
- Create `src/db/index.ts` for database connection instance
- Add `.env` file with `DATABASE_URL` for SQLite database path
- Add database scripts to `package.json`: `db:push`, `db:generate`, `db:migrate`, `db:studio`

### 4. Verify and Configure Biome

- Ensure `biome.json` exists (created by CLI)
- Add scripts to `package.json`: `lint`, `format`, `check`
- Configure Biome to ignore generated files (route tree, migrations, etc.)

### 5. Verify Tailwind CSS Setup

- Ensure `tailwind.config.ts` exists and includes correct content paths
- Verify global CSS file includes Tailwind directives
- Ensure PostCSS is configured

### 6. Verify TanStack Router Setup

- Confirm router is configured (should be automatic with Start)
- Verify route structure in `app/routes/` or similar directory
- Ensure router types are generated

### 7. Create Example Database Integration

- Add a simple example route or API endpoint that uses Drizzle to query the database
- This demonstrates the database connection is working

## Files to be Created/Modified

- `package.json` - Add Drizzle dependencies and scripts
- `drizzle.config.ts` - Drizzle configuration for SQLite
- `src/db/schema.ts` - Database schema definitions
- `src/db/index.ts` - Database connection instance
- `.env` - Environment variables (DATABASE_URL)
- `.env.example` - Example environment file
- `biome.json` - Biome configuration (may be created by CLI)
- Update existing Tailwind and TypeScript configs as needed

## Notes

- TanStack Router is built into TanStack Start, so no separate installation needed
- The CLI should handle TypeScript, Tailwind, and Biome setup automatically
- SQLite database file will be created in the project root or specified location
- Drizzle migrations will be stored in `drizzle/` directory