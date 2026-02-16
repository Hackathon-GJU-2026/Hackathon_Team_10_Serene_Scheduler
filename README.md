# Serene Scheduler

Serene Scheduler is a role-based timetable web app:
- Frontend: React + Vite
- Backend: Flask
- Storage: JSON files (prototype mode)

This README gives a complete **manual Render deployment guide** with exact environment variables.

## 1. Project Structure

```text
boka/
  backend/
    app.py
    requirements.txt
    users.json
    pending_registrations.json
    published_timetable.json
    reschedule_requests.json
    activity_log.json
  frontend/
    package.json
    vite.config.js
    src/
  render.yaml (optional, not required for manual deploy)
```

## 2. Before Deployment

1. Push latest code to GitHub.
2. Do not commit real secrets in `backend/.env`.
3. Confirm backend starts locally and frontend builds:

```powershell
python -m py_compile backend/app.py
cd frontend
npm run build
```

## 3. Deploy Backend on Render (Web Service)

### Step-by-step

1. Go to `https://dashboard.render.com`
2. Click `New +` -> `Web Service`
3. Connect your GitHub repo
4. Configure:
- Name: `serene-scheduler-backend`
- Branch: `main`
- Root Directory: `backend`
- Runtime: `Python`
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`

5. Set Backend Environment Variables (Render -> Environment):

```env
FLASK_SECRET_KEY=<strong_random_secret>
DATA_DIR=/var/data
FRONTEND_ORIGIN=<set after frontend deploy>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your_email@gmail.com>
SMTP_PASS=<gmail_app_password>
SMTP_FROM_EMAIL=<your_email@gmail.com>
SMTP_FROM_NAME=Serene Scheduler

SHOW_DEV_VERIFICATION_CODE=0
```

6. Click `Create Web Service`

### Add Persistent Disk (must)

1. Open backend service -> `Disks`
2. Click `Add Disk`
3. Set:
- Name: `scheduler-data`
- Mount path: `/var/data`
- Size: `1 GB` (or more)
4. Save

Why: your app stores runtime data in JSON files. Without disk, data can reset on restart/redeploy.

## 4. Deploy Frontend on Render (Static Site)

### Step-by-step

1. Render Dashboard -> `New +` -> `Static Site`
2. Connect same GitHub repo
3. Configure:
- Name: `serene-scheduler-frontend`
- Branch: `main`
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `build`

4. Set Frontend Environment Variable:

```env
VITE_API_BASE_URL=https://<your-backend-service>.onrender.com
```

5. Click `Create Static Site`

## 5. Final CORS Setup (Important)

After frontend deploy completes:

1. Copy frontend URL:
- Example: `https://serene-scheduler-frontend.onrender.com`

2. Go to backend service -> Environment
3. Set:

```env
FRONTEND_ORIGIN=https://serene-scheduler-frontend.onrender.com
```

4. Save and redeploy backend.

If this is wrong, frontend will show `Failed to fetch` / CORS errors.

## 6. Environment Variables Reference

### Backend required
- `FLASK_SECRET_KEY`: Flask session secret
- `DATA_DIR`: Data folder path (`/var/data` on Render)
- `FRONTEND_ORIGIN`: Exact frontend URL
- `SMTP_HOST`: SMTP server
- `SMTP_PORT`: SMTP port
- `SMTP_USER`: sender email login
- `SMTP_PASS`: app password
- `SMTP_FROM_EMAIL`: from email shown in OTP mail
- `SMTP_FROM_NAME`: from display name
- `SHOW_DEV_VERIFICATION_CODE`: keep `0` in production

### Frontend required
- `VITE_API_BASE_URL`: Backend API base URL

## 7. Gmail SMTP Setup (OTP)

Use App Password, not your normal password.

1. Google Account -> Security
2. Enable 2-Step Verification
3. Open `App passwords`
4. Generate app password
5. Put it in Render as `SMTP_PASS`

## 8. Data Persistence Behavior

With `DATA_DIR=/var/data` + persistent disk, these stay saved:
- `users.json`
- `pending_registrations.json`
- `published_timetable.json`
- `reschedule_requests.json`
- `activity_log.json`

Without persistent disk, these may reset.

## 9. Post-Deploy Testing Checklist

1. Open frontend URL.
2. Login as admin.
3. Register student and verify OTP.
4. Register teacher and approve from admin panel.
5. Generate/publish timetable.
6. Login as student and teacher.
7. Restart backend service.
8. Confirm users + timetable still exist.

## 10. Common Problems and Fixes

### `Failed to fetch`
- Check frontend `VITE_API_BASE_URL`
- Check backend is running
- Check backend `FRONTEND_ORIGIN`

### CORS blocked
- `FRONTEND_ORIGIN` must exactly match frontend URL

### OTP not delivered
- Wrong SMTP values or invalid app password
- Check spam folder

### Data lost after restart
- Missing persistent disk
- Wrong `DATA_DIR`

## 11. Security Checklist

- Never commit real `.env` secrets.
- Rotate leaked secrets immediately.
- Keep `SHOW_DEV_VERIFICATION_CODE=0` in production.
- Use a strong random `FLASK_SECRET_KEY`.

## 12. Local Development Commands

Backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```
