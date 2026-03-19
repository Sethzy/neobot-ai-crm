# A Thousand Ways to Sandbox an Agent

**Source:** /dev/michael — Michael Livshits (Build, Break, Repeat blog)
**Date:** Feb 2, 2026
**Tags:** agents, infrastructure, sandboxing, security, cli

---

## Summary

Three approaches to sandboxing agents, with the key insight that sandboxing isn't about restricting agents — it's what lets you give them bash instead of building fifty tools.

## The Three Approaches

### 1. Simulated Environments
No real OS. Agent thinks it's running shell commands but it's all JS/WASM.

| Project | Approach | Notes |
|---------|----------|-------|
| **just-bash** (Vercel) | TypeScript bash impl + in-memory VFS | 40+ Unix utils, <1ms startup, no real binaries |
| **Amla Sandbox** | QuickJS in WASM | Capability-based security, ~300ms first run, ~0.5ms subsequent |
| **AgentVM** | Alpine Linux via container2wasm | Experimental, real Linux in WASM |

**When to use:** Text/file manipulation only. Instant startup needed. No real binaries required.

### 2. OS-Level Isolation (Containers)
Real code against a real kernel, but contained.

| Project | Approach | Notes |
|---------|----------|-------|
| **sandbox-runtime** (Anthropic) | bubblewrap (Linux) / Seatbelt (macOS) | No containers, OS-level restrictions. Used by Claude Code |
| **Codex CLI** (OpenAI) | Landlock + seccomp (Linux) / Seatbelt (macOS) | Network disabled by default |
| **LLM-Sandbox** | Docker/K8s/Podman wrapper | Real isolation, real binaries, needs container runtime |
| **gVisor** | Userspace kernel (Go) | Intercepts syscalls. Used by Claude Web, Google Cloud Run |

**When to use:** Need real binaries. Running in cloud. Want Docker ecosystem.

### 3. MicroVMs
True VM-level isolation. Own kernel, own memory space, hardware-enforced boundaries.

| Service | Technology | Cold Start | Persistence |
|---------|-----------|------------|-------------|
| **E2B** | Firecracker/Cloud Hypervisor | ~200ms | Up to 24h |
| **Fly Sprites** | Full VMs | 1-2s | Persistent (snapshot/fork/resume) |
| **Daytona** | Stateful sandboxes | <90ms | Persistent |
| **Vercel Sandbox** | Firecracker | ~125ms | Ephemeral |
| **Cloudflare Sandbox** | Containers on edge | Fast | Configurable |
| **Modal** | Containers | Variable | Up to 24h |

**When to use:** Strongest isolation needed. Platform selling security. Operational capacity available.

## What CLI Agents Actually Use

| Agent | Linux | macOS | Windows | Network |
|-------|-------|-------|---------|---------|
| Claude Code | bubblewrap | Seatbelt | WSL2 (bubblewrap) | Proxy with domain allowlist |
| Codex CLI | Landlock + seccomp | Seatbelt | Restricted tokens | Disabled by default |

Both use OS-level primitives, no containers, network through a controlled channel.

**Key insight:** Network isolation matters as much as filesystem isolation. Without network control, a compromised agent can exfiltrate `~/.ssh`. Without filesystem control, it can backdoor shell config for later network access.

## Decision Matrix

| Use Case | Approach | Go-to Option |
|----------|----------|-------------|
| CLI tool on user's machine | OS primitives | sandbox-runtime |
| CLI agent in the cloud | Full VMs | Fly Sprites |
| Web agent, simple setup | Containers (gVisor) | Standard Kubernetes |
| Web agent, max isolation | MicroVMs | E2B, Vercel Sandbox |
| Text/file manipulation only | Simulated | just-bash |
| Already on Cloudflare | Containers | Cloudflare Sandbox |
| Batch/RL workloads | Containers | Modal |
| Browser-based agent | Browser sandbox | CSP + File System Access API |

## Open-Source Landscape

| Project | Approach | Status |
|---------|----------|--------|
| sandbox-runtime | bubblewrap/Seatbelt | Production (Claude Code) |
| just-bash | Simulated bash | Production |
| llm-sandbox | Docker/K8s/Podman wrapper | Active |
| amla-sandbox | WASM (QuickJS) | Active |
| agentvm | WASM (container2wasm) | Experimental |

## Relevance to Sunder

Sunder uses Vercel Sandbox (Firecracker-based) for agent code execution per `EXEC-04`. This article provides context on the broader sandboxing landscape and confirms Vercel Sandbox as a solid choice for cloud agent workloads requiring strong isolation.

## Key Takeaway

> "The sandbox isn't the constraint. It's the permission slip."

Most agents don't need Firecracker — they need grep and a filesystem. Start simple, escalate later.

---

## See Also

- [Awesome Sandbox Benchmarks](https://github.com/diggerhq/awesome-sandbox-benchmarks) — curated list of benchmarks and resources for picking the right sandbox for long-running agents. Links to ComputeSDK benchmarks, Mert Devici's feature comparison, Nilesh's full benchmark report (Baseten/Inferless), George Fahmy's Agent Sandbox Taxonomy (Stakpak), Ryan Vogel's hands-on experiments, and Nathan Flurry's cost comparison (Rivet). Maintained by the team behind opencomputer.dev.
