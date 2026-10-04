# Piano Tutor — Research & Design Plan

Draft 1 — 4 Oct 2026. To be revised once Jonny answers the open questions (bottom of file).

---

## 1. What it is

A personal piano teacher that runs on the Android tablet sitting on the piano's
music stand. It teaches **reading music** and **playing** together, listens to
what you play, gives feedback, and saves progress. It starts at absolute
beginner and the curriculum grows over time as we add to it.

---

## 2. Platform recommendation: a web app installed to the tablet (PWA)

Recommendation: build it as a **Progressive Web App**, not a native Android app.

| | PWA (recommended) | Native Android app |
|---|---|---|
| Install | "Add to home screen" from Chrome; opens full-screen like an app | Sideload APK or Play Store |
| Updates | I push a change, the tablet picks it up next launch | Rebuild + reinstall each time |
| Microphone | Yes (Web Audio API) | Yes |
| USB MIDI from a digital piano | Yes — Chrome on Android supports Web MIDI over USB | Yes |
| Offline | Yes, once loaded | Yes |
| Keep screen awake | Yes (Wake Lock API) | Yes |
| Dev effort | Much lower; can also test on the PC | Higher |

Hosting: a free static host (GitHub Pages or Netlify). It needs HTTPS for mic and
MIDI access. Nothing is sent to a server. Progress is saved on the tablet, with
an export/import backup file.

---

## 3. The biggest decision: how the app hears you

### Jonny's setup (answered 4 Oct)
- **Piano:** an older Casio Celviano with **no USB**. Jonny describes it as having an
  "aux port". We still need to check the exact sockets on the back/underside:
  - **Round 5-pin "MIDI OUT"** → a USB-MIDI interface cable (5-pin DIN to USB,
    ~£10–25), plus a USB-C adapter into the tablet. This gives **exact MIDI**,
    the same as a modern USB piano. Best outcome.
  - **"LINE OUT" or "PHONES"** (3.5mm or 6.35mm jack) → a small class-compliant USB audio
    interface (e.g. Behringer UCA202/UMC22, ~£25–40) into the tablet's USB-C.
    This gives a **clean wired audio signal**, with no room noise or echo, so pitch detection
    works much better than through the air. It's still not as exact as MIDI.
  - **"AUX IN" only** → that socket feeds sound *into* the piano, so it's no use
    to us. We'd fall back to the tablet's built-in mic.
- **Decision (4 Oct):** the piano has a headphone socket, but Jonny plays through the
  speakers, and plugging in headphones usually mutes them. So **the microphone is the
  main input**. Design consequences:
  - Single-note detection (fast, reliable) carries the early levels. Chord and
    two-hand detection (Basic Pitch) comes in later and is marked more leniently.
  - A one-off **calibration** step (play a few notes) sets the input level and measures the
    delay, so timing feedback is fair.
  - Feedback must never punish the app's own mistakes. If detection is unsure,
    it says nothing rather than marking a note wrong.
  - Wired line-in (via a USB audio interface) stays a possible later upgrade if mic accuracy
    becomes the limit.
- **Tablet:** Lenovo Idea Tab, Matte Edition. 12.1", 2560×1600, anti-glare, USB-C
  (no headphone jack). That's plenty of room for a grand staff plus keyboard.
  If the piano's cable goes into the USB-C port, the tablet can't charge while
  playing, but the 10,000 mAh battery covers that easily.

| Input | Accuracy | Notes |
|---|---|---|
| **USB MIDI** (digital piano → USB-C cable/adapter → tablet) | Exact | Every note, chord, timing to the millisecond, and how hard you pressed (dynamics). Works with headphones on. Best option by far. |
| **Mic, single notes** (pitch detection, e.g. YIN / `pitchy`) | Good | Reliable for one note at a time, which covers most of the early levels. |
| **Mic, chords / two hands** (Spotify's Basic Pitch model in the browser) | Moderate (~80%) | Usable but makes mistakes, especially with sustain pedal, room echo and low bass notes. Some delay. |

**Design response:** the app sees everything as "note played: pitch, time,
velocity" events, whatever the source. MIDI and mic are interchangeable plugins.
If your piano has USB, use MIDI and keep the mic as a fallback. If it's acoustic,
the curriculum leans on single-note work early (which fits beginner material
anyway) and chord feedback is more forgiving.

Things neither input can detect: **fingering, hand position, posture.** The app
will show fingering numbers and prompts, but can't check them.

---

## 4. How it teaches (pedagogy)

Based on well-established methods, not invented ones:

- **Landmark + intervallic reading** — not "Every Good Boy Deserves Football".
  Learn a few anchor notes on the grand staff first (Middle C, Treble G,
  Bass F, then the Cs and others), then read by *distance and direction*
  (step, skip, leap). This is how good sight-readers actually read.
- **Structure modelled on adult method books** — Alfred's *Adult All-in-One*
  and Faber *Adult Piano Adventures*: Middle C position → C position →
  G position → moving hands → scales/chords → simple pieces.
- **ABRSM grades as the long-term ladder** — Initial → Grade 1 → … → Grade 8
  give a recognised, measurable progression from beginner to advanced. App
  "levels" map onto these.
- **Deliberate practice** — short sessions, small chunks, slow first, hands
  separately then together, loop the hard bar.
- **Tempo ladder** — play a passage at ~60% speed; three clean runs moves the
  tempo up a step.
- **Spaced repetition** — note-reading cards, rhythms and key signatures come
  back on a schedule based on how well you know them.
- **Mistake-driven drills** — if you keep fumbling the same bar or interval,
  the app makes a short targeted exercise from it.

Three strands run in parallel, so reading and playing grow together:

1. **Reading** — notes, rhythm, key and time signatures, intervals, sight-reading.
2. **Technique** — five-finger patterns, scales, arpeggios, chords, hands together.
3. **Repertoire** — real pieces (public-domain classical plus generated
   exercises; you can import your own MusicXML later).

---

## 5. User experience

### The tablet on the stand
- **Landscape, large and high-contrast.** Readable from a sitting position
  about 60–70cm away.
- **Hands-free while playing.** The app moves on when you play the right
  notes. Few touches needed mid-exercise, and the buttons are large.
- **Screen stays on** during practice.
- **Calm, clean look:** white/cream "paper" for the score, one accent
  colour, no clutter. Dark mode for evenings.

### Main screens
1. **Today** — the home screen. A ready-made daily session (e.g. 20 min):
   warm-up → reading drill → technique → current piece → review. One big
   "Start" button.
2. **Path** — the curriculum as a map of units. Shows where you are, what's
   unlocked and what's next.
3. **Practice** — any piece or exercise, in one of three modes:
   - *Wait mode*: the score waits for you to play the right note(s). Best
     for learning.
   - *Play-along*: metronome runs, and you're scored on notes and timing.
   - *Loop*: repeat chosen bars, with the tempo ladder.
4. **Reading Gym** — quick drills: a note appears on the staff and you play
   it. Timed, with spaced repetition.
5. **Progress** — practice time, streak, accuracy trends, notes you know,
   current tempo per piece, skill map across the three strands.

### Feedback while playing
- Correct notes turn green, wrong notes red (with a ghost of what was
  expected), and late or early notes get a small timing marker.
- After each run you get a short summary, e.g. *"94% notes · rushing in
  bar 6 · try bars 5–7 at 70 bpm."*
- Tone stays encouraging and specific. No "FAILED" screens.

---

## 6. Technical outline

> **Changed (4 Oct):** no build step for now. The MVP is plain JavaScript modules, served
> directly by GitHub Pages, which keeps updates to a single `git push` and avoids
> installing Node. Worth revisiting (TypeScript/Svelte) if the code grows a lot.

- **Front end:** plain ES modules (originally planned: TypeScript + Vite + Svelte)
- **Score rendering:** OpenSheetMusicDisplay (MusicXML, built-in cursor) for
  pieces; VexFlow directly for generated drills
- **Sound / metronome:** Tone.js with a sampled piano for "hear it first"
- **Input:** Web MIDI API; Web Audio mic + `pitchy` (single notes) + Basic
  Pitch TF.js (chords)
- **Storage:** localStorage (small data; IndexedDB later if songs/recordings get stored); export/import JSON backup
- **PWA:** vite-plugin-pwa (offline, install), Wake Lock API
- **Content as data:** lessons are JSON + MusicXML files in the repo, so
  adding new lessons doesn't need code changes

### How updates work as you progress
Same pattern as the FPL project. You export a progress file now and then (or
just tell me how it's going). I read it, see what's going well and what's
stuck, and add or adjust lessons. Those get deployed and the tablet picks them
up automatically.

---

## 7. Roadmap

| Phase | Goal |
|---|---|
| **0. Spike** | A test page on *your* tablet with *your* piano. Does mic/MIDI detection work reliably in your room? This decides a lot, so it comes first. |
| **1. MVP** | App shell, Today screen, Level 1 (keyboard geography, Middle C position, landmarks, crotchets/minims/semibreves), Reading Gym, wait mode, progress saved. |
| **2. Rhythm** | Metronome, play-along scoring, tempo ladder, loop, hands together. |
| **3. Grow** | Curriculum to ~Grade 1–2, spaced repetition, mistake-driven drills, Progress dashboard. |
| **4. Depth** | Chords/polyphonic scoring, dynamics (MIDI), MusicXML import, scales & arpeggios library. |
| **Ongoing** | Grades 3 → 8, theory and ear training, built up level by level as you get there. |

---

## 8. Decisions from Jonny's answers (4 Oct)

- **Background:** had lessons before and got close to Grade 1, but has forgotten most of it.
  → Start with a short **placement check** (note reading, rhythm, a five-finger
  piece). The app skips what comes back quickly, so he isn't stuck on day-one material.
- **Goals:** popular songs he can **sing along to** first, and well-known
  **classical** pieces eventually. → After a shared foundation, the curriculum splits into
  two tracks that run side by side:
  - **Songs & Chords:** triads, inversions, common progressions (I–V–vi–IV
    etc.), left-hand accompaniment patterns, reading lead sheets (melody +
    chord symbols), then playing while singing. This is the skill that lets
    him play almost any pop song.
  - **Reading & Classical:** notation and sight-reading up the ABRSM grades,
    with public-domain pieces (Ode to Joy → Minuet in G → Für Elise → …).
- **Milestones: yes. Streaks/points/prizes: no.** → Progress shows
  grade-equivalent level per track, pieces and songs learned, skills ticked off,
  and practice time over time. No streaks, XP or badges.
- **Returning after a gap:** the home screen says how long it's been since the last
  session. After a few days, it gives a quick recap of where things were left. After a longer
  gap, it opens with a short review before any new material.
- **Hosting:** GitHub Pages is fine.
- **Copyright note:** the repo is public, so copyrighted pop arrangements and
  lyrics won't go in it. Instead, songs he gets himself (MusicXML/MIDI from
  MuseScore, Musicnotes etc.) are **imported and stored on the tablet only**.
  Chord progressions and lessons that refer to songs are fine.

## 9. Still open
- Exact sockets on the Celviano (MIDI OUT? LINE OUT? PHONES?) and the model number.
- GitHub account / `gh auth login` so the test page can be deployed.
