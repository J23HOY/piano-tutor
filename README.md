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
  (MIDI + audio pitch detection, keyboard, landmark-note drill), not yet deployed.

## Next steps
1. Decided: the mic is the main input (speakers on, only a headphone socket). Wired input is a possible later upgrade.
2. Jonny logs into GitHub (`gh auth login`) → deploy the spike to GitHub Pages.
3. Test on the tablet with the piano, then start the MVP.
