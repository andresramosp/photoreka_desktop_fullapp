# Stripe Products

Stripe is the source of truth for one-time payment products. The backend reads active one-time Prices from Stripe, expands each Product, and exposes configured items through `GET /api/payments/packages`.

## Required metadata

Add these metadata keys to each Stripe Product. Price metadata may override Product metadata if needed.

### Photo analysis package

```txt
photoreka_type=photo_package
photos=500
analyzed_photos=500
credits=1000
sort_order=10
highlighted=true
```

`analyzed_photos`, `credits`, `sort_order`, and `highlighted` are optional. If `analyzed_photos` is omitted, it defaults to `photos`; if `credits` is omitted, it defaults to `0`.

### AI credits package

```txt
photoreka_type=credits
credits=1500
description=~1 month of moderate chat & search
sort_order=20
```

`description` and `sort_order` are optional. If `description` is omitted, the backend uses the Stripe Product description.

## Optional metadata

```txt
photoreka_id=starter
```

Use `photoreka_id` only if you want a stable friendly ID in API responses. Checkout always uses Stripe's Price ID.

## Notes

- Products and Prices must be active.
- Prices must be one-time Prices.
- The backend only exposes Prices whose currency matches `STRIPE_CATALOG_CURRENCY` (`eur` by default).
- After a successful Checkout, the granted photos and credits are stored in `payments` so webhooks and refunds stay idempotent even if the Stripe Product changes later.

## Customer records

On the first checkout for a user, the backend creates a Stripe Customer with the user's email, name, and `photorekaUserId` metadata. The Customer ID is stored in `users.stripe_customer_id`, reused for later Checkout Sessions, and copied into each `payments.stripe_customer_id` row as a payment snapshot.

This keeps all purchases grouped under the same Stripe customer and makes later operations easier: invoice lookup, refunds, payment history, support checks, and a future Billing Portal flow if the app adds subscriptions or saved payment methods.
