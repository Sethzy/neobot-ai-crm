# Sunder - Document Processing SaaS Application Specification

> **Version:** 1.0.0
> **Last Updated:** January 2026
> **Status:** Feature Complete (Code Freeze)
> **Folder role:** Archive reference only (not an active build contract)

---

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Authentication](#authentication)
5. [Case Management](#case-management)
6. [Document Upload & Processing](#document-upload--processing)
7. [Per-Client Configuration](#per-client-configuration)
8. [Extraction & Review](#extraction--review)
9. [Report Generation (DocGen)](#report-generation-docgen)
10. [Database Schema](#database-schema)
11. [API Endpoints](#api-endpoints)
12. [UI Components](#ui-components)
13. [Routes](#routes)
14. [Key Interactions](#key-interactions)

---

## Overview

Sunder is a standalone SaaS product that transforms document management for claims processing. The application enables users to:

1. **Upload** scattered documents (PDFs, images, text files)
2. **Classify & Organize** automatically using AI (Gemini 2.5 Flash for triage/splitting)
3. **Extract Data** with confidence scores and citations (ExtendAI)
4. **Review & Validate** extracted data with citation verification
5. **Generate Reports** via AI-powered analysis or quick data exports

**Target Users:** Administrative staff at small-to-medium firms handling claims (personal injury law, insurance, construction progress claims) who currently rely on shared drives and manual organization.

**Primary Client:** Hoh Law (personal injury law firm) with specialized document types for medical expenses, medical reports, and income documents.

---

## Technology Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool and dev server |
| **Tailwind CSS** | Utility-first styling |
| **ShadCN UI** | Component library (Radix-based) |
| **TanStack Router** | File-based routing with loaders |
| **TanStack Query** | Data fetching, caching, mutations |
| **TanStack Table** | Data tables with sorting, filtering |
| **Zod v4** | Schema validation |
| **react-pdf-viewer** | PDF rendering with highlights |
| **dnd-kit** | Drag-and-drop (column reordering) |
| **pdf-lib** | PDF manipulation (splitting) |
| **ExcelJS** | Excel file generation |

### Backend

| Technology | Purpose |
|------------|---------|
| **Supabase PostgreSQL** | Database |
| **Supabase Auth** | Authentication (email/password) |
| **Supabase Storage** | Document and report storage |
| **Supabase RLS** | Row-level security |
| **Vercel Functions** | Serverless API endpoints |

### External Integrations

| Service | Purpose | Model/Tier |
|---------|---------|------------|
| **Google Gemini** | Document classification, splitting, tagging | Gemini 2.5 Flash |
| **ExtendAI** | High-accuracy data extraction with citations | Growth tier ($0.006/page) |
| **Claude (Anthropic)** | AI-powered report generation | Claude Sonnet 4.5 with Skills |

### Development & Testing

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit testing |
| **React Testing Library** | Component testing |
| **ESLint** | Code linting |
| **pnpm** | Package management |

---

## Project Structure

```
/
├── api/                          # Vercel serverless functions
│   ├── docgen/
│   │   └── generate.ts           # Report generation endpoint
│   └── gemini/
│       └── process.ts            # Document processing endpoint
│
├── src/
│   ├── api/                      # Client-side API helpers
│   │   └── gemini-process.ts     # Request validation utilities
│   │
│   ├── assets/                   # Static images & media
│   │   └── landing/              # Marketing page assets
│   │
│   ├── clients/                  # Per-client configurations
│   │   ├── skill-registry.ts     # DocGen skill ID mapping
│   │   └── hoh-law/              # Hoh Law client
│   │       ├── schemas/          # ExtendAI extraction schemas (JSON)
│   │       └── docgen-skill/     # Python calculation scripts
│   │
│   ├── components/
│   │   ├── ui/                   # ShadCN UI components (28 files)
│   │   ├── layout/               # App layout (sidebar, shell)
│   │   ├── landing/              # Marketing page components
│   │   ├── cases/                # Case management components
│   │   ├── documents/            # Document table, upload, viewer
│   │   │   └── extraction-review/  # Extraction review UI
│   │   └── docgen/               # Report generation UI
│   │
│   ├── config/                   # Per-client configuration system
│   │   ├── types.ts              # TagDefinition, ClientConfig, ValidationFailure
│   │   ├── loader.ts             # Static config registry
│   │   ├── prompt-builder.ts     # Dynamic Gemini prompt generation
│   │   ├── validator.ts          # Extraction validation logic
│   │   └── clients/              # Client config files
│   │       ├── default.ts        # Fallback config
│   │       └── hoh-law.ts        # Hoh Law specific config
│   │
│   ├── contexts/                 # React Context providers
│   │   ├── highlight-context.tsx # PDF highlight state
│   │   └── upload-context.tsx    # Upload queue state
│   │
│   ├── hooks/                    # Custom React hooks (23 files)
│   │   ├── use-cases.ts          # Case CRUD operations
│   │   ├── use-documents.ts      # Document operations + polling
│   │   ├── use-splits.ts         # Extraction splits operations
│   │   ├── use-docgen.ts         # Report generation
│   │   ├── use-session.ts        # Auth session management
│   │   ├── use-client-config.ts  # Client config fetching
│   │   └── ...
│   │
│   ├── lib/                      # Utility libraries
│   │   ├── supabase.ts           # Supabase client singleton
│   │   ├── auth.ts               # Route protection logic
│   │   ├── gemini.ts             # Gemini retry/error handling
│   │   ├── gemini-files.ts       # Google Files API wrapper
│   │   ├── extend-ai.ts          # ExtendAI client
│   │   ├── pdf-splitter.ts       # PDF manipulation
│   │   ├── field-utils.ts        # Field value formatting
│   │   ├── highlight-utils.ts    # Citation → highlight conversion
│   │   └── docgen/               # Report generation utilities
│   │       ├── types.ts          # Request/response schemas
│   │       ├── prompts.ts        # AI prompts
│   │       ├── claude-report.ts  # Claude Skills integration
│   │       ├── excel-generator.ts # Quick report generation
│   │       └── json-generator.ts # Data export formatting
│   │
│   ├── routes/                   # TanStack Router file-based routes
│   │   ├── __root.tsx            # Root layout + auth guard
│   │   ├── index.tsx             # Landing page (/)
│   │   ├── login.tsx             # Login (/login)
│   │   ├── register.tsx          # Register (/register)
│   │   ├── demo.tsx              # Demo booking (/demo)
│   │   ├── forgot-password.tsx   # Password reset
│   │   ├── update-password.tsx   # Password update
│   │   ├── auth/confirm.tsx      # Email confirmation
│   │   └── cases/
│   │       ├── index.tsx         # Cases list (/cases)
│   │       ├── $caseId.tsx       # Case detail (/cases/:caseId)
│   │       └── $caseId_.documents.$docId.tsx  # Document review
│   │
│   └── types/                    # TypeScript type definitions
│       ├── database.ts           # Supabase generated types
│       ├── cases.ts              # Case types + Zod schemas
│       ├── documents.ts          # Document types + Zod schemas
│       ├── extraction.ts         # Extraction types + Zod schemas
│       └── gemini.ts             # Gemini response types
│
├── supabase/
│   └── migrations/               # Database migrations (12 files)
│
├── docs/                         # Documentation
│   ├── architecture/             # Architecture docs
│   ├── plans/                    # Design documents
│   └── tasks/                    # Task tracking
│
├── tests/                        # Integration tests
│   └── integration/
│
└── PRD/                          # Product requirements
    └── app-spec.md               # This document
```

---

## Authentication

### Implementation

- **Provider:** Supabase Auth with email/password
- **Session Management:** JWT tokens with automatic refresh
- **Route Protection:** Global auth guard in `__root.tsx` with sync session cache

### Public Routes

| Path | Description |
|------|-------------|
| `/` | Landing/marketing page |
| `/demo` | Calendly booking widget |
| `/login` | Sign in form |
| `/register` | Sign up form |
| `/forgot-password` | Password reset request |
| `/update-password` | New password entry |
| `/auth/confirm` | Email verification callback |

### Protected Routes

| Path | Description |
|------|-------------|
| `/cases` | Cases dashboard (workspace) |
| `/cases/:caseId` | Case detail with tabs |
| `/cases/:caseId/documents/:docId` | Document extraction review |

### Auth Flow

1. User enters email and password on `/login`
2. Supabase validates credentials, returns JWT
3. Session cached in memory for sync route guard access
4. `onAuthStateChange` listener updates cache on sign-out
5. Protected routes redirect unauthenticated users to `/login?redirect={originalPath}`
6. Authenticated users on `/login` or `/register` redirect to `/cases`

### Session Caching

```typescript
// Initialized once at app startup (main.tsx)
await initializeAuth();

// Sync access in route loaders (no async calls)
const session = getCachedSession();
```

This enables **zero-loading-state navigation** by avoiding async session checks in route guards.

---

## Case Management

### Data Model

```typescript
interface Case {
  id: string;                              // UUID
  case_name: string;                       // Display name
  case_ref: string;                        // Unique reference (e.g., "HOH-2024-001")
  description: string | null;              // Optional notes
  case_opened_at: string;                  // When case was opened
  event_date: string | null;               // Relevant event date (e.g., accident)
  created_by: string;                      // User UUID
  created_at: string;
  updated_at: string;
  validation_review_completed_at: string | null;  // Review completion timestamp
  validation_review_completed_by: string | null;  // Reviewer UUID
}
```

### Features

#### Cases Dashboard (`/cases`)

- **Search:** Filter cases by name or reference
- **Create:** Modal form with validation (case_ref must be unique)
- **Navigate:** Click row to open case detail

#### Case Detail (`/cases/:caseId`)

- **Header Card:** Inline-editable name, reference, dates, description
- **Stats Row:** File count, split count, reviewed count
- **Tabs:**
  - **Files** - Document upload and table
  - **Rules** - Validation rules by document type
  - **Reports** - Report generation and history

#### Case Header Card

- **View Mode:** Compact display of metadata + stats
- **Edit Mode:** Full form with date pickers
- **Review Completion:** "Mark Review Complete" button with timestamp

### Hooks

| Hook | Purpose |
|------|---------|
| `useCases()` | List cases with search filter |
| `useCase(caseId)` | Single case detail |
| `useCreateCase()` | Create mutation with unique ref validation |
| `useUpdateCase()` | Update mutation |

### Route Loader Prefetching

The case detail route (`$caseId.tsx`) prefetches 6 queries in parallel:

```typescript
loader: ({ params }) => {
  queryClient.ensureQueryData(caseDetailQueryOptions(params.caseId));
  queryClient.ensureQueryData(documentsQueryOptions(params.caseId));
  queryClient.ensureQueryData(documentsWithStatusQueryOptions(params.caseId));
  queryClient.ensureQueryData(caseSplitsQueryOptions(params.caseId));
  queryClient.ensureQueryData(reportHistoryQueryOptions(params.caseId));
  queryClient.ensureQueryData(clientConfigIdQueryOptions);
}
```

This guarantees **zero loading states** on navigation.

---

## Document Upload & Processing

### Supported File Types

| Type | Extensions | Max Size |
|------|------------|----------|
| PDF | .pdf | 50 MB |
| Images | .jpeg, .jpg, .png, .webp | 50 MB |
| Text | .txt | 50 MB |

### Upload Flow

1. **Select Files:** Drag-drop, file picker, or paste (Ctrl+V)
2. **Validate:** File type and size checks
3. **Hash:** SHA-256 for duplicate detection
4. **Upload:** To Supabase Storage bucket
5. **Create Record:** Document row with status "uploaded"
6. **Trigger Processing:** Fire-and-forget API call
7. **Poll Status:** Auto-refresh every 3s while processing

### Upload UI Components

| Component | Purpose |
|-----------|---------|
| `UploadDropZone` | Empty state with drag-drop area |
| `DocumentDropOverlay` | Full-screen drop detection |
| `UploadProgressPanel` | Fixed bottom-right progress indicator |

### Processing Pipeline

```
Upload Complete
     ↓
POST /api/gemini/process
     ↓
┌────────────────────────────────────────┐
│  1. Download from Supabase Storage     │
│  2. Upload to Google Files API         │
│  3. Wait for ACTIVE state (polling)    │
│  4. Call Gemini 2.5 Flash              │
│     - Dynamic prompt from client config│
│     - Structured JSON output           │
│  5. Parse splits (logical documents)   │
│  6. Create split rows in database      │
└────────────────────────────────────────┘
     ↓
For each split with extendProcessorId:
     ↓
┌────────────────────────────────────────┐
│  7. Split PDF into child document      │
│     (or skip if single full-doc split) │
│  8. Upload to ExtendAI                 │
│  9. Run extraction with processor      │
│ 10. Validate: rules + confidence       │
│ 11. Store: extracted_data, metadata    │
│ 12. Set status: complete/needs_review  │
└────────────────────────────────────────┘
     ↓
Update document status: "complete"
Delete file from Google Files API (cleanup)
```

### Document Status Flow

```
uploaded → processing → complete
                     → failed (with processing_error)
```

### Split Extraction Status Flow

```
pending → processing → complete (all validations passed)
                    → needs_review (validation failures OR low confidence)
                    → failed (API error)
```

### Computed Document Status (View)

The `documents_with_status` database view computes status from splits:

| Priority | Condition | Status |
|----------|-----------|--------|
| 1 | `is_reviewed = true` | `reviewed` |
| 2 | Any split pending/processing | `processing` |
| 3 | All splits failed | `failed` |
| 4 | Any split needs_review OR partial failures | `in_review` |
| 5 | All splits complete | `processed` |
| 6 | Fallback | Document's `status` |

### Documents Table

| Column | Description |
|--------|-------------|
| # | Index |
| Duplicate | Warning icon if duplicates detected |
| Filename | Renamed (AI-generated) with original on hover |
| Description | AI-generated summary (truncated) |
| Tags | Primary tag + count badge |
| Status | Color-coded badge with tooltip |
| Created | Upload timestamp |
| Actions | View, Download, Delete |

**Features:**
- Draggable column reordering (persisted)
- Column visibility toggle (persisted)
- Tag filter dropdown
- Download all as ZIP
- Row click opens document review

---

## Per-Client Configuration

### Overview

Each client organization has a unique configuration defining:
- Document taxonomy (tags)
- Extraction schemas (ExtendAI processor IDs)
- Validation rules (business logic)

Users are linked to a client config via `user_profiles.client_config_id`.

### Types

#### TagDefinition

```typescript
interface TagDefinition {
  id: string;                    // snake_case (e.g., "medical_expense")
  displayName: string;           // UI label (e.g., "Medical Expense")
  classificationHint: string;    // 2-3 sentences for Gemini classification
  extendProcessorId: string | null;  // ExtendAI processor ID (null = no extraction)
  extractionConfig?: {           // Full ExtendAI config
    type: "EXTRACT";
    baseProcessor: string;
    baseVersion: string;
    schema: Record<string, unknown>;
    advancedOptions: Record<string, unknown>;
  };
  validate?: (data: Record<string, unknown>) => ValidationFailure[];
}
```

#### ValidationFailure

```typescript
interface ValidationFailure {
  ruleId: string;           // Unique rule ID (snake_case)
  ruleName: string;         // Human-readable name
  message: string;          // What failed
  description: string;      // Why it matters (business rationale)
  field: string | string[]; // Affected field(s)
}
```

#### ClientConfig

```typescript
interface ClientConfig {
  id: string;               // kebab-case (e.g., "hoh-law")
  name: string;             // Display name
  tags: TagDefinition[];    // Document types
}
```

### Available Configurations

#### Default Config

Fallback for users without specific client assignment.

| Tag ID | Display Name | Extraction |
|--------|--------------|------------|
| `invoices` | Invoices | No |
| `reports` | Reports | No |
| `contracts` | Contracts | No |
| `images` | Images | No |
| `correspondence` | Correspondence | No |
| `other` | Other | No |

#### Hoh Law Config

Personal injury law firm with medical document processing.

| Tag ID | Display Name | Processor ID | Validation Rules |
|--------|--------------|--------------|------------------|
| `medical_expense` | Medical Expense | `dp_CoZLsiI6FOxHC4rNTZHGS` | 11 rules |
| `medical_report` | Medical Report | `dp_nZE3Zf4gQPvVbElfcZSfQ` | 5 rules |
| `income_document` | Income Document | `dp_pKFvcN7cRNNDqPQz0X-V3` | 0 rules |
| `other` | Other | None | 0 rules |

### Config Loading

```typescript
// Static registry - no database lookups
const configs: Record<string, ClientConfig> = {
  default: defaultConfig,
  "hoh-law": hohLawConfig,
};

function getClientConfig(clientConfigId: string | null): ClientConfig {
  const id = clientConfigId ?? "default";
  return configs[id] ?? configs["default"];
}
```

### Dynamic Prompt Building

The `buildSplitterPrompt(config)` function generates Gemini prompts with:
1. Available tag IDs as enum values
2. Classification hints for each tag
3. Structured output schema

```typescript
const dynamicPrompt = buildSplitterPrompt(clientConfig);
const dynamicSchema = createSplitterSchema(clientConfig.tags.map(t => t.id));
```

### Validation System

```typescript
function validateExtraction(output: ExtendAIOutput, tag: TagDefinition): ValidationResult {
  // 1. Run tag's validate function
  const failures = tag.validate?.(output.value) ?? [];

  // 2. Check per-field OCR confidence (< 0.85 threshold)
  const lowConfidenceFields = findLowConfidenceFields(output.metadata);

  return {
    valid: failures.length === 0 && lowConfidenceFields.length === 0,
    failures,
    lowConfidenceFields,
  };
}
```

---

## Extraction & Review

### Data Model

#### SplitExtraction

```typescript
interface SplitExtraction {
  id: string;
  documentId: string;
  splitIndex: number;                // 0-indexed position
  startPage: number;                 // 1-indexed
  endPage: number;                   // 1-indexed
  tagId: string;                     // Document type
  identifier: string | null;         // Invoice/reference number
  documentDate: string | null;       // YYYY-MM-DD
  potentialDuplicate: string | null; // Duplicate description
  observation: string | null;        // Gemini's reasoning
  extendProcessorId: string | null;
  extractedData: Record<string, unknown> | null;         // Editable
  originalExtractedData: Record<string, unknown> | null; // Immutable audit
  extractionMetadata: Record<string, FieldMetadata> | null;
  extractionStatus: "pending" | "processing" | "complete" | "needs_review" | "failed";
  extractionError: string | null;
  validationFailures: ValidationFailure[] | null;
  lowConfidenceFields: LowConfidenceField[] | null;
  pageWidth: number | null;          // PDF dimensions
  pageHeight: number | null;
  dismissedRuleIds: string[] | null; // User-dismissed validations
  createdAt: string;
  updatedAt: string;
}
```

#### FieldMetadata

```typescript
interface FieldMetadata {
  ocrConfidence: number | null;      // 0-1 scale
  citations: Citation[] | null;      // Source locations
  insights: Insight[] | null;        // AI reasoning
}

interface Citation {
  page: number;                      // 1-indexed
  referenceText: string | null;      // Extracted text
  polygon: Point[] | null;           // Bounding box coordinates
}
```

### Document Review Page

**Route:** `/cases/:caseId/documents/:docId`

**Layout:** Two-column split view

| Left Pane | Right Pane |
|-----------|------------|
| PDF Viewer | Extraction List |
| Page navigation | Field filter bar |
| Zoom controls | Extraction cards |
| Highlight overlays | Editable fields |

### Extraction List Features

- **Document Navigator:** Popover listing all splits for quick navigation
- **Field Filters:** Toggle buttons for Low Confidence, Needs Review, Non-null
- **Duplicate Indicator:** Warning badge with cross-reference tooltip
- **Per-split Cards:** Collapsible with all extracted fields

### Field States

| State | Badge | Condition |
|-------|-------|-----------|
| Not found | Red "Not found" | Value is null |
| Low confidence | Orange "Low confidence" | OCR confidence < 0.85 |
| Needs review | Yellow "Needs review" | Has validation failures |
| Corrected | Blue "Corrected" | Value differs from original |
| Normal | None | Standard state |

### Field Editing

- **Inline Edit:** Click field to edit, auto-save on blur
- **Type-aware Inputs:** Text, number, date picker, checkbox, currency
- **Array Fields:** Table editor with click-to-edit cells
- **Currency Fields:** Separate amount and currency code inputs

### Citation Verification

1. **Hover Source Icon:** Tooltip shows reference text
2. **Click Source Icon:** PDF auto-scrolls to cited page
3. **Highlight Overlay:** Blue bounding box on cited text

### Review Actions

- **Mark Reviewed:** Toggle button sets `is_reviewed = true`
- **Lock Effect:** All fields become read-only when reviewed
- **Optimistic Update:** Instant UI feedback, rollback on error

### Validation Rule Dismissal

- **Per-field Dismiss:** X button on validation failure badges
- **Persistence:** Dismissed rule IDs stored in `splits.dismissed_rule_ids`
- **UI Effect:** Dismissed rules don't show badge, don't affect "needs review" filter

---

## Report Generation (DocGen)

### Report Types

| Type | Description | Engine |
|------|-------------|--------|
| `quick_report` | Fast Excel export with flattening | ExcelJS |
| `ai_analysis` | AI-powered analysis with insights | Claude Sonnet 4.5 |

### DocGen UI

**Location:** Reports tab on case detail page

**Features:**
- Tag/document type checkboxes with counts
- Report type selection (Quick Report vs AI Analysis)
- Custom prompt input for AI analysis
- Generate button (disabled until tags selected)
- Report history with download links

### Quick Report

**Process:**
1. Fetch splits with status `complete` or `needs_review`
2. Filter by selected tag IDs
3. Flatten complex types:
   - Currency → `{field}_amount`, `{field}_currency`
   - Nested objects → `{parent}_{child}`
   - Arrays → Row expansion
4. Generate Excel with auto-sum row
5. Upload to Supabase Storage
6. Return signed download URL

### AI Analysis

**Process:**
1. Convert splits to JSON with summary metadata
2. Upload JSON to Claude Files API
3. Call Claude Sonnet 4.5 with Skills:
   - `xlsx` skill (built-in Excel generation)
   - Optional client-specific skill (e.g., `hoh-law-docgen`)
4. Handle `pause_turn` continuations (up to 10)
5. Extract Excel file from code execution result
6. Extract AI summary from final text block
7. Upload to Supabase Storage
8. Store summary in `report_history.ai_summary`
9. Return signed download URL

### Report History

| Column | Description |
|--------|-------------|
| Name | Report display name |
| Type | Quick Report / AI Analysis |
| Tags | Included document types with counts |
| Splits | Number of extractions included |
| Generated | Timestamp |
| Actions | Download button |

### Claude Skills Integration

```typescript
// Skills used for AI analysis
const skills = ["xlsx"];  // Built-in Excel skill

const clientSkillId = getDocgenSkillId(clientConfigId);
if (clientSkillId) {
  skills.push(clientSkillId);  // e.g., "skill_014MCHbuRqzRdh9bsURwh72X"
}
```

**Client Skill Registry:**

| Client ID | Skill ID |
|-----------|----------|
| `default` | `null` (no custom skill) |
| `hoh-law` | `skill_014MCHbuRqzRdh9bsURwh72X` |

---

## Database Schema

### Tables

#### cases

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `case_name` | TEXT | NOT NULL |
| `case_ref` | TEXT | UNIQUE, NOT NULL |
| `description` | TEXT | |
| `case_opened_at` | TIMESTAMPTZ | DEFAULT now() |
| `event_date` | DATE | |
| `created_by` | UUID | FK → auth.users |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |
| `validation_review_completed_at` | TIMESTAMPTZ | |
| `validation_review_completed_by` | UUID | |

**RLS:** Users can only access cases where `created_by = auth.uid()`

#### documents

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `case_id` | UUID | FK → cases |
| `created_by` | UUID | FK → auth.users |
| `original_filename` | TEXT | NOT NULL |
| `filename` | TEXT | NOT NULL |
| `storage_path` | TEXT | NOT NULL |
| `file_type` | TEXT | NOT NULL |
| `file_size` | BIGINT | NOT NULL |
| `file_hash` | TEXT | NOT NULL |
| `document_date` | DATE | |
| `tags` | JSONB | `{"invoices": 2, "reports": 1}` |
| `description` | TEXT | AI-generated summary |
| `status` | TEXT | `uploaded`, `processing`, `complete`, `failed` |
| `renamed_filename` | TEXT | AI-generated filename |
| `primary_tag` | TEXT | Most frequent tag |
| `is_heterogeneous` | BOOLEAN | Multiple doc types |
| `page_ranges` | JSONB | Split definitions |
| `duplicate_status` | TEXT | `none`, `detected` |
| `processing_error` | TEXT | Error message |
| `gemini_response` | JSONB | Raw API response |
| `processed_at` | TIMESTAMPTZ | |
| `is_reviewed` | BOOLEAN | DEFAULT false |
| `reviewed_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**Constraints:**
- UNIQUE(`case_id`, `file_hash`) - Prevent duplicate uploads
- CHECK(`status` IN (...))

**RLS:** Users can only access documents where `created_by = auth.uid()`

#### splits

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `document_id` | UUID | FK → documents ON DELETE CASCADE |
| `split_index` | INTEGER | |
| `start_page` | INTEGER | CHECK > 0 |
| `end_page` | INTEGER | |
| `tag_id` | TEXT | NOT NULL |
| `identifier` | TEXT | Document reference |
| `document_date` | DATE | |
| `potential_duplicate` | TEXT | Duplicate description |
| `observation` | TEXT | Gemini reasoning |
| `extend_processor_id` | TEXT | |
| `original_extracted_data` | JSONB | Immutable audit copy |
| `extracted_data` | JSONB | Editable values |
| `extraction_metadata` | JSONB | Confidence + citations |
| `extraction_status` | TEXT | DEFAULT 'pending' |
| `extraction_error` | TEXT | |
| `validation_failures` | JSONB | `[{ruleId, ruleName, message, description, field}]` |
| `low_confidence_fields` | JSONB | `[{field, ocrConfidence}]` |
| `page_width` | REAL | PDF points |
| `page_height` | REAL | PDF points |
| `schema_version` | TEXT | |
| `extend_dashboard_url` | TEXT | |
| `dismissed_rule_ids` | TEXT[] | DEFAULT '{}' |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**Constraints:**
- UNIQUE(`document_id`, `split_index`)

**Indexes:**
- `idx_splits_document` on `document_id`
- `idx_splits_status` on `extraction_status`
- `idx_splits_needs_review` partial on `extraction_status = 'needs_review'`
- `idx_splits_tag` on `tag_id`

**RLS:** Users can only access splits through document → case ownership

#### user_profiles

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, FK → auth.users |
| `client_config_id` | TEXT | e.g., "hoh-law" |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**RLS:** Users can only read their own profile

#### report_history

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `case_id` | UUID | FK → cases ON DELETE CASCADE |
| `report_type` | TEXT | CHECK IN (...) |
| `name` | TEXT | NOT NULL |
| `prompt` | TEXT | Custom prompt for AI |
| `file_path` | TEXT | NOT NULL |
| `file_size_bytes` | INTEGER | |
| `splits_count` | INTEGER | NOT NULL |
| `tags_included` | TEXT[] | NOT NULL |
| `generated_at` | TIMESTAMPTZ | DEFAULT now() |
| `generated_by` | UUID | FK → auth.users |
| `ai_summary` | TEXT | Claude's summary |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**RLS:** Users can only access reports through case ownership

### Views

#### documents_with_status

Computed view adding `computed_status` based on split extraction states.

### Functions

#### update_updated_at_column()

Trigger function that sets `updated_at = now()` on UPDATE.

#### get_my_client_config()

Returns `client_config_id` for the authenticated user. Used by frontend to load appropriate config.

```sql
CREATE FUNCTION get_my_client_config() RETURNS text AS $$
  SELECT client_config_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

## API Endpoints

### POST /api/gemini/process

**Purpose:** Process uploaded document through Gemini classification and ExtendAI extraction.

**Request:**
```typescript
{
  documentId: string  // UUID
}
```

**Headers:**
- `Authorization: Bearer <supabase_jwt>`

**Response:**
```typescript
{
  success: true,
  data: {
    splits: Array<{
      type: string,
      startPage: number,
      endPage: number,
      identifier: string | null,
      document_date: string | null,
      potential_duplicate: string | null,
      observation: string
    }>
  }
}
```

**Error Responses:**
- `400` - Invalid documentId
- `401` - Missing/invalid JWT
- `404` - Document not found
- `500` - Processing error

**External APIs Called:**
- Google Files API (upload, poll, delete)
- Gemini 2.5 Flash (generateContent)
- ExtendAI (upload, processor_runs) - if configured

**Timeout:** 60 seconds

### POST /api/docgen/generate

**Purpose:** Generate report from extracted data.

**Request:**
```typescript
{
  caseId: string,
  reportType: "quick_report" | "ai_analysis",
  tagIds: string[],  // Min 1
  prompt?: string    // Max 2000 chars, for ai_analysis
}
```

**Headers:**
- `Authorization: Bearer <supabase_jwt>`

**Response:**
```typescript
{
  reportId: string,
  downloadUrl: string,
  expiresAt: string,  // ISO 8601, 1 hour
  metadata: {
    reportType: string,
    splitsCount: number,
    tagsIncluded: string[],
    fileSizeBytes: number
  }
}
```

**Error Responses:**
- `400` - Invalid request
- `401` - Missing token
- `404` - Case not found OR no extracted data
- `500` - Generation failure

**External APIs Called:**
- Claude Sonnet 4.5 with Skills (for ai_analysis only)

**Timeout:** 300 seconds (5 minutes for AI analysis)

---

## UI Components

### Layout Components

| Component | Purpose |
|-----------|---------|
| `AppLayout` | Main app shell with sidebar |
| `AppSidebar` | Collapsible navigation sidebar |

### UI Components (ShadCN)

28 base components including: Button, Card, Dialog, Input, Select, Tabs, Tooltip, Badge, etc.

### Feature Components

#### Cases (5 files)
- `CasesTable` - TanStack Table with sorting, column reorder
- `CaseHeaderCard` - Editable case metadata display
- `CreateCaseDialog` - Modal form with validation
- `ValidationRulesSection` - Per-tag validation rule display

#### Documents (15 files)
- `DocumentsSection` - Main container with table, upload, filters
- `DocumentsTable` - TanStack Table with status badges
- `UploadDropZone` - Drag-drop upload area
- `UploadProgressPanel` - Fixed progress indicator
- `PdfViewerPane` - PDF/image viewer with highlights
- `StatusBadge` - Color-coded status indicators
- `SplitCard` - Individual split display
- `SplitResultsPane` - Split list container

#### Extraction Review (12 files)
- `ExtractionList` - Scrollable list with filters
- `ExtractionCard` - Per-split field display
- `ExtractionField` - Single field with editing
- `EditableField` - Type-aware input
- `ArrayFieldEditor` - Table editor for arrays
- `CurrencyField` - Currency code + amount inputs
- `FieldFilter` - Toggle buttons for filtering
- `DocumentNavigator` - Split navigation popover
- `ReviewActions` - Mark reviewed button

#### DocGen (2 files)
- `DocgenSection` - Report generation interface
- `ReportHistory` - Report list with downloads

#### Landing (13 files)
- Marketing page components (Header, Hero, Features, Pricing, etc.)

---

## Routes

### Route Summary

| Path | Auth | Loader | Description |
|------|------|--------|-------------|
| `/` | Public | No | Landing page |
| `/demo` | Public | No | Calendly booking |
| `/login` | Public | No | Sign in |
| `/register` | Public | No | Sign up |
| `/forgot-password` | Public | No | Password reset |
| `/update-password` | Public | No | New password |
| `/auth/confirm` | Public | No | Email verification |
| `/cases` | Protected | No | Cases dashboard |
| `/cases/:caseId` | Protected | Yes (6 queries) | Case detail |
| `/cases/:caseId/documents/:docId` | Protected | Yes (2 queries) | Document review |

### Route Guard Logic

```typescript
// In __root.tsx beforeLoad
if (!session && !isPublicRoute(pathname)) {
  throw redirect({ to: "/login", search: { redirect: pathname } });
}
if (session && isAuthOnlyRoute(pathname)) {
  throw redirect({ to: "/cases" });
}
```

---

## Key Interactions

### Document Upload Flow

1. User drags files to upload area OR clicks to open picker OR pastes
2. Files validated (type, size) and hashed
3. Upload to Supabase Storage with progress
4. Document record created with status "uploaded"
5. Processing triggered (fire-and-forget)
6. Table polls every 3s while processing
7. Row updates as processing completes

### Extraction Review Flow

1. User clicks document with "In Review" status
2. Two-column layout opens: PDF + Extraction List
3. Field filters applied (Low Confidence, Needs Review, etc.)
4. User clicks field → PDF scrolls to citation
5. User edits field → Auto-save on blur
6. User dismisses validation rules if appropriate
7. User clicks "Mark Reviewed" when satisfied
8. Document locked, status changes to "Reviewed"

### Report Generation Flow

1. User navigates to Reports tab
2. User selects tag types to include
3. User chooses Quick Report or AI Analysis
4. User enters custom prompt (optional for AI)
5. User clicks Generate
6. Progress shown in upload panel
7. Report appears in history when complete
8. User clicks Download to get Excel file

---

## Environment Variables

### Required (Frontend)

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
```

### Required (API Functions)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
GEMINI_API_KEY=AIza...
```

### Optional (API Functions)

```
EXTEND_API_KEY=ext_...       # Enables ExtendAI extraction
ANTHROPIC_API_KEY=sk-ant-... # Enables AI analysis reports
```

---

## Security

### Row-Level Security (RLS)

All tables have RLS policies enforcing:
- Users can only access data they created
- Cascade access through foreign keys (documents → cases, splits → documents)

### JWT Verification

All API endpoints:
1. Extract JWT from `Authorization: Bearer <token>` header
2. Create authenticated Supabase client
3. RLS automatically enforces access control

### API Key Management

- All external API keys stored in Vercel environment variables
- Service role key only used server-side
- Never exposed to client

### File Security

- Supabase Storage uses signed URLs (300s for processing, 3600s for downloads)
- Google Files API files deleted after processing
- Files auto-delete after 48 hours if cleanup fails

---

## Performance Optimizations

### Route Loader Prefetching

Case detail route prefetches 6 queries in parallel, ensuring zero loading states.

### Auto-Polling

Documents table polls every 3s only while documents are processing, then stops.

### Optimistic Updates

- Mark reviewed toggle
- Field edits
- Rule dismissals

All use optimistic updates with rollback on error.

### Memoization

- `ExtractionCard` uses `React.memo` with custom equality check
- TanStack Table columns memoized
- Query results cached with appropriate stale times

### Partial Indexes

Database has partial index on `splits.extraction_status = 'needs_review'` for common filter.

---

*This specification reflects the actual implemented state of the Sunder codebase as of January 2026.*
