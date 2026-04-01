# Golden Snapshot Setup Guide

**Date:** 2026-03-30
**Owner:** (assign to dev)
**Status:** Ready to execute
**Estimated time:** 15–20 minutes

---

## What this is

Sunder's sandbox (Vercel Sandbox) boots from a pre-built "golden snapshot" — a frozen filesystem image with all dependencies pre-installed. This means every agent run gets a sandbox with Python, Node, LibreOffice, and all needed packages ready in ~0.4s, instead of installing at runtime.

This guide walks through creating that snapshot via the Vercel Sandbox CLI.

---

## Prerequisites

1. **Node.js 18+** installed locally
2. **Vercel account** with a team and project (the one Sunder deploys to)
3. **Vercel access token** — generate at https://vercel.com/account/tokens
4. Know your `VERCEL_TEAM_ID` and `VERCEL_PROJECT_ID` (visible in Vercel dashboard → project settings)

---

## Step 1: Install the Sandbox CLI

```bash
npm i -g sandbox
```

## Step 2: Authenticate

```bash
sandbox login
```

Follow the browser prompt. Alternatively, set env vars:

```bash
export VERCEL_TOKEN=<your-token>
export VERCEL_TEAM_ID=<your-team-id>
export VERCEL_PROJECT_ID=<your-project-id>
```

## Step 3: Create a fresh sandbox

```bash
sandbox create --runtime node24 --timeout 1h --project <your-project-name>
```

This prints a sandbox ID like `sbx_abc123`. Save it:

```bash
export SBX_ID=<sandbox-id>
```

## Step 4: Install system packages

```bash
sandbox exec $SBX_ID "sudo dnf install -y libreoffice unzip p7zip p7zip-plugins bc sqlite ripgrep fd-find"
```

> **Note:** Amazon Linux 2023 uses `dnf`, not `apt`. The `libreoffice` meta-package includes calc, writer, impress, and draw.

If `ripgrep` or `fd-find` are not in dnf repos, install via binary:

```bash
sandbox exec $SBX_ID "curl -LO https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz && tar xzf ripgrep-*.tar.gz && sudo cp ripgrep-*/rg /usr/local/bin/ && rm -rf ripgrep-*"
sandbox exec $SBX_ID "curl -LO https://github.com/sharkdp/fd/releases/download/v10.2.0/fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz && tar xzf fd-*.tar.gz && sudo cp fd-*/fd /usr/local/bin/ && rm -rf fd-*"
```

## Step 5: Install Python packages

```bash
sandbox exec $SBX_ID "pip3 install \
  pandas numpy scipy scikit-learn statsmodels \
  matplotlib seaborn \
  pyarrow openpyxl xlsxwriter xlrd \
  pillow python-pptx python-docx \
  pypdf pdfplumber pypdfium2 tabula-py reportlab img2pdf \
  sympy mpmath \
  tqdm python-dateutil pytz joblib"
```

### What each group is for

| Group | Packages | Why |
|-------|----------|-----|
| Data science | pandas, numpy, scipy, scikit-learn, statsmodels | Data analysis, modeling, statistics |
| Visualization | matplotlib, seaborn | Charts, plots, graphs |
| Excel | openpyxl, xlsxwriter, xlrd, pyarrow | Read/write/convert spreadsheets |
| Documents | python-docx, python-pptx | Word docs and PowerPoint slides |
| PDF | pypdf, pdfplumber, pypdfium2, tabula-py, reportlab, img2pdf | PDF read/write/extract/generate |
| Images | pillow | Resize, crop, watermark images |
| Math | sympy, mpmath | Symbolic math, arbitrary precision |
| Utilities | tqdm, python-dateutil, pytz, joblib | Progress bars, dates, parallelism |

## Step 6: Create workspace directory structure

The sandbox bash tool operates from `/vercel/sandbox/workspace/`. Pre-creating the directory tree avoids runtime `mkdir` calls and saves a network round-trip on every sandbox boot.

```bash
sandbox exec $SBX_ID "mkdir -p /vercel/sandbox/workspace/agent/home /vercel/sandbox/workspace/agent/uploads /vercel/sandbox/workspace/input"
```

## Step 7: Verify installs

```bash
sandbox exec $SBX_ID "python3 -c \"import pandas, numpy, matplotlib, openpyxl, pdfplumber, docx, pptx; print('All Python packages OK')\""
sandbox exec $SBX_ID "libreoffice --version"
sandbox exec $SBX_ID "node --version"
sandbox exec $SBX_ID "sqlite3 --version"
```

All should succeed with no errors.

## Step 8: Create the snapshot

```bash
sandbox snapshot $SBX_ID --stop --expiration 0
```

- `--stop` shuts down the sandbox after snapshotting (saves compute)
- `--expiration 0` means the snapshot never expires

This prints a snapshot ID like `snap_abc123`.

## Step 9: Set the env var

### Local development

Add to `.env.local`:

```
SANDBOX_GOLDEN_SNAPSHOT_ID=snap_abc123
```

### Vercel (production + preview)

```bash
vercel env add SANDBOX_GOLDEN_SNAPSHOT_ID
# Enter: snap_abc123
# Select: Production, Preview, Development
```

Or via dashboard: Project Settings → Environment Variables.

## Step 10: Verify end-to-end

1. Start the dev server
2. Open a chat thread
3. Send: "Run `python3 -c "import pandas; print(pandas.__version__)"` in bash"
4. The agent should use the bash tool and return the pandas version

---

## Maintenance

- **Rebuild when:** dependencies need updating, or a new package is needed
- **Cadence:** quarterly, or on-demand
- **To rebuild:** repeat steps 3–9 with a new sandbox
- **List existing snapshots:** `sandbox snapshots list --project <project>`
- **Delete old snapshots:** `sandbox snapshots delete <old-snap-id>`

---

## Quick reference (copy-paste full script)

```bash
# 1. Create sandbox
sandbox create --runtime node24 --timeout 1h --project <PROJECT>
# → note the SBX_ID

# 2. System packages
sandbox exec $SBX_ID "sudo dnf install -y libreoffice unzip p7zip p7zip-plugins bc sqlite ripgrep fd-find"

# 3. Python packages
sandbox exec $SBX_ID "pip3 install pandas numpy scipy scikit-learn statsmodels matplotlib seaborn pyarrow openpyxl xlsxwriter xlrd pillow python-pptx python-docx pypdf pdfplumber pypdfium2 tabula-py reportlab img2pdf sympy mpmath tqdm python-dateutil pytz joblib"

# 4. Workspace dirs
sandbox exec $SBX_ID "mkdir -p /vercel/sandbox/workspace/agent/home /vercel/sandbox/workspace/agent/uploads /vercel/sandbox/workspace/input"

# 5. Verify
sandbox exec $SBX_ID "python3 -c \"import pandas, numpy, matplotlib, openpyxl, pdfplumber, docx, pptx; print('OK')\""
sandbox exec $SBX_ID "libreoffice --version && node --version"

# 6. Snapshot
sandbox snapshot $SBX_ID --stop --expiration 0
# → note the SNAP_ID

# 7. Set env var
vercel env add SANDBOX_GOLDEN_SNAPSHOT_ID
# enter SNAP_ID, select all environments
```
