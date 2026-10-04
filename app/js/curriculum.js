// Curriculum content. Pure data: add lessons here without touching app code.
//
// Exercise notation (used by `play` steps):
//   tokens separated by spaces, bars separated by |
//   PITCH/DURATION[.][:finger]   e.g.  E4/q   G4/h:5   D4/q.   r/w (rest)
//   durations: w h q 8 16   (semibreve, minim, crotchet, quaver, semiquaver); "." = dotted
//   `rh` is drawn on the treble staff, `lh` on the bass staff.
//
// Step types:
//   text  – explanation, optional `visual` (keyboard or staff)
//   find  – find keys on the piano by letter (any octave) or exact key
//   gym   – note-reading cards drawn from `notes`
//   play  – a piece/exercise in wait mode (score waits for the right note)

export const TRACKS = [
  {
    id: 'foundation',
    title: 'Foundation',
    blurb: 'Keyboard, staff, rhythm and the first hand positions. Roughly the road to Grade 1.',
    units: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
  },
  {
    id: 'songs',
    title: 'Songs & Chords',
    blurb: 'Chords, left-hand patterns and lead sheets, so you can play the songs you know and sing along.',
    units: [],
    comingSoon: 'Opens after Foundation. Starts with the three chords behind hundreds of songs.',
  },
  {
    id: 'classical',
    title: 'Reading & Classical',
    blurb: 'Sight-reading and well-known pieces, working up through the grades.',
    units: [],
    comingSoon: 'Opens after Foundation. First stop: Minuet in G.',
  },
];

export const UNITS = {
  u1: { title: 'Finding your way around', lessons: ['l1-1', 'l1-2'] },
  u2: { title: 'The grand staff', lessons: ['l2-1', 'l2-2', 'l2-3'] },
  u3: { title: 'Rhythm basics', lessons: ['l3-1', 'l3-2'] },
  u4: { title: 'Middle C position: right hand', lessons: ['l4-1', 'l4-2', 'l4-3', 'l4-4'] },
  u5: { title: 'Middle C position: left hand', lessons: ['l5-1', 'l5-2', 'l5-3'] },
  u6: { title: 'Skips and C position', lessons: ['l6-1', 'l6-2', 'l6-3'] },
};

// Notes known once placement says the reading basics are solid.
export const PLACEMENT_POOL = ['C3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'C5'];
export const PLACEMENT_SKIPS = ['l1-1', 'l1-2', 'l2-1', 'l2-2', 'l2-3', 'l3-1', 'l3-2'];

export const LESSONS = {
  // ---------------- Unit 1 ----------------
  'l1-1': {
    title: 'Black key groups',
    minutes: 5,
    steps: [
      { type: 'text', title: 'The map is in the black keys',
        body: `<p>The black keys come in alternating groups of <b>two</b> and <b>three</b>. That pattern repeats all the way up the piano, and it's how you find every white note without looking at labels.</p>
               <p><b>C</b> is the white key just to the <b>left of each group of two</b>.</p>`,
        visual: { kind: 'keyboard', from: 48, to: 72, highlight: [48, 60, 72], labels: 'highlight' } },
      { type: 'find', prompt: 'Play any C', target: { pc: 0 }, count: 4, distinct: true,
        hint: 'Find a group of two black keys. C is the white key just to its left.' },
      { type: 'text', title: 'D and E',
        body: `<p><b>D</b> sits <b>between</b> the two black keys. <b>E</b> is just to the <b>right</b> of the pair.</p>
               <p>So the group of two gives you C, D and E.</p>`,
        visual: { kind: 'keyboard', from: 48, to: 72, highlight: [60, 62, 64], labels: 'highlight' } },
      { type: 'find', prompt: 'Play any D', target: { pc: 2 }, count: 3, distinct: true,
        hint: 'D is the white key in the middle of the two black keys.' },
      { type: 'find', prompt: 'Play any E', target: { pc: 4 }, count: 3, distinct: true,
        hint: 'E is just to the right of the group of two black keys.' },
    ],
  },
  'l1-2': {
    title: 'All seven white notes',
    minutes: 6,
    steps: [
      { type: 'text', title: 'A to G, then round again',
        body: `<p>Music uses just seven letters: <b>A B C D E F G</b>. After G it starts again at A.</p>
               <p>The group of <b>three</b> black keys holds <b>F G A B</b>. F is just left of the three, and B is just right of them.</p>`,
        visual: { kind: 'keyboard', from: 48, to: 72, highlight: [53, 55, 57, 59], labels: 'highlight' } },
      { type: 'find', prompt: 'Play any F', target: { pc: 5 }, count: 3, distinct: true,
        hint: 'F is just to the left of the group of three black keys.' },
      { type: 'find', prompt: 'Play any G', target: { pc: 7 }, count: 3, distinct: true },
      { type: 'find', prompt: 'Play any A', target: { pc: 9 }, count: 3, distinct: true },
      { type: 'find', prompt: 'Play any B', target: { pc: 11 }, count: 3, distinct: true,
        hint: 'B is just to the right of the group of three black keys.' },
      { type: 'text', title: 'Middle C',
        body: `<p><b>Middle C</b> is the C nearest the middle of the piano. On most pianos it's roughly under the brand name.</p>
               <p>It's the home base for everything in the next few units.</p>`,
        visual: { kind: 'keyboard', from: 48, to: 72, highlight: [60], labels: 'highlight' } },
      { type: 'find', prompt: 'Play Middle C', target: { midi: 60 }, count: 1,
        hint: 'Middle C is the C closest to the centre of the keyboard.' },
    ],
  },

  // ---------------- Unit 2 ----------------
  'l2-1': {
    title: 'Two staves, two clefs',
    minutes: 5,
    unlocks: ['C4'],
    steps: [
      { type: 'text', title: 'The grand staff',
        body: `<p>Piano music is written on two sets of five lines joined together: the <b>grand staff</b>.</p>
               <p>The top staff has a <b>treble clef</b> and mostly shows higher notes (usually your right hand). The bottom has a <b>bass clef</b> for lower notes (usually your left hand).</p>
               <p>Notes sit either <b>on a line</b> or <b>in a space</b>. Higher on the page means higher on the piano.</p>`,
        visual: { kind: 'staff', notes: [] } },
      { type: 'text', title: 'Middle C on paper',
        body: `<p>Middle C sits on its own short line, called a <b>ledger line</b>, right between the two staves.</p>
               <p>Here it is written just below the treble staff, which is where you'll usually see it for the right hand.</p>`,
        visual: { kind: 'staff', notes: ['C4'] } },
      { type: 'gym', prompt: 'Play the note you see', notes: ['C4'], count: 3 },
    ],
  },
  'l2-2': {
    title: 'Landmarks: Treble G and Bass F',
    minutes: 6,
    unlocks: ['G4', 'F3'],
    steps: [
      { type: 'text', title: 'Read from landmarks, not rhymes',
        body: `<p>Good readers don't spell out every note. They know a few <b>landmark notes</b> instantly and read the rest by <b>distance</b> from them.</p>
               <p>The clefs give you two landmarks for free. The <b>treble clef</b> curls around the second line up, which is <b>G</b> (the G above Middle C). The <b>bass clef</b>'s two dots sit either side of the second line down, which is <b>F</b> (the F below Middle C).</p>`,
        visual: { kind: 'staff', notes: ['G4', 'F3'] } },
      { type: 'gym', prompt: 'Play the note you see', notes: ['C4', 'G4', 'F3'], count: 12 },
    ],
  },
  'l2-3': {
    title: 'Landmarks: Treble C and Bass C',
    minutes: 6,
    unlocks: ['C5', 'C3'],
    steps: [
      { type: 'text', title: 'Two more Cs',
        body: `<p><b>Treble C</b> (one octave above Middle C) sits in the third space of the treble staff.</p>
               <p><b>Bass C</b> (one octave below Middle C) sits in the second space of the bass staff.</p>
               <p>Notice that the two Cs mirror each other around Middle C.</p>`,
        visual: { kind: 'staff', notes: ['C3', 'C4', 'C5'] } },
      { type: 'gym', prompt: 'Play the note you see', notes: ['C3', 'F3', 'C4', 'G4', 'C5'], count: 15 },
    ],
  },

  // ---------------- Unit 3 ----------------
  'l3-1': {
    title: 'Beats and note values',
    minutes: 6,
    steps: [
      { type: 'text', title: 'How long is a note?',
        body: `<p>The shape of a note tells you how long to hold it, counted in <b>beats</b>:</p>
               <ul><li><b>Crotchet</b> (quarter note): filled-in head with a stem. <b>1 beat</b>.</li>
               <li><b>Minim</b> (half note): hollow head with a stem. <b>2 beats</b>.</li>
               <li><b>Semibreve</b> (whole note): hollow head, no stem. <b>4 beats</b>.</li></ul>
               <p>The <b>4/4</b> at the start is the time signature: 4 crotchet beats in every bar.</p>`,
        visual: { kind: 'score', ex: { rh: 'C4/q C4/q C4/h | C4/w' } } },
      { type: 'play', title: 'Middle C rhythm',
        intro: 'Use your right thumb. Count "1 2 3 4" out loud, steadily, and hold each note for its full value. For now the app only checks the notes, not the rhythm, so the counting is up to you.',
        ex: { rh: 'C4/q:1 C4/q C4/h | C4/h C4/h | C4/q C4/q C4/q C4/q | C4/w', bpm: 72 } },
    ],
  },
  'l3-2': {
    title: 'Rests and bars',
    minutes: 5,
    steps: [
      { type: 'text', title: 'Silence counts too',
        body: `<p>A <b>rest</b> means silence for that many beats. Keep counting through it.</p>
               <p>The vertical lines are <b>bar lines</b>. Each bar holds exactly 4 beats in 4/4 time.</p>`,
        visual: { kind: 'score', ex: { rh: 'C4/q r/q C4/h | r/h C4/h' } } },
      { type: 'play', title: 'Rests on the beat',
        intro: 'Right thumb on Middle C. Count all four beats in every bar, including the rests.',
        ex: { rh: 'C4/q:1 r/q C4/q r/q | C4/h r/h | C4/q C4/q C4/q r/q | C4/w', bpm: 72 } },
    ],
  },

  // ---------------- Unit 4 ----------------
  'l4-1': {
    title: 'Right hand: C D E F G',
    minutes: 6,
    unlocks: ['D4', 'E4', 'F4'],
    steps: [
      { type: 'text', title: 'Middle C position',
        body: `<p>Put your right thumb on Middle C, then rest one finger on each white key going up: C D E F G.</p>
               <p>Fingers are numbered <b>1 (thumb) to 5 (little finger)</b>. The small numbers above notes tell you which finger to use.</p>
               <p>Keep your hand rounded, as if you're holding a ball, with the fingertips on the keys.</p>`,
        visual: { kind: 'keyboard', from: 55, to: 72, highlight: [60, 62, 64, 65, 67], labels: 'highlight' } },
      { type: 'play', title: 'Up and down',
        intro: 'Thumb on Middle C. One finger per note, and watch the page, not your hand.',
        ex: { rh: 'C4/q:1 D4/q:2 E4/q:3 F4/q:4 | G4/w:5 | G4/q:5 F4/q:4 E4/q:3 D4/q:2 | C4/w:1', bpm: 72 } },
      { type: 'gym', prompt: 'Play the note you see', notes: ['C4', 'D4', 'E4', 'F4', 'G4'], count: 15 },
    ],
  },
  'l4-2': {
    title: 'Steps',
    minutes: 6,
    steps: [
      { type: 'text', title: 'Reading by direction',
        body: `<p>When a note moves from a line to the very next space, or a space to the very next line, it's a <b>step</b>. That means the next key, and the next finger.</p>
               <p>Don't name every note. Find the first one, then follow the shape: <b>up a step, down a step, same note</b>.</p>` },
      { type: 'play', title: 'Hot Cross Buns',
        intro: 'Starts on E with finger 3. Every move is a step or a repeat.',
        ex: { rh: 'E4/q:3 D4/q:2 C4/h:1 | E4/q D4/q C4/h | C4/8 C4/8 C4/8 C4/8 D4/8 D4/8 D4/8 D4/8 | E4/q D4/q C4/h', bpm: 80 } },
    ],
  },
  'l4-3': {
    title: 'Mary Had a Little Lamb',
    minutes: 6,
    steps: [
      { type: 'play', title: 'Mary Had a Little Lamb',
        intro: 'Finger 3 on E to start. Watch for the jump up to G in bar 4.',
        ex: { rh: 'E4/q:3 D4/q:2 C4/q:1 D4/q:2 | E4/q E4/q E4/h | D4/q D4/q D4/h | E4/q G4/q:5 G4/h | E4/q:3 D4/q C4/q D4/q | E4/q E4/q E4/q E4/q | D4/q D4/q E4/q D4/q | C4/w', bpm: 84 } },
    ],
  },
  'l4-4': {
    title: 'Ode to Joy (right hand)',
    minutes: 8,
    milestone: 'Your first real classical theme: Beethoven, right hand',
    steps: [
      { type: 'text', title: 'Beethoven, 1824',
        body: `<p>This tune comes from Beethoven's 9th Symphony. It uses only the five notes under your right hand, and almost every move is a step.</p>
               <p>The <b>dotted crotchet</b> (a crotchet with a dot after it) lasts 1½ beats, and the quaver after it is the other half beat. That gives the little "lilt" at the end of each phrase.</p>` },
      { type: 'play', title: 'Ode to Joy',
        intro: 'Finger 3 on E. Play it slowly. Aim for no stumbles rather than speed.',
        pass: 0.85,
        ex: { rh: 'E4/q:3 E4/q F4/q:4 G4/q:5 | G4/q F4/q E4/q D4/q:2 | C4/q:1 C4/q D4/q E4/q | E4/q. D4/8 D4/h | E4/q E4/q F4/q G4/q | G4/q F4/q E4/q D4/q | C4/q C4/q D4/q E4/q | D4/q. C4/8 C4/h', bpm: 84 } },
    ],
  },

  // ---------------- Unit 5 ----------------
  'l5-1': {
    title: 'Left hand: C B A G F',
    minutes: 6,
    unlocks: ['B3', 'A3', 'G3'],
    steps: [
      { type: 'text', title: 'Thumbs share Middle C',
        body: `<p>Put your <b>left</b> thumb on Middle C, then rest one finger on each white key going <b>down</b>: C B A G F.</p>
               <p>Left-hand fingers are numbered the same way: <b>thumb is 1</b>. So finger 5 lands on the F below Middle C, which is your Bass F landmark.</p>`,
        visual: { kind: 'keyboard', from: 48, to: 64, highlight: [53, 55, 57, 59, 60], labels: 'highlight' } },
      { type: 'play', title: 'Down and back',
        intro: 'Left thumb on Middle C. These notes are in the bass clef.',
        ex: { lh: 'C4/q:1 B3/q:2 A3/q:3 G3/q:4 | F3/w:5 | F3/q:5 G3/q:4 A3/q:3 B3/q:2 | C4/w:1', bpm: 72 } },
      { type: 'gym', prompt: 'Play the note you see', notes: ['F3', 'G3', 'A3', 'B3', 'C4'], count: 15 },
    ],
  },
  'l5-2': {
    title: 'Left hand melody',
    minutes: 6,
    steps: [
      { type: 'play', title: 'Steps in the bass',
        intro: 'Find the first note from your landmark: Bass F is the line between the two dots of the bass clef.',
        ex: { lh: 'F3/q:5 G3/q A3/q B3/q | C4/h:1 A3/h | G3/q A3/q B3/q G3/q | F3/w', bpm: 76 } },
    ],
  },
  'l5-3': {
    title: 'Hands take turns',
    minutes: 7,
    steps: [
      { type: 'text', title: 'Both thumbs on Middle C',
        body: `<p>Now both hands sit in Middle C position at the same time, with both thumbs sharing Middle C.</p>
               <p>The hands take turns. When one is playing, the other has a rest. Keep both hands resting on the keys.</p>` },
      { type: 'play', title: 'Question and answer',
        intro: 'Right hand asks, left hand answers.',
        ex: { rh: 'E4/q:3 F4/q G4/h | r/w | G4/q F4/q E4/q D4/q | r/w',
              lh: 'r/w | C4/q:1 B3/q A3/h | r/w | B3/q A3/q G3/h', bpm: 76 } },
    ],
  },

  // ---------------- Unit 6 ----------------
  'l6-1': {
    title: 'Skips',
    minutes: 6,
    steps: [
      { type: 'text', title: 'Line to line, space to space',
        body: `<p>When a note moves from a <b>line to the next line</b>, or a <b>space to the next space</b>, it skips one key. That's a <b>skip</b> (also called a 3rd), and you skip one finger too.</p>
               <p>Steps look like neighbours on the staff. Skips leave a gap. Learn to see that gap, and you'll often know the next note without naming it.</p>`,
        visual: { kind: 'score', ex: { rh: 'C4/q E4/q G4/q E4/q | C4/w' } } },
      { type: 'play', title: 'Skipping up and down',
        intro: 'Right hand in Middle C position. Fingers 1, 3 and 5 do most of the work.',
        ex: { rh: 'C4/q:1 E4/q:3 G4/q:5 E4/q | C4/h E4/h | D4/q:2 F4/q:4 E4/q D4/q | C4/w', bpm: 76 } },
    ],
  },
  'l6-2': {
    title: 'C position: left hand',
    minutes: 7,
    unlocks: ['D3', 'E3'],
    steps: [
      { type: 'text', title: 'Moving the left hand down',
        body: `<p>Now move the left hand down so that <b>finger 5 is on Bass C</b> (the C below Middle C). The fingers cover C D E F G, with the thumb on G.</p>
               <p>This is <b>C position</b>. You'll use it constantly, especially for chords later.</p>`,
        visual: { kind: 'keyboard', from: 43, to: 60, highlight: [48, 50, 52, 53, 55], labels: 'highlight' } },
      { type: 'play', title: 'Left hand in C position',
        intro: 'Finger 5 on Bass C, your landmark in the second space of the bass staff.',
        ex: { lh: 'C3/q:5 D3/q:4 E3/q:3 F3/q:2 | G3/w:1 | G3/q F3/q E3/q D3/q | C3/w', bpm: 76 } },
      { type: 'gym', prompt: 'Play the note you see', notes: ['C3', 'D3', 'E3', 'F3', 'G3'], count: 15 },
    ],
  },
  'l6-3': {
    title: 'Ode to Joy (both hands, taking turns)',
    minutes: 8,
    milestone: 'Foundation complete: reading both clefs, both hands',
    steps: [
      { type: 'text', title: 'Putting it together',
        body: `<p>Right hand in Middle C position, left hand in C position.</p>
               <p>The right hand plays the first phrase. The left hand answers with the same tune an octave lower.</p>` },
      { type: 'play', title: 'Ode to Joy, shared',
        intro: 'Go slowly. Get the hand changes smooth before you speed up.',
        pass: 0.85,
        ex: { rh: 'E4/q:3 E4/q F4/q G4/q | G4/q F4/q E4/q D4/q | C4/q C4/q D4/q E4/q | E4/q. D4/8 D4/h | r/w | r/w | r/w | r/w',
              lh: 'r/w | r/w | r/w | r/w | E3/q:3 E3/q F3/q:2 G3/q:1 | G3/q F3/q E3/q D3/q:4 | C3/q:5 C3/q D3/q E3/q | D3/q. C3/8 C3/h', bpm: 80 } },
    ],
  },
};

export const FOUNDATION_ORDER = TRACKS[0].units.flatMap(u => UNITS[u].lessons);

export function unitOf(lessonId) {
  return Object.entries(UNITS).find(([, u]) => u.lessons.includes(lessonId))?.[0];
}
