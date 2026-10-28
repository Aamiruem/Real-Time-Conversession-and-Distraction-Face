// Site-wide SEO constants and the content of the statically generated marketing pages.
export const SITE_URL = (import.meta.env.VITE_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "FocusLink AI";
export const TAGLINE = "AI Focus Tracker, Interview & Speech Coach";
export const DESCRIPTION =
  "Free AI focus tracker and interview coach: real-time distraction & drowsiness detection, mock interviews " +
  "with body-language feedback, an AI speech and conversation coach, and machine-learning fatigue prediction.";

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
  {
    slug: "interview-preparation",
    icon: "💼",
    title: "AI interview preparation with mock interviews and body-language feedback",
    metaTitle: "AI Mock Interview Practice – Interview Preparation for Any Job",
    metaDescription:
      "Practise mock interviews for 15 job fields. AI scores your answer, delivery, eye contact, smile, posture and gestures, then tells you exactly how to improve.",
    keywords: [
      "mock interview practice",
      "AI interview preparation",
      "interview questions and answers",
      "STAR method practice",
      "body language interview tips",
      "video interview practice",
    ],
    summary:
      "Answer real interview questions on camera and get an interview-readiness score from what you said, how you said it and how you came across — with the fixes that matter most.",
    sections: [
      {
        heading: "Mock interviews for any field",
        body: "Software, data, sales, finance, healthcare, teaching, HR, design, engineering, management, hospitality and more — each with role-specific questions, the skills interviewers test and the right dress code.",
      },
      {
        heading: "Content, delivery and presence — all scored",
        body: "Your answer is checked for relevance (machine-learning text similarity), STAR structure, strong vocabulary and a confident opening. Delivery covers fluency, hedging and voice modulation. Computer vision measures eye contact, smile, posture, hand gestures, lighting and anything distracting in the frame.",
      },
      {
        heading: "A complete preparation guide",
        body: "From getting the interview (CV keywords, LinkedIn, referrals) to the first 30 seconds, dressing, sitting posture, eye contact, tone, answering tough questions, questions to ask and the follow-up email.",
      },
    ],
    faq: [
      {
        q: "Which interview questions can I practise?",
        a: "Common questions like “Tell me about yourself”, strengths and weaknesses, conflict and failure stories, plus role-specific questions for 15 job fields.",
      },
      {
        q: "Does it check my body language?",
        a: "Yes. Pose and object detection run in your browser and score posture, gestures, face touching, crossed arms and distractions such as a phone in view.",
      },
      {
        q: "Can I control it hands-free?",
        a: "Yes — say “start recording”, “stop recording” or “next question”, or use keyboard shortcuts.",
      },
    ],
  },
  {
    slug: "conversation-coach",
    icon: "🗨️",
    title: "Conversation coach for fluency, confidence and voice modulation",
    metaTitle: "AI Conversation Coach – Fluency, Confidence & Tone Feedback",
    metaDescription:
      "Record any conversation — interview, sales call, presentation, meeting or small talk — and get scores for fluency, word confidence, focus, interaction and voice modulation.",
    keywords: [
      "conversation practice",
      "communication skills",
      "fluency practice",
      "voice modulation",
      "speaking confidence app",
    ],
    summary:
      "Pick one of ten conversation types, talk, and see where you are strong and what needs improvement — as percentages, with suggestions written for that kind of conversation.",
    sections: [
      {
        heading: "Five areas that make a conversation work",
        body: "Fluency (fillers, pauses, pace), word confidence (hedging vs. decisive wording), focus (eye contact), interaction (questions, “you” and “we”, acknowledging the other person) and voice modulation (pitch and volume variety).",
      },
      {
        heading: "Tailored to the situation",
        body: "A sales call, a debate and a casual chat need different things. Each conversation type has its own ideal pace, weighting and advice.",
      },
      {
        heading: "Say it better next time",
        body: "Every recording comes with a rewrite of what you said without fillers and hedges, plus practice drills for your weakest area.",
      },
    ],
    faq: [
      {
        q: "Do I need a camera?",
        a: "No. Voice-only mode scores everything except eye contact.",
      },
      {
        q: "Which conversation types are supported?",
        a: "Job interview, presentation, team meeting, sales pitch, casual conversation, debate, customer support, teaching, storytelling and phone or video calls.",
      },
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
  {
    q: "Can I practise job interviews?",
    a: "Yes. Mock interviews for 15 job fields score your answer, delivery, eye contact, posture and gestures, with a full preparation guide.",
  },
  { q: "Is FocusLink AI free?", a: "Yes — create an account with your email and start a session in seconds." },
];

export function jsonLd(data) {
  // Escape "<" so user-controlled strings can never close the script tag.
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
