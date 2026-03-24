## `docs/AUTH_API.md`

```markdown
# Hazam — Auth API Documentation

Base URL: `http://localhost:3000/api`

All requests and responses use `Content-Type: application/json` unless noted otherwise.

---

## Response Format

Every API response follows this structure:

**Success:**
```json
{
  "success": true,
  "message": "Human readable message",
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Human readable error message",
  "errors": [
    { "field": "email", "message": "Invalid email address" }
  ]
}
```

`errors` array is only present for validation errors (400).

---

## Auth Token Usage

After login, you receive two tokens:

- **Access Token** — short-lived (15 minutes). Send in every protected request header:
  ```
  Authorization: Bearer <accessToken>
  ```

- **Refresh Token** — long-lived (7 days). Use it to get a new access token when the current one expires. Store securely (httpOnly cookie or secure storage).

**Token refresh flow:**
1. Make API call with access token
2. If you get `401` → call `/api/auth/refresh` with your refresh token
3. Store the new access + refresh tokens
4. Retry the original request

---

## Phone Number Format

Nepal format is required: `+977-XXXXXXXXXX`

- Must start with `+977-`
- Followed by exactly 10 digits
- Examples: `+977-9812345678`, `+977-9841234567`

---

## 1. Register

Creates a new account. A 6-digit verification code is sent to the email.

```
POST /api/auth/register
```

**Request Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `fullName` | string | ✅ | 2–255 characters |
| `email` | string | ✅ | Valid email, case-insensitive |
| `password` | string | ✅ | 8–128 characters |
| `phoneNumber` | string | ✅ | Nepal format: `+977-XXXXXXXXXX` |
| `role` | string | ✅ | `"customer"` or `"barber"` only |

**Request Example:**
```json
{
  "fullName": "Ram Bahadur",
  "email": "ram@example.com",
  "password": "mypassword123",
  "phoneNumber": "+977-9812345678",
  "role": "customer"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "fullName": "Ram Bahadur",
    "email": "ram@example.com",
    "phoneNumber": "+977-9812345678",
    "role": "customer",
    "isVerified": false,
    "createdAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**After registration:**
- User is NOT verified yet (`isVerified: false`)
- A 6-digit OTP is sent to the registered email
- OTP expires in 15 minutes
- User must verify before accessing protected features

**Possible Errors:**

| Status | Message | When |
|--------|---------|------|
| 400 | Validation failed | Missing/invalid fields |
| 409 | Email is already registered | Duplicate email |

---

## 2. Verify Email

Verifies the account using the 6-digit OTP sent to email.

```
POST /api/auth/verify-email
```

**Request Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `email` | string | ✅ | Email used during registration |
| `code` | string | ✅ | Exactly 6 digits (e.g. `"482910"`) |

**Request Example:**
```json
{
  "email": "ram@example.com",
  "code": "482910"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": {
    "message": "Email verified successfully"
  }
}
```

**After verification:**
- `isVerified` becomes `true`
- User can now access all protected features (booking, wallet, etc.)

**Possible Errors:**

| Status | Message | When |
|--------|---------|------|
| 400 | Validation failed | Code not 6 digits, invalid email |
| 401 | Invalid or expired verification code | Wrong code, expired code, already used code |
| 404 | No account found with this email | Email not registered |
| 409 | Email is already verified | Already verified |

---

## 3. Resend Verification Code

Sends a new OTP to the email. Rate limited to 3 attempts per 15 minutes.

```
POST /api/auth/resend-verification
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | ✅ |

**Request Example:**
```json
{
  "email": "ram@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Verification code sent",
  "data": {
    "message": "Verification code sent"
  }
}
```

**Important:** The old OTP is NOT invalidated. Both old (if not expired) and new OTP will work. Only the latest OTP is typically needed.

**Possible Errors:**

| Status | Message | When |
|--------|---------|------|
| 400 | Validation failed | Invalid email |
| 404 | No account found with this email | Email not registered |
| 409 | Email is already verified | Already verified |
| 429 | Maximum 3 verification attempts per 15 minutes | Rate limited |

---

## 4. Login

Authenticates with email and password. Returns access + refresh tokens.

```
POST /api/auth/login
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | ✅ |
| `password` | string | ✅ |

**Request Example:**
```json
{
  "email": "ram@example.com",
  "password": "mypassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "fullName": "Ram Bahadur",
      "email": "ram@example.com",
      "phoneNumber": "+977-9812345678",
      "role": "customer",
      "isVerified": true
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "a1b2c3d4e5f6789..."
  }
}
```

**Important notes:**
- Login works even if `isVerified` is `false` — check `isVerified` on the frontend to show verification prompt
- Email is case-insensitive (`Ram@Example.COM` and `ram@example.com` are the same)
- OAuth-only users (no password) cannot use this endpoint

**Possible Errors:**

| Status | Message | When |
|--------|---------|------|
| 400 | Validation failed | Missing email or password |
| 401 | Invalid email or password | Wrong credentials (same message for both) |
| 401 | This account uses Google sign-in... | OAuth-only account |

---

## 5. Refresh Token

Gets a new access + refresh token pair using the refresh token.
The old refresh token is invalidated (token rotation).

```
POST /api/auth/refresh
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `refreshToken` | string | ✅ |

**Request Example:**
```json
{
  "refreshToken": "a1b2c3d4e5f6789..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "fullName": "Ram Bahadur",
      "email": "ram@example.com",
      "phoneNumber": "+977-9812345678",
      "role": "customer",
      "isVerified": true
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...(new)",
    "refreshToken": "x9y8z7w6v5u4321...(new)"
  }
}
```

**CRITICAL:** After refreshing, you MUST store and use the NEW refresh token.
The old one is permanently invalidated. If you lose the new refresh token,
the user must login again.

**Recommended frontend flow:**
```
1. API call returns 401 (access token expired)
2. Call POST /api/auth/refresh with stored refresh token
3. Store BOTH new accessToken and new refreshToken
4. Retry the original API call with new access token
5. If refresh also returns 401 → redirect to login page
```

**Possible Errors:**

| Status | Message | When |
|--------|---------|------|
| 400 | Validation failed | Missing refresh token |
| 401 | Invalid refresh token | Token doesn't exist in DB |
| 401 | Refresh token has expired | Token older than 7 days |

---

## 6. Logout

Invalidates the refresh token. The access token will still work until it
expires (15 min max), but the refresh token is immediately unusable.

```
POST /api/auth/logout
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `refreshToken` | string | ✅ |

**Request Example:**
```json
{
  "refreshToken": "a1b2c3d4e5f6789..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": {
    "message": "Logged out successfully"
  }
}
```

**Frontend action after logout:**
- Clear stored access token
- Clear stored refresh token
- Redirect to login page

**Possible Errors:**

| Status | Message | When |
|--------|---------|------|
| 400 | Validation failed | Missing refresh token |
| 401 | Invalid refresh token | Token already used/invalid |

---

## 7. Forgot Password

Sends a 6-digit password reset code to the email.
Always returns success (even for non-existent emails) for security.

```
POST /api/auth/forgot-password
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | ✅ |

**Request Example:**
```json
{
  "email": "ram@example.com"
}
```

**Success Response (200) — ALWAYS returned:**
```json
{
  "success": true,
  "message": "If an account exists with this email, a reset code has been sent",
  "data": {
    "message": "If an account exists with this email, a reset code has been sent"
  }
}
```

**Important:**
- Same response whether email exists or not (anti-enumeration)
- Same response for OAuth-only accounts (no reset code is actually sent)
- Reset code expires in 1 hour
- Rate limited to 3 attempts per 15 minutes per email

**Frontend flow:**
1. Show email input form
2. Call this endpoint
3. Show "Check your email" message regardless of response
4. Show reset code input form

**Possible Errors:**

| Status | Message | When |
|--------|---------|------|
| 400 | Validation failed | Invalid email format |
| 429 | Maximum 3 reset attempts per 15 minutes | Rate limited |

---

## 8. Reset Password

Resets the password using the 6-digit code from forgot-password email.
After successful reset, ALL sessions are logged out (all refresh tokens invalidated).

```
POST /api/auth/reset-password
```

**Request Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `email` | string | ✅ | Email that received the reset code |
| `code` | string | ✅ | Exactly 6 digits |
| `newPassword` | string | ✅ | 8–128 characters |

**Request Example:**
```json
{
  "email": "ram@example.com",
  "code": "739201",
  "newPassword": "mynewpassword456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully. Please log in with your new password.",
  "data": {
    "message": "Password reset successfully. Please log in with your new password."
  }
}
```

**After successful reset:**
- Old password no longer works
- ALL refresh tokens for this user are deleted (logged out everywhere)
- The reset code is marked as used (cannot be reused)
- All other unused reset codes for this email are also invalidated
- User must login again with the new password

**Frontend flow:**
1. Call this endpoint with email + code + new password
2. On success → redirect to login page
3. Show "Password reset successful. Please login with your new password."

**Possible Errors:**

| Status | Message | When |
|--------|---------|------|
| 400 | Validation failed | Invalid fields, password too short |
| 401 | Invalid or expired reset code | Wrong code, expired, already used |
| 401 | This account uses Google sign-in... | OAuth-only account |

---

## 9. Google OAuth — Initiate

Redirects the user to Google's consent screen.
Must include `role` as a query parameter.

```
GET /api/auth/google?role=customer
GET /api/auth/google?role=barber
```

**Query Parameters:**

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `role` | string | ✅ | `"customer"` or `"barber"` |

**Behavior:**
- Returns `302 Redirect` to Google's OAuth consent screen
- User sees Google's "Choose an account" / "Allow access" screen
- After user consents, Google redirects back to the callback URL

**Frontend usage:**
```javascript
// Navigate the browser (full page redirect, NOT fetch/axios)
window.location.href = 'http://localhost:3000/api/auth/google?role=customer';
```

**Possible Errors:**

| Status | Message | When |
|--------|---------|------|
| 400 | Validation failed | Missing role, invalid role, role=admin |

---

## 10. Google OAuth — Callback

This endpoint is called by Google, NOT by your frontend directly.
After processing, it redirects to your frontend with tokens or error.

```
GET /api/auth/google/callback
```

**You do NOT call this endpoint.** Google redirects here automatically.

**Success Redirect:**
```
https://your-frontend.com/auth/oauth-callback?accessToken=xxx&refreshToken=xxx&isNewUser=true
```

**Error Redirect:**
```
https://your-frontend.com/auth/oauth-callback?error=Error+message+here
```

**Frontend page at `/auth/oauth-callback` must:**

```javascript
// 1. Read query params
const params = new URLSearchParams(window.location.search);
const error = params.get('error');
const accessToken = params.get('accessToken');
const refreshToken = params.get('refreshToken');
const isNewUser = params.get('isNewUser');

// 2. Handle error
if (error) {
  showErrorMessage(decodeURIComponent(error));
  redirectTo('/login');
  return;
}

// 3. Store tokens
storeAccessToken(accessToken);
storeRefreshToken(refreshToken);

// 4. Clean URL (remove tokens from browser history)
window.history.replaceState({}, '', '/auth/oauth-callback');

// 5. Redirect based on user status
if (isNewUser === 'true') {
  // New OAuth user — redirect to profile completion
  // They need to add phone number
  redirectTo('/complete-profile');
} else {
  // Returning user — go to dashboard
  redirectTo('/dashboard');
}
```

**What happens on the backend:**

| Scenario | Backend Action | `isNewUser` |
|----------|---------------|-------------|
| Brand new Google user | Creates account + wallet, `isVerified: true`, `phoneNumber: null` | `true` |
| Returning Google user | Logs in, issues new tokens | `false` |
| Google email matches existing email/password account | Links Google to existing account, sets `isVerified: true` | `false` |

---

## Complete Auth Flows

### Flow 1: Email/Password Registration → Verification → Login

```
Frontend                           Backend
   │                                  │
   ├─── POST /api/auth/register ────→ │ Creates user + wallet + OTP
   │                                  │ Sends verification email
   │ ←── 201 { user data } ──────────┤
   │                                  │
   │  (User checks email for OTP)     │
   │                                  │
   ├─── POST /api/auth/verify-email ─→│ Validates OTP
   │                                  │ Sets isVerified = true
   │ ←── 200 { verified } ───────────┤
   │                                  │
   ├─── POST /api/auth/login ────────→│ Validates credentials
   │                                  │ Returns tokens
   │ ←── 200 { user, tokens } ───────┤
   │                                  │
   │  (Store tokens, go to dashboard) │
```

### Flow 2: Google OAuth Registration

```
Frontend                           Backend                    Google
   │                                  │                          │
   │── GET /api/auth/google ─────────→│                          │
   │   ?role=customer                 │── 302 redirect ────────→│
   │                                  │                          │
   │ ←──────────────── Google consent screen ──────────────────→│
   │                                  │                          │
   │  (User clicks "Allow")          │                          │
   │                                  │←── callback with code ──┤
   │                                  │                          │
   │                                  │ Creates user + wallet    │
   │                                  │ Generates tokens         │
   │                                  │                          │
   │ ←── 302 redirect to frontend ───┤                          │
   │     ?accessToken=x               │                          │
   │     &refreshToken=y              │                          │
   │     &isNewUser=true              │                          │
   │                                  │                          │
   │  (Read params, store tokens)     │                          │
   │  (Redirect to /complete-profile) │                          │
   │                                  │                          │
   │── PATCH /api/profile ───────────→│ Updates phone number     │
   │   { phoneNumber: "+977-..." }    │                          │
   │ ←── 200 { updated user } ───────┤                          │
```

### Flow 3: Password Reset

```
Frontend                           Backend
   │                                  │
   ├── POST /api/auth/forgot-password→│ Generates reset OTP
   │   { email }                      │ Sends reset email
   │ ←── 200 { message } ────────────┤
   │                                  │
   │  (User checks email for OTP)     │
   │                                  │
   ├── POST /api/auth/reset-password →│ Validates OTP
   │   { email, code, newPassword }   │ Updates password
   │                                  │ Invalidates ALL sessions
   │ ←── 200 { message } ────────────┤
   │                                  │
   │  (Redirect to login page)        │
   │                                  │
   ├── POST /api/auth/login ─────────→│ Login with new password
   │ ←── 200 { user, tokens } ───────┤
```

### Flow 4: Token Refresh

```
Frontend                           Backend
   │                                  │
   ├── GET /api/some-resource ───────→│
   │   Authorization: Bearer <expired>│
   │ ←── 401 Unauthorized ───────────┤
   │                                  │
   ├── POST /api/auth/refresh ───────→│ Validates refresh token
   │   { refreshToken: "old" }        │ Rotates: deletes old, creates new
   │ ←── 200 { new tokens } ─────────┤
   │                                  │
   │  (Store BOTH new tokens)         │
   │                                  │
   ├── GET /api/some-resource ───────→│ Retry with new access token
   │   Authorization: Bearer <new>    │
   │ ←── 200 { data } ───────────────┤
```

---

## User States & What They Can Access

| State | Description | Can Access |
|-------|-------------|------------|
| **Unverified** | `isVerified: false` | Login, browse shops (`GET /api/shops/*`), verify email, resend OTP |
| **Verified, no phone** | `isVerified: true`, `phoneNumber: null` (OAuth users) | Above + view profile, update profile |
| **Fully complete** | `isVerified: true`, `phoneNumber` set | Everything: bookings, wallet, coupons, shop management |

**Frontend should check after login:**
```javascript
const { user } = loginResponse.data;

if (!user.isVerified) {
  redirectTo('/verify-email');
} else if (!user.phoneNumber) {
  redirectTo('/complete-profile');
} else {
  redirectTo('/dashboard');
}
```

---

## All Auth Endpoints — Quick Reference

| Method | Endpoint | Auth Required | Purpose |
|--------|----------|---------------|---------|
| `POST` | `/api/auth/register` | ❌ | Create account |
| `POST` | `/api/auth/verify-email` | ❌ | Verify with OTP |
| `POST` | `/api/auth/resend-verification` | ❌ | Resend OTP |
| `POST` | `/api/auth/login` | ❌ | Get tokens |
| `POST` | `/api/auth/refresh` | ❌ | Refresh tokens |
| `POST` | `/api/auth/logout` | ❌ | Invalidate refresh token |
| `POST` | `/api/auth/forgot-password` | ❌ | Request reset code |
| `POST` | `/api/auth/reset-password` | ❌ | Reset with code |
| `GET` | `/api/auth/google?role=x` | ❌ | Start Google OAuth |
| `GET` | `/api/auth/google/callback` | ❌ | Google callback (don't call directly) |

---

## HTTP Status Codes Used

| Code | Meaning | When |
|------|---------|------|
| 200 | Success | Successful operation |
| 201 | Created | Registration successful |
| 302 | Redirect | Google OAuth redirects |
| 400 | Bad Request | Validation failed (check `errors` array) |
| 401 | Unauthorized | Invalid credentials, expired token, invalid OTP |
| 404 | Not Found | Email not registered |
| 409 | Conflict | Email already registered, already verified |
| 429 | Too Many Requests | Rate limited (OTP resend, forgot password) |
| 500 | Internal Server Error | Server bug (report to backend team) |
```

---

**Step 4D complete.** Full auth API documentation created.

## Step 4 Complete — Summary

| What was built | Details |
|---|---|
| **Google OAuth utility** | State generation (signed JWT with CSRF nonce), auth URL builder, Google token exchange |
| **OAuth service** | New user creation, returning user login, account linking (email/password ↔ Google) |
| **OAuth routes** | `GET /google` (initiate), `GET /google/callback` (handle callback + redirect to frontend) |
| **28 OAuth tests** | New users, returning users, account linking, errors, cross-flow interactions |
| **Full API docs** | 10 endpoints documented with request/response examples, flows, error codes, frontend integration guide |

**Total test count: 102 tests passing** (6 health + 20 schema + 48 auth + 28 oauth)

**Steps 3 + 4 (Auth module) is fully tested and stable. Ready to proceed to Step 5 (Middleware layer)?**
