# Presence AI — Focus, Speak & Interview with Confidence

<img src="frontend/public/icon.svg" width="56" alt="Presence AI logo">

Presence AI watches your webcam and computes, live and per frame, whether you are **Focused, Distracted,
Drowsy, Yawning or away**. It also shows your **focus % and distraction %**. A **Speech Coach** scores your
speaking confidence and pronunciation, a **machine-learning model** predicts fatigue risk, and in **Focus
Rooms** people chat in real time while seeing each other's live focus.

The frontend is a **React (Vite + React Router, JavaScript/JSX) app** whose public pages are pre-rendered to static HTML for SEO. The
backend is **FastAPI**, with data in **SQL (SQLite / AWS RDS PostgreSQL) + S3**. An **MCP server** lets AI
assistants such as Claude use Presence AI's engines and data as tools.

📘 **Step-by-step guide from setup to a live AWS deployment: [docs/PIPELINE.md](docs/PIPELINE.md)**

## ✨ Features

| Area | What it does | Tech |
|---|---|---|
| Computer Vision | 478-point face landmarks (with iris), Eye Aspect Ratio, blink rate, yawns (MAR), head pose, gaze — **runs in the browser**, so video never leaves the device | MediaPipe Tasks (WebAssembly), JavaScript |
| AI state engine | Time-based rules → Focused / Distracted / Drowsy / Yawning / No Face, live **Focus %**, drowsiness alarm | `frontend/src/lib/attention.js` (port of `backend/cv/`) |
| Speech Coach | Transcript, pace (WPM), filler words, pauses, pronunciation clarity, read-aloud accuracy, pitch variety, assertive wording, eye contact → **confidence score** + tips + a "say it like this" rewrite | faster-whisper, NumPy |
| Conversation Coach | Record a conversation (10 types: interview, presentation, meeting, sales, casual, debate, support, teaching, storytelling, phone) → **fluency, word confidence, focus, interaction and voice modulation** scores, "needs improvement" %, evidence and type-specific suggestions + practice drills | `backend/speech/conversation.py`, `/app/conversation`, Streamlit page 6 |
| Interview Prep | Mock interviews for 15 job fields (question bank with frameworks, outlines and pitfalls) → **readiness score** from content (TF-IDF relevance, STAR/PREP structure, vocabulary, opening, length), delivery and on-camera presence (eye contact, smile via face blendshapes, expression, framing, posture, lighting, camera sharpness); full guide from getting the interview to follow-up, dress codes, word swaps | `backend/interview/`, `/app/interview`, Streamlit page 7 |
| AI coach | Ask anything about your progress, interviews, speaking or focus; automated daily insight on the dashboard. Uses **Claude Opus 5.5** when `ANTHROPIC_API_KEY` is set (server-side fallbacks on), otherwise a built-in coach (TF-IDF retrieval over the guide + your own numbers) | `backend/coach/assistant.py`, `POST /coach/ask` |
| Recommendations | What to practise next, ranked by expected benefit and explained: best focus time and session length, weakest skill → exercise, interview questions to re-practise (spaced), drowsiness, untried conversation types | `backend/coach/recommend.py`, `GET /recommendations` |
| Account & data (CRUD) | Profile, password change, account deletion with all data; read/rename/delete recordings; edit/delete your messages; update/delete your rooms | `/auth/me`, `/speech/sessions/{id}`, `/rooms/{id}` |
| Machine learning | Fatigue-risk classifier: CV model selection, model card, per-prediction explanations, retraining from users' own ratings | scikit-learn |
| NLP | Sentiment (VADER or **Amazon Comprehend**), toxicity, keywords, wording confidence, conversation summaries | vaderSentiment |
| Real-time rooms | WebSocket chat, presence, typing, everyone's live focus, drowsy alerts | FastAPI WebSockets |
| Meet (video calls) | Zoom/Meet-style meetings by link: HD 720p / Full HD 1080p / data-saver video, echo-cancelled noise-suppressed 48 kHz audio, screen share, chat, reactions, raised hands, active speaker, per-person connection quality, device picker, Ctrl+D / Ctrl+E — up to 8 people, browser to browser (end-to-end encrypted media) | WebRTC, `backend/app/routers/meet_routes.py`, `frontend/src/lib/meet.js` |
| Voice coach | A female voice guides focus sessions and interview practice: which way to move or turn, light, posture, reads questions aloud and speaks feedback after each answer ("don't say *I think*, say *I'm confident*") | Web Speech API, `frontend/src/lib/voiceCoach.js` |
| Object detection | Every object the camera sees is boxed and named (80 everyday types: phone, laptop, cup, book, chair…) with confidence; phones and other people count against interview focus | MediaPipe EfficientDet-Lite2 |
| Guest access & app install | "Continue as guest" / "Try it now" — use everything without an account; **Install app** button (PWA) with offline shell and shortcuts | `POST /auth/guest`, `public/sw.js` |
| Auth | Sign up and log in with username / email / mobile + password, OTP login, password reset. **Easy mode** (default locally): accounts work instantly. **Verified mode**: email + mobile OTP via **AWS SES / SNS** | JWT, bcrypt |
| SEO | Static HTML landing + keyword-targeted feature pages, metadata API, Open Graph/Twitter, JSON-LD (SoftwareApplication, Organization, FAQPage, BreadcrumbList), sitemap.xml, robots.txt, manifest; the private app is `noindex` | Vite build-time pre-rendering |
| MCP server | 18 tools (NLP, speech coaching, fatigue ML, model card, users, sessions, rooms, insights, leaderboard, recommendations, AI coach, interview questions + guide), 2 prompts, 1 resource — over stdio or HTTP `/mcp` | Model Context Protocol (`mcp` SDK) |
| Cloud | RDS, S3, SES, SNS, Comprehend, EC2 + Docker + Nginx | boto3, Docker |

## 📁 Project structure

```text
├── backend/                    # everything server-side (Python)
│   ├── app/                    # FastAPI package: auth/OTP, attention, speech, rooms + WS, analytics, ML/NLP API
│   │   ├── main.py             # entry point (uvicorn app.main:app, or python main.py)
│   │   ├── config.py · database.py · models.py · schemas.py · auth.py
│   │   ├── routers/            # one module per API area (full CRUD for profile, sessions, rooms, messages)
│   │   ├── services/           # AWS, NLP wrapper, OTP, email/SMS
│   │   └── mcp_server.py       # MCP server: AI tools for Claude & other assistants
│   ├── coach/                  # AI coach (Claude + built-in fallback) and the recommendation engine
│   ├── interview/              # interview question bank, guide and answer/delivery/body scoring
│   ├── cv/                     # Python attention + body/object engines (used by the Streamlit UI)
│   ├── nlp/                    # text analysis engine
│   ├── speech/                 # speech coach engine (Whisper) + audio decoding
│   ├── ml/                     # fatigue model: features, dataset, train, predict
│   ├── tests/                  # pytest: auth, CRUD, coach, dashboard, AI modules, ML API, MCP, speech, interview
│   ├── requirements.txt        # API dependencies (what the Docker image installs)
│   ├── requirements-dev.txt    # + tests and the cv engine
│   ├── .env.example            # backend settings → copy to backend/.env
│   └── Dockerfile
├── frontend/                   # React (Vite) website + app — all code in src/
│   ├── src/                    # index.html, main.jsx, Root.jsx (routes), entry-server.jsx (pre-render)
│   │   ├── pages/              # Landing, Feature, Login, Signup, NotFound + app/ (Dashboard, Focus, Interview…)
│   │   ├── styles/globals.css
│   │   ├── components/         # shared React components (index.js exports them all; Ctrl+K command palette)
│   │   └── lib/                # attention + body (pose/objects) engines, camera/voice hooks, API client + cache, seo
│   ├── scripts/                # setup-assets (MediaPipe models) · prerender (static HTML, sitemap, robots)
│   ├── vite.config.mjs · nginx.conf · Dockerfile
│   └── streamlit/              # Streamlit UI: app.py (router, grouped nav) + views/ (pages) + utils/
├── deploy/
│   ├── nginx.conf              # / → React frontend, /api/ + /ws/ → FastAPI
│   └── aws/                    # setup_aws.sh (S3, RDS, SES, SNS, IAM) · deploy_ec2.sh
├── docs/PIPELINE.md            # initial → live walkthrough
├── docker-compose.yml          # db + backend + web + nginx
├── requirements.txt            # installs every Python requirement in one go
├── setup.ps1                   # one-time setup: venv, requirements, .env files, npm install
├── start.ps1                   # starts API + React app + Streamlit, each in its own window
└── run-backend.ps1             # starts (or restarts) just the API, from any folder
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
.\run-backend.ps1        # stops an older backend on the port first; or: python backend\app\main.py

# Terminal 2 — website + app on http://localhost:3000
cd frontend; npm run dev

# Optional: legacy Streamlit UI on http://localhost:8501
cd frontend\streamlit; ..\..\.venv\Scripts\python.exe -m streamlit run app.py

# Tests / production build
cd backend; ..\.venv\Scripts\python.exe -m pytest -q tests
cd frontend; npm run build
```

The trained fatigue model is in `backend/ml/artifacts/`.

### 🗄️ Database: local or online (AWS RDS)

All data (accounts, focus sessions, recordings' results, rooms, messages) is stored in SQL through SQLAlchemy.
`DATABASE` in `backend/.env` picks where:

| `DATABASE=` | Storage | Setup |
|---|---|---|
| `local` (default) | SQLite file `backend/focuslink.db` | none |
| `aws` | PostgreSQL on Amazon RDS (SSL on, encrypted storage, daily backups) | `DB_HOST`, `DB_USER`, `DB_PASSWORD` (+ `DB_NAME`, `DB_PORT`) |

Going online, step by step:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\aws\setup_rds.ps1   # creates RDS, opens it to your IP, fills DB_* in .env
cd backend
python -m app.db_cli status --db aws    # can we reach it?
python -m app.db_cli copy --to aws      # copy every row (ids kept), verified by row counts; --replace to overwrite
# then set DATABASE=aws in backend/.env and restart the backend
```

Without the AWS CLI: create a PostgreSQL instance in the RDS console (Free tier template, public access *Yes*, a
security group allowing port 5432 from your IP), then put its endpoint and login into `DB_*` in `backend/.env`.

`python -m app.db_cli status` shows which database the backend uses and its row counts; `/health` reports it too
(`database.connected`), and the web app shows a notice if the backend can't reach its database.

**Why port 8010?** Another project on this machine already uses port 8000. If the frontend talks to the wrong
backend you'll see errors that aren't from Presence AI, such as "Enter your owner email address".

**Login:** with `AWS_ENABLED=false` (the default), anyone can create an account and is signed in immediately,
and the mobile number is optional. Set `REQUIRE_VERIFICATION=true` to require email + mobile OTP codes. Until
AWS SES/SNS is configured, those codes are shown on screen and in the API log.

## 🔌 API overview (create · read · update · delete)

Interactive docs with every endpoint: `http://localhost:8010/docs`. All data lives in SQL (SQLite locally, PostgreSQL on
AWS RDS via `DATABASE_URL`); reports can go to S3, email/SMS through SES/SNS.

| Resource | Create | Read | Update | Delete |
|---|---|---|---|---|
| Account | `POST /auth/register` | `GET /auth/me` | `PATCH /auth/me`, `POST /auth/password` | `DELETE /auth/me` (everything) |
| Focus sessions | `POST /attention/sessions` | `GET /attention/sessions`, `/{id}` | `PATCH /attention/sessions/{id}/feedback` | `DELETE /attention/sessions/{id}` |
| Recordings (speech · conversation · interview) | `POST /speech/analyze`, `/interview/answer`, `/speech/sessions` | `GET /speech/sessions`, `/{id}`, `/latest` | `PATCH /speech/sessions/{id}` | `DELETE /speech/sessions/{id}` |
| Rooms | `POST /rooms` | `GET /rooms` | `PATCH /rooms/{id}` (creator) | `DELETE /rooms/{id}` (creator) |
| Messages | `POST /rooms/{id}/messages`, WebSocket | `GET /rooms/{id}/messages` | `PATCH …/messages/{mid}` (author) | `DELETE …/messages/{mid}` (author) |
| Coaching | `POST /coach/ask` | `GET /recommendations`, `/coach/insight`, `/analytics/dashboard` | — | — |
| Meetings | `POST /meet` | `GET /meet/{code}` | WebSocket `/ws/meet/{code}` (signaling, chat, state) | ends when everyone leaves |
| Guest | `POST /auth/guest` | — | — | — |

## 🤖 MCP server (use Presence AI from Claude and other AI assistants)

`backend/app/mcp_server.py` exposes Presence AI over the [Model Context Protocol](https://modelcontextprotocol.io):

| Kind | Name | What it does |
|---|---|---|
| tool | `analyze_text`, `analyze_conversation` | Sentiment, toxicity, keywords, hedging, wording confidence, summaries |
| tool | `coach_speech_file`, `confident_rewrite` | Full speech-coach report for a recording; rewrite without fillers and hedges |
| tool | `predict_fatigue`, `fatigue_model_card` | ML fatigue risk with explanation; model metrics |
| tool | `platform_stats`, `user_overview`, `list_focus_sessions`, `leaderboard` | Read-only user and focus data |
| tool | `list_rooms`, `room_messages`, `room_insights` | Read-only chat data + NLP insights |
| tool | `recommendations`, `ask_coach`, `speech_history` | A user's ranked recommendations, an AI-coach answer, recent recordings |
| tool | `interview_questions`, `interview_guide` | Question bank per job field; preparation guide (optional topic filter) |
| prompt | `weekly_focus_review`, `improve_my_message` | Ready-made coaching prompts |
| resource | `presence://model-card` | Model card JSON |

**Claude Code:** `.mcp.json` in this repo registers it automatically. Open the project and run `/mcp`.
**Claude Desktop:** add this to `claude_desktop_config.json`:

```json
{ "mcpServers": { "presence": {
    "command": "C:\\path\\to\\project\\.venv\\Scripts\\python.exe",
    "args": ["-m", "app.mcp_server"],
    "env": { "PYTHONPATH": "C:\\path\\to\\project\\backend" } } } }
```

**Remote (HTTP):** set `MCP_API_KEY` and the API serves `POST /mcp` (Streamable HTTP). Clients send
`Authorization: Bearer <MCP_API_KEY>`. Without the key the endpoint stays off. Set `MCP_ALLOW_FILES=false` on
a public server so `coach_speech_file` can't read server files.

## 🌍 Deploy free-tier style: Vercel (website) + Render (API + PostgreSQL)

1. **Backend on Render** — Dashboard → *New → Blueprint* → choose this repo. [render.yaml](render.yaml) creates the
   Docker API and a managed PostgreSQL and connects them. Fill in `SITE_URL` (your Vercel URL) and any optional keys
   (MongoDB Atlas `MONGODB_URI`, `ANTHROPIC_API_KEY`, AWS, TURN). Check `https://<your-api>.onrender.com/health`.
2. **Frontend on Vercel** — *Add New → Project* → this repo, **Root Directory `frontend`** ([vercel.json](frontend/vercel.json)
   does the rest). Environment variables: `VITE_SITE_URL=https://<your-app>.vercel.app` and
   `VITE_WS_URL=wss://<your-api>.onrender.com` (Vercel can't proxy WebSockets, so meetings and room chat connect to
   Render directly). If Render gave your API a different URL than `presence-api.onrender.com`, change it in the
   `/api` rewrite in `frontend/vercel.json`.
3. Open the Vercel URL in any browser → **Try it now — no sign-up**, or **Install app**. HTTPS is automatic on both,
   which camera, microphone and screen sharing require.

Meetings connect people directly; across strict office firewalls or some mobile networks a **TURN relay** is needed
(`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` — e.g. Metered, Twilio, Cloudflare Calls or your own coturn).
Meetings are kept in the API's memory, so run a single API instance (the default).

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

Thresholds: `frontend/src/lib/attention.js → THRESHOLDS` (browser) and `backend/cv/attention_detector.py → Thresholds`.
