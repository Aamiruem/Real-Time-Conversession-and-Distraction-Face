# 🎯 FocusLink AI — Real-Time Attention, Distraction Detection & Focus-Aware Conversations

FocusLink AI watches your webcam and computes, live and per frame, whether you are **Focused, Distracted,
Drowsy, Yawning or away**. It also shows your **focus % and distraction %**. In **Focus Rooms**, people
chat in real time, and every participant sees the others' live focus score. Each message is analysed
with NLP.

## ✨ Features

| Area | What it does | Tech |
|---|---|---|
| Computer Vision | 468-point face mesh, Eye Aspect Ratio, blink rate, yawn (MAR), head pose (yaw/pitch/roll), iris gaze | MediaPipe, OpenCV, NumPy |
| AI state engine | Time-based rules → Focused / Distracted / Drowsy / Yawning / No Face, live **Focus %** & **Distraction %**, drowsiness alarm | Python |
| Real-time conversations | WebSocket chat rooms, presence, typing, live focus of every participant, drowsy alerts to the room | FastAPI WebSockets |
| NLP | Sentiment (VADER or **Amazon Comprehend**), toxicity flag, keyword extraction, extractive conversation summary | vaderSentiment, boto3 |
| Speech Coach | Camera + mic: transcript, pace (WPM), filler words, hesitation pauses, pronunciation clarity, read-aloud accuracy, pitch variety, assertive wording, eye contact → **confidence score** + coaching tips + a "say it like this" rewrite | faster-whisper, NumPy, streamlit-webrtc |
| Backend | REST API, JWT auth, bcrypt passwords | FastAPI, PyJWT |
| Database | Users, sessions, live snapshots, rooms, messages | SQLAlchemy · SQLite (dev) / PostgreSQL / **AWS RDS** |
| Cloud | Session reports to **S3** (pre-signed links), RDS, Comprehend, EC2 deploy | boto3, AWS CLI, Docker |
| Frontend | Login, live Focus Monitor dashboard, Focus Rooms, Analytics | **Streamlit**, streamlit-webrtc, Plotly |

## 📁 Project structure

```
Real Time Conversession/
├── backend/
│   ├── main.py                 # FastAPI app, routers, startup DB init
│   ├── config.py               # env settings
│   ├── database.py             # SQLAlchemy engine/session (SQLite or RDS)
│   ├── models.py               # User, AttentionSession, FocusSnapshot, Room, Message
│   ├── schemas.py              # Pydantic models
│   ├── auth.py                 # bcrypt + JWT
│   ├── websocket_manager.py    # room connections, broadcasts, live focus sharing
│   ├── routers/
│   │   ├── auth_routes.py      # /auth/register, /auth/login, /auth/me
│   │   ├── attention_routes.py # /attention/update, /attention/sessions, /attention/snapshots
│   │   ├── chat_routes.py      # /rooms, messages, insights, WS /ws/rooms/{id}
│   │   ├── analytics_routes.py # /analytics/me, /analytics/leaderboard
│   │   └── speech_routes.py    # /speech/sessions (saved Speech Coach reports)
│   └── services/
│       ├── nlp_service.py      # sentiment, toxicity, keywords, summary
│       └── aws_service.py      # S3 reports, Comprehend
├── cv/
│   └── attention_detector.py   # the computer-vision attention engine
├── speech/
│   └── analyzer.py             # speech coach: transcript, fluency, clarity, voice, confidence, tips
├── frontend/
│   ├── app.py                  # Streamlit home: login / register
│   ├── pages/
│   │   ├── 1_Focus_Monitor.py  # live webcam dashboard + alarm + save session
│   │   ├── 2_Focus_Rooms.py    # real-time chat + shared live focus
│   │   ├── 3_Analytics.py      # history, leaderboard, NLP insights, speech progress
│   │   └── 4_Speech_Coach.py   # talk to the camera → confidence + pronunciation coaching
│   └── utils/
│       ├── api_client.py       # REST client
│       ├── ws_client.py        # background WebSocket client
│       ├── video.py            # webrtc video processor
│       └── ui.py               # theme, cards, gauges, auth guard
├── aws/
│   ├── setup_aws.sh            # create S3 bucket, RDS, IAM policy
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

# Terminal 1 — backend (API docs at http://localhost:8000/docs)
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend (http://localhost:8501)
.venv\Scripts\python.exe -m streamlit run frontend/app.py
```

Always run with the project's `.venv` Python. With system Python 3.14 the imports fail (`No module named
'jwt'` / `mediapipe`), and a mismatched `pyarrow` shows "To use Custom Components in Streamlit, you need to
install PyArrow". The first Speech Coach analysis downloads the speech model (~150 MB). Your login is kept
in the URL (`?session=…`), so refreshing the page keeps you signed in.

To test conversations, open a second browser (or an incognito window), register a second user, and
join the same room.

## 🐳 Run with Docker (PostgreSQL included)

```bash
cp .env.example .env
docker compose up --build
```

## ☁️ AWS

1. `aws configure`, then `DB_PASS=YourStrongPass bash aws/setup_aws.sh`. This creates the S3 bucket,
   the RDS PostgreSQL database and the IAM policy, and prints the `.env` values.
2. Set `AWS_ENABLED=true` (and optionally `USE_COMPREHEND=true`) in `.env`.
3. Start an Ubuntu EC2 instance with an IAM role that has `FocusLinkAIPolicy`, clone the project, then
   run `bash aws/deploy_ec2.sh`.
4. Browsers allow the webcam only over **HTTPS**, so put an ALB with an ACM certificate (or Nginx with
   Let's Encrypt) in front of port 8501.

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
| POST | `/auth/register`, `/auth/login` | Get a JWT |
| POST | `/attention/update` | Live metrics (also broadcast to your rooms) |
| POST/GET | `/attention/sessions` | Save / list sessions (S3 report) |
| GET/POST | `/rooms` | List / create rooms |
| GET/POST | `/rooms/{id}/messages` | History / send (with NLP) |
| GET | `/rooms/{id}/insights` | Sentiment, keywords, summary, focus while chatting |
| WS | `/ws/rooms/{id}?token=JWT` | Real-time events: `chat`, `presence`, `focus_update`, `alert`, `typing` |
