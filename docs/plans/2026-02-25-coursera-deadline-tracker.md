# Coursera Deadline Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-user service to track Coursera deadlines, detect changes, and send configurable notifications via a Telegram bot.

**Architecture:** A browser extension captures authentication cookies and sends them to a Cloudflare Worker. The Worker fetches deadlines, compares them against a history stored in D1, and sends notifications via Telegram based on user-defined settings.

**Tech Stack:**

- **Frontend:** Chrome Extension (Manifest V3, JavaScript)
- **Backend:** Cloudflare Workers (JavaScript)
- **Database:** Cloudflare D1 (SQLite)
- **KV Store:** Cloudflare KV
- **Notifications:** Telegram Bot API
- **Scheduling:** Cloudflare Cron Triggers

---

### Task 1: Project Scaffolding & Initial Setup

**Files:**

- Create: `src/`
- Create: `tests/`
- Create: `extension-wxt/`
- Create: `worker/`
- Modify: `.gitignore`

**Step 1: Create project directories**

Run:

```bash
mkdir src tests extension-wxt worker
```

Expected: Directories `src`, `tests`, `extension-wxt`, `worker` are created.

**Step 2: Update .gitignore**

Modify `.gitignore` to include common files to ignore.

```
# .gitignore

# Python
__pycache__/
*.pyc
.env
venv/

# Node.js
node_modules/

# Cloudflare
.wrangler/
```

**Step 3: Commit**

```bash
git add .
git commit -m "chore: set up project structure and gitignore"
```

---

### Task 2: Telegram Bot and Cloudflare Setup (Manual)

**Goal:** Manually set up external services and store credentials.

**Step 1: Create Telegram Bot**

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`.
3. Follow the prompts to name your bot and get the API token.

**Step 2: Create Cloudflare Resources**

1. Go to your Cloudflare dashboard.
2. Create a new Worker.
3. Create a D1 database named `coursera-deadlines`.
4. Create a KV namespace named `COURSERA_COOKIES`.
5. Bind the D1 database and KV namespace to your Worker in `wrangler.toml`.
6. Add the Telegram bot token as a secret to your worker: `npx wrangler secret put TELEGRAM_BOT_TOKEN`.

**Step 3: Commit Placeholder wrangler.toml**

Create `worker/wrangler.toml` with placeholder content.

```toml
# worker/wrangler.toml
name = "coursera-deadline-worker"
main = "src/index.js"
compatibility_date = "2023-10-30"

[[d1_databases]]
binding = "DB"
database_name = "coursera-deadlines"
database_id = "<your-database-id>"

[[kv_namespaces]]
binding = "KV"
id = "<your-kv-id>"
```

```bash
git add worker/wrangler.toml
git commit -m "chore: add placeholder wrangler.toml"
```

---

### Task 3: D1 Database Schema

**Files:**

- Create: `worker/src/schema.js`
- Test: `worker/tests/schema.test.js`

**Step 1: Write the failing test for user table creation**

```javascript
// worker/tests/schema.test.js
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

test("should create users table", async () => {
  const { stdout } = await execAsync(
    "npx wrangler d1 execute coursera-deadlines --command \"SELECT name FROM sqlite_master WHERE type='table' AND name='users'\"",
  );
  expect(stdout).toContain("users");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- worker/tests/schema.test.js`
Expected: FAIL, table 'users' not found.

**Step 3: Write schema and script to apply it**

```javascript
// worker/src/schema.js
export const usersSchema = `
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_chat_id TEXT NOT NULL UNIQUE,
    telegram_username TEXT,
    name TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_fetched_at DATETIME
);`;

// You would typically have a script to run this
// For now, we'll run it manually.
```

Run manually via `npx wrangler`:

```bash
npx wrangler d1 execute coursera-deadlines --command "CREATE TABLE users (id INTEGER PRIMARY KEY, telegram_chat_id TEXT NOT NULL UNIQUE, name TEXT, is_active INTEGER DEFAULT 1, created_at DATETIME, last_fetched_at DATETIME);"
```

**Step 4: Run test to verify it passes**

Run: `npm test -- worker/tests/schema.test.js`
Expected: PASS

**Step 5: Repeat for all tables**

Repeat steps 1-4 for `deadline_history`, `user_settings`, and `fetch_log` tables.

**Step 6: Commit**

```bash
git add worker/src/schema.js worker/tests/schema.test.js
git commit -m "feat: create D1 database schema"
```

---

### Task 4: Browser Extension - Manifest and Popup

**Files:**

- Create: `extension-wxt/manifest.json`
- Create: `extension-wxt/popup.html`
- Create: `extension-wxt/popup.js`
- Create: `extension-wxt/styles.css`

**Step 1: Create the manifest file**

```json
// extension-wxt/manifest.json
{
  "manifest_version": 3,
  "name": "Coursera Deadline Tracker",
  "version": "0.1.0",
  "description": "Capture Coursera cookies to track deadlines.",
  "permissions": ["cookies", "storage", "alarms", "activeTab"],
  "host_permissions": ["https://*.coursera.org/*"],
  "action": {
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

**Step 2: Create the initial popup UI**

```html
<!-- extension-wxt/popup.html -->
<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div id="app">
      <h1>Coursera Deadline Tracker</h1>
      <div id="register-form">
        <input type="text" id="name" placeholder="Your Name" />
        <input type="text" id="telegram-id" placeholder="Telegram Chat ID" />
        <button id="register-btn">Register</button>
      </div>
      <div id="dashboard" class="hidden">
        <p>Status: <span id="status">Not Connected</span></p>
        <button id="connect-btn">Connect to Coursera</button>
      </div>
    </div>
    <script src="popup.js"></script>
  </body>
</html>
```

**Step 3: Add basic UI logic**

```javascript
// extension-wxt/popup.js
document.addEventListener("DOMContentLoaded", () => {
  // ... basic event listeners for buttons ...
});
```

**Step 4: Load extension in Chrome and verify UI**

1. Go to `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `extension-wxt` directory.
4. Verify the popup appears.

**Step 5: Commit**

```bash
git add extension-wxt/
git commit -m "feat(extension): create basic manifest and popup UI"
```

This is a detailed start. I will continue with the remaining tasks for the worker, extension logic, and the final notification system in subsequent steps if you approve.
