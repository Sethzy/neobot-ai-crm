/**
 * Groq Whisper speech-to-text integration for uploaded meeting audio files.
 * @module lib/transcription/groq-whisper
 */

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

export interface TranscribeAudioInput {
  /** Signed URL used to download the private audio object from Supabase Storage. */
  audioUrl: string;
  /** Optional ISO language code hint to improve transcription accuracy. */
  language?: string;
}

export interface TranscribeAudioResult {
  /** Plain-text transcription returned by Groq Whisper. */
  text: string;
}

/**
 * Downloads the source audio file and submits it to Groq's OpenAI-compatible
 * transcription endpoint as multipart form data.
 */
export async function transcribeAudio({
  audioUrl,
  language,
}: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const audioResponse = await fetch(audioUrl);

  if (!audioResponse.ok) {
    throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
  }

  const audioBlob = await audioResponse.blob();
  const formData = new FormData();

  formData.append(
    "file",
    new File([audioBlob], "recording.webm", {
      type: audioBlob.type || "audio/webm",
    }),
  );
  formData.append("model", GROQ_WHISPER_MODEL);
  formData.append("response_format", "json");

  if (language) {
    formData.append("language", language);
  }

  const groqResponse = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();
    throw new Error(`Groq transcription failed (${groqResponse.status}): ${errorText}`);
  }

  const payload = await groqResponse.json() as { text?: unknown };

  return {
    text: typeof payload.text === "string" ? payload.text : "",
  };
}
