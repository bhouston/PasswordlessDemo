---
name: JWT-based passkey challenge authentication
overview: Refactor passkey authentication to use JWT tokens instead of database storage for challenges. When user selects passkey login, generate challenge, encode it in a JWT token (with user identity and 10-minute expiration), and redirect to a token-based route. The challenge is extracted from the JWT during verification, eliminating database storage.
todos:
  - id: jwt-token-functions
    content: Add signPasskeyChallengeToken and verifyPasskeyChallengeToken functions to src/server/jwt.ts
    status: completed
  - id: initiate-function
    content: Create initiatePasskeyLogin server function in src/server/passkey.ts that generates auth options and JWT token
    status: completed
  - id: modify-verify
    content: Modify verifyAuthenticationResponse to accept token parameter and extract challenge from JWT instead of database
    status: completed
  - id: new-token-route
    content: Create new route src/routes/login-passkey.$passkeyToken.tsx with loader that validates token and returns auth options
    status: completed
  - id: update-verification-page
    content: Update login-verification.tsx to call initiatePasskeyLogin and redirect to token route
    status: completed
  - id: remove-old-route
    content: Remove old src/routes/login-passkey.tsx route file (replaced by token route)
    status: completed
---

# JWT-Based Passkey Challenge Authentication

## Overview

Refactor the passkey authentication flow to use stateless JWT tokens instead of persisting challenges in the database. The challenge, user identity (email/userId), and expiration are encoded in a JWT token that expires in 10 minutes. This simplifies the architecture and removes the need for database challenge storage.

## Current Flow

1. User navigates to `/login-passkey` with email in search params
2. Route loader validates user and checks for passkey
3. Component calls `generateAuthenticationOptions` → stores challenge in `users.passcodeChallenge`
4. User authenticates with passkey
5. Component calls `verifyAuthenticationResponse` → retrieves challenge from database

## New Flow

1. User clicks "Login with Passkey" on `/login-verification` page
2. Server function `initiatePasskeyLogin` generates auth options + JWT token with challenge
3. Redirect to `/login-passkey/{token}` route
4. Route loader validates token and extracts challenge/user info
5. Component uses challenge from token (embedded in auth options)
6. User authenticates, sends response + token to server
7. Server verifies token (expiration + challenge) and authenticates user

## Implementation Details

### 1. JWT Token Functions (`src/server/jwt.ts`)

Add new functions for passkey challenge tokens:

- `signPasskeyChallengeToken(challenge: string, userId: number, email: string): Promise<string>`
  - Creates JWT with payload: `{ challenge, userId, email, iat, exp }`
  - Expiration: 10 minutes (600 seconds)

- `verifyPasskeyChallengeToken(token: string): Promise<PasskeyChallengeTokenPayload>`
  - Verifies JWT signature and expiration
  - Returns `{ challenge, userId, email, iat, exp }`
  - Throws error if invalid/expired

### 2. New Server Function (`src/server/passkey.ts`)

Create `initiatePasskeyLogin` server function:

- Input: `{ email: string }`
- Validates user exists and has passkey
- Generates authentication options (includes challenge)
- Creates JWT token with challenge + user identity
- Returns: `{ options: PublicKeyCredentialRequestOptionsJSON, token: string }`

Modify `verifyAuthenticationResponse`:

- Remove `getAndRemoveChallenge` call
- Accept token in input: `{ response: unknown, token: string }`
- Verify token to extract challenge and userId
- Use challenge from token instead of database
- Verify authentication response with extracted challenge

### 3. New Route (`src/routes/login-passkey.$passkeyToken.tsx`)

Create token-based route:

- Route pattern: `/login-passkey/$passkeyToken`
- Loader:
  - Validates token using `verifyPasskeyChallengeToken`
  - Fetches user by userId from token
  - Verifies user has passkey
  - Generates authentication options (reusing challenge from token)
  - Returns `{ user, options, token }`
- Component:
  - Uses options from loader (challenge already embedded)
  - Calls `startAuthentication` with options
  - Calls `verifyAuthenticationResponse` with response + token
  - Handles success/error states

### 4. Update Login Verification Route (`src/routes/login-verification.tsx`)

Modify "Login with Passkey" button:

- Call `initiatePasskeyLogin` server function instead of navigating
- On success, redirect to `/login-passkey/{token}` with token from response
- Handle errors (user not found, no passkey, etc.)

### 5. Remove Database Challenge Storage

Remove challenge-related code from authentication flow:

- Remove `storeChallenge` and `getAndRemoveChallenge` calls from `generateAuthenticationOptions` and `verifyAuthenticationResponse` (authentication only)
- Keep these functions for registration flow (unchanged)
- Database schema can keep `passcodeChallenge` fields for now (used by registration), but they won't be used for authentication

### 6. Update Type Definitions

Add TypeScript interface for passkey challenge token payload:

```typescript
export interface PasskeyChallengeTokenPayload {
  challenge: string;
  userId: number;
  email: string;
  iat: number;
  exp: number;
}
```

## Security Considerations

- JWT tokens are signed with `JWT_SECRET`, preventing tampering
- 10-minute expiration ensures timely authentication
- Challenge is cryptographically random (generated by SimpleWebAuthn)
- Token includes user identity to prevent cross-user attacks
- Token is single-use (challenge verification ensures this)

## Files to Modify

1. `src/server/jwt.ts` - Add passkey challenge token functions
2. `src/server/passkey.ts` - Add `initiatePasskeyLogin`, modify `verifyAuthenticationResponse`
3. `src/routes/login-passkey.$passkeyToken.tsx` - New token-based route
4. `src/routes/login-verification.tsx` - Update button to call `initiatePasskeyLogin`
5. `src/routes/login-passkey.tsx` - Can be removed (replaced by token route)

## Migration Notes

- Old `/login-passkey` route with email search param can be removed
- Registration flow remains unchanged (still uses database challenges)
- Existing users with challenges in database won't be affected (authentication flow no longer reads them)