# Pass 3 — Handhold Tool Sweep (user required)

**Driver:** Claude prepares the flow, **user** enters credentials / 2FA.
**Model under test:** `claude-haiku-4-5`
**Why these need you:** real OAuth consent + 2FA on Google/Slack/Microsoft side. agent-browser can drive clicks but cannot type your real password or approve a push notification.

Run **after** the autonomous checklist completes. I'll ping you per item.

---

## H1 — T36 createConnection (Google Drive)

**My prep (autonomous):**
- [ ] Open chat, prompt: "Connect my Google Drive."
- [ ] agent-browser drives the OAuth handoff up to the Google account-chooser screen.
- [ ] Screenshot the consent page → /tmp/sunder-qa/pass3/handhold-T36-consent.png
- [ ] **Ping user.**

**Your turn:**
- [ ] Pick the Google account you want connected.
- [ ] Enter password.
- [ ] Approve 2FA prompt on your phone.
- [ ] Click "Allow" on the Composio scopes screen.
- [ ] Tell me "done."

**My finish (autonomous):**
- [ ] Wait for redirect back to Sunder.
- [ ] Re-run T31 listConnections → expect Google Drive present.
- [ ] Mark T36 ✅.

---

## H2 — T35 executeComposioTool *(blocked on H1)*

**My prep:**
- [ ] Confirm H1 lands a live Google Drive connection.
- [ ] Prompt: "Using Composio, list the 5 most recent files in my Google Drive."

**Expected:** tool card returns a real file list from your account.

**Your turn:**
- [ ] Eyeball the file list — do these match real files in your Drive? (yes/no)

**My finish:**
- [ ] If yes, mark T35 ✅. If no, capture the response and mark `fail`.

---

## H3 — T37 reauthorizeConnection *(blocked on H1)*

**My prep:**
- [ ] In Composio dashboard or via tool, expire/invalidate the H1 connection (or wait if token already stale).
- [ ] Prompt: "Reauthorize my Google Drive connection."
- [ ] agent-browser drives back to the Google consent screen.
- [ ] **Ping user.**

**Your turn:**
- [ ] Re-approve on Google (same steps as H1).
- [ ] Tell me "done."

**My finish:**
- [ ] Verify T31 shows connection active again.
- [ ] Mark T37 ✅.

---

## Optional spillover (only if Block C in autonomous list deferred items)

- [ ] **T34 manageActivatedTools** — if no pre-existing connection, run after H1 lands.
- [ ] **T38 deleteConnection** — run last, deletes the H1 test connection to leave the account clean.

---

## Tally

H1: 0/1
H2: 0/1
H3: 0/1
**Total handhold: 0/3** (+ up to 2 spillover)

## Total Pass-3 coverage when both lists complete

Autonomous 12 + Handhold 3 = **15/16 of T28–T43**
(T42 requestApproval lives in the regression sweep, not here.)
