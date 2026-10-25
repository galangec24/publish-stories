# Payments and access

Readers pay once per story. There are two ways to pay; the first is the main one.

## 1. QR transfer to the author's own GCash or bank account

This is the main flow. It has no fees and needs no payment provider.

1. **Admin setup.** In **Admin → Your QR codes**, the admin uploads each QR image. The browser decodes it with jsQR (`web/src/lib/qrph.js`) and validates its CRC-16 checksum. It then fills in the institution (from the SWIFT/BIC code), the account holder and a masked account number. The decoded text is saved as `PaymentMethod.qr_payload`.
2. **The reader's QR.** At the end of the free chapters, the reader sees the QR with the **story's price embedded**. `withAmount()` rewrites the payload as a dynamic QR Ph code: tag `01` becomes `12`, tag `54` holds the amount, and the checksum is recomputed. The QR is then drawn with the `qrcode` package. If a method has no saved payload, the reader's browser decodes the uploaded image itself.
   - Banking apps decide what to do with the amount. Some fill it in; others (for example BDO) only show it greyed out as a hint. The card tells readers to type it in that case.
3. **Submitting.** The reader taps **I've paid**, attaches the receipt screenshot (required) and types the reference number. `POST /api/payments/manual/` then:
   - checks the reference format and refuses a reference already used on a paid or pending purchase;
   - re-encodes the screenshot to WebP (which drops its metadata) and stores it in `PaymentProof`;
   - creates the purchase with status **`paid`** straight away, so the story unlocks now and is checked later;
   - creates an access code (`ABCD-EFGH`, without look-alike characters) and an access grant for this device and network;
   - notifies the admins, and emails the reader their access code if they gave an email.
4. **Checking.** In **Admin → QR payments**, each payment sits under *To check*, with its receipt (admin-only endpoint), the story and its price.
   - **Confirm received** sets `reviewed_at`.
   - **Revoke** sets the status to `rejected`. That locks the story again and makes the access code stop working. **Restore access** undoes a revoke.

Personal GCash and bank accounts cannot notify the website when money arrives. "Unlock now, check later" is therefore a deliberate trade-off: readers don't wait, and fake references last only until they are revoked.

## 2. PayMongo hosted checkout (optional, off by default)

`POST /api/subscribe/<story_id>/` creates a PayMongo checkout session (QR Ph). The reader pays on PayMongo's page and comes back to `/stories/<slug>?payment=success`. The webhook `checkout_session.payment.paid` then marks the purchase paid, and the page re-checks a few times. This works for guests too, through the same device grants.

- Readers only see it when both `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` are set.
- In **test mode** (an `sk_test_` key), only admins can use it, because test checkouts let anyone fake a payment. Admin → Your QR codes has a **Try a test payment** button for this.
- Live or test mode follows the key prefix, so `PAYMONGO_LIVE_MODE` is not needed.
- The money goes to whoever owns the PayMongo account, not to the uploaded QR codes. That account should be in the author's name.

## Who can read a paid story

`payments/access.py → has_full_access(request, story)` grants access if **any** of these is true:

1. The story is free (price 0, or in a public column), or the reader is an admin.
2. A **paid** purchase belongs to the signed-in account.
3. This **device** has an access grant for a paid purchase. The device is the browser's random `X-Viewer-Id`, stored as a hash.
4. Another device with a grant was used on **this same network** within `ACCESS_NETWORK_DAYS` (30 days), and the purchase has room for one more device (`ACCESS_MAX_DEVICES`, 5). This device then gets its own grant.
   - The network is the public IPv4 address or the IPv6 `/64`, stored as a hash. Local and private addresses never count.
   - A grant keeps the network it was unlocked on. Using the phone at a café doesn't move the purchase's network there.
   - The device cap matters because Philippine mobile data uses carrier-grade NAT, so many strangers share one public IP.
5. An **access code** was claimed on this device (`POST /api/access/claim/`), within the same device cap. If the reader is signed in and the purchase has no account yet, the purchase is attached to their account.

The **price locks** once a story has a paid purchase or a pending QR transfer. The admin can change the price at publish time until then.

## Readers' view: My purchases

`GET /api/my-purchases/` lists the reader's purchases, by account or by this device's grants. Each one shows a state:

- **Successful:** the payment is paid.
- **In progress:** a checkout is still open.
- **Failed:** a QR transfer was revoked, or a PayMongo checkout was abandoned for over an hour.

Each state comes with a short reason, and the access code is shown for successful purchases.

## Sales report

`GET /api/admin/sales/?period=day|week|month|year&from=&to=&story=1,2` (admin only) sums paid purchases by `paid_at`, in the Asia/Manila timezone.

- Revoked payments are reported separately and not counted.
- Unconfirmed QR payments are counted, and also shown as "not yet checked".
- The page fills empty periods with zero, draws one bar series, and offers a table view and CSV export.
