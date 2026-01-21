# Security Analysis Report

**Date:** January 21, 2026
**Project:** PasswordlessDemo
**Auditor:** AI Assistant

## Executive Summary

A security audit was performed on the `PasswordlessDemo` project. The audit focused on secret management, client/server code separation, authentication logic, and general security best practices.

**Critical vulnerabilities were identified** involving server-side database logic leaking to the client bundle and executing in the browser context. These issues must be addressed immediately to prevent application crashes and potential data exposure.

## Findings

### 1. Critical: Server Logic Leaking to Client via Loaders

**Severity:** Critical
**Affected Files:**
- `src/routes/login-check-email.tsx`
- `src/routes/login-verification.tsx`
- `src/routes/user-settings.tsx`
- `src/routes/login-via-link.$loginLinkToken.tsx`
- `src/routes/signup.$signupToken.tsx`

**Description:**
The application uses TanStack Router `loader` functions to fetch data directly from the database using `db.select()` and even perform writes (`db.insert` in `signup.$signupToken.tsx`). In TanStack Start/Router, `loader` functions run on the **client** during client-side navigation (unless explicitly configured otherwise).

This causes two major issues:
1.  **Functional Failure:** The `db` module imports `better-sqlite3`, which is a Node.js native binding. This will fail to load or execute in the browser, causing the application to crash on client-side navigation.
2.  **Information Disclosure:** The database schema, query logic, and potentially connection strings (if hardcoded or bundled) are included in the client-side JavaScript bundle, exposing internal architecture to attackers.
3.  **Improper State Change:** `signup.$signupToken.tsx` performs a state-changing operation (User Creation) inside a `loader` (GET request), which violates HTTP semantics and can lead to unpredictable behavior.

**Recommendation:**
Move all database interaction logic into `createServerFn` handlers. The `loader` should call these server functions, which act as an API layer. Alternatively, use `.server` loader patterns if supported by the framework configuration to ensure code is stripped from the client bundle. State-changing operations should generally be POST requests handled by actions or server functions, not loaders.

### 2. High: Top-Level Imports of Sensitive Modules

**Severity:** High
**Affected Files:**
- `src/routes/signup.tsx`
- `src/routes/login-check-email.tsx`
- `src/components/PasskeyComponent.tsx`
- `src/routes/signup.$signupToken.tsx`
- `src/routes/login-via-link.$loginLinkToken.tsx`

**Description:**
These files import `src/lib/jwt.ts` (containing secret key logic) and `src/lib/passkey.ts` at the top level. While the functions are used inside `createServerFn` handlers, the top-level import statement remains. Depending on the bundler configuration and tree-shaking efficiency, this runs the risk of including sensitive server-side code (and secrets like `JWT_SECRET`) in the client bundle.

**Recommendation:**
- Use dynamic imports (e.g., `const { signSignupToken } = await import('@/lib/jwt')`) inside `createServerFn` handlers.
- Or, move server-only logic into files with a `.server.ts` suffix or a dedicated server directory that is explicitly excluded from the client build.

### 3. Medium: Hardcoded and Weak Secrets

**Severity:** Medium
**Affected Files:**
- `src/lib/constants.ts`

**Description:**
The `JWT_SECRET` falls back to a hardcoded string `'dev-secret-key-change-in-production'`. While this is a fallback, it poses a risk if the environment variable is missing in production.

**Recommendation:**
- Remove the default fallback in production. Throw an error if `JWT_SECRET` is not defined.
- Ensure `JWT_SECRET` is a long, random string (at least 32 characters) in production.

### 4. Medium: In-Memory Challenge Store

**Severity:** Medium
**Affected Files:**
- `src/lib/passkey.ts`

**Description:**
WebAuthn challenges are stored in an in-memory `Map`. This approach is:
- **Not Scalable:** It will not work in a clustered environment or serverless deployment (e.g., Vercel, AWS Lambda) as memory is not shared.
- **DoS Risk:** There is no limit on the map size, potentially allowing an attacker to exhaust server memory by initiating many registrations/logins.

**Recommendation:**
- Store challenges in a distributed store like Redis or the database with a short expiration (TTL).
- Implement a cleanup job or TTL index to remove expired challenges.

### 5. Low: Console Logging of Sensitive URLs

**Severity:** Low
**Affected Files:**
- `src/routes/signup.tsx`
- `src/routes/login-check-email.tsx`

**Description:**
The application logs login and verification URLs to the server console. In a production environment, these logs might be persisted and accessible to operators or third-party logging services, potentially allowing unauthorized access to user accounts.

**Recommendation:**
- Wrap these logs in a conditional check (e.g., `if (process.env.NODE_ENV === 'development')`).
- Use a proper email service for sending links in production.

### 6. Low: Symmetric JWT Signing

**Severity:** Low
**Affected Files:**
- `src/lib/jwt.ts`

**Description:**
The application uses `HS256` (Symmetric HMAC) for signing JWTs. If the secret key is compromised, an attacker can sign valid tokens.

**Recommendation:**
- Consider using `RS256` or `ES256` (Asymmetric) keys. This allows the public key to be used for verification (even on the client if needed) without risking the private signing key.

## Conclusion

The project demonstrates a solid foundation for passwordless authentication but requires immediate attention to the **Critical** issue of server logic leaking to the client. Addressing the loader implementation and ensuring strict separation of client/server code is essential for a secure and functional application.
