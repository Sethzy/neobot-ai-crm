/**
 * xAI Grok Speech-to-Text supported languages.
 *
 * Sourced from docs.x.ai — this is the full list of BCP-47 codes the
 * /v1/stt endpoint accepts. Codes here are passed verbatim in the
 * `language` multipart field.
 *
 * Notable gaps for the Singapore market: Chinese (Mandarin/Cantonese)
 * and Tamil are not on the STT list at time of writing. Callers
 * targeting those languages must fall back to `en`.
 *
 * @module lib/transcription/languages
 */

export interface SttLanguage {
  code: string;
  label: string;
}

export const STT_LANGUAGES: readonly SttLanguage[] = [
  { code: "en", label: "English" },
  { code: "ms", label: "Malay" },
  { code: "id", label: "Indonesian" },
  { code: "fil", label: "Filipino" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "hi", label: "Hindi" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "cs", label: "Czech" },
  { code: "ro", label: "Romanian" },
  { code: "fa", label: "Persian" },
  { code: "mk", label: "Macedonian" },
] as const;

export const DEFAULT_STT_LANGUAGE = "en";

export const SUPPORTED_STT_LANGUAGE_CODES: ReadonlySet<string> = new Set(
  STT_LANGUAGES.map((lang) => lang.code),
);
