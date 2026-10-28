# Presence AI — from first setup to a live AWS deployment

This guide walks through the whole project in the order you would build and ship it. Each step
says what you do, which code is involved, and how to check that it works.

```
 Google ──▶ React/Vite build (frontend/) — static SEO pages: /, /features/*, sitemap.xml, robots.txt
 Browser ─▶ React app (/app/*)
   camera ─▶ MediaPipe face landmarker in the browser (frontend/src/lib/attention.js) — video never uploaded
   mic    ─▶ MediaRecorder ──upload──┐
   /api/* ──────────────────────────┴─▶ FastAPI (backend/app) ┌──▶ AWS RDS PostgreSQL (users, sessions, chat, OTPs)
   /ws/*  ── WebSocket chat rooms ─────▶   ├─ speech/       ├──▶ AWS S3 (session reports)
                                           ├─ nlp/          ├──▶ AWS SES (OTP email) · AWS SNS (OTP SMS)
                                           └─ ml/           └──▶ Amazon Comprehend (optional sentiment)
```

---

## 1. Local setup (≈10 min)

MediaPipe needs Python 3.9–3.12, so use the project's Python 3.11 virtual environment.

```powershell
py -3.11 -m venv .venv            # or: uv venv --python 3.11  (one venv at the repo root)
.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
copy backend\.env.example backend\.env
cd frontend; npm install; cd ..   # Node.js >= 20; also downloads the face model into frontend/public/mediapipe
```

**Check:** `.venv\Scripts\python.exe -c "import faster_whisper, sklearn, fastapi; print('ok')"`

## 2. Database & data model

`backend/app/database.py` uses SQLAlchemy, so the same code runs on SQLite (dev) and PostgreSQL (RDS).
Tables are created on startup. `_migrate()` adds new columns to existing databases, so you never have
to delete your data.

| Table | Purpose |
|---|---|
| `users` | account, bcrypt hash, `email_verified`, `phone_verified` |
| `otp_codes` | HMAC-hashed one-time codes with expiry, attempt counter and purpose |
| `attention_sessions` | one row per focus session + the user's `self_fatigue` label (ML target) |
| `focus_snapshots` | live samples every few seconds |
| `speech_sessions` | Speech Coach reports (full JSON) |
| `rooms`, `messages` | chat with sentiment/toxicity/keywords |

## 3. Authentication (email + mobile OTP)

`backend/app/routers/auth_routes.py` + `backend/app/services/otp_service.py` + `notify_service.py`

**Easy mode** (`REQUIRE_VERIFICATION=false`, the default while `AWS_ENABLED=false`): `POST /auth/register`
returns a JWT straight away, and the mobile number is optional. **Verified mode** works like this:

1. `POST /auth/register` creates an unverified user and sends **two** 6-digit codes: email (SES) and SMS (SNS).
2. `POST /auth/verify` confirms each code. Once both are confirmed, the response contains a JWT.
3. `POST /auth/login` accepts a username, email or mobile number plus a password. An unverified account gets a `403 unverified` response.
4. `POST /auth/otp/request` + `/auth/otp/login` handle password-less sign-in. `/auth/password/reset` resets a forgotten password.

Security: codes are stored as an HMAC hash, expire after 10 minutes, allow 5 attempts and have a
60-second resend cooldown. `otp/request` never reveals whether an account exists.

**Dev mode:** while `AWS_ENABLED=false`, codes are shown in the UI and in the server log instead of
being sent, so you can test without AWS.

## 4. The four AI modules (each usable on its own)

| Module | Input → output | Try it |
|---|---|---|
| `backend/cv/attention_detector.py` | video frame → EAR, MAR, head pose, gaze → Focused / Distracted / Drowsy | AI Lab → Computer vision |
| `backend/nlp/text_analyzer.py` | text → sentiment, toxicity, keywords, wording confidence, summary | AI Lab → NLP |
| `backend/speech/analyzer.py` | audio → transcript, pace, fillers, clarity, pitch → confidence score + tips | AI Lab → Speech, Speech Coach |
| `backend/ml/` | session features → fatigue risk (low / medium / high) + explanation | AI Lab → Machine learning |

## 5. Machine-learning lifecycle

```
cd backend
python -m ml.train             # bootstrap: simulated sessions only
python -m ml.train --with-db   # + real sessions users rated ("How tired do you feel?")
```

* **Data** (`backend/ml/dataset.py`): at launch there are no labels, so we simulate sessions from a latent
  fatigue variable (cold start). Every rating a user gives after a Focus Monitor session becomes a real
  label, and each real label is weighted 5×.
* **Model selection** (`backend/ml/train.py`): Logistic Regression, Random Forest and Gradient Boosting are compared
  with 5-fold stratified cross-validation (macro-F1). The best one is refit and scored on a 20% held-out split.
* **Artifacts**: `backend/ml/artifacts/fatigue_model.joblib` and `model_card.json` (metrics, confusion matrix,
  permutation importance, data counts, limitations). The backend Docker image trains it at build time.
* **Serving**: `GET /ml/model`, `POST /ml/predict`, `GET /ml/fatigue/me`. Each prediction also lists the
  features that pushed risk up or down.
* **Retraining in production**: run a weekly cron on the server:
  `docker compose --env-file backend/.env exec backend python -m ml.train --with-db && docker compose --env-file backend/.env restart backend`.

## 5b. MCP server (AI assistants as clients)

`backend/app/mcp_server.py` wraps the same engines as Model Context Protocol tools, so Claude (Desktop or Code)
and other MCP clients can analyse text, coach speech files, predict fatigue and read users, sessions and rooms.

```powershell
cd backend; ..\.venv\Scripts\python.exe -m app.mcp_server      # stdio — what .mcp.json / Claude Desktop launch
```

For a remote client, set `MCP_API_KEY` and use `https://yourdomain.com/mcp` with `Authorization: Bearer <key>`
(Nginx forwards `/mcp` to the API). `backend/app/native_preload.py` loads NumPy, CTranslate2 and scikit-learn on the
main thread at startup. On Windows, loading them later from worker threads can deadlock or crash the server.

## 6. Tests

```powershell
cd backend; ..\.venv\Scripts\python.exe -m pytest -q tests
```

The tests cover the MCP server (tools, prompts and resources over a real MCP client session; API-key
protection of `/mcp`), sign-up, OTP verification (both channels), wrong-code and attempt limits, OTP login,
password reset, the NLP engine, the speech rewrite and read-aloud alignment, ML features and predictions,
feedback labels, and the SEO pages. Each run uses a throw-away SQLite database.

## 7. Run locally

```powershell
# Terminal 1 — API → http://localhost:8010 (docs: /docs). Port 8010 avoids clashing with other local apps on 8000.
cd backend; ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8010
# Terminal 2 — website + app → http://localhost:3000 (the Vite dev server proxies /api/* to the API)
cd frontend; npm run dev
```

Or run everything in Docker, with Postgres and Nginx in front: `docker compose --env-file backend/.env up --build`
gives you http://localhost.

## 8. AWS resources

```bash
export AWS_REGION=ap-south-1 DB_PASS='a-strong-password' SES_SENDER=no-reply@yourdomain.com
bash deploy/aws/setup_aws.sh
```

This creates the S3 bucket, an RDS PostgreSQL instance, an SES sender identity and the SNS SMS settings,
plus an IAM policy (`s3:PutObject/GetObject`, `comprehend:DetectSentiment`, `ses:SendEmail`, `sns:Publish`).

Before real users can sign up:
* **SES sandbox:** you can only email verified addresses until you request production access.
* **SNS sandbox:** add test phone numbers or request production access. For India, register a DLT
  entity and an OTP template.

Put the printed values in `backend/.env`: `AWS_ENABLED=true`, `DATABASE_URL_OVERRIDE=…rds…`, `S3_BUCKET`,
`SES_SENDER`, `SITE_URL=https://yourdomain.com` (baked into canonical links and the sitemap at build time).
`OTP_DEV_MODE` is off automatically once AWS is enabled.

## 9. Go live on EC2 with HTTPS

1. Launch Ubuntu EC2 (t3.large recommended for Whisper + MediaPipe). Attach an IAM role with
   `FocusLinkAIPolicy`. In the security group, open ports 22, 80 and 443.
2. `git clone …` then run `bash deploy/aws/deploy_ec2.sh`. This builds the images and starts backend, web and nginx.
3. Point your domain's A record at the instance, then add HTTPS (browsers only allow camera and mic on HTTPS):
   ```bash
   sudo apt install -y certbot
   sudo docker compose --env-file backend/.env stop nginx
   sudo certbot certonly --standalone -d yourdomain.com
   ```
   Add a `listen 443 ssl;` server block to `deploy/nginx.conf` with
   `ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;` and the matching key. Mount
   `/etc/letsencrypt` into the nginx container, redirect port 80 to 443, then `docker compose --env-file backend/.env up -d nginx`.
   (Alternative: an Application Load Balancer with a free ACM certificate.)
4. **Check:** `https://yourdomain.com/` shows the landing page, `/signup` creates an account, and the OTP
   email and SMS arrive (verified mode).

## 10. SEO checklist after launch

* The public pages are **prerendered to static HTML** at build time (`scripts/prerender.mjs`): the landing page and three keyword-targeted
  feature pages (`/features/focus-tracker`, `/features/speech-coach`, `/features/fatigue-prediction`).
  Each has a unique title and description, a canonical link, Open Graph/Twitter tags, one H1 and
  schema.org JSON-LD (SoftwareApplication, Organization, WebSite, FAQPage, BreadcrumbList).
* The Inter font is self-hosted through `next/font`, so there's no layout shift. The OG image and
  icons are file-based metadata.
* `robots.txt`, `sitemap.xml` and `manifest.webmanifest` are generated from `VITE_SITE_URL`.
  `/app/*` and `/login` are `noindex`.
* To rank for more keywords, add entries to `FEATURES` in `frontend/src/lib/site.js`. Each one becomes a new
  static page and is added to the sitemap automatically.
* Submit `https://yourdomain.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
* Check the page with PageSpeed Insights and the Rich Results Test (the FAQ rich result should show up).
* The app under `/app/` sits behind a login and is deliberately kept out of the index.

## 11. Operating it

* Logs: `docker compose logs -f backend web`
* Backups: RDS automated backups (set retention ≥ 7 days for production)
* Secrets: rotate `SECRET_KEY` (this logs everyone out) and never commit `backend/.env`
* Model: retrain weekly (step 5) and watch `test.f1_macro` in the model card
