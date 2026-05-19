# Namestitev — VideoSummary

Navodila za namestitev predpakirane aplikacije (`.dmg`) na macOS.

---

## 1. Izberi pravi DMG

| Arhitektura Mac-a | Datoteka |
|---|---|
| Apple Silicon (M1 / M2 / M3 / M4) | `VideoSummary-0.1.0-arm64.dmg` |
| Intel | `VideoSummary-0.1.0.dmg` |

> Preveriš: Apple meni → **About This Mac** — če piše "Chip: Apple Mxxx" → Apple Silicon, drugače Intel.

---

## 2. Namesti aplikacijo

1. Dvoklikni `.dmg` datoteko — odpre se okno z ikono `VideoSummary.app`.
2. Povleci `VideoSummary.app` v mapo `Applications`.
3. Odpni `.dmg` (desni klik na ikono diska → Eject) in zbriši `.dmg` datoteko.

---

## 3. Prvi zagon (Gatekeeper)

App **ni code-signed**, zato ga macOS pri prvem zagonu blokira. Na novejših macOS verzijah (Sonoma 14+) namesto navadnega opozorila dobiš misleading sporočilo:

> *"Datoteka »VideoSummary« je poškodovana in je ni mogoče odpreti. Premaknite jo v koš."*

App **ni poškodovan** — macOS samo skriva pravi razlog ("unsigned developer"). Tri rešitve, od najbolj zanesljive do najmanj:

**Način A — `xattr` v terminalu (priporočeno, deluje vedno):**

V terminalu (Applications → Utilities → Terminal):

```bash
xattr -cr /Applications/VideoSummary.app
```

To zbriše `com.apple.quarantine` atribut, ki ga je macOS dodal ob downloadu. Po tem dvoklik na app normalno deluje. Naredi enkrat, ne rabiš ponavljat.

**Način B — desni klik (samo na starejših macOS, do ~Ventura):**
1. V Finderju pojdi v `Applications`.
2. **Desni klik** na `VideoSummary.app` → **Open**.
3. V dialogu klikni **Open**.

**Način C — System Settings (zadnja varianta):**
1. Dvoklikni `VideoSummary.app` — pojavi se napaka.
2. Pojdi v **System Settings → Privacy & Security**.
3. Pomakni se navzdol — pojavi se sporočilo "VideoSummary was blocked…" + gumb **Open Anyway**. Klikni ga.
4. Potrdi z **Open**.

Po prvem uspešnem zagonu (kateri koli način) lahko app odpiraš z navadnim dvoklikom.

---

## 4. Zunanje odvisnosti (po potrebi)

App deluje samostojno za vse osnovno (import, transkripcija). Te stvari so opcijske glede na to kaj boš uporabljal:

### yt-dlp — če želiš uvažati z YouTube URL-ja
```bash
brew install yt-dlp
```
(Če nimaš Homebrewa: https://brew.sh)

### Ollama — za lokalni LLM (povzetki, chat)
1. Prenesi z https://ollama.com → instaliraj.
2. V terminalu:
   ```bash
   ollama pull llama3
   # ali nek manjši model:
   ollama pull llama3.2:3b
   ```
3. Ollama teče v ozadju avtomatsko po instalaciji.

### Google Gemini API key — za cloud LLM (brezplačen tier)
1. Pojdi na https://aistudio.google.com/apikey
2. Klik **Create API key** → skopiraj.
3. V app-u → Settings → Google Gemini → prilepi key → Save key.
   - Key se shrani v macOS keychain, ne v plain text.

---

## 5. Prva nastavitev v app-u

1. Odpri `VideoSummary` iz Applications.
2. Klikni **Settings** v sidebar-u.
3. **Library folder** — kam shranjevati videe. Default `~/Videos/VideoSummary/`. Lahko spremeniš.
4. **Transcription**:
   - Default model: `base` (dober kompromis).
5. **LLM Providers**:
   - **Ollama base URL** — default `http://localhost:11434` deluje. Klik **Test connection**.
   - **Google Gemini** — prilepi API key (če ga imaš). Klik **Test**.
6. **Workflow automation** (priporočeno):
   - ✅ Auto-start transcription after import
   - ✅ Auto-generate summary after transcription _(zahteva da je nastavljen Default LLM)_
   - **Default LLM** — izberi providerja + model (npr. Ollama + `llama3`).
7. **Prompts** — privzeti prompt za povzetke in chat. Po želji spremeni.

---

## 6. Uporaba (kratek workflow)

- **Uvozi video:** povleci `.mp4 / .mov / .mkv / .webm` datoteko **direktno na Library** stran. Ali klik `+ New Video` (`⌘N`).
- **YouTube:** New Video → "From URL" → prilepi link → Fetch info → Download & Import.
- **Transkripcija** se zažene avtomatsko (če imaš vklopljeno) — vidiš jo v spodnjem delu sidebar-a.
- **Klik na video v Library** → Video Detail stran z video playerjem, transcript / summary / highlights / info tabi in chat panel desno.
- **Klik na transcript segment** → video skoči tja in se predvaja.

---

## Tipke (shortcut)

| Tipka | Akcija |
|---|---|
| `⌘K` | Fokus search v Library |
| `⌘N` | Odpri New Video |
| `Space` | Play / pause video |
| `J` | Skok nazaj 5s |
| `K` | Skok naprej 5s |
| `←` | Prejšnji transcript segment |
| `→` | Naslednji transcript segment |
| `T` | Preklopi na Transcript tab |
| `Esc` | Zapri Edit modal |

---

## Kje so podatki?

- **App nastavitve:** `~/Library/Application Support/VideoSummary/settings.json`
- **Whisper modeli** (cached): `~/Library/Application Support/VideoSummary/whisper-models/`
- **Logi:** `~/Library/Application Support/VideoSummary/logs/`
- **Videi & transkripcije:** v library folderju ki si ga nastavil (default `~/Videos/VideoSummary/`).
- **Skrivnosti (Gemini API key):** macOS keychain (servis `VideoSummaryWorkflow`).

---

## Posodobitev

Ko izide nova verzija:
1. Prenesi nov `.dmg`.
2. Povleci nov `VideoSummary.app` v Applications — potrdi **Replace**.
3. Nastavitve in library ostanejo (so v ločenih folderjih).

---

## Deinstalacija

1. Povleci `VideoSummary.app` iz Applications v Trash.
2. Po želji zbriši še:
   ```bash
   rm -rf ~/Library/Application\ Support/VideoSummary
   rm -rf ~/Videos/VideoSummary   # samo če ti tvojih videov ne rabiš več
   ```
3. Odstrani Gemini key iz keychain (opcijsko): Keychain Access app → poišči `VideoSummaryWorkflow` → delete.

---

## Pogoste težave

**"Datoteka »VideoSummary« je poškodovana in je ni mogoče odpreti"** (Sonoma+) ali **"VideoSummary can't be opened because Apple cannot check it for malicious software"** (starejši macOS)
→ Gatekeeper blokira nepodpisan app. Zaženi v terminalu: `xattr -cr /Applications/VideoSummary.app`. Glej korak 3 zgoraj za vse podrobnosti.

**"Ollama unreachable"**
→ Preveri da je Ollama instaliran in zagnan (`ollama list` v terminalu mora delovati). Default URL je `http://localhost:11434`.

**"yt-dlp not installed"**
→ `brew install yt-dlp` v terminalu, potem restart app.

**Video se ne predvaja**
→ Zapri in ponovno odpri app. Če težava ostaja, javi.

**Transkripcija je počasna**
→ Default model je `base` (~140 MB). Manjši = hitrejši ampak manj točen. Za hitrost izberi `tiny`. Za boljšo kvaliteto `small` ali `medium`.

**Halucinacije v transkriptu** (`(music)`, `(applause)` segmenti)
→ Normalno. Whisper včasih napiše take "non-speech" segmente za tišino ali šum. Govor je vseeno OK.
