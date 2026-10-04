# Piano Tutor

A personal piano-teaching app for Jonny's Android tablet, which sits on the
piano's music stand. It teaches reading music and playing from beginner
upwards, listens via mic (or USB MIDI), gives feedback and saves progress.

## Status
- 4 Oct 2026: Research done, first draft of the plan written ([PLAN.md](PLAN.md)).
  Waiting on Jonny's answers to the clarifying questions before Phase 0
  (the mic/MIDI detection test on the real tablet and piano).

- 4 Oct 2026: Answers in (see PLAN.md §3 and §8). The piano is an older Celviano
  with no USB. Phase 0 test page built at [spike/index.html](spike/index.html)
  (MIDI + audio pitch detection, keyboard, landmark-note drill). Mic chosen as the main input. Deployed to GitHub Pages.

- 4 Oct 2026: **MVP v0.1 built** in `app/`. Screens: Today (daily session, time since
  last practice, recap after a gap), Path, lessons (explain / find keys / reading cards /
  wait-mode playing), Reading Gym (spaced repetition, "Play it" or "Name it"), Progress
  (milestones, practice time, note mastery, pieces), Settings (mic sensitivity, backup).
  Foundation track: 6 units, 17 lessons, up to Ode to Joy with both hands taking turns.
  Tested in desktop Chrome with simulated notes. **Not yet tested with the real mic and piano.**

- 4 Oct 2026: v0.1.1 fits practice screens above the on-screen keys (Jonny's feedback).

- 4 Oct 2026: **v0.2.0**, from Jonny's requests:
  - Key hints: "Play any B" shows a big badge and blue dots on every B on the bottom keys.
    After a wrong note it says "You played D. Play F instead: a skip higher" and marks F.
    Keys turn **blue** (not green) when correct. Optional "Show keys" in wait mode.
  - **Rhythm**: Play along mode (1-bar count-in, metronome, notes + timing scored, rushing/
    dragging feedback), **tempo ladder** (starts at 70% of goal, +~10% per pass), **loop bars**
    with Repeat, "Loop bar N" from the results. Settings > Timing calibration (tap along).
  - **Songs & Chords track** (opens after l4-1): 3 units, 9 lessons. C/F/G/Am chords, smooth
    inversions, chord progressions with Now/Next, song sheets (chords over lyrics) for
    Twinkle, When the Saints, Happy Birthday, Amazing Grace, and the I–V–vi–IV pop progression.
  - Chord recognition from the mic: chroma (energy per note letter) from an 8192-pt FFT, then
    best-fitting triad. `tests/chroma.html` checks it on synthesised chords (all correct,
    including C vs Am). Not yet tried on the real piano.

- 4 Oct 2026: v0.2.1. Jonny (first real-piano test): "it's initially saying G is wrong, then
  correcting itself". The mic's first reading of a note can wobble before it settles, so
  wrong notes heard by the mic are now held for 280 ms and dropped if the right note follows.
  Chords are only called wrong after ~0.4 s of a settled, clearly different chord. Also,
  resizes that only change the height no longer reset a piece.

## Links
- Repo: https://github.com/J23HOY/piano-tutor
- **App (tablet):** https://j23hoy.github.io/piano-tutor/app/
- Input test page: https://j23hoy.github.io/piano-tutor/spike/

## How it's built
- No build step: plain ES modules served by GitHub Pages. Push to `main` = deployed.
- `app/js/curriculum.js` holds **all lesson content as data**. New lessons go there.
- `app/vendor/vexflow.js`: VexFlow 4.2.5 for notation (bundled so it works offline).
- Progress is in localStorage on the device, with JSON backup/restore in Settings.
- Dev: `python -m http.server 8765 --bind 127.0.0.1` from the repo root, then
  `tests/shot.sh "preset=midway&to=/today" name` takes screenshots with seeded progress.
  Add `&sim=60,62,64` to play notes into the app (`60+64+67` = chord, `r` = skip a step,
  `&simgap=ms`, `&simdelay=ms`, `&autostart=1` starts Play along, `&simsrc=mic` pretends the notes came from the mic). Presets: `new`, `fresh`, `placed`, `midway`.
  `tests/chroma.html` (headless `--dump-dom`) prints the chord-recognition results.
  On a desk computer, the keys A W S E D F T G Y H U J K play C4–C5 (Z/X shift octave).

## Next steps
1. Jonny tries it at the piano: mic note detection, chord recognition, Play along timing
   (run Settings > Timing calibration first). Report what's unreliable.
2. Tune from that: thresholds, chord-matching strictness, default mic delay.
3. Songs: steady-beat mode for songs (one chord per bar with the metronome), LH bass + RH chord,
   importing his own songs (chord sheets typed in, stored on the tablet only).
4. Reading & Classical track: Minuet in G and onwards, key signatures, G position.
