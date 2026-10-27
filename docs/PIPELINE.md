# FocusLink AI — from first setup to a live AWS deployment

This guide walks through the whole project in the order you would build and ship it. Each step
says what you do, which code is involved, and how to check that it works.

```
 Browser ──WebRTC──▶ Streamlit (frontend/)                 ┌──▶ AWS RDS PostgreSQL (users, sessions, chat, OTPs)
   camera + mic        ├─ cv/      face attention engine   │
                       ├─ speech/  speech coach engine     ├──▶ AWS S3 (session reports)
                       └─ REST/WS ──▶ FastAPI (backend/) ──┼──▶ AWS SES (OTP email) · AWS SNS (OTP SMS)
                                        ├─ nlp/  text AI   └──▶ Amazon Comprehend (optional sentiment)
 Google ──▶ SEO landing page (backend/web) └─ ml/   fatigue model (scikit-learn)
```

---

## 1. Local setup (≈10 min)

MediaPipe needs Python 3.9–3.12, so use the project's Python 3.11 virtual environment.

```powershell
py -3.11 -m venv .venv            # or: uv venv --python 3.11
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

**Check:** `python -c "import mediapipe, faster_whisper, sklearn; print('ok')"`

## 2. Database & data model

`backend/database.py` uses SQLAlchemy, so the same code runs on SQLite (dev) and PostgreSQL (RDS).
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

`backend/routers/auth_routes.py` + `backend/services/otp_service.py` + `notify_service.py`

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
| `cv/attention_detector.py` | video frame → EAR, MAR, head pose, gaze → Focused / Distracted / Drowsy | AI Lab → Computer vision |
| `nlp/text_analyzer.py` | text → sentiment, toxicity, keywords, wording confidence, summary | AI Lab → NLP |
| `speech/analyzer.py` | audio → transcript, pace, fillers, clarity, pitch → confidence score + tips | AI Lab → Speech, Speech Coach |
| `ml/` | session features → fatigue risk (low / medium / high) + explanation | AI Lab → Machine learning |

## 5. Machine-learning lifecycle

```
python -m ml.train             # bootstrap: simulated sessions only
python -m ml.train --with-db   # + real sessions users rated ("How tired do you feel?")
```

* **Data** (`ml/dataset.py`): at launch there are no labels, so we simulate sessions from a latent
  fatigue variable (cold start). Every rating a user gives after a Focus Monitor session becomes a real
  label, and each real label is weighted 5×.
* **Model selection** (`ml/train.py`): Logistic Regression, Random Forest and Gradient Boosting are compared
  with 5-fold stratified cross-validation (macro-F1). The best one is refit and scored on a 20% held-out split.
* **Artifacts**: `ml/artifacts/fatigue_model.joblib` and `model_card.json` (metrics, confusion matrix,
  permutation importance, data counts, limitations). The backend Docker image trains it at build time.
* **Serving**: `GET /ml/model`, `POST /ml/predict`, `GET /ml/fatigue/me`. Each prediction also lists the
  features that pushed risk up or down.
* **Retraining in production**: run a weekly cron on the server:
  `docker compose exec backend python -m ml.train --with-db && docker compose restart backend`.

## 6. Tests

```powershell
python -m pytest -q tests
```

The tests cover sign-up, OTP verification (both channels), wrong-code and attempt limits, OTP login,
password reset, the NLP engine, the speech rewrite and read-aloud alignment, ML features and predictions,
feedback labels, and the SEO pages. Each run uses a throw-away SQLite database.

## 7. Run locally

```powershell
# Terminal 1 — API + SEO landing page   → http://localhost:8000  (docs: /docs)
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
# Terminal 2 — app                       → http://localhost:8501
.venv\Scripts\python.exe -m streamlit run frontend/Home.py
```

Or run everything in Docker, with Postgres and Nginx in front: `docker compose up --build` gives you
http://localhost (landing page) and http://localhost/app/ (app).

## 8. AWS resources

```bash
export AWS_REGION=ap-south-1 DB_PASS='a-strong-password' SES_SENDER=no-reply@yourdomain.com
bash aws/setup_aws.sh
```

This creates the S3 bucket, an RDS PostgreSQL instance, an SES sender identity and the SNS SMS settings,
plus an IAM policy (`s3:PutObject/GetObject`, `comprehend:DetectSentiment`, `ses:SendEmail`, `sns:Publish`).

Before real users can sign up:
* **SES sandbox:** you can only email verified addresses until you request production access.
* **SNS sandbox:** add test phone numbers or request production access. For India, register a DLT
  entity and an OTP template.

Put the printed values in `.env`: `AWS_ENABLED=true`, `DATABASE_URL_OVERRIDE=…rds…`, `S3_BUCKET`,
`SES_SENDER`, `SITE_URL=https://yourdomain.com`, `APP_URL=https://yourdomain.com/app/`.
`OTP_DEV_MODE` is off automatically once AWS is enabled.

## 9. Go live on EC2 with HTTPS

1. Launch Ubuntu EC2 (t3.large recommended for Whisper + MediaPipe). Attach an IAM role with
   `FocusLinkAIPolicy`. In the security group, open ports 22, 80 and 443.
2. `git clone …` then run `bash aws/deploy_ec2.sh`. This builds the images and starts backend, frontend and nginx.
3. Point your domain's A record at the instance, then add HTTPS (browsers only allow camera and mic on HTTPS):
   ```bash
   sudo apt install -y certbot
   sudo docker compose stop nginx
   sudo certbot certonly --standalone -d yourdomain.com
   ```
   Add a `listen 443 ssl;` server block to `deploy/nginx.conf` with
   `ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;` and the matching key. Mount
   `/etc/letsencrypt` into the nginx container, redirect port 80 to 443, then `docker compose up -d nginx`.
   (Alternative: an Application Load Balancer with a free ACM certificate.)
4. **Check:** `https://yourdomain.com/` shows the landing page, `/app/` lets you sign up, and the OTP email
   and SMS arrive.

## 10. SEO checklist after launch

* The landing page (`backend/web/index.html`) already has a title, meta description, canonical link,
  Open Graph and Twitter tags, schema.org `SoftwareApplication` + `Organization` + `FAQPage`, one H1,
  semantic sections, a mobile-first layout, and a page that loads without JavaScript.
* `robots.txt` and `sitemap.xml` are generated from `SITE_URL`.
* Submit `https://yourdomain.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
* Check the page with PageSpeed Insights and the Rich Results Test (the FAQ rich result should show up).
* Keep the app itself under `/app/`. It sits behind a login and doesn't need to be indexed.

## 11. Operating it

* Logs: `docker compose logs -f backend frontend`
* Backups: RDS automated backups (set retention ≥ 7 days for production)
* Secrets: rotate `SECRET_KEY` (this logs everyone out) and never commit `.env`
* Model: retrain weekly (step 5) and watch `test.f1_macro` in the model card
