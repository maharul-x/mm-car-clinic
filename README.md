# M&M Car Clinic

Cash book, inventory and (soon) salary tracker for M&M Car Clinic.

- **Website:** plain HTML/CSS/JS, hosted on GitHub Pages (no build step).
- **Database:** a Google Sheet. A small Google Apps Script attached to the sheet is the API.

```
Phone / PC browser ──► GitHub Pages (this repo) ──► Apps Script web app ──► Google Sheet tabs
```

## What it does

| Screen | |
|---|---|
| **Daily** | Cash in / cash out / transfers for one day, opening and closing balance, closing balance by account (Cash in hand, Bank, bKash). Print gives the same layout as the old paper ledger. |
| **Monthly** | Totals for the month, expenses and income by category (click a category to see every entry), day-by-day closing, month-end balance per account, CSV download. |
| **Inventory** | Parts and consumables with stock level, low-stock warnings, stock in / out / adjust, history. Stock bought or sold can be recorded in the cash book at the same time. |
| **Salary → Attendance** | Monthly grid of employees × days. Tap a day: P present, A absent, H half day, L paid leave, O off. Weekly off days fill in automatically. |
| **Salary → Salary sheet** | Basic, present/absent days, absence deduction (worked out automatically), advance, net payable, paid, due. Advances and salary payments are recorded in the cash book too. Printable. |
| **Salary → Employees** | Add, edit or remove staff. Untick "track attendance" for investors or anyone paid a fixed amount. |
| **Settings** | Starting balances, payment methods, categories, business details. |

There is one **Transactions** tab instead of one tab per day. Each day's opening balance is worked out
from the starting balances plus everything before it, so nothing has to be linked by hand.

## Sheet tabs (created automatically)

| Tab | Holds |
|---|---|
| `Transactions` | Every cash in / out / transfer: date, type, invoice, description, category, amount, method |
| `Categories` | Category lists for cash in and cash out |
| `Settings` | Starting date, opening balance per account, payment methods, business details |
| `Inventory` | Items: SKU, name, category, unit, cost and sale price, reorder level |
| `StockMoves` | Every stock in / out / adjustment |
| `Employees` | Name, designation, basic salary, joining date, whether attendance is tracked |
| `Attendance` | One row per employee per marked day: date, status (P/A/H/L/O) |
| `SalaryPayments` | Advances and salary payments, which month they belong to, and the linked cash-book entry |

Please don't rename these tabs or their header row. You can read them and filter them freely.

## One-time setup

### 1. Add the script to the Google Sheet
1. Open the Google Sheet → **Extensions → Apps Script**.
2. Delete what's in `Code.gs` and paste in [`apps-script/Code.gs`](apps-script/Code.gs).
3. Click ⚙️ **Project Settings** → set the time zone to **(GMT+06:00) Dhaka**.
4. Save (💾). Go back to the sheet and reload it. A new **M&M App** menu appears.

### 2. Prepare the sheet
1. **M&M App → 1. Set up / repair tabs** (Google will ask you to allow the script the first time).
2. **M&M App → 2. Set app password**: choose a password of at least 8 characters. Everyone using the app signs in with it.
3. *(Optional)* **M&M App → 3. Import old daily sheets**: copies every old "DAILY CASH FLOW LEDGER" tab into
   `Transactions`, sets the opening balances from the first day, and reads the category from the brackets
   in the description, e.g. `LUNCH (FOOD)` → Food. Your old tabs are not changed, and running it again replaces the earlier import.
4. *(Optional)* **M&M App → 4. Import employees from a salary sheet**: paste the salary sheet's link and the month.
   Employees (name, designation, basic salary) are added or updated, and the "Advance Salary Taken" amounts are
   recorded as advances for that month. Designations containing "Invest" are set to not track attendance.

**How the absence deduction works:** one day's pay = basic ÷ 30 (or ÷ days in the month, set in Settings).
Each **A** deducts one day, each **H** half a day. **L** (paid leave), **O** (off) and unmarked working days are not deducted.
Days before an employee's joining date are deducted. Days after today aren't counted until they happen.

### 3. Publish the script as a web app
1. In Apps Script: **Deploy → New deployment → ⚙️ → Web app**.
2. *Execute as:* **Me**. *Who has access:* **Anyone**.
3. **Deploy** and copy the **Web app URL** (ends in `/exec`).

"Anyone" means anyone with the URL can reach the script, but every request is checked against the app
password before any data is read or changed. After 10 wrong passwords it locks for 15 minutes.
The password lives only in the script's properties, never in this repo, so the public code doesn't expose it.

After changing `Code.gs` later: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (the URL stays the same).

### 4. Open the app
Open the GitHub Pages site, paste the Web app URL, enter the password.
To skip pasting the URL on every new device, put it in [`js/config.js`](js/config.js) and push.

## Run locally

```bash
python -m http.server 5500
```

Then open http://localhost:5500. **Try the demo** (shown only on localhost) works without a server, using made-up sample data that stays in that browser.
