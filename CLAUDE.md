You are an expert in nextJS. Our database is hosted on Supabase. Our serverless functions and frontend deployment are on Vercel.

## Project Context

both desktop and mobile responsiveness required.

## Key Principles

- In all interactions, give concise, technical responses with accurate TypeScript examples. Be concise.
- Use functional, declarative programming. Avoid classes.
- Use descriptive variable names with auxiliary verbs (e.g., `isLoading`).
- Use lowercase with dashes for directories (e.g., `components/auth-wizard`).
- **Remember:** We optimize for straightforward, standard and DRY, and readable implementations over clever abstractions. When in doubt, choose the boring solution.
- **You have unlimited time.** Take as long as needed to get it right. All features must work end-to-end through the UI
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Verify and Question**. No performative agreement. Technical rigor always. Prefer technical correctness over social comfort.
- **Session Boundaries:** If the user's request isn't directly related to the current context and can be safely started in a fresh session, suggest starting from scratch to avoid context confusion.

## TypeScript Usage

- Use TypeScript for all code.
- Avoid enums. Use maps instead for better type safety and flexibility.
- Use functional components with TypeScript interfaces.

## State Management and Data Fetching

- Use TanStack Query to handle global state and data fetching. Prefer it over `useEffect`.
- Implement validation using Zod for robust schema validation.

## Routing and Navigation

- Use Next.js App Router with file-based routing under `app/**`.
- Prefer Server Components where possible, and use client-side navigation/state only when necessary.

## Backend and Database

- Use Supabase for backend services, including authentication and database interactions. You must always Supabase guidelines for security and performance.
- Use Zod schemas to validate data exchanged with the backend. Use the latest version Zod 4
- Use the latest import { GoogleGenAI } from "@google/genai";

## UI and Styling

- Use ShadCN UI for consistent, accessible component design.
- Use Tailwind CSS for styling.
- Implement consistent design and responsive patterns across the app.
- Tables: Always ask the user if they want to use TanStack Table.
- Forms: Use Zod validation and lightweight controlled/uncontrolled React form patterns.

## Testing and Documentation

- Where required, write unit tests for components using Vitest and React Testing Library.
- All code **must** be thoroughly documented using JSDoc-style comments. Assume a junior developer audience. Over-explain complex or non-obvious logic. Optimize comments for IDE IntelliSense.
- Always add a concise line of file-level JSDoc docs at the top of each file when a file represents a clear module or feature.
