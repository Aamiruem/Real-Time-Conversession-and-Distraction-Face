# 🎯 FocusLink AI — Real-Time Attention, Distraction Detection & Focus-Aware Conversations

FocusLink AI watches your webcam and computes, live and per frame, whether you are **Focused, Distracted,
Drowsy, Yawning or away**. It also shows your **focus % and distraction %**. A **Speech Coach** scores your
speaking confidence and pronunciation, a **machine-learning model** predicts fatigue risk, and in **Focus
Rooms** people chat in real time while seeing each other's live focus. Accounts are verified with
**email and mobile OTP**, data lives in **SQL (SQLite / AWS RDS PostgreSQL) + S3**, and a **SEO landing page**
markets the app.

📘 **Step-by-step guide from setup to a live AWS deployment: [docs/PIPELINE.md](docs/PIPELINE.md)**

## ✨ Features

| Area | What it does | Tech |
|---|---|---|
| Computer Vision | 468-point face mesh, Eye Aspect Ratio, blink rate, yawn (MAR), head pose (yaw/pitch/roll), iris gaze | MediaPipe, OpenCV, NumPy |
| AI state engine | Time-based rules → Focused / Distracted / Drowsy / Yawning / No Face, live **Focus %** & **Distraction %**, drowsiness alarm | Python |
| Real-time conversations | WebSocket chat rooms, presence, typing, live focus of every participant, drowsy alerts to the room | FastAPI WebSockets |
| NLP | Sentiment (VADER or **Amazon Comprehend**), toxicity flag, keyword extraction, extractive conversation summary | vaderSentiment, boto3 |
| Speech Coach | Camera + mic: transcript, pace (WPM), filler words, hesitation pauses, pronunciation clarity, read-aloud accuracy, pitch variety, assertive wording, eye contact → **confidence score** + coaching tips + a "say it like this" rewrite | faster-whisper, NumPy, streamlit-webrtc |
| Machine learning | Fatigue-risk classifier: CV model selection (LogReg / RandomForest / GradBoost), model card, explanations, retraining from users' own ratings | scikit-learn, pandas |
| AI Lab | Each AI technology isolated with a live demo: CV on a photo, NLP on text, speech on a recording, ML with sliders | Streamlit |
| Auth | Sign-up with **email + mobile OTP** verification, login by username/email/mobile + password, OTP login, password reset | FastAPI, JWT, bcrypt, **AWS SES** + **AWS SNS** |
| Backend | REST API, WebSockets | FastAPI |
| Database | Users, OTP codes, sessions, snapshots, speech reports, rooms, messages | SQLAlchemy · SQLite (dev) / PostgreSQL / **AWS RDS** |
| Cloud | S3 reports, RDS, SES, SNS, Comprehend, EC2 + Docker + Nginx | boto3, AWS CLI, Docker |
| SEO | Static landing page with meta/OG/Twitter tags, schema.org JSON-LD (app, org, FAQ), sitemap.xml, robots.txt | HTML/CSS served by FastAPI |
| Frontend | Redesigned dark UI: sign-in/sign-up/OTP screens, dashboard, Focus Monitor, Speech Coach, Rooms, Analytics, AI Lab | **Streamlit**, streamlit-webrtc, Plotly |

## 📁 Project structure

```
Real Time Conversession/
├── backend/
│   ├── main.py                 # FastAPI app, routers, startup DB init
│   ├── config.py               # env settings
│   ├── database.py             # SQLAlchemy engine/session (SQLite or RDS)
│   ├── models.py               # User, OtpCode, AttentionSession, FocusSnapshot, SpeechSession, Room, Message
│   ├── schemas.py              # Pydantic models
│   ├── auth.py                 # bcrypt + JWT
│   ├── websocket_manager.py    # room connections, broadcasts, live focus sharing
│   ├── routers/
│   │   ├── auth_routes.py      # register, verify, resend, login, OTP login, password reset, me
│   │   ├── attention_routes.py # /attention/update, /attention/sessions, /attention/snapshots
│   │   ├── chat_routes.py      # /rooms, messages, insights, WS /ws/rooms/{id}
│   │   ├── analytics_routes.py # /analytics/me, /analytics/leaderboard
│   │   ├── speech_routes.py    # /speech/sessions (saved Speech Coach reports)
│   │   ├── ai_routes.py        # /ml/model, /ml/predict, /ml/fatigue/me, /nlp/analyze
│   │   └── site_routes.py      # SEO landing page, robots.txt, sitemap.xml
│   ├── services/
│   │   ├── otp_service.py      # issue / check hashed one-time codes
│   │   ├── notify_service.py   # email via SES, SMS via SNS (dev mode fallback)
│   │   ├── nlp_service.py      # wraps nlp/ (+ optional Comprehend)
│   │   └── aws_service.py      # S3 reports, Comprehend
│   └── web/                    # landing page HTML/CSS, favicon, og-image, manifest
├── cv/
│   └── attention_detector.py   # the computer-vision attention engine
├── nlp/
│   └── text_analyzer.py        # sentiment, toxicity, keywords, wording confidence, summaries
├── speech/
│   └── analyzer.py             # speech coach: transcript, fluency, clarity, voice, confidence, tips
├── ml/
│   └── features.py · dataset.py · train.py · predict.py   # fatigue-risk model lifecycle
├── frontend/
│   ├── Home.py                 # sign in / sign up / OTP / reset + home dashboard
│   ├── pages/
│   │   ├── 1_Focus_Monitor.py  # live webcam dashboard + alarm + save session
│   │   ├── 2_Focus_Rooms.py    # real-time chat + shared live focus
│   │   ├── 3_Analytics.py      # history, leaderboard, NLP insights, speech progress
│   │   ├── 4_Speech_Coach.py   # talk to the camera → confidence + pronunciation coaching
│   │   └── 5_AI_Lab.py         # try CV, NLP, Speech AI and the ML model one by one
│   └── utils/
│       ├── api_client.py       # REST client
│       ├── ws_client.py        # background WebSocket client
│       ├── video.py            # webrtc video + microphone processors
│       ├── speech_view.py      # speech report widgets, audio decoding
│       └── ui.py               # design system, headers, cards, gauges, auth guard
├── tests/                      # pytest: auth/OTP, AI modules, ML API, SEO pages
├── deploy/nginx.conf           # / → landing, /app/ → Streamlit, /api/ + /ws/ → FastAPI
├── docs/PIPELINE.md            # initial → live walkthrough
├── aws/
│   ├── setup_aws.sh            # S3 bucket, RDS, SES sender, SNS SMS, IAM policy
│   └── deploy_ec2.sh           # deploy with Docker on EC2
├── Dockerfile.backend · Dockerfile.frontend · docker-compose.yml
├── requirements.txt · requirements-backend.txt · .env.example
```

## 🚀 Run locally (Windows)

> MediaPipe needs **Python 3.9 – 3.12**. Your system has 3.14, so install Python 3.11 and use a venv.

```powershell
cd "C:\Users\GTI\Downloads\Real Time Conversession"
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env

# Terminal 1 — backend + SEO landing page (http://localhost:8000, API docs at /docs)
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000

# Terminal 2 — app (http://localhost:8501)
.venv\Scripts\python.exe -m streamlit run frontend/Home.py

# Tests
.venv\Scripts\python.exe -m pytest -q tests
```

Until AWS SES/SNS is configured (`AWS_ENABLED=false`), sign-up OTP codes are **shown on screen and in the
backend log** instead of being emailed/texted, so you can test the full flow locally.

Always run with the project's `.venv` Python. With system Python 3.14 the imports fail (`No module named
'jwt'` / `mediapipe`), and a mismatched `pyarrow` shows "To use Custom Components in Streamlit, you need to
install PyArrow". The first Speech Coach analysis downloads the speech model (~150 MB). Your login is kept
in the URL (`?session=…`), so refreshing the page keeps you signed in.

To test conversations, open a second browser (or an incognito window), register a second user, and
join the same room.

## 🐳 Run with Docker (PostgreSQL included)

```bash
cp .env.example .env
docker compose up --build      # http://localhost (landing) · http://localhost/app/ (app)
```

## ☁️ AWS

1. `aws configure`, then `DB_PASS=YourStrongPass SES_SENDER=no-reply@yourdomain.com bash aws/setup_aws.sh`.
   This creates the S3 bucket, RDS PostgreSQL, the SES sender identity, SNS SMS settings and the IAM
   policy, and prints the `.env` values.
2. Set `AWS_ENABLED=true` (and optionally `USE_COMPREHEND=true`) in `.env`. Request SES and SNS
   production access so codes reach any email and phone (in India, also register for DLT).
3. Start an Ubuntu EC2 instance with an IAM role that has `FocusLinkAIPolicy`, clone the project, then
   run `bash aws/deploy_ec2.sh`. Nginx serves the landing page at `/` and the app at `/app/`.
4. Browsers allow the webcam only over **HTTPS**. See [docs/PIPELINE.md](docs/PIPELINE.md) step 9.

Every saved session is uploaded as `reports/user_<id>/session_<id>.json` to S3. The Analytics page
links to it.

## 🧠 How the focus score is computed

* **EAR** = (|p2−p6| + |p3−p5|) / (2·|p1−p4|). If EAR stays below 0.21 for less than 1.2 s, it counts
  as a blink. If it stays below for 1.2 s or more, the state is **Drowsy** and the alarm sounds.
* **MAR** (mouth opening ÷ mouth width) above 0.6 for 0.8 s counts as a **Yawn**.
* **Head pose** comes from `cv2.solvePnP` on 6 landmarks. |yaw| > 25° or |pitch| > 20° means looking away.
* **Gaze** comes from the iris position between the eye corners. Below 0.38 is left, above 0.62 is right.
* If the user looks away for 1.5 s or more, the state is **Distracted**.
* **Focus %** = time spent Focused ÷ total session time. **Distraction %**, **Drowsy %** and
  **No-face %** use the same calculation.

You can change all thresholds in `cv/attention_detector.py → Thresholds`.

## 🔌 Main API

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` → `/auth/verify` (email + sms) | Sign up; JWT once both codes are confirmed |
| POST | `/auth/login`, `/auth/otp/request`, `/auth/otp/login`, `/auth/password/reset` | Password / OTP sign-in, reset |
| GET/POST | `/ml/model`, `/ml/predict`, `/ml/fatigue/me` | Fatigue model card, prediction, your latest risk |
| POST | `/nlp/analyze` | Full NLP breakdown of a text |
| PATCH | `/attention/sessions/{id}/feedback` | Your fatigue rating (training label) |
| POST | `/attention/update` | Live metrics (also broadcast to your rooms) |
| POST/GET | `/attention/sessions` | Save / list sessions (S3 report) |
| GET/POST | `/rooms` | List / create rooms |
| GET/POST | `/rooms/{id}/messages` | History / send (with NLP) |
| GET | `/rooms/{id}/insights` | Sentiment, keywords, summary, focus while chatting |
| WS | `/ws/rooms/{id}?token=JWT` | Real-time events: `chat`, `presence`, `focus_update`, `alert`, `typing` |
