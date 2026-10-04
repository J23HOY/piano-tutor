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
  Add `&sim=60,62,64` to play notes into the app. Presets: `new`, `fresh`, `placed`, `midway`.
  On a desk computer, the keys A W S E D F T G Y H U J K play C4–C5 (Z/X shift octave).

## Next steps
1. Jonny tries the app on the tablet at the piano: placement check, a lesson, Reading Gym.
   Report how reliable mic detection is (wrong notes, missed notes, repeated notes, delay).
2. Tune detection based on that (sensitivity defaults, octave handling, maybe a better
   pitch algorithm or Basic Pitch for chords).
3. Phase 2: metronome, play-along with rhythm scoring, tempo ladder, loop bars.
4. Open the Songs & Chords track (C, F, G chords → I–V–vi–IV → lead sheets).
