# Front-end contract

These are the real Document Centre files, unedited. They are the agreed
vocabulary between the screens and the engine.

| File | What to do with it |
| --- | --- |
| `types.ts` | The order/job/payment/status types. Take wholesale; delete the print-specific spec types at the bottom. |
| `status-maps.ts` | Labels and colours for every status. Take wholesale — this is what keeps admin and customer views consistent. |
| `queries.ts` | Read paths: admin list, customer list, order detail. Note the shape of the joins; copy it. |
| `mutations.ts` | Every write, as a call into the `order-engine` function. This is the file that enforces "the browser never writes rows". |
| `editability.ts` | Which fields a customer may still change, by status. Small and worth keeping. |
| `invoiceRenderer.ts` | Thin wrapper; replace with GASA's invoice layout. |

## How the screens use it

- List pages call `fetchAdminOrders` / `fetchCustomerOrders` with filters and
  render badges from `status-maps.ts`.
- Detail pages call `fetchOrderDetail` and render jobs from
  `order_jobs.product_snapshot` — **not** from the live catalogue.
- Every action button calls a function in `mutations.ts`, which invokes the
  engine and then invalidates the react-query keys. Nothing writes directly.

## Things to strip for GASA

Anything named for print: page counts, binding, imposition, preflight, paper,
proofs of PDFs. Mockup approval survives; PDF preflight does not.
