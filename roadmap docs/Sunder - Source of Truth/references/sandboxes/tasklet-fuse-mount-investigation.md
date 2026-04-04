# Tasklet FUSE Mount — Investigation Findings

**Source:** Live probing of Tasklet sandbox internals (Apr 2026)
**Method:** Mounted filesystem inspection, latency benchmarks, caching analysis, `dmesg` boot log review

---

## 1. Identity of the FUSE Mount

From `/proc/mounts` and `/proc/self/mountinfo`:

```
AvfsFuse /agent fuse rw,nosuid,nodev,relatime,user_id=0,group_id=0,allow_other 0 0
```

- **FUSE daemon name**: `AvfsFuse` — a custom FUSE implementation (not s3fs, gcsfuse, rclone, etc.)
- **FUSE library**: `libfuse 2` (env var: `FUSE_LIBRARY_PATH=/lib/libfuse.so.2`)
- **FUSE API version**: 7.41 (from `dmesg`)
- **Reported capacity**: 1 PB — virtual/unlimited, confirming cloud-backed storage

## 2. Runtime — NOT Vercel

This is the biggest finding. From `dmesg` boot logs:

- **Kernel**: [Unikraft](https://unikraft.org/) — a **unikernel** framework, not a traditional Linux kernel
- **Platform**: [Blaxel](https://blaxel.ai/) (formerly Blaxel.ai)
  - `BL_WORKSPACE=tasklet`
  - `BL_TYPE=sandbox`
  - `BL_GENERATION=mk3`
  - `BL_REGION=us-was-1`
- **Secrets delivery**: via `virtiofs` — confirms VM/microVM isolation (virtio = QEMU/KVM/Firecracker)
- **Root filesystem**: overlay on `erofs` (read-only compressed) with a tmpfs upper layer

**Conclusion**: Tasklet's sandbox runs on Blaxel's Unikraft-based microVM platform, NOT Vercel. They have full kernel-level control, which is how they support FUSE natively.

## 3. Latency Benchmarks (1KB file)

| Operation | `/agent/home/` (FUSE) | `/tmp/` (local) | Ratio |
|-----------|----------------------|-----------------|-------|
| **Read**  | ~220ms avg (158–522ms) | ~0.02ms avg | **~13,500x slower** |
| **Write** | ~963ms avg (523–4920ms) | ~0.02ms avg | **~49,000x slower** |

## 4. Caching Behavior — None Observed

10 sequential reads of the same 100KB file:

```
COLD:   222ms
read 2: 219ms
read 3: 188ms
read 4: 232ms
read 5: 397ms
read 6: 214ms
...
```

- 1st read: 222ms, avg subsequent: 229ms
- **No caching effect** — every read appears to hit the remote backing store
- Latency variance suggests network round-trips, not local I/O

## 5. Write Behavior — Write-Through (Synchronous)

- Cross-process reads are **immediately consistent** after writes
- No buffering observed — write latency (~500ms–5s) suggests synchronous persistence
- **Conclusion**: Write-through to remote storage, no async writeback or buffer-and-sync

## 6. Architecture Summary

```
┌─────────────────────────────────────┐
│  Unikraft MicroVM (Blaxel)          │
│                                     │
│  ┌─────────┐     ┌───────────────┐  │
│  │  /tmp/   │     │  /agent/      │  │
│  │  overlay │     │  AvfsFuse     │  │
│  │  (fast)  │     │  (libfuse 2)  │  │
│  └─────────┘     └──────┬────────┘  │
│                         │            │
│                    FUSE calls        │
│                    (no caching)      │
│                         │            │
└─────────────────────────┼───────────┘
                          │
                   Cloud Storage
                   (type unknown,
                    reports 1PB)
```

## 7. Implications for Sunder

### What this tells us:
1. **FUSE works great for this pattern** — lazy, transparent, always-current file access is proven in production
2. **The latency trade-off is real** — 200ms+ per read, 500ms+ per write. The `/tmp/` fast-tier pattern is essential
3. **No local caching** — every operation hits remote storage. A local cache layer could dramatically improve repeat-read performance
4. **Write-through is the safest model** — no data loss risk from crashes

### What it does NOT tell us:
1. **Tasklet is not on Vercel** — they run on Blaxel/Unikraft microVMs with full kernel control
2. **FUSE on Vercel may still not be feasible** — Vercel's sandbox likely doesn't expose `/dev/fuse`. Our original concern stands
3. **The backing store is unknown** — could be S3, GCS, R2, or a custom object store

### Recommendations for Sunder:
- **If staying on Vercel**: FUSE is likely not an option. Consider:
  - Lazy-fetch via a virtual filesystem API (intercept `open()` calls at the application level)
  - WebDAV mount (some sandboxes support this)
  - Optimized eager preload: only preload files referenced in the command, not everything
  - Keep current approach but add incremental sync for mid-session files
- **If willing to switch compute**: Fly.io, Hetzner, or any provider with Firecracker/microVM support would allow FUSE
- **If building own FUSE**: `go-fuse` or `libfuse3` with a Supabase Storage backend + LRU local cache would address both pain points

---

## Related References

- `tasklet-sandbox-architecture-trace.md` — full architecture trace of the Tasklet sandbox (covers process tree, tool routing, orchestration loop)
- `sandbox-environments-comparison.md` — comparison of sandbox providers
- `a-thousand-ways-to-sandbox-an-agent.md` — sandboxing approaches overview
