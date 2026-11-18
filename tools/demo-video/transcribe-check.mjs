// Asks Gemini to transcribe a voice clip, to check what the TTS actually said.
import { readFileSync } from "node:fs";
process.loadEnvFile("d:/CampusOS/.env");
const key = process.env.GEMINI_API_KEYS.split(",")[Number(process.env.KEY_INDEX ?? 0)].trim();
for (const file of process.argv.slice(2)) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.CHECK_MODEL ?? "gemini-2.5-flash"}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: "audio/wav", data: readFileSync(file).toString("base64") } }, { text: "Transcribe this audio word for word. Then on a new line, say roughly how many seconds of silence there are in total." }] }] }) });
  const j = await r.json();
  console.log(file.split(/[\/]/).pop(), "=>", j.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(j.error));
}
