---
name: Passwordless Login System
overview: Create a passwordless authentication system with email verification using JWT tokens, TanStack Form with Zod validation, and Shadcn UI components.
todos:
  - id: install-deps
    content: "Install dependencies: @tanstack/react-form, zod, jose, and set up Shadcn UI (field, input, button, label components)"
    status: completed
  - id: setup-shadcn
    content: Initialize Shadcn UI configuration (components.json) and install required components
    status: completed
  - id: jwt-utils
    content: Create JWT utilities (src/lib/jwt.ts) and constants (src/lib/constants.ts) for token signing/verification
    status: completed
  - id: signup-page
    content: Create signup page (src/routes/signup.tsx) with TanStack Form, Zod validation, and Shadcn Field components
    status: completed
  - id: signup-server
    content: Create server function for signup that generates JWT token and logs verification URL to console
    status: completed
  - id: check-email-page
    content: Create signup-check-email page (src/routes/signup-check-email.tsx) with confirmation message
    status: completed
  - id: register-route
    content: Create registration route (src/routes/auth/register.$registrationToken.tsx) with token verification
    status: completed
  - id: register-server
    content: Create server function to verify token and create user in database
    status: completed
---

# Passwordless Login System Implementation

## Overview

Build a passwordless signup flow with email verification using JWT tokens. Users sign up with name and email, receive a verification link (logged to console), and complete registration by clicking the link.

## Architecture

```
User Flow:
1. Signup Page → User enters name/email
2. Server generates JWT token → Logs verification URL to console
3. Check Email Page → Confirmation message
4. User clicks link → Registration route verifies token
5. User created in database → Success/failure message
```

## Dependencies to Install

- `@tanstack/react-form` - Form library
- `zod` - Schema validation
- `jose` - JWT signing/verification
- Shadcn UI components: `field`, `input`, `button`, `label`

## Database Schema

No changes needed to `src/db/schema.ts` - existing `users` table with `id`, `name`, `email`, `createdAt` is sufficient. We'll check for existing emails to prevent duplicates.

## File Structure

```
src/
├── routes/
│   ├── signup.tsx                    # Signup form page
│   ├── signup-check-email.tsx        # Email sent confirmation
│   └── auth/
│       └── register.$registrationToken.tsx  # Token verification route
├── lib/
│   ├── jwt.ts                        # JWT signing/verification utilities
│   └── constants.ts                  # JWT secret, expiration times
└── components/
    └── ui/                           # Shadcn components (field, input, button, label)
```

## Implementation Details

### 1. Setup & Configuration

**Install dependencies:**

- `@tanstack/react-form`
- `zod`
- `jose`
- Shadcn CLI and components

**Create `src/lib/constants.ts`:**

- JWT secret (from env or default)
- Token expiration (24 hours)

**Create `src/lib/jwt.ts`:**

- `signRegistrationToken(name, email)` - Creates JWT with name, email, expiration
- `verifyRegistrationToken(token)` - Verifies and extracts payload

### 2. Signup Page (`src/routes/signup.tsx`)

- Use TanStack Form with Zod schema validation
- Form fields: name (required), email (required, valid email)
- Use Shadcn `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `Input`, `Button`
- On submit: call server function to generate token and log URL
- Navigate to `/signup-check-email` on success

**Server Function (`createServerFn`):**

- Validate input with Zod
- Check if email already exists in database
- Generate JWT token using `signRegistrationToken`
- Build verification URL: `/auth/register/${token}`
- Log URL to console (instead of sending email)
- Return success

### 3. Check Email Page (`src/routes/signup-check-email.tsx`)

- Simple confirmation page
- Message: "Check your email to complete registration"
- Show the logged URL in development (or instructions)

### 4. Registration Route (`src/routes/auth/register.$registrationToken.tsx`)

- Dynamic route parameter: `registrationToken`
- Loader: verify token using `verifyRegistrationToken`
- If valid: create user in database, return success
- If invalid/expired: return error
- Component: display "Registration Confirmed" or "Registration Failed" with error message

**Server Function:**

- Extract token from route params
- Verify token with `verifyRegistrationToken`
- Check if user already exists (prevent duplicate registration)
- Insert user into database
- Return success/error status

### 3. Error Handling

- Invalid/expired tokens → Show error message
- Duplicate email → Show error message
- Form validation errors → Display inline with FieldError
- Server errors → Display user-friendly messages

## Key Implementation Notes

- JWT payload: `{ name: string, email: string, exp: number, iat: number }`
- Token expiration: 24 hours
- Use environment variable for JWT secret (fallback to default for dev)
- Prevent duplicate registrations by checking existing emails
- All server functions use `createServerFn` from `@tanstack/react-start`
- Routes use `createFileRoute` from `@tanstack/react-router`