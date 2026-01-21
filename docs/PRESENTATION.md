# Building a Production-Grade Passwordless Authentication System

## Introduction

### 1.1 Passwords are a security nightmare
- **Problem**: Users reuse passwords across multiple sites.
- **Consequence**: A breach in one service compromises user accounts everywhere.
- **Complexity**: Enforcing complex passwords leads to users writing them down or forgetting them.
- **Solution**: Remove the password entirely.

### 1.2 Authenticator apps are a hack
- **Friction**: Requires a second device (usually a phone).
- **UX**: Copy-pasting 6-digit codes is tedious.
- **Phishing**: While better than SMS, they are still susceptible to sophisticated real-time phishing attacks.
- **Recovery**: losing the device often means getting locked out.

### 1.3 The login user flow
- **Ideal Flow**:
    1. User enters email.
    2. System checks if user exists.
    3. If recognized device/browser -> Prompt for Passkey.
    4. If new device -> Send Magic Link to email.
- **Benefits**: No secrets to remember. Phishing resistant (Passkeys). Seamless experience.

---

## Logging in with email

### 2.1 Simple but secure
- **Concept**: "Magic Links"
- **Mechanism**: Send a unique, time-limited, signed URL to the user's email.
- **Security**: Access to the email account proves identity.
- **UX**: Click link -> Logged in.

### 2.2 Implementing login links (using JWTs)
- **Token Generation**: We use JSON Web Tokens (JWT) to create a signed payload containing the user ID and expiration.

```typescript:src/lib/jwt.ts
export async function signLoginLinkToken(userId: number): Promise<string> {
	const secret = new TextEncoder().encode(JWT_SECRET);
	const now = Math.floor(Date.now() / 1000);

	const token = await new SignJWT({ userId })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt(now)
		.setExpirationTime(now + LOGIN_LINK_TOKEN_EXPIRATION)
		.sign(secret);

	return token;
}
```

- **Token Verification**: When the user clicks the link, we verify the signature and expiration.

```typescript:src/lib/jwt.ts
export async function verifyLoginLinkToken(
	token: string,
): Promise<LoginLinkTokenPayload> {
	const secret = new TextEncoder().encode(JWT_SECRET);

	try {
		const { payload } = await jwtVerify(token, secret, {
			algorithms: ['HS256'],
		});
        // ... validation logic
		return {
			userId: payload.userId,
			iat: payload.iat as number,
			exp: payload.exp as number,
		};
	} catch (error) {
        // ... error handling
		throw new Error('Token verification failed');
	}
}
```

- **Route Handler**: The route consumes the token and sets the session.

```typescript:src/routes/login-via-link.$loginLinkToken.tsx
export const Route = createFileRoute(
	'/login-via-link/$loginLinkToken',
)({
	loader: async ({ params }) => {
		try {
			// Verify the token
			const payload = await verifyLoginLinkToken(params.loginLinkToken);

			// Verify user exists in database
			const user = await db
				.select()
				.from(users)
				.where(eq(users.id, payload.userId))
				.limit(1);

			if (user.length === 0) {
				return { success: false, error: 'User not found' };
			}

			// Set authentication cookie
			setAuthCookie(payload.userId);

			return { success: true, user: user[0] };
		} catch (error) {
			return { success: false, error: 'Login failed...' };
		}
	},
    // ... component
});
```

### 2.3 Multiple emails
- **Database Schema**: Ensure email uniqueness at the database level.
- **Normalization**: In a complex system, you might separate `users` and `emails` tables to allow one user to have multiple email addresses (e.g. personal and work), but a simple unique constraint works for most.

```typescript:src/db/schema.ts
export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
    // ...
});
```

---

## Passkeys

### 3.1 Passkeys versus authenticators
- **Standard**: Built on WebAuthn / FIDO2 standards.
- **Security**: Public-key cryptography. The private key never leaves the user's device.
- **Phishing Resistance**: The browser enforces origin binding. You cannot be phished by `evil-google.com` because the browser won't release the credential.
- **UX**: Biometric verification (FaceID, TouchID) or device PIN.

### 3.2 Implementing passkeys (using SimpleWebAuthn)
- **Database Schema**: Store the public key, credential ID, and counter.

```typescript:src/db/schema.ts
export const passkeys = sqliteTable('passkeys', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	credentialId: text('credential_id').notNull(),
	publicKey: text('public_key').notNull(),
	counter: integer('counter').notNull().default(0),
	transports: text('transports'), // JSON array of transport methods
    // ...
});
```

- **Registration Flow**:
    1. **Generate Options**: Server tells browser what kind of credential to create.

```typescript:src/lib/passkey.ts
export async function generateRegistrationOptions(
	userId: number,
	userName: string,
	userDisplayName: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
    // ... check existing passkeys
	const opts: GenerateRegistrationOptionsOpts = {
		rpName: RP_NAME,
		rpID: RP_ID,
		userID: userIdToUint8Array(userId),
		userName: userName,
		userDisplayName: userDisplayName,
        // ...
		authenticatorSelection: {
			residentKey: 'required',
			userVerification: 'required',
			authenticatorAttachment: 'platform',
		},
	};
	const options = await swaGenerateRegistrationOptions(opts);
	storeChallenge(userId, options.challenge);
	return options;
}
```

    2. **Verify Response**: Server verifies the browser's response and stores the public key.

```typescript:src/lib/passkey.ts
export async function verifyRegistrationResponse(
	response: unknown,
	userId: number,
): Promise<{ success: boolean; error?: string }> {
    // ... retrieve challenge
	const opts: VerifyRegistrationResponseOpts = {
		response: response as any,
		expectedChallenge,
		expectedOrigin: ORIGIN,
		expectedRPID: RP_ID,
		requireUserVerification: true,
	};

	const verification = await swaVerifyRegistrationResponse(opts);
    // ... store credential in DB
}
```

- **Authentication Flow**: Similar "challenge-response" mechanism. The server sends a challenge, the device signs it with the private key, and the server verifies it with the stored public key.

---

## Security considerations

### 4.1 Rate limiting
- **Importance**: Prevents abuse of the email sending endpoint (spamming users) and brute-forcing tokens (though high entropy makes this hard).
- **Implementation**:
    - **Where**: Middleware or Server Functions.
    - **Strategy**: Limit requests per IP or per email address (e.g., 3 login attempts per minute).
    - **Note**: The current demo focuses on logic, but in production, you MUST wrap `signLoginLinkToken` and email sending logic with rate limiters (e.g., using Redis).

### 4.2 Signups
- **Verification**: Never create a user account without verifying ownership of the email first.
- **Process**:
    1. User submits email.
    2. Generate "Signup Token" (different from login token).
    3. Send link.
    4. Only create user record when link is clicked.

```typescript:src/routes/signup.tsx
// Server function to handle signup
const handleSignup = createServerFn({ method: 'POST' })
	.inputValidator((data: SignupFormData) => {
		return signupSchema.parse(data);
	})
	.handler(async ({ data }) => {
        // ... check if user exists
		// Generate JWT token
		const token = await signSignupToken(data.name, data.email);
        // ... send email (log to console in demo)
		return { success: true };
	});
```
