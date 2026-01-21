---
name: Security Improvements Implementation
overview: Refactor the application to address critical security vulnerabilities by moving all database and JWT operations to server functions, adding authentication middleware, implementing proper environment variable validation, and migrating WebAuthn challenges to the database.
todos:
  - id: env-config
    content: Create src/server/env.ts with Zod schema for environment variables (no defaults, fail if missing)
    status: completed
  - id: db-schema-update
    content: Add passcodeChallenge and passcodeChallengeExpiry fields to users table in schema.ts
    status: completed
  - id: auth-middleware
    content: Create src/server/middleware.ts with requireUser() function that validates cookie and returns user
    status: completed
  - id: update-passkey-lib
    content: Update src/lib/passkey.ts to store challenges in database instead of in-memory Map
    status: completed
  - id: create-auth-server
    content: Create src/server/auth.ts with signup, verifySignupToken, checkUserExists, generateLoginLink, verifyLoginLinkToken functions
    status: completed
  - id: create-user-server
    content: Create src/server/user.ts with getUserById, getUserByEmail, updateUserName, getUserWithPasskey functions (use requireUser middleware where needed)
    status: completed
  - id: create-passkey-server
    content: Create src/server/passkey.ts with passkey-related server functions (use requireUser middleware where needed)
    status: completed
  - id: update-signup-route
    content: Update src/routes/signup.tsx to use signup server function via useServerFn
    status: completed
  - id: update-signup-token-route
    content: Update src/routes/signup.$signupToken.tsx to create user in beforeLoad using verifySignupToken server function
    status: completed
  - id: update-login-routes
    content: Update login.tsx, login-check-email.tsx, login-verification.tsx, login-via-link route to use server functions
    status: completed
  - id: update-login-passkey-route
    content: Update src/routes/login-passkey.tsx to use server functions instead of inline createServerFn
    status: completed
  - id: update-user-settings-route
    content: Update src/routes/user-settings.tsx to use getUserWithPasskey and updateUserName server functions
    status: completed
  - id: update-passkey-component
    content: Update src/components/PasskeyComponent.tsx to use server functions from @/server/passkey
    status: completed
  - id: update-lib-files
    content: Update src/lib/jwt.ts, src/lib/passkey.ts, src/db/index.ts to use getEnvConfig() instead of process.env directly
    status: completed
  - id: remove-dynamic-imports
    content: Search and remove any dynamic imports, replace with static imports from server modules
    status: completed
  - id: update-constants
    content: Update or remove src/lib/constants.ts to use env config or remove if no longer needed
    status: completed
---

# Security Improvements Implementation Plan

## Overview

This plan addresses the critical security vulnerabilities identified in the security analysis by:

- Moving all database queries and JWT operations to dedicated server functions
- Adding authentication middleware for protected endpoints
- Implementing strict environment variable validation
- Migrating WebAuthn challenges from in-memory storage to the database

## Architecture Changes

### 1. Server Functions Organization

Create `src/server/` directory structure:

- `src/server/middleware.ts` - Authentication middleware (`requireUser`)
- `src/server/auth.ts` - Authentication-related server functions
- `src/server/user.ts` - User management server functions
- `src/server/passkey.ts` - Passkey management server functions
- `src/server/env.ts` - Environment variable validation

### 2. Database Schema Updates

Update `src/db/schema.ts` to add challenge fields to users table:

- `passcodeChallenge: text('passcode_challenge')` - nullable
- `passcodeChallengeExpiry: integer('passcode_challenge_expiry', { mode: 'timestamp' })` - nullable

### 3. Environment Configuration

Create `src/server/env.ts` with Zod schema:

- `JWT_SECRET` (required, no default)
- `BASE_URL` (required, no default)
- `RP_NAME` (required, no default)
- `RP_ID` (required, no default)
- `ORIGIN` (required, no default)
- `DATABASE_URL` (required, no default)
- `NODE_ENV` (optional, for conditional logic)

## Implementation Steps

### Step 1: Environment Variable Validation

**File: `src/server/env.ts`**

- Create Zod schema `envConfigSchema` with all required environment variables
- Export `getEnvConfig()` function that parses and validates `process.env`
- Ensure dotenv is loaded before validation (check where it's currently loaded)
- Remove all default fallbacks from `src/lib/constants.ts`

### Step 2: Database Schema Migration

**File: `src/db/schema.ts`**

- Add `passcodeChallenge` and `passcodeChallengeExpiry` fields to users table
- Run migration: `pnpm db:push`

### Step 3: Authentication Middleware

**File: `src/server/middleware.ts`**

- Create `requireUser()` middleware function
- Function should:
  - Read cookie using `getAuthCookie()` from `@/lib/auth`
  - Parse userId from cookie
  - Query database to verify user exists
  - Return user object or throw error
- Export middleware for use in server functions

### Step 4: Update Passkey Library

**File: `src/lib/passkey.ts`**

- Remove in-memory `challengeStore` Map
- Update `storeChallenge()` to write to database (user.passcodeChallenge, user.passcodeChallengeExpiry)
- Update `getAndRemoveChallenge()` to read from database and check expiration
- Remove `cleanupExpiredChallenges()` function
- Update all functions to use database instead of Map

### Step 5: Create Server Functions

**File: `src/server/auth.ts`**

- `signup()` - Check email exists, generate signup token
- `verifySignupToken()` - Verify token and create user (used in beforeLoad)
- `checkUserExists()` - Check if user exists by email
- `generateLoginLink()` - Generate login link token
- `verifyLoginLinkToken()` - Verify token and authenticate user

**File: `src/server/user.ts`**

- `getUserById()` - Get user by ID (with requireUser middleware)
- `getUserByEmail()` - Get user by email
- `updateUserName()` - Update user name (with requireUser middleware)
- `getUserWithPasskey()` - Get user and passkey status (with requireUser middleware)

**File: `src/server/passkey.ts`**

- `generateRegistrationOptions()` - Generate passkey registration options (with requireUser middleware)
- `verifyRegistrationResponse()` - Verify passkey registration (with requireUser middleware)
- `generateAuthenticationOptions()` - Generate passkey auth options
- `verifyAuthenticationResponse()` - Verify passkey authentication
- `deletePasskey()` - Delete user's passkey (with requireUser middleware)

### Step 6: Update Route Files

**File: `src/routes/signup.tsx`**

- Remove inline server function
- Import `signup` from `@/server/auth`
- Use `useServerFn` hook to call server function

**File: `src/routes/signup.$signupToken.tsx`**

- Move user creation logic to `beforeLoad` (not loader)
- Import `verifySignupToken` server function
- Call server function in `beforeLoad` to create user
- Remove database imports from route file

**File: `src/routes/login.tsx`**

- Remove inline server function
- Import `checkUserExists` from `@/server/auth`
- Use `useServerFn` hook

**File: `src/routes/login-check-email.tsx`**

- Remove loader database queries
- Import `getUserByEmail` and `generateLoginLink` from server functions
- Call server functions in loader or use `useServerFn` in component

**File: `src/routes/login-verification.tsx`**

- Remove loader database queries
- Import `getUserByEmail` server function
- Call server function in loader

**File: `src/routes/login-via-link.$loginLinkToken.tsx`**

- Move authentication logic to `beforeLoad`
- Import `verifyLoginLinkToken` server function
- Remove database imports

**File: `src/routes/login-passkey.tsx`**

- Remove inline server functions
- Import `getUserByEmail`, `initiatePasskeyLogin`, `verifyPasskeyLogin` from server functions
- Remove loader database queries
- Use server functions via `useServerFn` or in loader

**File: `src/routes/user-settings.tsx`**

- Remove loader database queries
- Remove inline server function
- Import `getUserWithPasskey` and `updateUserName` from server functions
- Call server functions in loader/beforeLoad

**File: `src/components/PasskeyComponent.tsx`**

- Remove inline server functions
- Import passkey server functions from `@/server/passkey`
- Use `useServerFn` hook to call server functions

### Step 7: Update Library Files

**File: `src/lib/constants.ts`**

- Remove all constants (they'll come from env config)
- Or update to import from `@/server/env` if needed for client-side code

**File: `src/lib/jwt.ts`**

- Update to use `getEnvConfig()` for JWT_SECRET
- Ensure no top-level imports of env vars

**File: `src/lib/passkey.ts`**

- Update to use `getEnvConfig()` for RP_NAME, RP_ID, ORIGIN
- Update challenge storage to use database

**File: `src/db/index.ts`**

- Update to use `getEnvConfig()` for DATABASE_URL

### Step 8: Remove Dynamic Imports

- Search for any `await import()` patterns
- Replace with static imports from `@/server/*` modules

## Key Implementation Details

### Middleware Pattern

```typescript
// src/server/middleware.ts
export async function requireUser() {
  const userIdStr = getAuthCookie();
  if (!userIdStr) {
    throw new Error('Not authenticated');
  }
  const userId = parseInt(userIdStr, 10);
  // Query user from database
  // Return user object
}
```

### Server Function with Middleware

```typescript
// src/server/user.ts
import { requireUser } from './middleware';

export const updateUserName = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    const user = await requireUser();
    // Use user.id, knowing user is authenticated
  });
```

### Environment Config Usage

```typescript
// src/server/env.ts
import { z } from 'zod';

const envConfigSchema = z.object({
  JWT_SECRET: z.string().min(32),
  BASE_URL: z.string().url(),
  // ... other required vars
});

let envConfig: z.infer<typeof envConfigSchema> | null = null;

export function getEnvConfig() {
  if (!envConfig) {
    envConfig = envConfigSchema.parse(process.env);
  }
  return envConfig;
}
```

### Challenge Storage in Database

```typescript
// In passkey.ts server functions
async function storeChallenge(userId: number, challenge: string) {
  const expiry = new Date(Date.now() + CHALLENGE_EXPIRATION);
  await db.update(users)
    .set({ 
      passcodeChallenge: challenge,
      passcodeChallengeExpiry: expiry 
    })
    .where(eq(users.id, userId));
}
```

## Migration Order

1. Create environment config (`src/server/env.ts`)
2. Update database schema and run migration
3. Create middleware (`src/server/middleware.ts`)
4. Update passkey library to use database for challenges
5. Create server function files (`auth.ts`, `user.ts`, `passkey.ts`)
6. Update route files to use server functions
7. Update component files to use server functions
8. Remove old constants file or update it
9. Test all authentication flows

## Testing Checklist

- [ ] Signup flow works (email check, token generation, user creation)
- [ ] Login flow works (email check, link generation, token verification)
- [ ] Passkey registration works (challenge stored in DB, verification)
- [ ] Passkey authentication works (challenge from DB, verification)
- [ ] User settings page loads (requires authentication)
- [ ] User name update works
- [ ] Passkey deletion works
- [ ] Environment variables fail fast if missing
- [ ] No database imports in route/component files
- [ ] No JWT imports in route/component files (except server functions)