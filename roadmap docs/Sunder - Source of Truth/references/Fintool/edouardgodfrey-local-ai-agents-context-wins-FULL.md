# Local AI Agents Will Win. It's All About Context.

**Source:** X Article by @EdouardGodfrey (Fintool, Ex-Apple 9 yrs, Harvard CS)
**Date:** Jan 28, 2026
**Views:** 6,144
**Repo:** https://github.com/edouard-blocktool/local-agent
**Tags:** #local-agents #context #sandboxing #lima-vm #playwright #browser-control #fintool #claude-cowork

---

## The Cursor Moment

I remember the moment I became Cursor-pilled.

On the surface, it did exactly what I was already doing with ChatGPT. Write code with an LLM. Copy code in, get suggestions, paste them back. Cursor seemed like a nicer wrapper around the same workflow.

Then I stopped copy-pasting. And everything changed.

The model wasn't smarter. But it could see my codebase. It stopped asking "what framework are you using?" It stopped hallucinating import paths. The friction vanished - not because the model improved, but because it found its own context.

---

## The Cowork Feeling

At Fintool, we build AI agents for financial research. Our architecture works fine: users upload documents, our agent runs in a remote sandbox with Bash access, results come back. It's robust. It scales.

But when Claude Cowork launched, I felt that Cursor feeling again.

The agent runs locally. It sees your browser - authenticated, with your sessions, your tabs. It sees your entire file system. No more janky MCP connectors to Sharepoint that barely work and can't manage context. No more uploading. No more describing what you're looking at.

**Everything a human can do on their machine, the agent can do.**

That's not the paradigm we have in the cloud. In a cloud sandbox, the agent only sees what you curate - what you copy-paste, drag-drop, upload, describe in your prompt. It can't check your Google Calendar to tell someone you're running five minutes late. It can't pull up that PDF you downloaded last week. It waits for you to provide context instead of finding it.

Then I realized what makes Cowork work for knowledge workers: **it's the sandbox.**

The agent runs in a VM - a full Linux filesystem inside Apple's virtualization framework. It can `rm -rf /` all day. Nothing on your real machine is affected.

---

## The Prototype

```
+-------------------------------------------------------------------------+
|                           HOST (macOS)                                  |
|                                                                         |
|  +----------+       +----------+  <--->  +-------------------+          |
|  |  Client  |       |  Chrome  |         |  Playwright MCP   |          |
|  |   CLI    |       |  Browser |         | (browser control) |          |
|  +----+-----+       +----------+         +---------+---------+          |
|       |                                            |                    |
|       | TCP :9999           ~/Desktop              |                    |
|       |                        |                   |                    |
|  =====|========================|===================|======== mount ==== |
|       |                        |                   |                    |
|       v                        v                   v                    |
|  +------------------------------------------------------------------+   |
|  |                      LIMA VM (Ubuntu)                            |   |
|  |                                                                  |   |
|  |   /mnt/desktop  <--  ~/Desktop    (read-write)                  |   |
|  |   /opt/agent    <--  agent code   (read-only)                   |   |
|  |                                                                  |   |
|  |   +----------------------------------------------------------+  |   |
|  |   |                  Agent Server                            |  |   |
|  |   |            (Claude + Bash/Read/Write)                    |  |   |
|  |   +----------------------------------------------------------+  |   |
|  |                                                                  |   |
|  +------------------------------------------------------------------+   |
|                                                                         |
+-------------------------------------------------------------------------+
```

---

## Three Risks of Local Agents

There are three risks to manage with a local agent:

1. **Destruction** - deleting your files
2. **Exfiltration** - leaking your data
3. **Unintended action** - sending emails you didn't approve

This prototype focuses on the first.

---

## Sandboxing: Default Deny, Explicit Allow

The agent runs in a Lima VM - a lightweight Linux virtual machine on macOS. It has its own filesystem, its own process space. Complete isolation from the host.

But complete isolation defeats the purpose. The agent needs to see something. So controlled mounts:

```
  Mount Configuration
  ===================

  /mnt/desktop  -->  ~/Desktop    (read-write)
  /opt/agent    -->  agent code   (read-only)
```

The agent can read and write files on my Desktop. That's it. Not my Documents folder. Not my SSH keys. Not my browser cookies. Just one folder, explicitly shared.

**This is the core pattern: default deny, explicit allow.**

My filesystem is invisible to the agent. I choose what to expose. The mental model flips from "what can the agent damage?" to "what have I shared with the agent?"

For browser control, the agent connects to Playwright MCP via a Chrome extension. The agent can navigate, click, fill forms - anything you'd do in a browser. This runs on the host, outside the VM, which is a security tradeoff not fully addressed.

That's the whole prototype. VM for filesystem isolation. Playwright for browser. No network filtering, no action approval. Just enough to test the core idea.

---

## What Can It Do?

```bash
./client prompt "Browse Google News and draft me a summary in my Desktop folder"
```

The agent opens Chrome, navigates to Google News, reads the headlines, and writes a markdown file to `/mnt/desktop/news-summary.md` - which appears on your actual Desktop.

This is the Cowork experience in miniature. The agent browses the web as you (authenticated, with your sessions). It writes to your filesystem (through a controlled mount). No copy-pasting. No uploading. Just ask, and it does the work.

**The same pattern scales:**

- Create an Excel model with revenue projections based on this earnings transcript
- Pull AAPL and MSFT stock data using yfinance and create a comparison chart
- Review my Google Calendar for the week - which meetings do I need to prep for?
- Go to my Gmail and summarize any urgent emails from the last 24 hours

Browser plus filesystem covers a surprising amount of knowledge work. No MCP connector needed for Gmail - the browser just works. No special integration for Excel - the agent installs `openpyxl` and writes the file.

---

## What's Next

The prototype works, but it's minimal. Four areas to build out:

### 1. Dynamic Mounts
Right now, mounts are fixed at VM startup. If you want to share a new folder mid-session, you restart the VM. That's not how real work flows. You're in a conversation, the agent needs access to something, you want to say "here, look at this folder" without breaking context. **Hot-mounting is essential.**

### 2. Artifacts
The agent creates files inside the sandbox. Getting them out is clunky - you have to know where they landed and copy them manually. Need a cleaner pattern where artifacts the agent produces surface automatically to the user. Cowork does this well with its artifact panel.

### 3. Network Proxy
The prototype handles destruction (filesystem isolation) but not exfiltration. The agent has unrestricted internet access. It could post your files anywhere. A proxy layer would help - route all traffic through it, log what's being sent, maybe allowlist specific domains. This also helps with prompt injection: you can inspect what the agent is receiving from the web.

### 4. Desktop Control
This is the nuclear option. Right now the agent controls Chrome through Playwright. But what about apps that don't run in a browser? Slack desktop, Excel native, Figma, your IDE. One answer is VNC - let the agent see and control the full desktop via screen sharing. Everything a human can do, the agent can do. **This is dangerous. It's also the endgame for true automation.** Cowork doesn't do this yet. But someone will.

---

## Why This Matters

**Local agents will win. Context wins, and context lives locally.**

Think about all the integrations that will never exist:
- No MCP connector for your company's obscure HR portal
- No one's building one for that legacy financial research system
- Salesforce has an API, but your compliance tool doesn't
- The long tail of enterprise software will never be covered

**But the browser just works.** The agent logs in the same way you do. It clicks through the same UI. The integration problem disappears - the agent uses the same interface you use.

**And your filesystem has everything.** Most enterprises are only just thinking about migrating to the cloud - so a Sharepoint connector, cool, but what about the years of spreadsheets sitting on local drives? The presentations. The documents. The PDFs you downloaded and forgot about. It's all there, accessible - if the agent can see it.

**That's the last mile of context.** Not what you remembered to upload. Not what you copy-pasted into a prompt. Everything.

This is why the runtime is moving local. Not for performance. Not for cost. Not even for privacy - though that matters a lot in enterprise. **For context.**

---

## Notable Comments

- **@embeddingshapes:** "The diagram says 'Claude' and references Anthropic/Claude Code. Is this ultimately just running CC in that VM? I'm not sure this is 'local' as typically understood."
- **@EdouardGodfrey (reply):** "Fair point. 'Local' means the harness, not the LLM. But you could swap in a local model and it would work the same."
- **@geoffprr:** "I can easily imagine how to implement this in a small size company, but for a mid-large size company it would be very complicated to do it today no? Seems like we would need a solution to do this at scale."
- **@maxvsnv:** "Navigating the obscure HR portal in a browser might be AGI's final frontier. People with years of tenure still rarely know how to do a basic thing there."

---

## Key Takeaways

- **Context > Intelligence:** The model doesn't need to be smarter; it needs to see more. The Cursor moment = friction vanishes when context is available natively
- **Local runtime for context:** Cloud sandboxes only see what you curate; local agents see everything (filesystem + authenticated browser)
- **Sandbox pattern:** Default deny, explicit allow. Lima VM for filesystem isolation, controlled mounts for selective access
- **Browser as universal integration:** No MCP connector needed. The browser works for Gmail, Calendar, HR portals, legacy systems - anything with a web UI
- **Three risks:** Destruction (solved via VM), exfiltration (needs network proxy), unintended action (needs approval layer)
- **The endgame:** Desktop control via VNC. Every app, not just browser. Dangerous but inevitable
- **Enterprise angle:** The long tail of enterprise software will never get API connectors. Browser + filesystem covers it all
- **"Local" caveat:** The harness is local, not necessarily the LLM. Could swap in a local model
