# Building a Production-Grade Passwordless Authentication System

## Introduction

### 1.1 The Tech Stack
- **Framework**: TanStack Start (React + Server Functions)
- **Routing**: TanStack Router (Type-safe file-based routing)
- **Database**: Drizzle ORM + SQLite
- **Auth Standards**: JWT (Magic Links) & WebAuthn (Passkeys)

> **Speaker Note:** "This isn't just a conceptual talk; this is a working demo built on a modern stack. I'm using TanStack Start because it lets me write my backend logic—my 'Server Functions'—right alongside my UI code. It's perfect for authentication flows where the handshake between client and server needs to be tight and type-safe."

### 1.2 Passwords are a security nightmare
- **Problem**: Users reuse passwords across multiple sites.
- **Consequence**: A breach in one service compromises user accounts everywhere.
- **Complexity**: Enforcing complex passwords leads to users writing them down or forgetting them.
- **Solution**: Remove the password entirely.

> **Speaker Note:** Start with a hook. "How many of you actually enjoy implementing 'Forgot Password' flows? Nobody? Exactly."

### 1.3 Authenticator apps are a hack
- **Friction**: Requires a second device (usually a phone).
- **UX**: Copy-pasting 6-digit codes is tedious.
- **Phishing**: While better than SMS, they are still susceptible to real-time phishing.
- **Recovery**: Losing the device often means getting locked out.

### 1.4 The Ideal User Flow
1. **Identification**: User enters email.
2. **Recognition**: System checks if user exists.
3. **Primary Auth (Fast)**: If recognized device -> Prompt for Passkey (FaceID/TouchID).
4. **Fallback Auth (Reliable)**: If new device -> Send Magic Link to email.
- **Benefits**: No secrets to remember. Phishing resistant. Seamless experience.

> **Speaker Note:** "Before we get to the fancy bio-metrics, we need a bedrock. Email is that bedrock. A 'Magic Link' is just a password that changes every time and is delivered to a device you already unlocked (your phone/laptop)."

---

## Logging in with email (Magic Links)

### 2.1 Simple but secure
- **Concept**: Send a unique, time-limited, signed URL to the user's email.
- **Security**: Access to the email account proves identity.
- **UX**: Click link -> Logged in.

*(Diagram Idea: Sequence diagram showing User -> Server -> Email -> User -> Server)*

### 2.2 Implementing login links (JWTs)
- **Token Generation**: We sign a payload containing the `userId` and `expiration`.
- **Stateless**: The server doesn't need to store the token, just verify the signature.

```typescript:src/lib/jwt.ts
export async function signLoginLinkToken(userId: number): Promise<string> {
	// ... setup secret and time
	const token = await new SignJWT({ userId })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt(now)
		.setExpirationTime(now + LOGIN_LINK_TOKEN_EXPIRATION)
		.sign(secret);
	return token;
}
```

> **Speaker Note:** "We use JWTs here not for sessions, but as a one-time-use entry ticket. It's stateless. The 'state' is the signature. As long as our `JWT_SECRET` is safe, the link is safe."

- **Route Handler (TanStack Router)**:
We use `beforeLoad` to verify the token *before* the component renders. This ensures we don't flash authorized UI to unauthorized users.

```typescript:src/routes/login-via-link.$loginLinkToken.tsx
export const Route = createFileRoute('/login-via-link/$loginLinkToken')({
	beforeLoad: async ({ params }) => {
		// 1. Verify token & Authenticate via Server Function
		const result = await verifyLoginLinkTokenAndAuthenticate({ 
            data: { token: params.loginLinkToken } 
        });

        // 2. Handle failure or return user data
        if (!result.success) {
            // Handle error state
        }
		return result;
	},
    component: LoginViaLinkPage
});
```

> **Speaker Note:** "Notice `beforeLoad`. In this stack, we verify the token *before* the React component even renders. If the token is invalid, we never flash the 'Success' state. It's clean and safe."

### 2.3 Multiple emails & Redundancy
- **Database Schema**: Emails must be unique.
- **Resilience**: Magic Links act as the "Account Recovery" method if a user loses their Passkey.

---

## Passkeys (WebAuthn)

### 3.1 Why Passkeys?
- **Standard**: Built on FIDO2/WebAuthn.
- **Phishing Resistance**: The browser enforces origin binding. You cannot be phished by `evil-google.com` because the browser won't release the credential for `google.com`.
- **UX**: Biometric verification (FaceID, TouchID) is faster than typing.

> **Speaker Note:** "Magic links are great, but they have friction. You have to leave the app, open email, click, and come back. Passkeys solve the *friction*. Think of a Passkey like a hardware 2FA key (YubiKey), but virtualized into your phone's secure enclave (FaceID/TouchID)."

### 3.2 The Flow (Challenge-Response)
*(Diagram Idea: Show the Server sending a random "Challenge", and the Browser signing it with the Private Key stored in the Secure Enclave)*

1. **Registration**: Device generates Key Pair. Public Key sent to Server. Private Key stays on device.
2. **Authentication**: Server sends Challenge. Device signs Challenge with Private Key. Server verifies with Public Key.

### 3.3 Implementation (SimpleWebAuthn)
We use `@simplewebauthn/server` to handle the complex cryptographic verification.

- **Database Schema**: We store the Public Key and a Counter (to prevent cloning).

```typescript:src/db/schema.ts
export const passkeys = sqliteTable('passkeys', {
	// ...
	publicKey: text('public_key').notNull(), // The only part we store
	counter: integer('counter').notNull().default(0), // Prevents replay attacks
	transports: text('transports'), 
});
```

> **Speaker Note:** "This `counter` field is important. If a passkey is cloned (which shouldn't happen), the counter helps us detect replay attacks. Also note we *only* store the Public Key. The Private Key never leaves the user's device."

- **Registration Logic**:

```typescript:src/lib/passkey.ts
// 1. Server generates options
export async function generateRegistrationOptions(...) {
	const opts = {
        // ...
		authenticatorSelection: {
			residentKey: 'required', // Enables "One-click" login
			userVerification: 'required', // Forces FaceID/PIN
			authenticatorAttachment: 'platform',
		},
	};
    // ...
}

// 2. Server verifies response
export async function verifyRegistrationResponse(...) {
	const verification = await swaVerifyRegistrationResponse({
		response,
		expectedChallenge,
		expectedOrigin: ORIGIN,
		expectedRPID: RP_ID,
        // ...
	});
    
    if (verification.verified) {
        // Save public key to DB
    }
}
```

> **Speaker Note:** "WebAuthn is a beast of a protocol. Don't write it from scratch. We use `SimpleWebAuthn` which handles the binary parsing and crypto checks."

---

## Security considerations

### 4.1 Rate limiting (Critical)
- **Attack Vector**: Attackers can trigger thousands of emails to random addresses (Email Bombing) or brute-force tokens.
- **Defense**: 
    - Limit "Send Email" requests by IP address (e.g., 5 per hour).
    - Limit requests by target Email (prevent spamming one victim).
    - Exponential backoff for failed login attempts.

> **Speaker Note:** "If you take one thing away from this talk: **Rate Limit your email endpoints.** If you don't, you are building a free weapon for spammers."

### 4.2 Account Enumeration
- **Problem**: Telling an attacker "Email not found" reveals who *is* a customer.
- **Solution**: Always say "If an account exists, we sent a link." (Though this degrades UX for legitimate users who made a typo).
- **Compromise**: In this demo, we prioritize UX, but in high-security contexts, use vague messages.

### 4.3 Signups
- **Verification First**: Never create a `User` record until email ownership is proven.
- **Flow**:
    1. User enters email -> Create `SignupToken` (JWT).
    2. Send Link.
    3. User clicks Link -> *Then* create user in DB.
