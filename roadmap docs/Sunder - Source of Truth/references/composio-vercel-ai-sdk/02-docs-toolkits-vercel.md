# Composio Vercel Toolkit

> Source: https://docs.composio.dev/toolkits/vercel
> Fetched: 2026-03-07

## Overview

The Vercel integration through Composio provides access to 174 tools for managing deployments, domains, projects, and infrastructure on the Vercel platform.

**Key Details:**
- **Category:** Developer tools
- **Authentication:** API_KEY
- **Tools Available:** 174
- **Triggers:** 0
- **Slug:** `VERCEL`
- **Version:** 20260307_00

## Core Capabilities

### Project Management
- Create and delete Vercel projects with comprehensive configuration
- Manage project settings, frameworks, and build commands
- Configure environment variables (plain, encrypted, sensitive types)
- Handle project transfers between accounts/teams

### Deployment Operations
- Create deployments from files or Git repositories
- Deploy edge functions with near-instant cold starts
- Monitor deployment status and retrieve detailed logs
- Access deployment events and runtime information
- Delete deployments and manage aliases

### Domain Management
- Register domains through Vercel's registrar
- Check domain availability and pricing
- Configure DNS records (A, AAAA, CNAME, MX, TXT, SRV, NS types)
- Add custom domains to projects with verification
- Transfer existing domains to Vercel

### Advanced Features
- **Edge Config:** Store and manage edge-level key-value data with low-latency reads
- **Cache Management:** Upload/download build artifacts, check cache status
- **Webhooks:** Create event-triggered notifications for deployments and other events
- **Shared Environment Variables:** Create variables usable across multiple projects
- **SSL/TLS Certificates:** Retrieve and manage SSL certificates
- **Firewall Protection:** Monitor active attack status for projects

## Authentication

The toolkit requires a Vercel API key for authentication. Team operations can be performed using either team slug (URL-friendly identifier) or team ID (starts with `team_` prefix).

## Key Tool Categories

**Deployment:** Create, list, retrieve details, delete deployments; manage deployment logs and events

**Domains:** Register, transfer, manage DNS records, configure custom domains for projects

**Environment:** Manage project and shared environment variables across production, preview, and development targets

**Infrastructure:** Edge Config management, cache artifact handling, certificate management

**Automation:** Webhook creation for event-driven workflows

> Note: This documents the "Vercel" toolkit (for managing Vercel infrastructure), NOT the Vercel AI SDK provider package (`@composio/vercel`). These are different things.
