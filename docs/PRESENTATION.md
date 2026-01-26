# Building a Production-Grade Passwordless Authentication System

## Introduction

### 1.1 The Tech Stack
- **Framework**: TanStack Start (React + Server Functions)
- **Routing**: TanStack Router (Type-safe file-based routing)
- **Database**: Drizzle ORM + SQLite
- **Auth Standards**: JWT (OTP Codes) & WebAuthn (Passkeys)

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
1. **Primary Auth (Fast)**: Passkey discovery mode - User's device automatically discovers their account via biometrics (FaceID/TouchID). No email input required.
2. **Fallback Auth (Reliable)**: If passkey unavailable -> User requests OTP code via email.
3. **Email Flow**: Always succeeds - sends 8-character alphanumeric code if account exists, or notification email if account doesn't exist.
- **Benefits**: No secrets to remember. Phishing resistant. Seamless experience. **No account enumeration** - attackers can't discover which emails are registered.

> **Speaker Note:** "Before we get to the fancy bio-metrics, we need a bedrock. Email is that bedrock. An OTP code is just a password that changes every time and is delivered to a device you already unlocked (your phone/laptop). But notice: with passkeys in discovery mode, users don't even need to type their email - the passkey itself identifies the account. This is both simpler and more secure."

---

## Logging in with email (OTP Codes)

### 2.1 Simple but secure
- **Concept**: Send a unique, time-limited, 8-character alphanumeric code to the user's email.
- **Security**: Access to the email account proves identity. The code must be entered in the same browser session.
- **UX**: Enter code -> Logged in. Works across devices (can read code on phone, enter on desktop).

*(Diagram Idea: Sequence diagram showing User -> Server -> Email -> User enters code -> Server)*

### 2.2 Implementing OTP codes
- **Code Generation**: Generate 8-character alphanumeric codes (A-Z, 0-9) for significantly improved security over numeric codes.
- **Code Storage**: Codes are hashed (SHA-256) and stored in the `userAuthAttempts` database table, not in the JWT.
- **Token Generation**: We sign a JWT containing `userAuthAttemptId` (not the code hash) along with `userId` or `email`.
- **Security**: Even if the JWT is decoded, the code cannot be revealed since it's stored separately in the database.

### 2.2.1 Why 8-Character Alphanumeric Codes?

**The Security Requirement:**
Unlike traditional 2FA authenticator apps (which provide a secondary authentication factor), OTP codes in this passwordless system are the **primary and only authentication method**. This fundamental difference requires substantially higher security.

**The Math:**
- **6-digit numeric codes**: 10^6 = **1,000,000** possible combinations
- **8-character alphanumeric codes**: 36^8 = **2,821,109,907,456** possible combinations (2.8 trillion)

**Why This Matters:**
The 8-character alphanumeric format provides approximately **2.8 million times** more entropy than 6-digit numeric codes. This massive keyspace ensures that:
1. **Brute-force attacks are computationally infeasible** - Even with unlimited attempts, an attacker would need to try trillions of combinations
2. **Rate limiting becomes less critical** - While we still implement rate limiting, the large keyspace provides defense-in-depth
3. **Primary authentication security** - Since there's no password as a first factor, the OTP code must be strong enough to stand alone

> **Speaker Note:** "You might wonder why we don't just use 6-digit codes like authenticator apps. The key difference is that authenticator codes are a *second* factor - you still need a password first. Our OTP codes are the *only* factor. That means they need to be strong enough to resist brute-force attacks on their own. 8 alphanumeric characters gives us 2.8 trillion possible combinations versus just 1 million for 6 digits. That's the difference between 'hard to guess' and 'computationally impossible to guess'."

```typescript:src/server/auth.ts
function generateOTPCode(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let code = "";
	for (let i = 0; i < 8; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return code;
}

// Code is hashed and stored in userAuthAttempts table
const codeHash = hashOTPCode(code);
await db.insert(userAuthAttempts).values({
	email: user.email,
	userId: user.id,
	codeHash,
	purpose: "login",
	expiresAt: new Date(Date.now() + 15 * 60 * 1000),
	used: false,
});

// JWT only contains reference to the attempt, not the code
const token = await signCodeVerificationToken(user.id, user.email, attempt.id);
```

> **Speaker Note:** "We use JWTs here not for sessions, but as a one-time-use entry ticket. The code itself is stored securely in the database, hashed with SHA-256. The JWT only contains a reference to the attempt, ensuring that even if the token is decoded, the code remains secret."

- **Route Handler (TanStack Router)**:
We use `beforeLoad` to verify the token *before* the component renders. This ensures we don't flash authorized UI to unauthorized users.

```typescript:src/routes/login-via-code.$codeVerificationToken.tsx
export const Route = createFileRoute('/login-via-code/$codeVerificationToken')({
	beforeLoad: async ({ params }) => {
		// 1. Verify token format (but don't authenticate yet)
		await verifyCodeVerificationToken(params.codeVerificationToken);
		return { tokenValid: true };
	},
	component: LoginViaCodePage
});
```

> **Speaker Note:** "Notice `beforeLoad`. In this stack, we verify the token *before* the React component even renders. The actual code verification happens when the user submits the form, ensuring the code is validated server-side."

### 2.3 Signup Flow
- **Signup Process**: Uses the same OTP-based flow as login.
- **Database Schema**: Emails must be unique.
- **Resilience**: OTP codes act as the "Account Recovery" method if a user loses their Passkey.

---

## Passkeys (WebAuthn)

### 3.1 Why Passkeys?
- **Standard**: Built on FIDO2/WebAuthn.
- **Phishing Resistance**: The browser enforces origin binding. You cannot be phished by `evil-google.com` because the browser won't release the credential for `google.com`.
- **UX**: Biometric verification (FaceID, TouchID) is faster than typing.

> **Speaker Note:** "OTP codes are great, but they still have some friction. You have to leave the app, open email, read the code, and type it back in. Passkeys solve the *friction*. Think of a Passkey like a hardware 2FA key (YubiKey), but virtualized into your phone's secure enclave (FaceID/TouchID)."

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

### 4.2 Account Enumeration Prevention

**Why prevent account enumeration?**
- **Privacy**: Attackers can't discover which emails are registered users.
- **Targeting**: Prevents attackers from building lists of valid accounts for targeted attacks.
- **Reconnaissance**: Stops attackers from mapping your user base before launching attacks.

**How we prevent it:**

1. **Passkeys (Discovery Mode)**: 
   - Users never enter their email - the passkey itself discovers the account.
   - No email input = no opportunity for enumeration.
   - The browser's WebAuthn API handles account discovery securely.

2. **Email Login (Always Succeeds)**:
   - The request always returns success, regardless of whether the account exists.
   - If account exists → Send 8-character OTP code email.
   - If account doesn't exist → Send notification email explaining someone tried to log in and that email isn't registered.
   - **Why it's safe to say "account doesn't exist"**: The email goes to the owner of that email address. They already know whether they have an account, so revealing this information doesn't help attackers.

> **Speaker Note:** "This is both simpler and more secure. Passkeys eliminate the enumeration attack vector entirely, and our email flow always succeeds - we just send different emails. The key insight is that when an account doesn't exist, we're telling the email owner something they already know, so there's no security risk."

### 4.3 Signups
- **Verification First**: Never create a `User` record until email ownership is proven.
- **Flow**:
    1. User enters name and email -> Generate 8-character OTP code.
    2. Store code hash in `userAuthAttempts` table with purpose "signup".
    3. Send OTP code email.
    4. User enters code -> Verify code from database -> *Then* create user in DB.
