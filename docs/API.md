## `docs/API.md`

# Hazam — Complete API Documentation

Base URL: `http://localhost:3000/api`

All requests and responses use `Content-Type: application/json` unless noted.

---

## Table of Contents

1. [Response Format](#response-format)
2. [Authentication](#authentication)
3. [Auth Endpoints](#auth-endpoints)
4. [Profile Endpoints](#profile-endpoints)
5. [Wallet Endpoints](#wallet-endpoints)
6. [Shop Management (Barber)](#shop-management-barber)
7. [Discovery (Public)](#discovery-public)
8. [Bookings (Customer)](#bookings-customer)
9. [Bookings (Barber)](#bookings-barber)
10. [Reviews](#reviews)
11. [Admin](#admin)
12. [Error Codes](#error-codes)
13. [User States & Access Control](#user-states--access-control)
14. [Complete Flow Diagrams](#complete-flow-diagrams)

---

## Response Format

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

`errors` array only present for validation errors (400).

---

## Authentication

### Token Usage

After login, you receive two tokens:

- **Access Token** — expires in 15 minutes
  ```
  Authorization: Bearer <accessToken>
  ```
- **Refresh Token** — expires in 7 days. Used to get new access token.

### Token Refresh Flow
```
1. API call returns 401 (access token expired)
2. Call POST /api/auth/refresh with stored refresh token
3. Store BOTH new accessToken AND new refreshToken
4. Retry original request with new access token
5. If refresh also returns 401 → redirect to login page
```

### Phone Number Format
Nepal format required: `+977-XXXXXXXXXX` (10 digits after prefix)

---

## Auth Endpoints

### POST /api/auth/register

Creates a new account. Sends 6-digit OTP to email.

**Rate Limit:** 200 req / 15 min (global)

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| fullName | string | ✅ | 2–255 chars |
| email | string | ✅ | Valid email |
| password | string | ✅ | 8–128 chars |
| phoneNumber | string | ✅ | +977-XXXXXXXXXX |
| role | string | ✅ | "customer" or "barber" |

**Request:**
```json
{
  "fullName": "Ram Bahadur",
  "email": "ram@example.com",
  "password": "mypassword123",
  "phoneNumber": "+977-9812345678",
  "role": "customer"
}
```

**Success (201):**
```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "data": {
    "id": "uuid",
    "fullName": "Ram Bahadur",
    "email": "ram@example.com",
    "phoneNumber": "+977-9812345678",
    "role": "customer",
    "isVerified": false,
    "createdAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | Validation failed |
| 409 | Email is already registered |

---

### POST /api/auth/verify-email

Verify account with 6-digit OTP from email.

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| email | string | ✅ | Registered email |
| code | string | ✅ | Exactly 6 digits |

**Request:**
```json
{
  "email": "ram@example.com",
  "code": "482910"
}
```

**Success (200):**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": { "message": "Email verified successfully" }
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | Validation failed |
| 401 | Invalid or expired verification code |
| 404 | No account found with this email |
| 409 | Email is already verified |

---

### POST /api/auth/resend-verification

Resend verification OTP. Rate limited to 3 per 15 minutes.

**Body:**
| Field | Type | Required |
|-------|------|----------|
| email | string | ✅ |

**Success (200):**
```json
{
  "success": true,
  "message": "Verification code sent",
  "data": { "message": "Verification code sent" }
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 404 | No account found with this email |
| 409 | Email is already verified |
| 429 | Maximum 3 verification attempts per 15 minutes |

---

### POST /api/auth/login

Login with email + password. Returns tokens.

**Rate Limit:** 10 attempts / 15 min per IP+email

**Body:**
| Field | Type | Required |
|-------|------|----------|
| email | string | ✅ |
| password | string | ✅ |

**Request:**
```json
{
  "email": "ram@example.com",
  "password": "mypassword123"
}
```

**Success (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "fullName": "Ram Bahadur",
      "email": "ram@example.com",
      "phoneNumber": "+977-9812345678",
      "role": "customer",
      "isVerified": true
    },
    "accessToken": "eyJhbGci...",
    "refreshToken": "a1b2c3d4..."
  }
}
```

**Important:**
- Login works even if `isVerified: false` — frontend should check and show verification prompt
- Email is case-insensitive

**Errors:**
| Status | Message |
|--------|---------|
| 400 | Validation failed |
| 401 | Invalid email or password |
| 401 | This account uses Google sign-in |
| 429 | Too many login attempts |

---

### POST /api/auth/refresh

Get new tokens using refresh token. Old refresh token is invalidated (rotation).

**Body:**
| Field | Type | Required |
|-------|------|----------|
| refreshToken | string | ✅ |

**Success (200):**
```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "user": { ... },
    "accessToken": "new-access-token",
    "refreshToken": "new-refresh-token"
  }
}
```

**⚠️ CRITICAL:** Store the NEW refresh token. Old one is permanently invalid.

**Errors:**
| Status | Message |
|--------|---------|
| 401 | Invalid refresh token |
| 401 | Refresh token has expired |

---

### POST /api/auth/logout

Invalidates refresh token.

**Body:**
| Field | Type | Required |
|-------|------|----------|
| refreshToken | string | ✅ |

**Success (200):**
```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": { "message": "Logged out successfully" }
}
```

**Frontend action:** Clear both tokens, redirect to login.

---

### POST /api/auth/forgot-password

Sends 6-digit reset code to email. Always returns success (anti-enumeration).

**Rate Limit:** 5 attempts / 15 min

**Body:**
| Field | Type | Required |
|-------|------|----------|
| email | string | ✅ |

**Success (200) — ALWAYS returned:**
```json
{
  "success": true,
  "message": "If an account exists with this email, a reset code has been sent",
  "data": { "message": "If an account exists with this email, a reset code has been sent" }
}
```

---

### POST /api/auth/reset-password

Reset password with OTP. Logs out all sessions.

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| email | string | ✅ | |
| code | string | ✅ | 6 digits |
| newPassword | string | ✅ | 8–128 chars |

**Success (200):**
```json
{
  "success": true,
  "message": "Password reset successfully. Please log in with your new password.",
  "data": { "message": "Password reset successfully. Please log in with your new password." }
}
```

**After success:** All refresh tokens invalidated. User must login again.

---

### GET /api/auth/google?role=customer|barber

Redirects to Google OAuth consent screen.

**Query Params:**
| Param | Required | Values |
|-------|----------|--------|
| role | ✅ | "customer" or "barber" |

**Usage (browser redirect, NOT fetch):**
```javascript
window.location.href = 'http://localhost:3000/api/auth/google?role=customer';
```

**Response:** `302 Redirect` to Google

---

### GET /api/auth/google/callback

Called by Google automatically. Redirects to frontend.

**Success redirect:**
```
{FRONTEND_URL}/auth/oauth-callback?accessToken=xxx&refreshToken=xxx&isNewUser=true
```

**Error redirect:**
```
{FRONTEND_URL}/auth/oauth-callback?error=Error+message
```

**Frontend handler:**
```javascript
const params = new URLSearchParams(window.location.search);
const error = params.get('error');
if (error) { showError(error); return; }

storeTokens(params.get('accessToken'), params.get('refreshToken'));
window.history.replaceState({}, '', '/auth/oauth-callback');

if (params.get('isNewUser') === 'true') {
  redirect('/complete-profile'); // Add phone number
} else {
  redirect('/dashboard');
}
```

---

## Profile Endpoints

### GET /api/profile

Get own profile.

**Auth:** `Bearer <accessToken>` (any role, any verification status)

**Success (200):**
```json
{
  "success": true,
  "message": "Profile retrieved",
  "data": {
    "id": "uuid",
    "fullName": "Ram Bahadur",
    "email": "ram@example.com",
    "phoneNumber": "+977-9812345678",
    "role": "customer",
    "isVerified": true,
    "googleId": false,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

Note: `googleId` is boolean — `true` if Google account linked, `false` otherwise.

---

### PATCH /api/profile

Update name and/or phone number.

**Auth:** `Bearer <accessToken>` (any role)

**Body (at least one required):**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| fullName | string | ❌ | 2–255 chars |
| phoneNumber | string | ❌ | +977-XXXXXXXXXX |

**Success (200):**
```json
{
  "success": true,
  "message": "Profile updated",
  "data": {
    "id": "uuid",
    "fullName": "Updated Name",
    "email": "ram@example.com",
    "phoneNumber": "+977-9899999999",
    "role": "customer",
    "isVerified": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### PATCH /api/profile/change-password

Change password for email/password users.

**Auth:** `Bearer <accessToken>` (any role)

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| currentPassword | string | ✅ | |
| newPassword | string | ✅ | 8–128 chars |

**Errors:**
| Status | Message |
|--------|---------|
| 401 | Current password is incorrect |
| 403 | This account uses Google sign-in |
| 403 | New password must be different |

---

## Wallet Endpoints

### GET /api/wallet/balance

Get wallet balance.

**Auth:** Verified user (any role)

**Success (200):**
```json
{
  "success": true,
  "message": "Wallet balance retrieved",
  "data": {
    "id": "uuid",
    "balance": "1500.00",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### GET /api/wallet/transactions

Get transaction history.

**Auth:** Verified user (any role)

**Query Params:**
| Param | Type | Default | Values |
|-------|------|---------|--------|
| page | number | 1 | ≥ 1 |
| limit | number | 10 | 1–50 |
| type | string | all | "credit" or "debit" |

**Success (200):**
```json
{
  "success": true,
  "message": "Wallet transactions retrieved",
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "type": "credit",
        "amount": "100.00",
        "description": "Coupon redemption HAZ-ABCD-EFGH",
        "referenceId": "coupon-uuid",
        "balanceBefore": "0.00",
        "balanceAfter": "100.00",
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 5,
      "totalPages": 1
    }
  }
}
```

---

### POST /api/wallet/redeem-coupon

Redeem a coupon to add balance.

**Auth:** Verified customer with complete profile
**Rate Limit:** 5 attempts / 15 min

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| code | string | ✅ | e.g. "HAZ-ABCD-EFGH" (case-insensitive) |

**Success (200):**
```json
{
  "success": true,
  "message": "Coupon redeemed successfully",
  "data": {
    "couponCode": "HAZ-ABCD-EFGH",
    "denomination": 100,
    "creditedAmount": "100.00",
    "newBalance": "1600.00"
  }
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 404 | Coupon not found |
| 409 | Coupon has already been redeemed |

---

## Shop Management (Barber)

All endpoints require: **Auth + Verified + Complete Profile + Barber Role**

### POST /api/barber/shop

Create shop (one per barber).

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| shopName | string | ✅ | 2–255 chars |
| shopPhoneNumber | string | ✅ | +977-XXXXXXXXXX |
| latitude | number | ✅ | -90 to 90 |
| longitude | number | ✅ | -180 to 180 |
| numberOfBarbers | number | ❌ | 1–50, default 1 |
| workingHours | object | ✅ | All 7 days |

**Working Hours format:**
```json
{
  "workingHours": {
    "monday": { "open": "09:00", "close": "18:00", "isClosed": false },
    "tuesday": { "open": "09:00", "close": "18:00", "isClosed": false },
    "wednesday": { "open": "09:00", "close": "18:00", "isClosed": false },
    "thursday": { "open": "09:00", "close": "18:00", "isClosed": false },
    "friday": { "open": "09:00", "close": "18:00", "isClosed": false },
    "saturday": { "open": "10:00", "close": "16:00", "isClosed": false },
    "sunday": { "open": "00:00", "close": "00:00", "isClosed": true }
  }
}
```

**Success (201):**
```json
{
  "success": true,
  "message": "Shop created successfully",
  "data": {
    "id": "uuid",
    "barberId": "uuid",
    "shopName": "Royal Barber",
    "shopPhoneNumber": "+977-9812345678",
    "latitude": 27.7172,
    "longitude": 85.3240,
    "numberOfBarbers": 2,
    "workingHours": { ... },
    "isActive": true,
    "services": [],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 409 | You already have a shop |

---

### GET /api/barber/shop

Get own shop with services.

---

### PATCH /api/barber/shop

Update shop details. At least one field required.

**Body (all optional):**
| Field | Type | Rules |
|-------|------|-------|
| shopName | string | 2–255 chars |
| shopPhoneNumber | string | +977-XXXXXXXXXX |
| latitude | number | -90 to 90 |
| longitude | number | -180 to 180 |
| numberOfBarbers | number | 1–50 |
| workingHours | object | All 7 days |

---

### PATCH /api/barber/shop/status

Toggle shop active/inactive.

**Body:**
| Field | Type | Required |
|-------|------|----------|
| isActive | boolean | ✅ |

**Success (200):**
```json
{
  "success": true,
  "message": "Shop deactivated",
  "data": {
    "id": "uuid",
    "shopName": "Royal Barber",
    "isActive": false,
    "updatedAt": "..."
  }
}
```

---

### POST /api/barber/shop/services

Add a service.

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| serviceName | string | ✅ | 2–255 chars |
| price | number | ✅ | > 0 |
| durationMinutes | number | ✅ | 5–480 |

**Success (201):**
```json
{
  "success": true,
  "message": "Service added",
  "data": {
    "id": "uuid",
    "shopId": "uuid",
    "serviceName": "Haircut",
    "price": "500.00",
    "durationMinutes": 30,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### PATCH /api/barber/shop/services/:serviceId

Edit a service. At least one field required.

**Body (all optional):**
| Field | Type | Rules |
|-------|------|-------|
| serviceName | string | 2–255 chars |
| price | number | > 0 |
| durationMinutes | number | 5–480 |

---

### DELETE /api/barber/shop/services/:serviceId

Remove a service.

**Success (200):**
```json
{
  "success": true,
  "message": "Service deleted successfully",
  "data": { "message": "Service deleted successfully" }
}
```

---

## Discovery (Public)

No authentication required.

### GET /api/shops/nearby

Find nearby barbershops by GPS coordinates.

**Query Params:**
| Param | Type | Required | Default | Rules |
|-------|------|----------|---------|-------|
| lat | number | ✅ | | -90 to 90 |
| lng | number | ✅ | | -180 to 180 |
| radius | number | ❌ | 5 | 0.1–50 (km) |
| limit | number | ❌ | 10 | 1–50 |
| page | number | ❌ | 1 | ≥ 1 |

**Example:**
```
GET /api/shops/nearby?lat=27.7172&lng=85.3240&radius=5&limit=10&page=1
```

**Success (200):**
```json
{
  "success": true,
  "message": "Nearby shops retrieved",
  "data": {
    "shops": [
      {
        "id": "uuid",
        "shopName": "Royal Barber",
        "shopPhoneNumber": "+977-9812345678",
        "latitude": 27.7150,
        "longitude": 85.3230,
        "numberOfBarbers": 2,
        "workingHours": { ... },
        "distance": 0.25,
        "rating": {
          "average": 4.5,
          "total": 12
        },
        "services": [
          {
            "id": "uuid",
            "serviceName": "Haircut",
            "price": "500.00",
            "durationMinutes": 30
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 3,
      "totalPages": 1
    }
  }
}
```

**Notes:**
- Only returns active shops (`isActive: true`)
- Sorted by distance ascending (nearest first)
- `distance` is in kilometers, rounded to 2 decimal places
- Use shop coordinates to generate Google Maps link: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`

---

### GET /api/shops/:shopId

Get shop details.

**Success (200):**
```json
{
  "success": true,
  "message": "Shop details retrieved",
  "data": {
    "id": "uuid",
    "shopName": "Royal Barber",
    "shopPhoneNumber": "+977-9812345678",
    "latitude": 27.7150,
    "longitude": 85.3230,
    "numberOfBarbers": 2,
    "workingHours": { ... },
    "isActive": true,
    "barber": {
      "id": "uuid",
      "fullName": "Ram Bahadur"
    },
    "rating": {
      "average": 4.5,
      "total": 12
    },
    "services": [ ... ],
    "recentReviews": [
      {
        "id": "uuid",
        "rating": 5,
        "comment": "Great haircut!",
        "createdAt": "..."
      }
    ],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## Bookings (Customer)

All endpoints require: **Auth + Verified + Complete Profile + Customer Role**

### POST /api/bookings

Create a booking.

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| shopId | string | ✅ | Valid UUID |
| serviceId | string | ✅ | Valid UUID |
| appointmentDate | string | ✅ | YYYY-MM-DD, not in the past |
| appointmentTime | string | ✅ | HH:MM 24-hour format |

**Request:**
```json
{
  "shopId": "shop-uuid",
  "serviceId": "service-uuid",
  "appointmentDate": "2025-01-20",
  "appointmentTime": "10:00"
}
```

**Success (201):**
```json
{
  "success": true,
  "message": "Booking created successfully",
  "data": {
    "id": "uuid",
    "customerId": "uuid",
    "shopId": "uuid",
    "serviceId": "uuid",
    "appointmentDate": "2025-01-20",
    "appointmentTime": "10:00:00",
    "endTime": "10:30:00",
    "status": "pending",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Validations performed:**
- Shop must be active
- Service must belong to that shop
- Appointment must be within shop's working hours
- Customer must have sufficient wallet balance
- Time slot must not be fully booked (capacity-based)
- Cannot book your own shop
- Cannot book past time for today

**Errors:**
| Status | Message |
|--------|---------|
| 402 | Insufficient wallet balance |
| 403 | Shop is currently inactive |
| 403 | Shop is closed on [day] |
| 403 | Appointment must be within working hours |
| 403 | Appointment time has already passed for today |
| 403 | You cannot book your own shop |
| 404 | Shop not found |
| 404 | Service not found in this shop |
| 409 | This time slot is fully booked |

---

### GET /api/bookings

List own bookings.

**Query Params:**
| Param | Type | Default | Values |
|-------|------|---------|--------|
| page | number | 1 | ≥ 1 |
| limit | number | 10 | 1–50 |
| status | string | all | pending, confirmed, completed, cancelled |

**Success (200):**
```json
{
  "success": true,
  "message": "Bookings retrieved",
  "data": {
    "bookings": [
      {
        "id": "uuid",
        "appointmentDate": "2025-01-20",
        "appointmentTime": "10:00:00",
        "endTime": "10:30:00",
        "status": "pending",
        "createdAt": "...",
        "updatedAt": "...",
        "shop": {
          "id": "uuid",
          "shopName": "Royal Barber",
          "shopPhoneNumber": "+977-9812345678",
          "latitude": 27.7150,
          "longitude": 85.3230
        },
        "service": {
          "id": "uuid",
          "serviceName": "Haircut",
          "price": "500.00",
          "durationMinutes": 30
        }
      }
    ],
    "pagination": { ... }
  }
}
```

---

### GET /api/bookings/:bookingId

Get booking detail.

**Success includes:** shop info + barber name + service details

---

### DELETE /api/bookings/:bookingId

Cancel own booking. Only pending bookings can be cancelled.

**Errors:**
| Status | Message |
|--------|---------|
| 404 | Booking not found |
| 409 | Cannot cancel... Only pending bookings |

---

## Bookings (Barber)

All endpoints require: **Auth + Verified + Complete Profile + Barber Role**

### GET /api/barber/bookings

List bookings for barber's shop.

**Query Params:**
| Param | Type | Default | Values |
|-------|------|---------|--------|
| page | number | 1 | ≥ 1 |
| limit | number | 10 | 1–50 |
| status | string | all | pending, confirmed, completed, cancelled |
| date | string | all | YYYY-MM-DD |

**Success includes:** customer info (name, email, phone) + service details

---

### PATCH /api/barber/bookings/:bookingId/confirm

Confirm a pending booking. Deducts from customer wallet, credits barber wallet.

**Errors:**
| Status | Message |
|--------|---------|
| 402 | Insufficient wallet balance (customer) |
| 409 | Cannot confirm... Only pending bookings |

---

### PATCH /api/barber/bookings/:bookingId/complete

Mark confirmed booking as completed.

**Errors:**
| Status | Message |
|--------|---------|
| 409 | Cannot complete... Only confirmed bookings |

---

### PATCH /api/barber/bookings/:bookingId/cancel

Cancel a booking. Refunds customer if it was confirmed.

**Errors:**
| Status | Message |
|--------|---------|
| 409 | Cannot cancel... Only pending or confirmed bookings |

---

## Reviews

### POST /api/reviews

Submit a review for a completed booking.

**Auth:** Customer (verified + complete)

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| bookingId | string | ✅ | Valid UUID |
| rating | number | ✅ | 1–5 integer |
| comment | string | ❌ | Max 1000 chars |

**Request:**
```json
{
  "bookingId": "booking-uuid",
  "rating": 5,
  "comment": "Great haircut!"
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 403 | Only completed bookings can be reviewed |
| 404 | Booking not found |
| 409 | Already reviewed this booking |

---

### GET /api/reviews/my

List own reviews.

**Auth:** Customer (verified + complete)

**Query:** `?page=1&limit=10`

---

### PATCH /api/reviews/:reviewId

Edit own review.

**Auth:** Customer (verified + complete)

**Body (at least one):**
| Field | Type | Rules |
|-------|------|-------|
| rating | number | 1–5 |
| comment | string | Max 1000 chars |

---

### DELETE /api/reviews/:reviewId

Delete own review.

**Auth:** Customer (verified + complete)

---

### GET /api/reviews/shop/:shopId

Get shop reviews with rating breakdown. **Public — no auth required.**

**Query:** `?page=1&limit=10`

**Success (200):**
```json
{
  "success": true,
  "message": "Shop reviews retrieved",
  "data": {
    "stats": {
      "averageRating": 4.3,
      "totalReviews": 15,
      "breakdown": {
        "5": 8,
        "4": 3,
        "3": 2,
        "2": 1,
        "1": 1
      }
    },
    "reviews": [
      {
        "id": "uuid",
        "rating": 5,
        "comment": "Best barber in town!",
        "customerName": "Ram Bahadur",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "pagination": { ... }
  }
}
```

---

## Admin

All endpoints require: **Auth + Admin Role**

Admin role is assigned manually in DB. Same login flow as other users.

### POST /api/admin/coupons/generate

Generate a batch of coupons.

**Body:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| denomination | number | ✅ | 50, 100, or 500 |
| quantity | number | ✅ | 1–500 |

**Success (201):**
```json
{
  "success": true,
  "message": "10 coupons generated",
  "data": {
    "denomination": 100,
    "quantity": 10,
    "codes": [
      "HAZ-ABCD-EFGH",
      "HAZ-JKLM-NPQR",
      "..."
    ]
  }
}
```

---

### GET /api/admin/coupons

List coupons with filters.

**Query Params:**
| Param | Type | Default | Values |
|-------|------|---------|--------|
| page | number | 1 | ≥ 1 |
| limit | number | 10 | 1–50 |
| status | string | all | "unused" or "redeemed" |
| denomination | number | all | 50, 100, 500 |

---

### GET /api/admin/users

List all users with role filter.

**Query Params:**
| Param | Type | Default | Values |
|-------|------|---------|--------|
| page | number | 1 | ≥ 1 |
| limit | number | 10 | 1–50 |
| role | string | all | customer, barber, admin |

---

### GET /api/admin/stats

Dashboard statistics.

**Success (200):**
```json
{
  "success": true,
  "message": "Stats retrieved",
  "data": {
    "users": {
      "totalUsers": 150,
      "totalCustomers": 120,
      "totalBarbers": 30
    },
    "bookings": {
      "totalBookings": 500,
      "pendingBookings": 25,
      "confirmedBookings": 50,
      "completedBookings": 400,
      "cancelledBookings": 25
    },
    "coupons": {
      "totalCoupons": 1000,
      "unusedCoupons": 600,
      "redeemedCoupons": 400
    },
    "transactions": {
      "totalCredits": "500000.00",
      "totalDebits": "450000.00"
    }
  }
}
```

---

## Error Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | Success | Successful operation |
| 201 | Created | Resource created |
| 302 | Redirect | Google OAuth |
| 400 | Bad Request | Validation error (check `errors` array) |
| 401 | Unauthorized | Invalid credentials, expired token |
| 402 | Payment Required | Insufficient wallet balance |
| 403 | Forbidden | Wrong role, unverified, incomplete profile |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate, already exists, invalid status transition |
| 429 | Too Many Requests | Rate limited |
| 500 | Internal Server Error | Server bug |

---

## User States & Access Control

| State | Can Access |
|-------|-----------|
| **Not logged in** | Health, discovery (nearby/detail), shop reviews |
| **Logged in, unverified** | Above + profile (get/update), login, refresh, verify |
| **Verified, no phone** | Above + change password |
| **Fully complete** | Everything (bookings, wallet, coupons, shop, reviews) |

**Frontend check after login:**
```javascript
const { user } = loginResponse.data;
if (!user.isVerified) redirect('/verify-email');
else if (!user.phoneNumber) redirect('/complete-profile');
else redirect('/dashboard');
```

---

## Complete Flow Diagrams

### Customer Full Flow
```
Register → Verify Email → Login → Add Coupon to Wallet
→ Browse Nearby Shops → Select Shop → Choose Service
→ Book Appointment → Wait for Barber to Confirm
→ Wallet Debited on Confirm → Attend Appointment
→ Barber Marks Complete → Leave Review
```

### Barber Full Flow
```
Register → Verify Email → Login → Create Shop
→ Add Services → Set Working Hours → Activate Shop
→ Receive Booking Notifications → Confirm/Cancel Bookings
→ Wallet Credited on Confirm → Mark Appointments Complete
```

### Money Flow
```
Admin generates coupons
         ↓
Customer redeems coupon → Wallet credited
         ↓
Customer books service (balance checked, NOT deducted)
         ↓
Barber confirms → Customer wallet debited, Barber wallet credited
         ↓
If barber cancels confirmed booking → Barber debited, Customer refunded
```

---

## All Endpoints — Quick Reference

| # | Method | Endpoint | Auth | Role |
|---|--------|----------|------|------|
| 1 | POST | /api/auth/register | ❌ | — |
| 2 | POST | /api/auth/verify-email | ❌ | — |
| 3 | POST | /api/auth/resend-verification | ❌ | — |
| 4 | POST | /api/auth/login | ❌ | — |
| 5 | POST | /api/auth/refresh | ❌ | — |
| 6 | POST | /api/auth/logout | ❌ | — |
| 7 | POST | /api/auth/forgot-password | ❌ | — |
| 8 | POST | /api/auth/reset-password | ❌ | — |
| 9 | GET | /api/auth/google | ❌ | — |
| 10 | GET | /api/auth/google/callback | ❌ | — |
| 11 | GET | /api/profile | ✅ | Any |
| 12 | PATCH | /api/profile | ✅ | Any |
| 13 | PATCH | /api/profile/change-password | ✅ | Any |
| 14 | GET | /api/wallet/balance | ✅ | Verified |
| 15 | GET | /api/wallet/transactions | ✅ | Verified |
| 16 | POST | /api/wallet/redeem-coupon | ✅ | Customer |
| 17 | POST | /api/barber/shop | ✅ | Barber |
| 18 | GET | /api/barber/shop | ✅ | Barber |
| 19 | PATCH | /api/barber/shop | ✅ | Barber |
| 20 | PATCH | /api/barber/shop/status | ✅ | Barber |
| 21 | POST | /api/barber/shop/services | ✅ | Barber |
| 22 | PATCH | /api/barber/shop/services/:id | ✅ | Barber |
| 23 | DELETE | /api/barber/shop/services/:id | ✅ | Barber |
| 24 | GET | /api/shops/nearby | ❌ | — |
| 25 | GET | /api/shops/:shopId | ❌ | — |
| 26 | POST | /api/bookings | ✅ | Customer |
| 27 | GET | /api/bookings | ✅ | Customer |
| 28 | GET | /api/bookings/:bookingId | ✅ | Customer |
| 29 | DELETE | /api/bookings/:bookingId | ✅ | Customer |
| 30 | GET | /api/barber/bookings | ✅ | Barber |
| 31 | PATCH | /api/barber/bookings/:id/confirm | ✅ | Barber |
| 32 | PATCH | /api/barber/bookings/:id/complete | ✅ | Barber |
| 33 | PATCH | /api/barber/bookings/:id/cancel | ✅ | Barber |
| 34 | POST | /api/reviews | ✅ | Customer |
| 35 | GET | /api/reviews/my | ✅ | Customer |
| 36 | PATCH | /api/reviews/:reviewId | ✅ | Customer |
| 37 | DELETE | /api/reviews/:reviewId | ✅ | Customer |
| 38 | GET | /api/reviews/shop/:shopId | ❌ | — |
| 39 | POST | /api/admin/coupons/generate | ✅ | Admin |
| 40 | GET | /api/admin/coupons | ✅ | Admin |
| 41 | GET | /api/admin/users | ✅ | Admin |
| 42 | GET | /api/admin/stats | ✅ | Admin |

---

## Step 11 Complete — Final Summary

### What was built across all 11 steps:

| Module | Details |
|--------|---------|
| **Project Setup** | TypeScript strict, Zod env validation, PostgreSQL + Drizzle ORM, Pino logger |
| **Database** | 10 tables, 5 enums, full relations, proper indexes, FK cascades |
| **Auth** | Email/password + Google OAuth, OTP verification, token rotation, password reset, rate limiting |
| **Profile** | Get/update profile, change password, OAuth profile completion |
| **Middleware** | requireAuth, requireVerified, requireCompleteProfile, requireRole, validate (body/query/params), rate limiters |
| **Wallet** | Balance tracking, transaction history, coupon redemption with `SELECT FOR UPDATE` |
| **Coupons** | Batch generation, redemption with double-lock, admin listing |
| **Shop** | Create/update/toggle, service CRUD, one shop per barber |
| **Discovery** | Haversine geo-queries with bounding box optimization, KNN sort, rating stats |
| **Bookings** | Duration-aware capacity-based slot check, confirm (atomic debit/credit), cancel (conditional refund), email notifications |
| **Reviews** | Create (completed bookings only), update/delete, public shop reviews with rating breakdown |
| **Admin** | Coupon management, user listing, dashboard stats |
| **Error Handling** | Custom error hierarchy, central handler, standardized responses |
| **Security** | Argon2 passwords, SHA-256 tokens, CSRF state on OAuth, rate limiting, anti-enumeration, `SELECT FOR UPDATE` on all money operations |
| **42 endpoints** | Full REST API coverage |
| **Documentation** | Complete API reference for frontend team |

**The Hazam backend is complete.**
