# Smoke test checklist

1. `npm run dev` opens the app.
2. Settings → set library folder, paste Gemini key (optional), `Test connection` shows OK for Ollama.
3. New Video → pick `.mp4` → Import → transcribe with `base` (downloads model first run) → progress visible → completes.
4. Step 3 → Generate summary via Ollama (or Gemini) → save & open.
5. Video Detail: player plays; click transcript line seeks; Summary tab shows markdown; Chat sends a question and streams back.
6. Restart app → library reloads from disk, video still present, chat history persists.
7. Delete the video's folder manually on disk → restart → it's gone from library, no crash.
