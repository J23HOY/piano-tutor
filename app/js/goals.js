// What "passed" means for each kind of step. A lesson only completes, and the next one only
// unlocks, once every step's goal is met. The goal is shown before you start.

export const WAIT_PASS = 0.9;      // wait mode: 90%+ of notes clean…
export const WAIT_RUNS = 2;        // …on two runs in a row
export const ALONG_NOTES = 0.9;    // play along: 90%+ notes right
export const ALONG_TIME = 0.8;     //             80%+ in time
export const ALONG_SPEED = 0.95;   //             at (nearly) full speed
export const GYM_PASS = 0.8;       // reading cards: 80%+ right first time
export const CHANGE_SECS = 2.5;    // chord changes: under 2.5 s on average
export const MAX_WRONG = 2;        // chords and songs: at most 2 wrong chords

export function goalText(step) {
  switch (step.type) {
    case 'play':
      return step.mode === 'along'
        ? `Goal: play along at full speed (${step.ex.bpm || 80} bpm), ${pct(ALONG_NOTES)} notes right and ${pct(ALONG_TIME)} in time`
        : `Goal: ${WAIT_RUNS} runs in a row with ${pct(WAIT_PASS)} of notes clean`;
    case 'gym': return `Goal: ${pct(GYM_PASS)} right first time`;
    case 'chords': return `Goal: under ${CHANGE_SECS} s per change, no more than ${MAX_WRONG} wrong chords`;
    case 'song': return `Goal: sing it through with no more than ${MAX_WRONG} wrong chords`;
    default: return '';
  }
}
const pct = x => `${Math.round(x * 100)}%+`;

// Text, find-the-key and single-chord steps are passed simply by finishing them.
export const stepPassed = (step, rec) =>
  ['text', 'find', 'chord'].includes(step.type) ? !!rec?.done : !!rec?.mastered;
