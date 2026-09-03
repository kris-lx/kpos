# KPOS UI flow test cases

The browser suite is split into two categories so an expected denial is not
reported as a product failure.

## Allowed cases

| ID | Actor | Flow | Expected result |
| --- | --- | --- | --- |
| A-01 | Store Owner | Login with valid credentials | Lands on POS |
| A-02 | Store Owner | Open inventory | Inventory stats render regardless of Lao locale |
| A-03 | Store Owner | Create and delete a customer member | Record is created, then removed from the list |
| A-04 | Store Owner | Create and delete a product | Record is created, then removed from the list |
| A-05 | Store Owner | Add product, exact cash, confirm payment | Sale completes and cart resets |
| A-06 | Store Owner | Open reports/settings/inventory pages | Page loads without route denial |

## Denied cases

| ID | Actor | Attempt | Expected result |
| --- | --- | --- | --- |
| D-01 | Unauthenticated user | Open `/pos` | Redirects to `/login` |
| D-02 | Any user | Login with an invalid password | Remains on `/login` |
| D-03 | Restricted Staff | Open `/products` without `products:view` | Redirects to `/dashboard`; no add-product action |
| D-04 | Restricted Staff | Open `/customers/members` without `customers:view` | Redirects to `/dashboard`; no add-member action |

Restricted Staff cases require `E2E_RESTRICTED_EMAIL` and
`E2E_RESTRICTED_PASSWORD` from `qa-seed-restricted.ts`. They are skipped when
the restricted fixture is not supplied, instead of silently testing with the
Store Owner account.

## Not valid as UI assertions

- English text matching for Lao pages.
- Mojibake-encoded Lao regular expressions.
- Selecting the last icon button in a card.
- Assuming a table row when the default view is a product card grid.

The suite uses stable `data-testid` hooks for these controls and keeps the
authorization boundary test separate from normal CRUD tests.
