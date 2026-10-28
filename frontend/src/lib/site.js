// Site-wide SEO constants and the content of the statically generated marketing pages.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "FocusLink AI";
export const TAGLINE = "AI Focus Tracker, Speech Coach & Fatigue Detection";
export const DESCRIPTION =
  "Free AI focus tracker: real-time distraction & drowsiness detection from your webcam, an AI speech coach " +
  "for confident speaking, machine-learning fatigue prediction and focus-aware chat rooms.";

export const FEATURES = [
  {
    slug: "focus-tracker",
    icon: "🎥",
    title: "AI focus tracker with webcam distraction & drowsiness detection",
    metaTitle: "AI Focus Tracker – Webcam Distraction Detection",
    metaDescription:
      "Measure your real focus while studying or working. Webcam AI detects distraction, drowsiness, blinks and yawns live and gives you a focus %.",
    keywords: ["focus tracker", "distraction detection", "drowsiness detection", "study focus app", "webcam attention"],
    summary:
      "FocusLink watches 478 face landmarks in your browser and tells you, second by second, whether you are focused, distracted, drowsy or away.",
    sections: [
      {
        heading: "How the focus score is measured",
        body: "Eye aspect ratio detects blinks and closed eyes, mouth aspect ratio detects yawns, the face's 3-D rotation gives head pose, and iris position gives gaze direction. Looking away for more than 1.5 seconds counts as distracted; eyes closed for more than 1.2 seconds counts as drowsy and sounds an alarm. Your focus % is the share of time spent focused.",
      },
      {
        heading: "Private by design",
        body: "Face analysis runs locally in your browser with MediaPipe. Video never leaves your device — only numbers such as focus %, blink rate and head angle are saved to your account.",
      },
      {
        heading: "Built for students and remote workers",
        body: "Use it for study sessions, deep work blocks or online classes. Every session is saved so you can see your focus trend, best time of day and how long you can stay focused.",
      },
    ],
    faq: [
      {
        q: "Does the focus tracker record my video?",
        a: "No. Video is analysed in your browser and never uploaded or stored.",
      },
      {
        q: "Does it work without installing anything?",
        a: "Yes. It runs in Chrome, Edge, Firefox and Safari with webcam permission.",
      },
    ],
  },
  {
    slug: "speech-coach",
    icon: "🗣️",
    title: "AI speech coach for confident speaking and clear pronunciation",
    metaTitle: "AI Speech Coach – Speak With Confidence",
    metaDescription:
      "Practise speaking with an AI coach: get a confidence score, pronunciation feedback, filler-word count, pace and pitch analysis, plus a better way to say it.",
    keywords: [
      "AI speech coach",
      "public speaking practice",
      "pronunciation practice",
      "filler words",
      "speaking confidence",
    ],
    summary:
      "Talk to your camera for a minute and get a confidence score from 0–100 with specific tips — and a rewrite of what you said, minus the 'um's and 'I think maybe's.",
    sections: [
      {
        heading: "Seven signals of a confident speaker",
        body: "Pace (120–160 words per minute), filler words, hesitation pauses, pronunciation clarity, pitch variety, assertive wording and eye contact are combined into one confidence score, so you know exactly what to work on next.",
      },
      {
        heading: "Pronunciation practice with read-aloud mode",
        body: "Read a passage and the coach aligns what it heard with the text, highlighting words you skipped or said differently so you can practise them.",
      },
      {
        heading: "Interview, presentation and pitch practice",
        body: "Pick a topic such as a job-interview introduction or a 60-second pitch, record, and track your confidence improving over time in your analytics.",
      },
    ],
    faq: [
      {
        q: "Which speech recognition does it use?",
        a: "Whisper (faster-whisper) running on our server; recordings are analysed and not kept.",
      },
      {
        q: "Can I practise pronunciation?",
        a: "Yes. Read-aloud mode compares your speech with the passage and lists misread words.",
      },
    ],
  },
  {
    slug: "fatigue-prediction",
    icon: "🧠",
    title: "Fatigue prediction with machine learning",
    metaTitle: "Fatigue Prediction with Machine Learning",
    metaDescription:
      "A machine-learning model predicts your fatigue risk after every focus session from blink rate, yawns, eye openness, time of day and session length.",
    keywords: ["fatigue prediction", "burnout risk", "eye strain", "machine learning", "study breaks"],
    summary:
      "After each session a scikit-learn model estimates your fatigue risk — low, medium or high — explains which signals drove it, and learns from how tired you say you feel.",
    sections: [
      {
        heading: "What the model looks at",
        body: "Session length, start hour, focused/distracted/drowsy time, time away from the screen, blink rate, yawns per 10 minutes and average eye openness.",
      },
      {
        heading: "It learns from you",
        body: "Rate how tired you feel after a session. Those ratings become training labels, and the model is retrained to match your own patterns.",
      },
      {
        heading: "Transparent by default",
        body: "The model card shows the algorithm chosen by cross-validation, test accuracy, the confusion matrix and which features matter most.",
      },
    ],
    faq: [
      { q: "Is this a medical diagnosis?", a: "No. It is a productivity aid that suggests when to take a break." },
      { q: "How accurate is it?", a: "The live model card in the app shows its current test accuracy and F1 score." },
    ],
  },
];

export const HOME_FAQ = [
  {
    q: "Is my webcam video uploaded anywhere?",
    a: "No. Face analysis runs in your browser and only numbers such as focus % and blink rate are saved.",
  },
  {
    q: "How does the AI speech coach measure confidence?",
    a: "It scores pace, filler words, pauses, pronunciation clarity, pitch variety, hedging language and eye contact, then gives tips and a more confident rewrite of what you said.",
  },
  {
    q: "How is fatigue predicted?",
    a: "A scikit-learn model uses session length, time of day, drowsy and distracted time, blink rate, yawns and eye openness, and improves from your own ratings.",
  },
  { q: "Is FocusLink AI free?", a: "Yes — create an account with your email and start a session in seconds." },
];

export function jsonLd(data) {
  // Escape "<" so user-controlled strings can never close the script tag.
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
