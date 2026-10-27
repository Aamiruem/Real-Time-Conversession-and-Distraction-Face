# 🎯 FocusLink AI — Real-Time Attention, Distraction Detection & Focus-Aware Conversations

FocusLink AI watches your webcam and computes, live and per frame, whether you are **Focused, Distracted,
Drowsy, Yawning or away**. It also shows your **focus % and distraction %**. A **Speech Coach** scores your
speaking confidence and pronunciation, a **machine-learning model** predicts fatigue risk, and in **Focus
Rooms** people chat in real time while seeing each other's live focus.

The frontend is a **Next.js (React) app** with server-rendered, SEO-optimised public pages. The backend is
**FastAPI**, with data in **SQL (SQLite / AWS RDS PostgreSQL) + S3**.

📘 **Step-by-step guide from setup to a live AWS deployment: [docs/PIPELINE.md](docs/PIPELINE.md)**

## ✨ Features

| Area | What it does | Tech |
|---|---|---|
| Computer Vision | 478-point face landmarks (with iris), Eye Aspect Ratio, blink rate, yawns (MAR), head pose, gaze — **runs in the browser**, so video never leaves the device | MediaPipe Tasks (WebAssembly), TypeScript |
| AI state engine | Time-based rules → Focused / Distracted / Drowsy / Yawning / No Face, live **Focus %**, drowsiness alarm | `web/lib/attention.ts` (port of `cv/`) |
| Speech Coach | Transcript, pace (WPM), filler words, pauses, pronunciation clarity, read-aloud accuracy, pitch variety, assertive wording, eye contact → **confidence score** + tips + a "say it like this" rewrite | faster-whisper, NumPy |
| Machine learning | Fatigue-risk classifier: CV model selection, model card, per-prediction explanations, retraining from users' own ratings | scikit-learn |
| NLP | Sentiment (VADER or **Amazon Comprehend**), toxicity, keywords, wording confidence, conversation summaries | vaderSentiment |
| Real-time rooms | WebSocket chat, presence, typing, everyone's live focus, drowsy alerts | FastAPI WebSockets |
| Auth | Sign up and log in with username / email / mobile + password, OTP login, password reset. **Easy mode** (default locally): accounts work instantly. **Verified mode**: email + mobile OTP via **AWS SES / SNS** | JWT, bcrypt |
| SEO | Static HTML landing + keyword-targeted feature pages, metadata API, Open Graph/Twitter, JSON-LD (SoftwareApplication, Organization, FAQPage, BreadcrumbList), sitemap.xml, robots.txt, manifest; the private app is `noindex` | Next.js 16 |
| Cloud | RDS, S3, SES, SNS, Comprehend, EC2 + Docker + Nginx | boto3, Docker |

## 📁 Project structure

```
├── web/                        # Next.js (React) frontend
│   ├── app/page.tsx            # SEO landing page (static)
│   ├── app/features/[slug]/    # SEO feature pages (static)
│   ├── app/login · signup      # auth (password, OTP login, reset, verification)
│   ├── app/app/…               # private app: dashboard, focus, speech, rooms, analytics, lab
│   ├── app/sitemap.ts · robots.ts · manifest.ts
│   ├── lib/attention.ts        # in-browser attention engine
│   ├── lib/useFaceTracker.ts   # camera + MediaPipe face landmarker
│   └── lib/api.ts · auth.tsx   # API client (proxied via /api) + login state
├── backend/                    # FastAPI: auth/OTP, attention, speech, rooms + WS, analytics, ML/NLP API
├── cv/                         # Python attention engine (reference + legacy Streamlit app)
├── nlp/                        # text analysis engine
├── speech/                     # speech coach engine + audio decoding
├── ml/                         # fatigue model: features, dataset, train, predict
├── tests/                      # pytest: auth/OTP, easy mode, AI modules, ML API, speech upload
├── frontend/                   # legacy Streamlit UI (optional; the React app replaces it)
├── deploy/nginx.conf           # / → Next.js, /api/ + /ws/ → FastAPI
├── Dockerfile.backend · Dockerfile.web · docker-compose.yml
└── docs/PIPELINE.md            # initial → live walkthrough
```

## 🚀 Run locally (Windows)

> Backend needs Python 3.11 (MediaPipe/Whisper wheels); frontend needs Node.js ≥ 20.

```powershell
# one-time setup
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-backend.txt
cd web; npm install; cd ..

# Terminal 1 — API on port 8010 (docs: http://localhost:8010/docs)
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8010

# Terminal 2 — website + app on http://localhost:3000
cd web; npm run dev

# Tests
.venv\Scripts\python.exe -m pytest -q tests
cd web; npm run typecheck; npm run build
```

**Why port 8010?** Another project on this machine already uses port 8000. If the frontend talks to the wrong
backend you'll see errors that aren't from FocusLink, such as "Enter your owner email address".

**Login:** with `AWS_ENABLED=false` (the default), anyone can create an account and is signed in immediately,
and the mobile number is optional. Set `REQUIRE_VERIFICATION=true` to require email + mobile OTP codes. Until
AWS SES/SNS is configured, those codes are shown on screen and in the API log.

## 🐳 Docker (PostgreSQL + Nginx included)

```bash
cp .env.example .env
docker compose up --build      # http://localhost
```

## ☁️ AWS

1. `aws configure`, then `DB_PASS=YourStrongPass SES_SENDER=no-reply@yourdomain.com bash aws/setup_aws.sh`.
   This creates the S3 bucket, RDS PostgreSQL, the SES sender, SNS SMS settings and the IAM policy.
2. In `.env` set `AWS_ENABLED=true`, `DATABASE_URL_OVERRIDE=<rds url>`, `SES_SENDER` and
   `SITE_URL=https://yourdomain.com`. Request SES/SNS production access (India: DLT registration for SMS).
3. On an Ubuntu EC2 instance with the `FocusLinkAIPolicy` role, run `bash aws/deploy_ec2.sh`.
4. Add HTTPS (browsers only allow camera/mic on HTTPS). See [docs/PIPELINE.md](docs/PIPELINE.md) step 9.

## 🧠 How the focus score is computed

* **EAR** = (|p2−p6| + |p3−p5|) / (2·|p1−p4|). If EAR stays below 0.21 for less than 1.2 s, it counts as
  a blink. If it stays below for 1.2 s or more, the state is **Drowsy** and the alarm sounds.
* **MAR** (mouth opening ÷ mouth width) above 0.6 for 0.8 s counts as a **Yawn**.
* **Head pose** comes from MediaPipe's 3-D facial transformation matrix. |yaw| > 25° or |pitch| > 20° means
  looking away.
* **Gaze** comes from the iris position between the eye corners. Outside 0.38–0.62 means looking sideways.
* If the user looks away for 1.5 s or more, the state is **Distracted**.
* **Focus %** = time spent Focused ÷ total session time.

Thresholds: `web/lib/attention.ts → THRESHOLDS` (browser) and `cv/attention_detector.py → Thresholds`.

## 🔌 Main API

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/config` | Whether sign-up needs OTP verification |
| POST | `/auth/register` (→ `/auth/verify` in verified mode) | Sign up; returns a JWT straight away in easy mode |
| POST | `/auth/login`, `/auth/otp/request`, `/auth/otp/login`, `/auth/password/reset` | Password / OTP sign-in, reset |
| POST | `/speech/analyze` (multipart audio) | Transcribe + score a recording, save it |
| GET/POST | `/ml/model`, `/ml/predict`, `/ml/fatigue/me` | Fatigue model card, prediction, your latest risk |
| POST | `/nlp/analyze` | Full NLP breakdown of a text |
| POST | `/attention/update`, `/attention/sessions` | Live metrics / save a session (S3 report) |
| PATCH | `/attention/sessions/{id}/feedback` | Your fatigue rating (training label) |
| GET/POST | `/rooms`, `/rooms/{id}/messages`, `/rooms/{id}/insights` | Rooms, history, NLP insights |
| WS | `/ws/rooms/{id}?token=JWT` | Real-time events: `chat`, `presence`, `focus_update`, `alert`, `typing` |
