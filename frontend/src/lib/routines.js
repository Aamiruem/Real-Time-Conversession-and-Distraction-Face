// Guided routines for the skin check: skincare, yoga and posture — each step is an animated illustration (two
// keyframes the player blends between, in rhythm with the breath), a spoken + captioned instruction and a timer.
//
// Body poses: joint points in a 200×150 box, floor at y = 140, figure facing left for floor poses.
// head, neck, hip, l/r knee (lk/rk), l/r foot (lf/rf), l/r elbow (le/re), l/r hand (lh/rh).

const STAND = { head: [100, 28], neck: [100, 40], hip: [100, 82], lk: [96, 110], lf: [95, 138], rk: [104, 110], rf: [105, 138], le: [90, 60], lh: [88, 80], re: [110, 60], rh: [112, 80] };
const SEATED = { head: [100, 52], neck: [100, 64], hip: [100, 108], lk: [72, 118], lf: [108, 124], rk: [128, 118], rf: [92, 124], le: [82, 86], lh: [76, 112], re: [118, 86], rh: [124, 112] };
const pose = (base, patch) => ({ ...base, ...patch });

export const POSES = {
  stand: [STAND, pose(STAND, { neck: [100, 39], head: [100, 27] })],
  seated: [SEATED, pose(SEATED, { neck: [100, 62], head: [100, 50], le: [81, 85], re: [119, 85] })],
  anulom: [pose(SEATED, { re: [116, 76], rh: [104, 58] }), pose(SEATED, { re: [114, 78], rh: [98, 58], neck: [100, 62], head: [100, 50] })],
  bhramari: [pose(SEATED, { le: [80, 60], lh: [92, 50], re: [120, 60], rh: [108, 50] }), pose(SEATED, { le: [80, 59], lh: [92, 49], re: [120, 59], rh: [108, 49], neck: [100, 62], head: [100, 50] })],
  downdog: [
    { head: [66, 108], neck: [74, 98], hip: [120, 52], lk: [132, 95], lf: [146, 138], rk: [134, 95], rf: [150, 136], le: [60, 118], lh: [46, 138], re: [62, 118], rh: [50, 138] },
    { head: [66, 110], neck: [74, 100], hip: [122, 45], lk: [134, 92], lf: [146, 138], rk: [136, 92], rf: [149, 138], le: [60, 119], lh: [46, 138], re: [62, 119], rh: [50, 138] },
  ],
  cobra: [
    { head: [52, 128], neck: [64, 130], hip: [112, 134], lk: [140, 136], lf: [168, 138], rk: [142, 137], rf: [170, 138], le: [66, 138], lh: [54, 138], re: [68, 138], rh: [56, 138] },
    { head: [54, 92], neck: [64, 104], hip: [112, 132], lk: [140, 136], lf: [168, 138], rk: [142, 137], rf: [170, 138], le: [70, 122], lh: [64, 138], re: [72, 122], rh: [66, 138] },
  ],
  child: [
    { head: [66, 128], neck: [78, 122], hip: [134, 112], lk: [118, 138], lf: [150, 138], rk: [120, 138], rf: [152, 138], le: [56, 132], lh: [36, 138], re: [58, 132], rh: [38, 138] },
    { head: [66, 127], neck: [78, 120], hip: [134, 107], lk: [118, 138], lf: [150, 138], rk: [120, 138], rf: [152, 138], le: [56, 132], lh: [36, 138], re: [58, 132], rh: [38, 138] },
  ],
  legsup: [
    { head: [40, 130], neck: [52, 132], hip: [108, 134], lk: [112, 98], lf: [114, 62], rk: [114, 98], rf: [116, 62], le: [66, 140], lh: [80, 140], re: [70, 138], rh: [86, 138] },
    { head: [40, 130], neck: [52, 131], hip: [108, 133], lk: [112, 98], lf: [114, 62], rk: [114, 98], rf: [116, 62], le: [66, 140], lh: [80, 140], re: [70, 138], rh: [86, 138] },
  ],
  necktilt: [pose(STAND, { head: [92, 30] }), pose(STAND, { head: [108, 30] })],
  shoulders: [pose(STAND, { neck: [100, 37], le: [90, 56], re: [110, 56], lh: [88, 76], rh: [112, 76] }), pose(STAND, { neck: [100, 42], le: [90, 63], re: [110, 63], lh: [88, 83], rh: [112, 83] })],
  chintuck: [pose(STAND, { head: [104, 28] }), pose(STAND, { head: [97, 29] })],
  walk: [
    pose(STAND, { lk: [92, 110], lf: [84, 138], rk: [108, 110], rf: [114, 136], le: [106, 62], lh: [112, 80], re: [94, 62], rh: [88, 80] }),
    pose(STAND, { lk: [108, 110], lf: [114, 136], rk: [92, 110], rf: [84, 138], le: [94, 62], lh: [88, 80], re: [106, 62], rh: [112, 80] }),
  ],
};

const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

// kind: "body" (animated figure; `pose` from POSES) or "face" (animated face; `face` = which skincare action)
// period: seconds for one A→B→A cycle (≈ one breath in yoga)
export const ROUTINES = [
  {
    id: "am",
    title: "Morning skincare",
    sub: "3 minutes · cleanse, protect",
    color: "#0284c7",
    steps: [
      { kind: "face", face: "rinse", title: "Rinse", secs: 20, period: 2, how: "Splash your face with lukewarm water. Not hot — hot water dries and reddens skin.", demo: yt("how to wash face properly dermatologist") },
      { kind: "face", face: "cleanse", title: "Cleanse", secs: 60, period: 3, how: "A pea-sized amount of gentle cleanser. Massage in small circles for 60 seconds, including the sides of the nose and the jawline.", demo: yt("60 second face cleansing rule") },
      { kind: "face", face: "pat", title: "Pat dry", secs: 15, period: 1.5, how: "Pat — don't rub — with a clean towel. Leave the skin slightly damp.", demo: yt("pat dry face towel skincare") },
      { kind: "face", face: "serum", title: "Serum (optional)", secs: 30, period: 3, how: "Two or three drops of vitamin C or niacinamide serum. Press gently into the skin.", demo: yt("how to apply vitamin c serum") },
      { kind: "face", face: "moisturise", title: "Moisturise", secs: 30, period: 3, how: "Dot moisturiser on the forehead, cheeks and chin, then spread outwards and upwards.", demo: yt("how to apply moisturizer correctly") },
      { kind: "face", face: "sunscreen", title: "Sunscreen SPF 30+", secs: 30, period: 3, how: "Two finger-lengths of sunscreen for face and neck. Don't forget ears and the back of the neck. Reapply every 2 to 3 hours outdoors.", demo: yt("two finger rule sunscreen how much") },
    ],
  },
  {
    id: "pm",
    title: "Night skincare",
    sub: "3 minutes · clean, repair",
    color: "#7c3aed",
    steps: [
      { kind: "face", face: "cleanse", title: "Remove sunscreen & makeup", secs: 45, period: 3, how: "First cleanse: micellar water or a cleansing balm to lift sunscreen and makeup.", demo: yt("double cleansing routine how to") },
      { kind: "face", face: "cleanse", title: "Second cleanse", secs: 60, period: 3, how: "Gentle cleanser again, small circles for a full minute, then rinse with lukewarm water.", demo: yt("gentle face cleanser night routine") },
      { kind: "face", face: "pat", title: "Pat dry", secs: 15, period: 1.5, how: "Pat dry with a clean towel.", demo: yt("pat dry face towel skincare") },
      { kind: "face", face: "serum", title: "Treatment", secs: 30, period: 3, how: "Your treatment, if you use one — for example niacinamide, azelaic acid or retinol two nights a week. One active at a time.", demo: yt("how to start retinol beginners dermatologist") },
      { kind: "face", face: "moisturise", title: "Moisturise", secs: 30, period: 3, how: "Moisturiser over everything, outwards and upwards. A little under the eyes with your ring finger.", demo: yt("night moisturizer how to apply") },
    ],
  },
  {
    id: "yoga",
    title: "Yoga for calm & glow",
    sub: "5 minutes · breathing and gentle poses",
    color: "#16a34a",
    steps: [
      { kind: "body", pose: "seated", title: "Sukhasana — settle", secs: 30, period: 5, how: "Sit cross-legged, back tall, hands on your knees. Breathe in slowly through the nose, and out.", demo: yt("sukhasana easy pose how to") },
      { kind: "body", pose: "anulom", title: "Anulom Vilom", secs: 60, period: 8, how: "Close the right nostril with your thumb, breathe in through the left. Close the left, breathe out through the right. Then reverse.", demo: yt("anulom vilom pranayama step by step") },
      { kind: "body", pose: "bhramari", title: "Bhramari — humming bee", secs: 45, period: 7, how: "Thumbs gently on the ear flaps. Breathe in, then hum like a bee as you breathe out. Feel the face relax.", demo: yt("bhramari pranayama how to") },
      { kind: "body", pose: "downdog", title: "Downward dog", secs: 30, period: 5, how: "Hands and feet on the floor, hips high, like an upside-down V. Press the heels towards the floor. Bend the knees if needed.", demo: yt("downward dog pose beginners") },
      { kind: "body", pose: "cobra", title: "Bhujangasana — cobra", secs: 30, period: 5, how: "Lie on your front, hands under the shoulders. Breathe in and lift the chest gently, elbows bent. Breathe out and lower.", demo: yt("bhujangasana cobra pose beginners") },
      { kind: "body", pose: "child", title: "Balasana — child's pose", secs: 45, period: 6, how: "Knees down, sit back on your heels, stretch the arms forward, forehead to the floor. Breathe into your back.", demo: yt("balasana child's pose how to") },
      { kind: "body", pose: "legsup", title: "Legs up the wall", secs: 60, period: 6, how: "Lie on your back with your legs resting up a wall. Arms relaxed. Slow, easy breaths.", demo: yt("viparita karani legs up the wall") },
    ],
  },
  {
    id: "desk",
    title: "Desk posture reset",
    sub: "2 minutes · neck, shoulders, circulation",
    color: "#d97706",
    steps: [
      { kind: "body", pose: "necktilt", title: "Neck side stretch", secs: 30, period: 6, how: "Slowly tilt your ear towards one shoulder, hold, then the other side. Shoulders stay down.", demo: yt("neck side stretch desk") },
      { kind: "body", pose: "shoulders", title: "Shoulder rolls", secs: 30, period: 3, how: "Roll your shoulders up, back and down. Big slow circles.", demo: yt("shoulder rolls exercise") },
      { kind: "body", pose: "chintuck", title: "Chin tucks", secs: 30, period: 4, how: "Glide your chin straight back, making a double chin. Hold for two seconds and release. It undoes the screen-forward head.", demo: yt("chin tuck exercise posture") },
      { kind: "body", pose: "walk", title: "March in place", secs: 30, period: 1.2, how: "March on the spot and swing your arms — it gets the blood moving after sitting.", demo: yt("march in place exercise beginners") },
    ],
  },
];

export const routineLength = (r, scale = 1) => r.steps.reduce((a, s) => a + s.secs * scale, 0);
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
