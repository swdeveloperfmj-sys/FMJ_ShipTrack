# FMJ ShipTrack

Shipment and import management workspace with a React dashboard and an Express API.

## Start the application

Use two terminals from the project folders:

```powershell
cd Backend
npm install
npm run dev
```

```powershell
cd Frontend
npm install
npm run dev
```

Open the Vite URL shown in the Frontend terminal (usually `http://localhost:5173`).
The API runs at `http://localhost:4000`.

## MongoDB setup (MongoDB Atlas)

1. Sign in to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and create a free cluster.
2. In **Security → Database Access**, add a database user and save its username and password.
   This database user is separate from your Atlas website login.
3. In **Security → Network Access**, add your current IP address. Avoid allowing access from
   every IP (`0.0.0.0/0`) for a normal setup.
4. In the cluster, choose **Connect → Drivers → Node.js** and copy the connection string.
5. Open `Backend/.env`. Replace the local `MONGODB_URI` value with the copied connection
   string, replace `<password>` with the database user's password, and add the database
   name `fmj_shiptrack` after the host. Keep the query options at the end, for example:

   ```env
   MONGODB_URI=mongodb+srv://shiptrack_user:YOUR_PASSWORD@cluster0.example.mongodb.net/fmj_shiptrack?retryWrites=true&w=majority
   ```

   If the password contains characters such as `@`, `#`, `/` or `:`, URL-encode those
   characters before putting the password in the URI. Keep `.env` private; do not commit it.
6. Start the backend with `npm run dev`. MongoDB creates the `fmj_shiptrack` database and
   `shipments` collection automatically when the app first writes shipment records.
7. Open `http://localhost:4000/api/health`; the response should include
   `"database":"connected"`. Then start the frontend.

`Backend/.env.example` is an Atlas connection-string template. For a local MongoDB server,
the default `MONGODB_URI=mongodb://127.0.0.1:27017/fmj_shiptrack` in `Backend/.env` can be
used instead. `Frontend/.env` sets the API URL used by the browser.

## Super-admin sign-in and email OTP

The app has no demo username or password. On first launch, it shows a one-time setup
page for creating your own super-admin username and password. Shipment APIs remain
locked until the email verification code is confirmed. After setup, the public setup
endpoint is permanently disabled by the database's single-admin record.

1. In `Backend/.env`, keep your existing MongoDB settings and add the authentication
   and SMTP settings shown in `Backend/.env.example`.
2. Generate two different random secrets in PowerShell:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Run it twice. Use the first result for `AUTH_TOKEN_SECRET` and the second for
   `SUPER_ADMIN_SETUP_KEY`. Keep both secret and do not commit or share them.
3. Enable two-step verification on the Google account `sw.developer.fmj@gmail.com`,
   then create a Google **App Password** for SMTP. Put it in `SMTP_PASS` (remove spaces
   if Google displays them). Do not use your normal Google account password.
   `SMTP_USER` and `SMTP_FROM` should use that same Google account. The app sends login
   codes only to `sw.developer.fmj@gmail.com`.
4. Restart the backend, open the frontend, and create the initial admin with your own
   username, a password of at least 12 characters, and the setup key from step 2.
   The setup key is required only for this initial account creation. Then enter the
   emailed 6-digit code to sign in.

The backend stores the admin password as a bcrypt hash, expires codes after five
minutes, limits verification attempts, and uses an HTTP-only session cookie. Use
**Sign out** when finished. If email delivery fails, check SMTP settings and the
backend terminal; no code is displayed in the browser or server logs.

If you have already created a super-admin account, the setup page will not appear
again. Do not delete the admin record from MongoDB unless you intentionally want to
re-enable initial setup.

The frontend displays shipment records returned by MongoDB through the backend API.
The backend does not add demo or seed shipments. If the database is empty, the
dashboard shows an empty state and lets you add your actual shipment records. Existing
records already stored in MongoDB are left unchanged.

Create consignee records from **Consignees → Create consignee** before assigning them
to new shipments. Each consignee has a unique code, name, assigned color and optional
contact details. Choose a preset or custom color when creating or editing a consignee;
the color is saved with that consignee and appears in its directory, shipment labels and
reports. Consignee codes already used by shipment records cannot be renamed or deleted
until those shipments are reassigned.

Manage country records and currencies separately in their own sections on the
**Countries** page. Both can be created, edited and deleted. Currency codes are
three-letter codes (for example USD, AED or RMB); a currency assigned to a shipment
cannot be deleted or have its code changed.

The workspace navigation includes the dashboard, consignee reports and directory,
country management, documents, delay/cost analytics, and **To be TT**. The To be TT page
lists shipments with Pending payment status, regardless of the selected payment terms; add shipments
there or use a shipment's row actions to edit or delete its record. Shipment table rows
do not open a detail popup when clicked. The dashboard provides a
recent-shipment overview; the former standalone shipment register, tracking, payment,
and customs pages are not included in the navigation. The consignee selector includes
FMJ, JD, RL, AOP and UB; the shipment's recipient name is recorded separately.

The **SHIPMENT** report presents shipments in sections matching the shipment workbook:
**Under Clearing Shipment**, **TT SENT**, and **To be TT**. Each section retains the
existing web-app shipment table columns.

Shipment payment terms support Letter of Credit (Sight or Usance, with days for Usance),
100% Advance Payment by TT, DA from BL date (30/60/90/120 days), DP of Sight, and Open
Account (30/45/60/90/120 days). Shipment value currency can be selected as USD, AED or RMB.

The app does not provide password recovery or additional admin accounts. Secure the
deployment and email account before exposing it to a public network.
