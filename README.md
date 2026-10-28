# 🎯 FocusLink AI — Real-Time Attention, Distraction Detection & Focus-Aware Conversations

FocusLink AI watches your webcam and computes, live and per frame, whether you are **Focused, Distracted,
Drowsy, Yawning or away**. It also shows your **focus % and distraction %**. A **Speech Coach** scores your
speaking confidence and pronunciation, a **machine-learning model** predicts fatigue risk, and in **Focus
Rooms** people chat in real time while seeing each other's live focus.

The frontend is a **Next.js (React, JavaScript/JSX) app** with server-rendered, SEO-optimised public pages. The
backend is **FastAPI**, with data in **SQL (SQLite / AWS RDS PostgreSQL) + S3**. An **MCP server** lets AI
assistants such as Claude use FocusLink's AI engines and data as tools.

📘 **Step-by-step guide from setup to a live AWS deployment: [docs/PIPELINE.md](docs/PIPELINE.md)**

## ✨ Features

| Area | What it does | Tech |
|---|---|---|
| Computer Vision | 478-point face landmarks (with iris), Eye Aspect Ratio, blink rate, yawns (MAR), head pose, gaze — **runs in the browser**, so video never leaves the device | MediaPipe Tasks (WebAssembly), JavaScript |
| AI state engine | Time-based rules → Focused / Distracted / Drowsy / Yawning / No Face, live **Focus %**, drowsiness alarm | `frontend/lib/attention.js` (port of `backend/cv/`) |
| Speech Coach | Transcript, pace (WPM), filler words, pauses, pronunciation clarity, read-aloud accuracy, pitch variety, assertive wording, eye contact → **confidence score** + tips + a "say it like this" rewrite | faster-whisper, NumPy |
| Conversation Coach | Record a conversation (10 types: interview, presentation, meeting, sales, casual, debate, support, teaching, storytelling, phone) → **fluency, word confidence, focus, interaction and voice modulation** scores, "needs improvement" %, evidence and type-specific suggestions + practice drills | `backend/speech/conversation.py`, `/app/conversation`, Streamlit page 6 |
| Interview Prep | Mock interviews for 15 job fields (question bank with frameworks, outlines and pitfalls) → **readiness score** from content (TF-IDF relevance, STAR/PREP structure, vocabulary, opening, length), delivery and on-camera presence (eye contact, smile via face blendshapes, expression, framing, posture, lighting, camera sharpness); full guide from getting the interview to follow-up, dress codes, word swaps | `backend/interview/`, `/app/interview`, Streamlit page 7 |
| Machine learning | Fatigue-risk classifier: CV model selection, model card, per-prediction explanations, retraining from users' own ratings | scikit-learn |
| NLP | Sentiment (VADER or **Amazon Comprehend**), toxicity, keywords, wording confidence, conversation summaries | vaderSentiment |
| Real-time rooms | WebSocket chat, presence, typing, everyone's live focus, drowsy alerts | FastAPI WebSockets |
| Auth | Sign up and log in with username / email / mobile + password, OTP login, password reset. **Easy mode** (default locally): accounts work instantly. **Verified mode**: email + mobile OTP via **AWS SES / SNS** | JWT, bcrypt |
| SEO | Static HTML landing + keyword-targeted feature pages, metadata API, Open Graph/Twitter, JSON-LD (SoftwareApplication, Organization, FAQPage, BreadcrumbList), sitemap.xml, robots.txt, manifest; the private app is `noindex` | Next.js 16 |
| MCP server | 13 tools (NLP, speech coaching, fatigue ML, model card, users, sessions, rooms, insights, leaderboard), 2 prompts, 1 resource — over stdio or HTTP `/mcp` | Model Context Protocol (`mcp` SDK) |
| Cloud | RDS, S3, SES, SNS, Comprehend, EC2 + Docker + Nginx | boto3, Docker |

## 📁 Project structure

```text
├── backend/                    # everything server-side (Python) — run commands from here
│   ├── app/                    # FastAPI package: auth/OTP, attention, speech, rooms + WS, analytics, ML/NLP API
│   │   ├── main.py             # entry point (uvicorn app.main:app)
│   │   ├── config.py · database.py · models.py · schemas.py · auth.py
│   │   ├── routers/            # one module per API area
│   │   ├── services/           # AWS, NLP wrapper, OTP, email/SMS
│   │   └── mcp_server.py       # MCP server: AI tools for Claude & other assistants
│   ├── cv/                     # Python attention engine (reference; used by the Streamlit UI)
│   ├── nlp/                    # text analysis engine
│   ├── speech/                 # speech coach engine + audio decoding
│   ├── ml/                     # fatigue model: features, dataset, train, predict
│   ├── tests/                  # pytest: auth/OTP, easy mode, AI modules, ML API, MCP, speech upload
│   ├── requirements.txt        # API dependencies (what the Docker image installs)
│   ├── requirements-dev.txt    # + tests and the cv engine
│   ├── .env.example            # backend settings → copy to backend/.env
│   └── Dockerfile
├── frontend/                   # Next.js (React) website + app
│   ├── app/page.jsx            # SEO landing page (static)
│   ├── app/features/[slug]/    # SEO feature pages + per-page social images (static)
│   ├── app/login · signup      # auth (password, OTP login, reset, verification)
│   ├── app/app/…               # private app: dashboard, focus, speech, rooms, analytics, lab
│   ├── app/sitemap.js · robots.js · manifest.js
│   ├── components/             # shared React components
│   ├── lib/attention.js        # in-browser attention engine
│   ├── lib/useFaceTracker.js   # camera + MediaPipe face landmarker
│   ├── lib/api.js · auth.jsx   # API client (proxied via /api) + login state
│   ├── .env.example · Dockerfile
│   └── streamlit/              # legacy Streamlit UI (optional; the React app replaces it)
├── deploy/
│   ├── nginx.conf              # / → Next.js, /api/ + /ws/ → FastAPI
│   └── aws/                    # setup_aws.sh (S3, RDS, SES, SNS, IAM) · deploy_ec2.sh
├── docker-compose.yml          # db + backend + web + nginx
├── requirements.txt            # installs every Python requirement in one go
└── docs/PIPELINE.md            # initial → live walkthrough
```

## 🚀 Run locally (Windows)

> Backend needs Python 3.11 (MediaPipe/Whisper wheels); frontend needs Node.js ≥ 20.

**Quick start** — two scripts at the repo root do everything below:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1   # once: venv, all requirements, .env files, npm install
powershell -ExecutionPolicy Bypass -File .\start.ps1   # API :8010 + React :3000 + Streamlit :8501 (add -NoStreamlit to skip it)
```

Or step by step:

```powershell
# one-time setup (one Python venv at the repo root)
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt   # or just backend\requirements-dev.txt
copy backend\.env.example backend\.env
cd frontend; npm install; cd ..

# Terminal 1 — API on port 8010 (docs: http://localhost:8010/docs)
cd backend; ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8010

# Terminal 2 — website + app on http://localhost:3000
cd frontend; npm run dev

# Optional: legacy Streamlit UI on http://localhost:8501
cd frontend\streamlit; ..\..\.venv\Scripts\python.exe -m streamlit run app.py

# Tests / production build
cd backend; ..\.venv\Scripts\python.exe -m pytest -q tests
cd frontend; npm run build
```

The local SQLite database is `backend/focuslink.db`, and the trained fatigue model is in `backend/ml/artifacts/`.

**Why port 8010?** Another project on this machine already uses port 8000. If the frontend talks to the wrong
backend you'll see errors that aren't from FocusLink, such as "Enter your owner email address".

**Login:** with `AWS_ENABLED=false` (the default), anyone can create an account and is signed in immediately,
and the mobile number is optional. Set `REQUIRE_VERIFICATION=true` to require email + mobile OTP codes. Until
AWS SES/SNS is configured, those codes are shown on screen and in the API log.

## 🤖 MCP server (use FocusLink from Claude and other AI assistants)

`backend/app/mcp_server.py` exposes FocusLink over the [Model Context Protocol](https://modelcontextprotocol.io):

| Kind | Name | What it does |
|---|---|---|
| tool | `analyze_text`, `analyze_conversation` | Sentiment, toxicity, keywords, hedging, wording confidence, summaries |
| tool | `coach_speech_file`, `confident_rewrite` | Full speech-coach report for a recording; rewrite without fillers and hedges |
| tool | `predict_fatigue`, `fatigue_model_card` | ML fatigue risk with explanation; model metrics |
| tool | `platform_stats`, `user_overview`, `list_focus_sessions`, `leaderboard` | Read-only user and focus data |
| tool | `list_rooms`, `room_messages`, `room_insights` | Read-only chat data + NLP insights |
| prompt | `weekly_focus_review`, `improve_my_message` | Ready-made coaching prompts |
| resource | `focuslink://model-card` | Model card JSON |

**Claude Code:** `.mcp.json` in this repo registers it automatically. Open the project and run `/mcp`.
**Claude Desktop:** add this to `claude_desktop_config.json`:

```json
{ "mcpServers": { "focuslink": {
    "command": "C:\\path\\to\\project\\.venv\\Scripts\\python.exe",
    "args": ["-m", "app.mcp_server"],
    "env": { "PYTHONPATH": "C:\\path\\to\\project\\backend" } } } }
```

**Remote (HTTP):** set `MCP_API_KEY` and the API serves `POST /mcp` (Streamable HTTP). Clients send
`Authorization: Bearer <MCP_API_KEY>`. Without the key the endpoint stays off. Set `MCP_ALLOW_FILES=false` on
a public server so `coach_speech_file` can't read server files.

## 🐳 Docker (PostgreSQL + Nginx included)

```bash
cp backend/.env.example backend/.env
docker compose --env-file backend/.env up --build      # http://localhost
```

## ☁️ AWS

1. `aws configure`, then `DB_PASS=YourStrongPass SES_SENDER=no-reply@yourdomain.com bash deploy/aws/setup_aws.sh`.
   This creates the S3 bucket, RDS PostgreSQL, the SES sender, SNS SMS settings and the IAM policy.
2. In `backend/.env` set `AWS_ENABLED=true`, `DATABASE_URL_OVERRIDE=<rds url>`, `SES_SENDER` and
   `SITE_URL=https://yourdomain.com`. Request SES/SNS production access (India: DLT registration for SMS).
3. On an Ubuntu EC2 instance with the `FocusLinkAIPolicy` role, run `bash deploy/aws/deploy_ec2.sh`.
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

Thresholds: `frontend/lib/attention.js → THRESHOLDS` (browser) and `backend/cv/attention_detector.py → Thresholds`.

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
| POST | `/mcp` (when `MCP_API_KEY` is set) | Model Context Protocol endpoint for AI assistants |
| WS | `/ws/rooms/{id}?token=JWT` | Real-time events: `chat`, `presence`, `focus_update`, `alert`, `typing` |
