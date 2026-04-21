/**
 * xAI Grok speech-to-text integration with speaker diarization.
 *
 * Synchronous batch REST call against `POST https://api.x.ai/v1/stt`.
 * Accepts a signed audio URL and returns a transcript plus per-speaker
 * segments (adjacent same-speaker words collapsed into one segment).
 *
 * @module lib/transcription/xai-stt
 */

import { assertSupportedSttLanguage } from "@/lib/transcription/languages";

const XAI_STT_URL = "https://api.x.ai/v1/stt";

export interface TranscribeAudioInput {
  /** Signed URL used to download the private audio object from Supabase Storage. */
  audioUrl: string;
  /** BCP-47 language code (see `STT_LANGUAGES`). Drives recognition + ITN formatting. */
  language: string;
}

export interface TranscribeAudioResult {
  /** Plain-text transcription returned by the provider. */
  text: string;
  /** Segments with timestamps and speaker labels (grouped by adjacent same-speaker words). */
  segments: Array<{
    start: number;
    end: number;
    text: string;
    speaker: number;
  }>;
}

interface XaiSttWord {
  text: string;
  start: number;
  end: number;
  speaker?: number;
}

interface XaiSttResponse {
  text: string;
  language?: string;
  duration?: number;
  words?: XaiSttWord[];
}

/**
 * Folds the flat `words[]` stream into segments. A new segment starts whenever the
 * speaker ID changes; within a segment, we extend `end` and append word text.
 * Words missing a `speaker` (diarization off or uncertain) default to speaker 0.
 */
function groupWordsIntoSegments(words: XaiSttWord[]): TranscribeAudioResult["segments"] {
  const segments: TranscribeAudioResult["segments"] = [];

  for (const word of words) {
    const speaker = word.speaker ?? 0;
    const last = segments[segments.length - 1];

    if (!last || last.speaker !== speaker) {
      segments.push({
        start: word.start,
        end: word.end,
        text: word.text,
        speaker,
      });
    } else {
      last.end = word.end;
      last.text = `${last.text} ${word.text}`;
    }
  }

  return segments;
}

/**
 * Transcribes audio via xAI Grok STT. Returns the transcript plus per-speaker segments.
 * Throws on missing credentials or non-2xx responses.
 */
export async function transcribeAudio({
  audioUrl,
  language,
}: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  const validatedLanguage = assertSupportedSttLanguage(language);

  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }

  const form = new FormData();
  form.append("url", audioUrl);
  form.append("diarize", "true");
  form.append("language", validatedLanguage);
  // Inverse Text Normalization: spoken numbers/dates/currency → written form
  // (e.g. "three point two million dollars" → "$3.2 million"). Requires language.
  form.append("format", "true");

  console.log(`[xai-stt] submit | language=${validatedLanguage}`);
  const response = await fetch(XAI_STT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`xAI STT request failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as XaiSttResponse;
  const segments = groupWordsIntoSegments(payload.words ?? []);
  console.log(`[xai-stt] done | segments=${segments.length} textLen=${payload.text.length}`);

  return {
    text: payload.text,
    segments,
  };
}
