# Rev AI Transcription Swap

## Summary

Replace Groq Whisper with Rev AI Reverb Turbo for meeting transcription. Adds speaker diarization (who said what). Meetings become a paid-only feature — free tier users don't get the meetings surface.

**Cost:** ~$0.05 per 30-min meeting ($0.10/hr Reverb Turbo, diarization included).

## What Changes

### 1. Replace `src/lib/transcription/groq-whisper.ts` with `src/lib/transcription/rev-ai.ts`

New module handles the Rev AI async flow:
- Submit job: `POST https://api.rev.ai/speechtotext/v1/jobs` with `source_config.url` pointing to the signed Supabase audio URL
- Poll for completion: `GET /jobs/{id}` every 2s until `status: "transcribed"`
- Fetch transcript: `GET /jobs/{id}/transcript` with `Accept: application/vnd.rev.transcript.v1.0+json`
- Normalize the monologues response into our `TranscribeAudioResult` shape

**Interface:**

```ts
export interface TranscribeAudioResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    speaker: number;
  }>;
}
```

Rev AI returns word-level elements grouped by speaker monologue. We collapse each monologue into one segment with `start` = first word's `ts`, `end` = last word's `end_ts`, `text` = all words joined.

### 2. Update `app/api/meetings/ingest/route.ts`

- Change import from `groq-whisper` to `rev-ai`
- Update `buildTranscriptBody` to include speaker labels:
  - Before: `[00:12] we need to close by Friday`
  - After: `[00:12] Speaker 1: we need to close by Friday`

No other changes. Summary prompt, search tool, UI all consume the markdown transcript — format change is minimal.

### 3. Environment variable

- Remove: `GROQ_API_KEY` (from meeting transcription use — may still be used elsewhere)
- Add: `REV_AI_ACCESS_TOKEN`

### 4. Update tests

- Update `groq-whisper.test.ts` → `rev-ai.test.ts` with new mock responses (monologues format)
- Update `ingest/route.test.ts` to mock the new module

## What Doesn't Change

- Summary generation (still Gemini Flash via `generateObject`)
- Meeting search tool
- Meeting detail page / transcript UI
- Database schema
- Upload flow

## API Flow

```
Browser records audio
  → uploads to Supabase Storage
  → calls POST /api/meetings/ingest

Ingest route:
  1. Create/find meeting_record row
  2. Generate signed URL for audio
  3. Submit to Rev AI (POST /jobs with URL)
  4. Poll Rev AI (GET /jobs/{id}) every 2s
  5. Fetch transcript (GET /jobs/{id}/transcript)
  6. Collapse monologues → segments with speaker labels
  7. Format markdown transcript with [HH:MM] Speaker N: text
  8. Upload transcript to Supabase Storage
  9. Generate summary via Gemini Flash
  10. Update meeting_record with title + summary
```

## Rev AI Response Shape

```json
{
  "monologues": [
    {
      "speaker": 1,
      "elements": [
        { "type": "text", "value": "Hi", "ts": 0.27, "end_ts": 0.32, "confidence": 1.0 },
        { "type": "punct", "value": "," },
        { "type": "text", "value": "let's", "ts": 0.35, "end_ts": 0.52, "confidence": 0.98 },
        { "type": "text", "value": "begin", "ts": 0.52, "end_ts": 0.78, "confidence": 0.99 }
      ]
    },
    {
      "speaker": 2,
      "elements": [
        { "type": "text", "value": "Sounds", "ts": 1.2, "end_ts": 1.5, "confidence": 0.97 },
        { "type": "text", "value": "good", "ts": 1.5, "end_ts": 1.7, "confidence": 1.0 }
      ]
    }
  ]
}
```

## Files Touched

| File | Change |
|---|---|
| `src/lib/transcription/rev-ai.ts` | New — replaces groq-whisper.ts |
| `src/lib/transcription/groq-whisper.ts` | Delete |
| `app/api/meetings/ingest/route.ts` | Update import + transcript format |
| `src/lib/transcription/__tests__/rev-ai.test.ts` | New — replaces groq-whisper test |
| `src/lib/transcription/__tests__/groq-whisper.test.ts` | Delete |
| `app/api/meetings/ingest/route.test.ts` | Update mocks |
| `.env.local` | Add `REV_AI_ACCESS_TOKEN` |

## Unresolved Questions

None.
