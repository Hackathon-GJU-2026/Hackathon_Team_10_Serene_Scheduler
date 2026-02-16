import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv()

from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
import copy, math, random, itertools
from collections import defaultdict
from datetime import datetime, timedelta
from functools import wraps
import json
import smtplib
import urllib.request
import urllib.error
from email.mime.text import MIMEText
from email.utils import formataddr
from pymongo import MongoClient

APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Serve React production build from frontend/build
app = Flask(
    __name__,
    static_folder=os.path.join(APP_DIR, '..', 'frontend', 'build'),
    static_url_path='/'
)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "change-this-secret")
running_on_render = bool(os.environ.get("RENDER"))
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="None" if running_on_render else "Lax",
    SESSION_COOKIE_SECURE=running_on_render,
)
configured_origins = os.environ.get(
    "FRONTEND_ORIGIN",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
).split(",")
allowed_origins = [o.strip() for o in configured_origins if o.strip()]
allowed_origins.extend([r"http://localhost:\d+", r"http://127\.0\.0\.1:\d+"])
allowed_origins.extend([
    r"http://10\.\d+\.\d+\.\d+:\d+",
    r"http://192\.168\.\d+\.\d+:\d+",
    r"http://172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+:\d+"
])
CORS(
    app,
    supports_credentials=True,
    origins=allowed_origins
)

BASE_DIR = APP_DIR
configured_data_dir = os.environ.get("DATA_DIR", BASE_DIR)
fallback_data_dir = os.path.join("/tmp", "serene-data")
try:
    os.makedirs(configured_data_dir, exist_ok=True)
    DATA_DIR = configured_data_dir
except PermissionError:
    os.makedirs(fallback_data_dir, exist_ok=True)
    DATA_DIR = fallback_data_dir
except OSError:
    os.makedirs(fallback_data_dir, exist_ok=True)
    DATA_DIR = fallback_data_dir
USERS_FILE = os.path.join(DATA_DIR, "users.json")
PUBLISHED_TIMETABLE_FILE = os.path.join(DATA_DIR, "published_timetable.json")
RESCHEDULE_REQUESTS_FILE = os.path.join(DATA_DIR, "reschedule_requests.json")
PENDING_REGISTRATIONS_FILE = os.path.join(DATA_DIR, "pending_registrations.json")
ACTIVITY_LOG_FILE = os.path.join(DATA_DIR, "activity_log.json")
SEED_USERS_FILE = os.path.join(BASE_DIR, "users.json")

USERS = {}
PUBLISHED_TIMETABLE = None
RESCHEDULE_REQUESTS = []
PENDING_REGISTRATIONS = []
ACTIVITY_LOGS = []
MONGO_CLIENT = None
MONGO_STATE_COLLECTION = None


def init_mongo():
    global MONGO_CLIENT, MONGO_STATE_COLLECTION
    mongo_uri = os.environ.get("MONGO_URI", "").strip()
    if not mongo_uri:
        return
    db_name = os.environ.get("MONGO_DB_NAME", "serene_scheduler").strip() or "serene_scheduler"
    try:
        MONGO_CLIENT = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        MONGO_CLIENT.admin.command("ping")
        MONGO_STATE_COLLECTION = MONGO_CLIENT[db_name]["app_state"]
        print(f"[storage] Using MongoDB database '{db_name}'")
    except Exception as exc:
        MONGO_CLIENT = None
        MONGO_STATE_COLLECTION = None
        print(f"[storage] MongoDB unavailable, falling back to JSON files: {exc}")


def state_key_for_path(path):
    return os.path.splitext(os.path.basename(path))[0]


def read_json_file(path, default_value):
    if MONGO_STATE_COLLECTION is not None:
        try:
            doc = MONGO_STATE_COLLECTION.find_one({"_id": state_key_for_path(path)})
            if doc is None or "value" not in doc:
                return copy.deepcopy(default_value)
            return doc["value"]
        except Exception:
            return copy.deepcopy(default_value)
    if not os.path.exists(path):
        return copy.deepcopy(default_value)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return copy.deepcopy(default_value)


def write_json_file(path, data):
    if MONGO_STATE_COLLECTION is not None:
        MONGO_STATE_COLLECTION.replace_one(
            {"_id": state_key_for_path(path)},
            {"_id": state_key_for_path(path), "value": data},
            upsert=True
        )
        return
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def read_seed_users():
    if not os.path.exists(SEED_USERS_FILE):
        return {}
    try:
        with open(SEED_USERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def load_users():
    users = read_json_file(USERS_FILE, {})
    if not isinstance(users, dict):
        users = {}

    changed = False
    if not users:
        seed_users = read_seed_users()
        for username, record in seed_users.items():
            if username in users or not isinstance(record, dict):
                continue
            users[username] = record
            changed = True

    if "admin" not in users:
        users["admin"] = {
            "username": "admin",
            "password": os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin123"),
            "role": "admin",
            "name": "Administrator"
        }
        changed = True

    demo_teacher_password = os.environ.get("DEFAULT_TEACHER_PASSWORD", "teacher123")
    demo_teachers = [
        ("t_dr_karambir", "Dr. Karambir"),
        ("t_dr_sona", "Dr. Sona"),
        ("t_mr_divyansh", "Mr. Divyansh"),
        ("t_ms_pooja", "Ms. Pooja"),
    ]
    for username, teacher_name in demo_teachers:
        if username in users:
            continue
        users[username] = {
            "username": username,
            "password": demo_teacher_password,
            "role": "teacher",
            "name": teacher_name,
            "teacher_name": teacher_name,
            "email": f"{username}@demo.local",
            "status": "active"
        }
        changed = True

    if changed:
        write_json_file(USERS_FILE, users)
    return users


def save_users():
    write_json_file(USERS_FILE, USERS)


def load_published_timetable():
    return read_json_file(PUBLISHED_TIMETABLE_FILE, None)


def save_published_timetable():
    write_json_file(PUBLISHED_TIMETABLE_FILE, PUBLISHED_TIMETABLE)


def get_latest_published_timetable():
    """Always refresh from disk so multiple server workers stay consistent."""
    global PUBLISHED_TIMETABLE
    PUBLISHED_TIMETABLE = load_published_timetable()
    if PUBLISHED_TIMETABLE:
        refresh_temporary_changes()
    return PUBLISHED_TIMETABLE


def parse_iso_utc(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def rebuild_timetable_from_active_changes():
    global PUBLISHED_TIMETABLE
    if not PUBLISHED_TIMETABLE:
        return

    base_data = copy.deepcopy(PUBLISHED_TIMETABLE.get("baseTimetableData") or PUBLISHED_TIMETABLE.get("timetableData") or {})
    rows = base_data.get("timetable", [])
    input_data = PUBLISHED_TIMETABLE.get("inputData", {})
    changes = sorted(PUBLISHED_TIMETABLE.get("temporary_changes", []), key=lambda c: c.get("appliedAt", ""))

    for change in changes:
        if change.get("type") == "reslot_theory":
            try:
                rows = apply_theory_reslot(
                    rows,
                    change.get("teacher"),
                    change.get("day"),
                    change.get("fromSlot"),
                    change.get("toSlot"),
                    input_data.get("slots", [])
                )
            except Exception:
                continue
        else:
            rows = run_teacher_reset(
                input_data,
                rows,
                change.get("teacher"),
                change.get("day"),
                change.get("slot")
            )

    PUBLISHED_TIMETABLE.setdefault("timetableData", {})
    PUBLISHED_TIMETABLE["timetableData"]["timetable"] = rows


def refresh_temporary_changes():
    global PUBLISHED_TIMETABLE
    if not PUBLISHED_TIMETABLE:
        return

    # Ensure a stable base snapshot exists for revert/rebuild.
    if "baseTimetableData" not in PUBLISHED_TIMETABLE and PUBLISHED_TIMETABLE.get("timetableData"):
        PUBLISHED_TIMETABLE["baseTimetableData"] = copy.deepcopy(PUBLISHED_TIMETABLE["timetableData"])
        save_published_timetable()

    now = datetime.utcnow()
    existing = PUBLISHED_TIMETABLE.get("temporary_changes", [])
    active = []
    for change in existing:
        exp = parse_iso_utc(change.get("expiresAt"))
        if exp and exp > now:
            active.append(change)

    if len(active) != len(existing):
        PUBLISHED_TIMETABLE["temporary_changes"] = active
        rebuild_timetable_from_active_changes()
        PUBLISHED_TIMETABLE["publishedAt"] = datetime.utcnow().isoformat() + "Z"
        save_published_timetable()


def load_reschedule_requests():
    return read_json_file(RESCHEDULE_REQUESTS_FILE, [])


def save_reschedule_requests():
    write_json_file(RESCHEDULE_REQUESTS_FILE, RESCHEDULE_REQUESTS)


def get_latest_reschedule_requests():
    global RESCHEDULE_REQUESTS
    RESCHEDULE_REQUESTS = load_reschedule_requests()
    return RESCHEDULE_REQUESTS




def load_pending_registrations():
    return read_json_file(PENDING_REGISTRATIONS_FILE, [])


def save_pending_registrations():
    write_json_file(PENDING_REGISTRATIONS_FILE, PENDING_REGISTRATIONS)


def get_latest_pending_registrations():
    global PENDING_REGISTRATIONS
    PENDING_REGISTRATIONS = load_pending_registrations()
    return PENDING_REGISTRATIONS


def cleanup_pending_registrations():
    regs = get_latest_pending_registrations()
    kept = []
    changed = False
    now = datetime.utcnow()
    for reg in regs:
        status = reg.get("status")
        if status not in ("pending_email_verification", "pending_admin_approval"):
            changed = True
            continue
        if status == "pending_email_verification":
            expires = parse_iso_utc(reg.get("verification_expires_at"))
            if expires and expires <= now:
                changed = True
                continue
        if status == "pending_admin_approval":
            if "verification_code" in reg or "verification_expires_at" in reg:
                reg.pop("verification_code", None)
                reg.pop("verification_expires_at", None)
                changed = True
        kept.append(reg)
    if changed or len(kept) != len(regs):
        PENDING_REGISTRATIONS[:] = kept
        save_pending_registrations()


def cleanup_reschedule_requests():
    requests = get_latest_reschedule_requests()
    kept = [r for r in requests if r.get("status") == "pending"]
    if len(kept) != len(requests):
        RESCHEDULE_REQUESTS[:] = kept
        save_reschedule_requests()


def load_activity_logs():
    return read_json_file(ACTIVITY_LOG_FILE, [])


def save_activity_logs():
    write_json_file(ACTIVITY_LOG_FILE, ACTIVITY_LOGS)


def get_latest_activity_logs():
    global ACTIVITY_LOGS
    ACTIVITY_LOGS = load_activity_logs()
    return ACTIVITY_LOGS


def cleanup_activity_logs(days_to_keep=2):
    logs = get_latest_activity_logs()
    now = datetime.utcnow()
    keep = []
    for entry in logs:
        ts = parse_iso_utc(entry.get("createdAt"))
        if not ts:
            continue
        if ts >= now - timedelta(days=days_to_keep):
            keep.append(entry)
    if len(keep) != len(logs):
        ACTIVITY_LOGS[:] = keep
        save_activity_logs()


def add_activity_log(event_type, message, data=None):
    logs = get_latest_activity_logs()
    entry = {
        "id": int(datetime.utcnow().timestamp() * 1000) + random.randint(10, 999),
        "type": event_type,
        "message": message,
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "data": data or {}
    }
    logs.append(entry)
    cleanup_activity_logs()
    save_activity_logs()
    return entry


def is_username_taken(username):
    global USERS
    USERS = load_users()
    cleanup_pending_registrations()
    uname = (username or "").strip().lower()
    for user in USERS.values():
        if (user.get("username") or "").strip().lower() == uname:
            return True

    regs = get_latest_pending_registrations()
    for reg in regs:
        if (reg.get("username") or "").strip().lower() == uname and reg.get("status") in (
            "pending_email_verification", "pending_admin_approval", "approved"
        ):
            return True
    return False


def is_email_taken(email):
    global USERS
    USERS = load_users()
    cleanup_pending_registrations()
    normalized = (email or "").strip().lower()
    if not normalized:
        return False

    for user in USERS.values():
        if (user.get("email") or "").strip().lower() == normalized:
            return True

    regs = get_latest_pending_registrations()
    for reg in regs:
        if (reg.get("email") or "").strip().lower() == normalized and reg.get("status") in (
            "pending_email_verification", "pending_admin_approval", "approved"
        ):
            return True
    return False


def email_taken_source(email):
    global USERS
    USERS = load_users()
    cleanup_pending_registrations()
    normalized = (email or "").strip().lower()
    if not normalized:
        return None

    for username, user in USERS.items():
        if (user.get("email") or "").strip().lower() == normalized:
            return {
                "source": "users",
                "username": username,
                "role": user.get("role"),
                "status": user.get("status", "active")
            }

    regs = get_latest_pending_registrations()
    for reg in regs:
        if (reg.get("email") or "").strip().lower() == normalized and reg.get("status") in (
            "pending_email_verification", "pending_admin_approval", "approved"
        ):
            return {
                "source": "pending_registrations",
                "username": reg.get("username"),
                "role": reg.get("role"),
                "status": reg.get("status"),
                "registration_id": reg.get("id")
            }
    return None


def send_verification_email(email, code):
    resend_api_key = os.environ.get("RESEND_API_KEY")
    resend_from_email = os.environ.get("RESEND_FROM_EMAIL")
    resend_from_name = os.environ.get("RESEND_FROM_NAME", "Serene Scheduler")

    if resend_api_key and resend_from_email:
        from_value = f"{resend_from_name} <{resend_from_email}>" if resend_from_name else resend_from_email
        payload = {
            "from": from_value,
            "to": [email],
            "subject": "Serene Scheduler Email Verification",
            "html": (
                f"<p>Your Serene Scheduler verification code is: <strong>{code}</strong></p>"
                "<p>This code expires in 15 minutes.</p>"
            ),
            "text": f"Your Serene Scheduler verification code is: {code}\nThis code expires in 15 minutes."
        }
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                if 200 <= response.status < 300:
                    return True, "Verification email sent via Resend"
                body = response.read().decode("utf-8", errors="ignore")
                return False, f"Resend failed ({response.status}): {body}"
        except urllib.error.HTTPError as e:
            details = e.read().decode("utf-8", errors="ignore")
            return False, f"Resend HTTP error ({e.code}): {details}"
        except Exception as e:
            return False, f"Resend request failed: {e}"

    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    smtp_from_email = (
        os.environ.get("SMTP_FROM_EMAIL")
        or os.environ.get("SMTP_FROM")
        or smtp_user
    )
    smtp_from_name = os.environ.get("SMTP_FROM_NAME", "Serene Scheduler")

    if not smtp_host or not smtp_user or not smtp_pass or not smtp_from_email:
        return False, "Email service not configured"

    msg = MIMEText(
        f"Your Serene Scheduler verification code is: {code}\nThis code expires in 15 minutes.",
        "plain",
        "utf-8"
    )
    msg["Subject"] = "Serene Scheduler Email Verification"
    msg["From"] = formataddr((smtp_from_name, smtp_from_email))
    msg["To"] = email

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_from_email, [email], msg.as_string())

    return True, "Verification email sent"


def build_user_from_registration(reg):
    role = reg.get("role")
    base = {
        "username": reg.get("username"),
        "password": reg.get("password"),
        "role": role,
        "name": reg.get("name"),
        "email": reg.get("email"),
        "status": "active"
    }
    if role == "teacher":
        base["teacher_name"] = reg.get("teacher_name") or reg.get("name")
    if role == "student":
        base["section"] = reg.get("section")
        base["stream"] = reg.get("stream")
        base["semester"] = reg.get("semester")
        base["batch"] = reg.get("batch")
        base["division"] = reg.get("division")
    return base


def slugify_username(value):
    safe = "".join(ch.lower() if ch.isalnum() else "_" for ch in str(value))
    safe = "_".join([part for part in safe.split("_") if part])
    return safe or "user"


def parse_semester_number(value):
    raw = (value or "").strip().lower()
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        try:
            return int(digits)
        except Exception:
            return None
    words = {
        "first": 1, "second": 2, "third": 3, "fourth": 4,
        "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8
    }
    return words.get(raw)


def to_roman_semester(value):
    mapping = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII"}
    sem_num = parse_semester_number(value)
    if sem_num in mapping:
        return mapping[sem_num]
    return (value or "").strip().upper()


def sync_users_from_timetable(timetable_rows):
    teacher_names = sorted({(row.get("teacher") or "").strip() for row in timetable_rows if row.get("teacher")})
    sections = sorted({(row.get("section") or "").strip() for row in timetable_rows if row.get("section")})

    for teacher_name in teacher_names:
        username = f"t_{slugify_username(teacher_name)}"
        if username not in USERS:
            USERS[username] = {
                "username": username,
                "password": os.environ.get("DEFAULT_TEACHER_PASSWORD", "teacher123"),
                "role": "teacher",
                "name": teacher_name,
                "teacher_name": teacher_name
            }

    for section in sections:
        username = f"s_{slugify_username(section)}"
        if username not in USERS:
            USERS[username] = {
                "username": username,
                "password": os.environ.get("DEFAULT_STUDENT_PASSWORD", "student123"),
                "role": "student",
                "name": section,
                "section": section
            }

    save_users()


def get_current_user():
    username = session.get("username")
    if not username:
        return None
    user = USERS.get(username)
    if not user:
        return None
    return user


def public_user(user):
    if not user:
        return None
    return {
        "username": user.get("username"),
        "role": user.get("role"),
        "name": user.get("name", user.get("username")),
        "teacher_name": user.get("teacher_name"),
        "section": user.get("section"),
        "email": user.get("email"),
        "stream": user.get("stream"),
        "semester": user.get("semester"),
        "batch": user.get("batch"),
        "division": user.get("division")
    }


def require_auth(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        return func(*args, **kwargs)
    return wrapper


def require_roles(*roles):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            if user.get("role") not in roles:
                return jsonify({"error": "Forbidden"}), 403
            return func(*args, **kwargs)
        return wrapper
    return decorator


# ----------------- Data Structure Transformation -----------------

def transform_classes_to_sections(data):
    """
    Transform the new classes-based data structure to the old sections-based structure
    that the existing algorithms expect.
    """
    # Create a copy of the original data
    transformed_data = copy.deepcopy(data)
    
    # Extract sections from classes
    sections = []
    
    for class_info in data.get('classes', []):
        class_name = class_info.get('name', '')
        class_subjects = class_info.get('subjects', [])
        class_lab_subjects = class_info.get('lab_subjects', [])
        
        for section_info in class_info.get('sections', []):
            section_name = section_info.get('name', '')
            
            # Create full section name (e.g., "CSE 3rd Year - A")
            if section_name:
                full_section_name = f"{class_name} - {section_name}"
            else:
                full_section_name = class_name
            
            # Create section in the old format
            section_data = {
                'name': full_section_name,
                'student_count': section_info.get('student_count', 0),
                'subjects': class_subjects.copy(),
                'lab_subjects': class_lab_subjects.copy(),
                'class_name': class_name,  # Keep reference to parent class
                'section_name': section_name
            }
            
            sections.append(section_data)
    
    # Replace classes with sections in the transformed data
    transformed_data['sections'] = sections
    
    # Remove the classes key as it's no longer needed
    if 'classes' in transformed_data:
        del transformed_data['classes']
    
    return transformed_data

def validate_input_data(data):
    """
    Validate the input data structure and return validation results.
    """
    errors = []
    warnings = []
    
    # Check if classes exist
    if 'classes' not in data:
        errors.append('Missing required field: classes')
        return {'valid': False, 'errors': errors, 'warnings': warnings}
    
    classes = data.get('classes', [])
    if not classes:
        errors.append('At least one class is required')
        return {'valid': False, 'errors': errors, 'warnings': warnings}
    
    # Validate each class
    for i, class_info in enumerate(classes):
        if not isinstance(class_info, dict):
            errors.append(f'Class {i+1} must be an object')
            continue
            
        # Check required fields
        if not class_info.get('name'):
            errors.append(f'Class {i+1} must have a name')
        
        if 'sections' not in class_info or not class_info['sections']:
            errors.append(f'Class {i+1} must have at least one section')
        else:
            # Validate sections
            for j, section in enumerate(class_info['sections']):
                if not isinstance(section, dict):
                    errors.append(f'Class {i+1}, Section {j+1} must be an object')
                    continue
                
                if not section.get('name'):
                    warnings.append(f'Class {i+1}, Section {j+1} should have a name')
                
                if not section.get('student_count', 0):
                    warnings.append(f'Class {i+1}, Section {j+1} should have student count')
        
        # Check subjects
        subjects = class_info.get('subjects', [])
        lab_subjects = class_info.get('lab_subjects', [])
        
        if not subjects and not lab_subjects:
            warnings.append(f'Class {i+1} ({class_info.get("name", "")}) has no subjects defined')
    
    # Check other required fields
    required_fields = ['rooms', 'days', 'slots']
    for field in required_fields:
        if field not in data:
            errors.append(f'Missing required field: {field}')
    
    # Check days and slots
    if 'days' in data and len(data.get('days', [])) < 1:
        errors.append('At least one day must be defined')
    
    if 'slots' in data:
        non_lunch_slots = [s for s in data.get('slots', []) if s != 'Lunch Break']
        if len(non_lunch_slots) < 1:
            errors.append('At least one time slot must be defined')
    
    # Check teacher assignments
    all_subjects = set()
    for class_info in classes:
        all_subjects.update(class_info.get('subjects', []))
        all_subjects.update(class_info.get('lab_subjects', []))
    
    teachers = data.get('teachers', {})
    lab_teachers = data.get('lab_teachers', {})
    
    for subject in all_subjects:
        if subject not in teachers and subject not in lab_teachers:
            warnings.append(f'No teacher assigned to subject: {subject}')
        else:
            assigned_teachers = []
            if subject in teachers:
                assigned_teachers.extend([t for t in teachers[subject] if t.strip()])
            if subject in lab_teachers:
                assigned_teachers.extend([t for t in lab_teachers[subject] if t.strip()])
            
            if not assigned_teachers:
                warnings.append(f'Subject "{subject}" has no valid teachers assigned')
    
    # Check lab room assignments
    lab_rooms = data.get('lab_rooms', {})
    for class_info in classes:
        for lab_subject in class_info.get('lab_subjects', []):
            if lab_subject not in lab_rooms or not lab_rooms[lab_subject]:
                warnings.append(f'No lab rooms assigned to lab subject: {lab_subject}')
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }


# ----------------- Utilities -----------------


def assign_fixed_classrooms(data):
    rooms = data.get("rooms", [])
    fixed = {}
    for i, sec in enumerate(data["sections"]):
        if rooms:
            fixed[sec["name"]] = rooms[i % len(rooms)]
        else:
            fixed[sec["name"]] = None
    return fixed



def create_fixed_teacher_mapping(data):
    mapping = {}
    for sec in data["sections"]:
        secname = sec["name"]
        subjects = sec.get("subjects", []) + sec.get("lab_subjects", [])
        for sub in subjects:
            if sub in data.get("lab_teachers", {}):
                teachers = data["lab_teachers"][sub]
            else:
                val = data.get("teachers", {}).get(sub)
                if isinstance(val, list):
                    teachers = val[:]
                elif val:
                    teachers = [val]
                else:
                    teachers = [None]
            if not teachers:
                teachers = [None]
            idx = abs(hash((secname, sub))) % len(teachers)
            mapping[(secname, sub)] = teachers[idx]
    return mapping



def get_lab_groups_map(data):
    cap = data.get("lab_capacity", 30)
    groups = {}
    for s in data["sections"]:
        students = int(s.get("student_count", 0))
        groups[s["name"]] = max(1, math.ceil(students / cap))
    return groups



def make_group_labels(num_groups):
    return [f"G{i+1}" for i in range(num_groups)]



def make_empty_timetable(data):
    timetable = {}
    for sec in data["sections"]:
        name = sec["name"]
        timetable[name] = {}
        for day in data["days"]:
            timetable[name][day] = {}
            for slot in data["slots"]:
                if slot == "Lunch Break":
                    timetable[name][day][slot] = [("LUNCH", None, None)]
                else:
                    timetable[name][day][slot] = []
    return timetable



# ----------------- Scheduler Core -----------------


def slot_blocks_order(data, duration=2):
    slots = data["slots"]
    blocks = []
    if duration <= 1:
        return [[s] for s in slots if s != "Lunch Break"]
    for i in range(len(slots) - duration + 1):
        candidate = slots[i:i + duration]
        # Never allow a single lab block to cross lunch.
        if "Lunch Break" in candidate:
            continue
        blocks.append(candidate)
    # Prefer earlier contiguous blocks first.
    return blocks



def teacher_unavailable_on(teacher, day, slot, data):
    if not teacher:
        return False
    unavail = data.get("teacher_unavailability", {})
    if teacher not in unavail:
        return False
    for u in unavail[teacher]:
        if u.get("day") == day and u.get("slot") == slot:
            return True
    return False



def can_place_block(timetable, secname, day, block_slots, room, teacher, used_rooms, used_teachers, data):
    max_teacher_daily = int(data.get("constraints", {}).get("max_lectures_per_day_teacher", 5))
    if teacher:
        current_teacher_hours = sum(1 for t, d, _ in used_teachers if t == teacher and d == day)
        if current_teacher_hours + len(block_slots) > max_teacher_daily:
            return False
    for slot in block_slots:
        existing = timetable[secname][day][slot]
        if any(entry and entry[0] not in ("FREE",) for entry in existing):
            return False
        if room and (room, day, slot) in used_rooms:
            return False
        if teacher and (teacher, day, slot) in used_teachers:
            return False
        if teacher and has_adjacent_lab_for_teacher(timetable, teacher, day, slot, data):
            return False
        if teacher_unavailable_on(teacher, day, slot, data):
            return False
    return True


def has_adjacent_lab_for_teacher(timetable, teacher, day, slot, data):
    if not teacher:
        return False
    slots_no_lunch = [s for s in data.get("slots", []) if s != "Lunch Break"]
    if slot not in slots_no_lunch:
        return False
    idx = slots_no_lunch.index(slot)
    neighbors = []
    if idx - 1 >= 0:
        neighbors.append(slots_no_lunch[idx - 1])
    if idx + 1 < len(slots_no_lunch):
        neighbors.append(slots_no_lunch[idx + 1])

    teacher_lc = teacher.strip().lower()
    for secname in timetable:
        for neighbor_slot in neighbors:
            for entry in timetable[secname][day].get(neighbor_slot, []):
                if not entry:
                    continue
                if len(entry) > 3 and (entry[2] or "").strip().lower() == teacher_lc:
                    return True
    return False


def assign_all_labs(data, timetable, fixed_teachers, fixed_classrooms):
    days = data["days"]
    lab_rooms_map = data.get("lab_rooms", {})
    lab_groups_map = get_lab_groups_map(data)
    constraints = data.get("constraints", {})
    default_lab_duration = int(constraints.get("lab_session_duration", 2))
    max_teacher_daily = int(constraints.get("max_lectures_per_day_teacher", 5))
    lab_durations = data.get("lab_durations", {})


    tasks = []
    for sec in data["sections"]:
        secname = sec["name"]
        num_groups = lab_groups_map[secname]
        group_labels = make_group_labels(num_groups)
        # each group for each lab subject needs a session
        for gi, gl in enumerate(group_labels):
            for lab in sec.get("lab_subjects", []):
                duration = int(lab_durations.get(lab, default_lab_duration))
                duration = max(1, duration)
                tasks.append({
                    "section": secname,
                    "lab": lab,
                    "group_index": gi,
                    "group_label": gl,
                    "duration": duration,
                    "assigned": False
                })


    used_rooms = set()
    used_teachers = set()
    used_group_day = set()  # (section, group_index, day)
    group_session_count = defaultdict(int)  # (section, group_index) -> assigned labs count
    slots_no_lunch = [s for s in data.get("slots", []) if s != "Lunch Break"]

    def pick_room_for_block(day, block, lab, gi, temp_rooms=None):
        available_rooms = lab_rooms_map.get(lab, [])
        if not available_rooms:
            available_rooms = data.get("labs", []) or [fixed_classrooms.get(secname)]
        if not available_rooms:
            return None
        # Rotate preference by group index to distribute rooms, but allow any free room.
        start = gi % len(available_rooms)
        ordered = available_rooms[start:] + available_rooms[:start]
        for room_candidate in ordered:
            blocked = False
            for slot in block:
                if (room_candidate, day, slot) in used_rooms:
                    blocked = True
                    break
                if temp_rooms is not None and (room_candidate, day, slot) in temp_rooms:
                    blocked = True
                    break
            if not blocked:
                return room_candidate
        return None


    # primary pass: try combos per section/day/block
    max_duration = max((t.get("duration", 2) for t in tasks), default=2)
    blocks_by_duration = {d: slot_blocks_order(data, d) for d in range(1, max_duration + 1)}

    for duration in range(max_duration, 0, -1):
        duration_tasks_exist = any((not t["assigned"]) and t.get("duration", 2) == duration for t in tasks)
        if not duration_tasks_exist:
            continue
        slot_blocks = blocks_by_duration.get(duration, [])
        for block in slot_blocks:
            if all(t["assigned"] for t in tasks):
                break
            for day in days:
                if all(t["assigned"] for t in tasks):
                    break
                for sec in data["sections"]:
                    secname = sec["name"]
                    pending = [
                        t for t in tasks
                        if (not t["assigned"]) and t["section"] == secname and t.get("duration", 2) == duration
                    ]
                    if not pending:
                        continue
                    # Fairness: prefer groups with fewer assigned labs; rotate ties by day.
                    day_index = days.index(day)
                    total_groups = lab_groups_map[secname]
                    pending = sorted(
                        pending,
                        key=lambda t: (
                            group_session_count[(secname, t["group_index"])],
                            ((t["group_index"] - day_index) % max(1, total_groups))
                        )
                    )
                    parallel_cap = min(lab_groups_map[secname], 3)
                    assigned_in_this_block = False
                    for k in range(parallel_cap, 0, -1):
                        for combo in itertools.combinations(pending, k):
                            group_idxs = {c["group_index"] for c in combo}
                            labs_set = {c["lab"] for c in combo}
                            if len(group_idxs) != k or len(labs_set) != k:
                                continue
                            ok = True
                            temp_rooms = set()
                            temp_teachers = set()
                            combo_rooms = {}
                            for c in combo:
                                gi = c["group_index"]
                                lab = c["lab"]
                                if (secname, gi, day) in used_group_day:
                                    ok = False
                                    break
                                room = pick_room_for_block(day, block, lab, gi, temp_rooms=temp_rooms)
                                teacher = fixed_teachers.get((secname, lab))
                                if room is None and (lab_rooms_map.get(lab) or data.get("labs")):
                                    ok = False
                                    break
                                if teacher:
                                    current_teacher_hours = sum(1 for t, d, _ in used_teachers if t == teacher and d == day)
                                    if current_teacher_hours + len(block) > max_teacher_daily:
                                        ok = False
                                        break
                                for slot in block:
                                    if any(entry and entry[0] not in ("FREE",) for entry in timetable[secname][day][slot]):
                                        ok = False
                                        break
                                    if room and (room, day, slot) in used_rooms:
                                        ok = False
                                        break
                                    if teacher and (teacher, day, slot) in used_teachers:
                                        ok = False
                                        break
                                    if room and (room, day, slot) in temp_rooms:
                                        ok = False
                                        break
                                    if teacher and (teacher, day, slot) in temp_teachers:
                                        ok = False
                                        break
                                    if teacher and has_adjacent_lab_for_teacher(timetable, teacher, day, slot, data):
                                        ok = False
                                        break
                                    if teacher_unavailable_on(teacher, day, slot, data):
                                        ok = False
                                        break
                                if not ok:
                                    break
                                combo_rooms[(c["group_index"], c["lab"])] = room
                                for slot in block:
                                    if room:
                                        temp_rooms.add((room, day, slot))
                                    if teacher:
                                        temp_teachers.add((teacher, day, slot))
                            if not ok:
                                continue
                            # commit combo
                            for c in combo:
                                gi = c["group_index"]
                                lab = c["lab"]
                                room = combo_rooms.get((gi, lab))
                                teacher = fixed_teachers.get((secname, lab))
                                label = c["group_label"]
                                duration_val = c.get("duration", 2)
                                for slot in block:
                                    timetable[secname][day][slot].append((lab, room, teacher, label, duration_val))
                                    if room:
                                        used_rooms.add((room, day, slot))
                                    if teacher:
                                        used_teachers.add((teacher, day, slot))
                                c["assigned"] = True
                                used_group_day.add((secname, gi, day))
                                group_session_count[(secname, gi)] += 1
                            assigned_in_this_block = True
                            break
                        if assigned_in_this_block:
                            break


    # secondary pass: one-by-one
    for tsk in tasks:
        if tsk["assigned"]:
            continue
        secname = tsk["section"]
        lab = tsk["lab"]
        gi = tsk["group_index"]
        duration = tsk.get("duration", 2)
        teacher = fixed_teachers.get((secname, lab))
        placed = False
        for block in blocks_by_duration.get(duration, slot_blocks_order(data, duration)):
            for day in days:
                if (secname, gi, day) in used_group_day:
                    continue
                room = pick_room_for_block(day, block, lab, gi)
                if room is None and (lab_rooms_map.get(lab) or data.get("labs")):
                    continue
                if teacher and any(has_adjacent_lab_for_teacher(timetable, teacher, day, s, data) for s in block):
                    continue
                if can_place_block(timetable, secname, day, block, room, teacher, used_rooms, used_teachers, data):
                    label = tsk["group_label"]
                    for slot in block:
                        timetable[secname][day][slot].append((lab, room, teacher, label, duration))
                        if room:
                            used_rooms.add((room, day, slot))
                        if teacher:
                            used_teachers.add((teacher, day, slot))
                    tsk["assigned"] = True
                    used_group_day.add((secname, gi, day))
                    group_session_count[(secname, gi)] += 1
                    placed = True
                    break
            if placed:
                break
        if not tsk["assigned"]:
            # last resort: ignore teacher conflicts
            for block in blocks_by_duration.get(duration, slot_blocks_order(data, duration)):
                for day in days:
                    if (secname, gi, day) in used_group_day:
                        continue
                    room = pick_room_for_block(day, block, lab, gi)
                    if room is None and (lab_rooms_map.get(lab) or data.get("labs")):
                        continue
                    ok = True
                    for slot in block:
                        if any(entry and entry[0] not in ("FREE",) for entry in timetable[secname][day][slot]):
                            ok = False
                            break
                        if room and (room, day, slot) in used_rooms:
                            ok = False
                            break
                    if ok:
                        label = tsk["group_label"]
                        for slot in block:
                            timetable[secname][day][slot].append((lab, room, None, label, duration))
                            if room:
                                used_rooms.add((room, day, slot))
                        tsk["assigned"] = True
                        used_group_day.add((secname, gi, day))
                        group_session_count[(secname, gi)] += 1
                        ok = True
                        break
                if tsk["assigned"]:
                    break
        if not tsk["assigned"]:
            last_day = days[0]
            last_slot = data["slots"][-1]
            timetable[secname][last_day][last_slot].append((f"{lab}-UNSCHED", None, None, tsk["group_label"]))
            tsk["assigned"] = True


    return timetable



def assign_theory_subjects(data, timetable, fixed_teachers, fixed_classrooms, ignore_teacher_daily_limit=False):
    days = data["days"]
    slots = [s for s in data["slots"] if s != "Lunch Break"]
    slot_index = {s: i for i, s in enumerate(slots)}
    constraints = data.get("constraints", {})
    max_subj_per_day = constraints.get("max_lectures_per_subject_per_day", 2)
    max_daily = constraints.get("max_lectures_per_day_section", 6)
    max_teacher_daily = constraints.get("max_lectures_per_day_teacher", 5)
    lecture_req = data.get("lecture_requirements", {})


    used_rooms = set()
    used_teachers = set()
    for sec in timetable:
        for day in days:
            for slot in data["slots"]:
                for entry in timetable[sec][day][slot]:
                    if entry[0] in ("FREE", "LUNCH", "Workshop"):
                        continue
                    subj = entry[0]
                    room = entry[1]
                    teacher = entry[2]
                    if room:
                        used_rooms.add((room, day, slot))
                    if teacher:
                        used_teachers.add((teacher, day, slot))


    remaining = {}
    for sec in data["sections"]:
        secname = sec["name"]
        remaining[secname] = {}
        for sub in sec.get("subjects", []):
            remaining[secname][sub] = lecture_req.get(sub, 3)


    daily_subj_count = {sec["name"]: {d: defaultdict(int) for d in days} for sec in data["sections"]}
    daily_total = {sec["name"]: {d: 0 for d in days} for sec in data["sections"]}


    for sec in data["sections"]:
        secname = sec["name"]
        subjects = sec.get("subjects", [])
        subjects.sort(key=lambda s: -remaining[secname].get(s, 0))
        for sub in subjects:
            req = remaining[secname][sub]
            if req <= 0:
                continue
            teacher = fixed_teachers.get((secname, sub))
            fixed_room = fixed_classrooms.get(secname)
            attempts = 0
            while req > 0 and attempts < len(days) * len(slots) * 3:
                candidate_days = sorted(days, key=lambda d: daily_total[secname][d])
                placed = False
                for day in candidate_days:
                    if daily_subj_count[secname][day][sub] >= max_subj_per_day:
                        continue
                    if daily_total[secname][day] >= max_daily:
                        continue
                    for slot in slots:
                        if any(e and e[0] not in ("FREE",) and (len(e) > 3) for e in timetable[secname][day][slot]):
                            continue
                        if any(e and e[0] not in ("FREE",) and (len(e) <= 3 and e[0] != sub) for e in timetable[secname][day][slot]):
                            continue
                        if teacher and teacher_unavailable_on(teacher, day, slot, data):
                            continue
                        prev_idx = slot_index[slot] - 1
                        if prev_idx >= 0:
                            prev_slot = slots[prev_idx]
                            prev_entries = timetable[secname][day][prev_slot]
                            if any(e[0] == sub for e in prev_entries):
                                continue
                        if fixed_room and (fixed_room, day, slot) in used_rooms:
                            continue
                        if teacher and (teacher, day, slot) in used_teachers:
                            continue
                        if (not ignore_teacher_daily_limit) and teacher and sum(1 for t, d, _ in used_teachers if t == teacher and d == day) >= max_teacher_daily:
                            continue
                        timetable[secname][day][slot].append((sub, fixed_room, teacher))
                        used_rooms.add((fixed_room, day, slot))
                        if teacher:
                            used_teachers.add((teacher, day, slot))
                        remaining[secname][sub] -= 1
                        req -= 1
                        daily_subj_count[secname][day][sub] += 1
                        daily_total[secname][day] += 1
                        placed = True
                        break
                    if placed:
                        break
                if not placed:
                    # local swap/backtrack
                    swap_done = try_easy_swap_for_subject(timetable, secname, sub, remaining, fixed_teachers,
                                                         fixed_classrooms, used_rooms, used_teachers, data,
                                                         daily_subj_count, daily_total)
                    if swap_done:
                        remaining[secname][sub] -= 1
                        req -= 1
                        continue
                    break
                attempts += 1


    for sec in data["sections"]:
        secname = sec["name"]
        for day in days:
            for slot in data["slots"]:
                if slot == "Lunch Break":
                    continue
                if not timetable[secname][day][slot]:
                    timetable[secname][day][slot] = [("FREE", None, None)]


    unfulfilled = {}
    for secname, subs in remaining.items():
        for sub, cnt in subs.items():
            if cnt > 0:
                unfulfilled.setdefault(secname, {})[sub] = cnt
    return timetable, unfulfilled



def try_easy_swap_for_subject(timetable, secname, sub, remaining, fixed_teachers, fixed_classrooms, used_rooms, used_teachers, data, daily_subj_count, daily_total):
    days = data["days"]
    slots = [s for s in data["slots"] if s != "Lunch Break"]
    for day in days:
        for slot in slots:
            entries = timetable[secname][day][slot]
            if not entries:
                continue
            for entry in entries:
                subj = entry[0]
                if subj in ("FREE", "LUNCH"):
                    continue
                if len(entry) > 3:
                    continue
                occ_count = sum(1 for s in slots for e in timetable[secname][day][s] if any(ee[0] == subj for ee in ([e] if isinstance(e, tuple) else e)))
                if occ_count <= 1:
                    continue
                for target_day in days:
                    for target_slot in slots:
                        if target_day == day and target_slot == slot:
                            continue
                        if any(e and e[0] not in ("FREE",) for e in timetable[secname][target_day][target_slot]):
                            continue
                        timetable[secname][day][slot] = [e for e in timetable[secname][day][slot] if e != entry]
                        if not timetable[secname][day][slot]:
                            timetable[secname][day][slot] = [("FREE", None, None)]
                        timetable[secname][target_day][target_slot].append(entry)
                        return True
    return False



# ----------------- Suggestion Generator -----------------


def generate_suggestions(data, timetable, unfulfilled, fixed_teachers):
    """
    For each unfulfilled (section, subject, count) produce suggestions:
      - If too few teachers or teacher-availability insufficient -> suggest more faculty or reassign.
      - If not enough free slots -> suggest increase slots/relax constraints.
      - Else suggest relaxing per-day limits or swapping labs/rooms.
    """
    days = data["days"]
    slots = [s for s in data["slots"] if s != "Lunch Break"]


    # compute used_teachers from final timetable
    used_teachers = set()
    for sec in timetable:
        for d in data["days"]:
            for s in data["slots"]:
                for entry in timetable[sec][d][s]:
                    if not entry:
                        continue
                    subj = entry[0]
                    teach = entry[2]
                    if subj in ("FREE", "LUNCH"):
                        continue
                    if teach:
                        used_teachers.add((teach, d, s))


    suggestions = {}


    for secname, subs in unfulfilled.items():
        suggestions.setdefault(secname, {})
        # count free slots for this section across the week
        free_slots = 0
        free_slot_list = []
        for d in days:
            for s in slots:
                entries = timetable[secname][d][s]
                if all(e[0] in ("FREE",) for e in entries):
                    free_slots += 1
                    free_slot_list.append((d, s))


        for sub, cnt in subs.items():
            msgs = []
            # how many teachers exist for this subject in department data
            teachers_for_sub = data.get("teachers", {}).get(sub, [])
            # if empty, check lab_teachers (rare for theory, but just in case)
            if not teachers_for_sub:
                teachers_for_sub = data.get("lab_teachers", {}).get(sub, [])


            teacher_count = len(teachers_for_sub)
            # measure per-teacher availability (counts of free slots for that teacher)
            teacher_avail = {}
            for t in teachers_for_sub:
                avail = 0
                for d in days:
                    for s in slots:
                        if (t, d, s) in used_teachers:
                            continue
                        if teacher_unavailable_on(t, d, s, data):
                            continue
                        avail += 1
                teacher_avail[t] = avail
            max_teacher_avail = max(teacher_avail.values()) if teacher_avail else 0


            msgs.append(f"Unfulfilled: need {cnt} lecture(s) of **{sub}** for **{secname}**.")


            if teacher_count == 0:
                msgs.append(f"- No teacher is assigned for subject **{sub}** in input. Suggest hiring/assigning at least {cnt} qualified faculty (or allow cross-teaching).")
            else:
                # If combined teacher availability insufficient
                total_possible_by_current_staff = sum(teacher_avail.values())
                if total_possible_by_current_staff < cnt:
                    more_needed = cnt - total_possible_by_current_staff
                    msgs.append(f"- Current faculty for **{sub}**: {teacher_count}. Their total available free slots â‰ˆ {total_possible_by_current_staff}. Suggest assigning/hiring at least **{more_needed}** additional faculty or reassigning other teachers.")
                else:
                    # if there are free slots but subject couldn't be placed due to constraints
                    if free_slots >= cnt:
                        msgs.append(f"- There are {free_slots} free slot(s) available for {secname}. The issue likely stems from daily/session constraints (e.g., `max_lectures_per_subject_per_day` or `max_lectures_per_day_section`) or teacher-room conflicts. Consider relaxing `max_lectures_per_subject_per_day` or `max_lectures_per_day_section`, or enabling limited swaps.")
                    else:
                        # not enough free slots
                        msgs.append(f"- Only {free_slots} free non-lunch slot(s) available for {secname}, which is less than the required {cnt}. Suggest: add more teaching slots (extend day / add Saturday), reduce lab distribution, or create additional parallel rooms so some theory slots can move into lab-time windows.")


            # room/lab related hints
            if sub + " LAB" in data.get("lab_rooms", {}):
                # subject appears to have an associated lab name â€” suggest increase lab rooms
                msgs.append(f"- Lab rooms for this subject are limited. Consider adding another lab room or freeing some lab time slots.")


            # generic suggestions
            msgs.append("- Other options: reduce group sizes (if lectures are duplicated), allow loading some lectures as remote/self-study, or manually move less-critical lectures to another week.")


            suggestions[secname][sub] = msgs


    return suggestions



# ----------------- API Helpers -----------------


def timetable_to_result(timetable, data, moved_map=None):
    """Return rows and include moved metadata if available."""
    result = []
    for secname, schedule in timetable.items():
        for day in data["days"]:
            for slot in data["slots"]:
                for entry in schedule[day][slot]:
                    if not entry:
                        continue
                    subj = entry[0]
                    if subj in ("FREE", "LUNCH"):
                        continue
                    room = entry[1]
                    teacher = entry[2]
                    row = {
                        "section": secname,
                        "day": day,
                        "slot": slot,
                        "subject": subj,
                        "room": room,
                        "teacher": teacher
                    }
                    # group for lab entries
                    if len(entry) > 3:
                        row["group"] = entry[3]
                    if len(entry) > 4:
                        row["duration"] = entry[4]
                    if moved_map and (secname, day, slot) in moved_map:
                        row["moved_from"] = moved_map[(secname, day, slot)]
                        row["moved"] = True
                    result.append(row)
    return result


def teacher_display_name(user):
    return user.get("teacher_name") or user.get("name") or user.get("username")


def filter_teacher_timetable(rows, teacher_name):
    return [row for row in rows if (row.get("teacher") or "").strip().lower() == teacher_name.strip().lower()]


def filter_student_timetable(rows, section_name):
    return [row for row in rows if (row.get("section") or "").strip().lower() == section_name.strip().lower()]


def get_teacher_available_theory_slots(rows, teacher_name, day, from_slot, slots_order):
    target = next((
        r for r in rows
        if (r.get("teacher") or "").strip().lower() == teacher_name.strip().lower()
        and r.get("day") == day
        and r.get("slot") == from_slot
    ), None)
    if not target:
        return [], "No assignment found at the selected day/slot"
    if target.get("group"):
        return [], "Lab sessions cannot be shifted with theory-slot option"

    section = target.get("section")
    available = []
    for s in [x for x in slots_order if x != "Lunch Break" and x != from_slot]:
        section_busy = any(
            r.get("section") == section and r.get("day") == day and r.get("slot") == s
            for r in rows
        )
        teacher_busy = any(
            (r.get("teacher") or "").strip().lower() == teacher_name.strip().lower()
            and r.get("day") == day and r.get("slot") == s
            for r in rows
        )
        if not section_busy and not teacher_busy:
            available.append(s)
    return available, None


def pull_forward_same_day_for_section(rows, section, day, slots_order, start_slot=None):
    slots = [s for s in slots_order if s != "Lunch Break"]
    if not slots:
        return rows

    start_index = 0
    if start_slot in slots:
        start_index = slots.index(start_slot)

    for i in range(start_index, len(slots) - 1):
        free_slot = slots[i]
        section_has_class = any(
            r.get("section") == section and r.get("day") == day and r.get("slot") == free_slot
            for r in rows
        )
        if section_has_class:
            continue

        moved = False
        for j in range(i + 1, len(slots)):
            src_slot = slots[j]
            candidate_idx = next((
                idx for idx, r in enumerate(rows)
                if r.get("section") == section
                and r.get("day") == day
                and r.get("slot") == src_slot
                and not r.get("group")
            ), None)
            if candidate_idx is None:
                continue

            candidate = rows[candidate_idx]
            teacher_lc = (candidate.get("teacher") or "").strip().lower()
            room = candidate.get("room")

            teacher_busy = any(
                idx != candidate_idx
                and (r.get("teacher") or "").strip().lower() == teacher_lc
                and r.get("day") == day
                and r.get("slot") == free_slot
                for idx, r in enumerate(rows)
            ) if teacher_lc else False
            if teacher_busy:
                continue

            room_busy = any(
                idx != candidate_idx
                and r.get("room") == room
                and r.get("day") == day
                and r.get("slot") == free_slot
                for idx, r in enumerate(rows)
            ) if room else False
            if room_busy:
                continue

            candidate["slot"] = free_slot
            candidate["moved_from"] = src_slot
            candidate["moved"] = True
            moved = True
            break

        if not moved:
            continue

    return rows


def apply_theory_reslot(rows, teacher_name, day, from_slot, to_slot, slots_order=None):
    updated = copy.deepcopy(rows)
    target = next((
        r for r in updated
        if (r.get("teacher") or "").strip().lower() == teacher_name.strip().lower()
        and r.get("day") == day
        and r.get("slot") == from_slot
    ), None)
    if not target:
        raise ValueError("No assignment found for selected slot")
    if target.get("group"):
        raise ValueError("Only theory sessions can be shifted to another slot")

    section = target.get("section")
    section_busy = any(r.get("section") == section and r.get("day") == day and r.get("slot") == to_slot for r in updated)
    if section_busy:
        raise ValueError("Selected target slot is not free for this class section")
    teacher_busy = any(
        (r.get("teacher") or "").strip().lower() == teacher_name.strip().lower()
        and r.get("day") == day and r.get("slot") == to_slot
        for r in updated
    )
    if teacher_busy:
        raise ValueError("Teacher is already occupied in selected target slot")

    target["slot"] = to_slot
    target["moved_from"] = from_slot
    target["moved"] = True
    if slots_order:
        updated = pull_forward_same_day_for_section(updated, section, day, slots_order, start_slot=from_slot)
    return updated


def run_teacher_reset(original_input_data, current_list, teacher, day, slot):
    # Transform to sections-based structure
    data = transform_classes_to_sections(original_input_data)

    timetable = make_empty_timetable(data)
    for entry in current_list:
        sec = entry["section"]
        d = entry["day"]
        s = entry["slot"]
        subj = entry["subject"]
        room = entry.get("room")
        teach = entry.get("teacher")
        group = entry.get("group")
        duration = entry.get("duration")
        if group:
            if duration:
                timetable[sec][d][s].append((subj, room, teach, group, duration))
            else:
                timetable[sec][d][s].append((subj, room, teach, group))
        else:
            timetable[sec][d][s].append((subj, room, teach))

    changed_sections = set()
    if teacher and day and slot:
        for sec in timetable:
            section_changed = False
            entries = timetable[sec][day][slot]
            to_remove = [e for e in entries if len(e) >= 3 and (e[2] or "").strip().lower() == (teacher or "").strip().lower()]
            # If teacher cancels a lab slot, remove that lab group from all slots of that day (full cancellation).
            for e in to_remove:
                if len(e) > 3:
                    subj = e[0]
                    grp = e[3]
                    for s in data["slots"]:
                        if s == "Lunch Break":
                            continue
                        timetable[sec][day][s] = [
                            x for x in timetable[sec][day][s]
                            if not (len(x) > 3 and x[0] == subj and x[3] == grp and (x[2] or "").strip().lower() == (teacher or "").strip().lower())
                        ]
                        if not timetable[sec][day][s]:
                            timetable[sec][day][s] = [("FREE", None, None)]
                        section_changed = True

            new_entries = [e for e in timetable[sec][day][slot] if len(e) < 3 or (e[2] or "").strip().lower() != (teacher or "").strip().lower()]
            if len(new_entries) != len(entries):
                if not new_entries:
                    timetable[sec][day][slot] = [("FREE", None, None)]
                    section_changed = True
                else:
                    timetable[sec][day][slot] = new_entries
                    section_changed = True
            if section_changed:
                changed_sections.add(sec)

    # reconstruct occupancy sets
    used_rooms = set()
    used_teachers = set()
    for sec in timetable:
        for d in data["days"]:
            for s in data["slots"]:
                for entry in timetable[sec][d][s]:
                    if not entry:
                        continue
                    subj = entry[0]
                    room = entry[1]
                    teach = entry[2]
                    if subj in ("FREE", "LUNCH"):
                        continue
                    if room:
                        used_rooms.add((room, d, s))
                    if teach:
                        used_teachers.add((teach, d, s))

    slots_all = data["slots"]
    if "Lunch Break" in slots_all:
        lunch_idx = slots_all.index("Lunch Break")
        rightmost_before_lunch = slots_all[lunch_idx - 1] if lunch_idx - 1 >= 0 else None
        rightmost_after_lunch = slots_all[-1] if len(slots_all) > lunch_idx + 1 else None
    else:
        rightmost_before_lunch = slots_all[-2] if len(slots_all) >= 2 else slots_all[0]
        rightmost_after_lunch = slots_all[-1]

    moved_map = {}  # (section, day, new_slot) -> old_slot

    def is_free_slot(sec_name, d, s):
        items = timetable[sec_name][d][s]
        return not items or all((x and x[0] == "FREE") for x in items)

    def is_same_lab_entry(a, b):
        return (
            len(a) > 3 and len(b) > 3
            and a[0] == b[0]
            and (a[1] or "") == (b[1] or "")
            and (a[2] or "") == (b[2] or "")
            and (a[3] or "") == (b[3] or "")
        )

    def has_lunch_between(slot_names):
        if "Lunch Break" not in slots_all or not slot_names:
            return False
        lunch_idx = slots_all.index("Lunch Break")
        idxs = sorted(slots_all.index(sname) for sname in slot_names)
        return idxs[0] < lunch_idx < idxs[-1]

    # For each changed section, compact same-day timetable by pulling later entries earlier.
    for sec in changed_sections:
        try:
            slots_no_lunch = [s for s in slots_all if s != "Lunch Break"]
            i = 0
            while i < len(slots_no_lunch):
                dest_slot = slots_no_lunch[i]
                if not is_free_slot(sec, day, dest_slot):
                    i += 1
                    continue

                moved_any = False
                for j in range(i + 1, len(slots_no_lunch)):
                    src_slot = slots_no_lunch[j]
                    src_entries = [e for e in timetable[sec][day][src_slot] if e and e[0] not in ("FREE", "LUNCH")]
                    if not src_entries:
                        continue

                    candidate = src_entries[0]
                    room = candidate[1]
                    teach = candidate[2]

                    # Theory single-slot move
                    if len(candidate) <= 3:
                        if teach and teacher_unavailable_on(teach, day, dest_slot, data):
                            continue
                        if teach and (teach, day, dest_slot) in used_teachers:
                            continue
                        if room and (room, day, dest_slot) in used_rooms:
                            continue

                        timetable[sec][day][src_slot] = [x for x in timetable[sec][day][src_slot] if x != candidate]
                        if not timetable[sec][day][src_slot]:
                            timetable[sec][day][src_slot] = [("FREE", None, None)]
                        timetable[sec][day][dest_slot] = [candidate]

                        if room:
                            used_rooms.discard((room, day, src_slot))
                            used_rooms.add((room, day, dest_slot))
                        if teach:
                            used_teachers.discard((teach, day, src_slot))
                            used_teachers.add((teach, day, dest_slot))

                        moved_map[(sec, day, dest_slot)] = src_slot
                        moved_any = True
                        break

                    # Lab block move as one full block only (no lunch split)
                    duration = int(candidate[4]) if len(candidate) > 4 and str(candidate[4]).isdigit() else 1
                    duration = max(1, duration)
                    if i + duration > len(slots_no_lunch):
                        continue
                    if j + duration > len(slots_no_lunch):
                        continue

                    src_block = slots_no_lunch[j:j + duration]
                    dest_block = slots_no_lunch[i:i + duration]
                    if has_lunch_between(src_block) or has_lunch_between(dest_block):
                        continue

                    # candidate must exist in every source block slot
                    if not all(any(is_same_lab_entry(x, candidate) for x in timetable[sec][day][sb]) for sb in src_block):
                        continue
                    # destination block must be fully free in section
                    if not all(is_free_slot(sec, day, db) for db in dest_block):
                        continue
                    # destination global room/teacher availability
                    conflict = False
                    for db in dest_block:
                        if teach and teacher_unavailable_on(teach, day, db, data):
                            conflict = True
                            break
                        if room and (room, day, db) in used_rooms:
                            conflict = True
                            break
                        if teach and (teach, day, db) in used_teachers:
                            conflict = True
                            break
                    if conflict:
                        continue

                    # move full lab block
                    for sb in src_block:
                        timetable[sec][day][sb] = [x for x in timetable[sec][day][sb] if not is_same_lab_entry(x, candidate)]
                        if not timetable[sec][day][sb]:
                            timetable[sec][day][sb] = [("FREE", None, None)]
                    for db in dest_block:
                        timetable[sec][day][db] = [candidate]

                    if room:
                        for sb in src_block:
                            used_rooms.discard((room, day, sb))
                        for db in dest_block:
                            used_rooms.add((room, day, db))
                    if teach:
                        for sb in src_block:
                            used_teachers.discard((teach, day, sb))
                        for db in dest_block:
                            used_teachers.add((teach, day, db))

                    for idx in range(duration):
                        moved_map[(sec, day, dest_block[idx])] = src_block[idx]
                    moved_any = True
                    break

                if not moved_any:
                    i += 1
        except Exception:
            pass

    result = timetable_to_result(timetable, data, moved_map=moved_map)
    return result



# ----------------- Endpoints -----------------


@app.route('/auth/login', methods=['POST'])
def auth_login():
    try:
        payload = request.json or {}
        username = (payload.get("username") or "").strip()
        password = payload.get("password") or ""

        if not username or not password:
            return jsonify({"error": "Username and password are required"}), 400

        user = USERS.get(username)
        if not user or user.get("password") != password:
            return jsonify({"error": "Invalid credentials"}), 401

        session["username"] = username
        return jsonify({"success": True, "user": public_user(user)})
    except Exception as e:
        return jsonify({"error": f"Login failed: {str(e)}"}), 500


@app.route('/auth/logout', methods=['POST'])
@require_auth
def auth_logout():
    session.pop("username", None)
    return jsonify({"success": True})


@app.route('/auth/me', methods=['GET'])
def auth_me():
    user = get_current_user()
    if not user:
        return jsonify({"authenticated": False}), 200
    return jsonify({"authenticated": True, "user": public_user(user)}), 200




@app.route('/auth/register/start', methods=['POST'])
def auth_register_start():
    try:
        payload = request.json or {}
        role = (payload.get("role") or "").strip().lower()
        username = (payload.get("username") or "").strip()
        password = payload.get("password") or ""
        name = (payload.get("name") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        teacher_name = (payload.get("teacher_name") or "").strip()
        section = (payload.get("section") or "").strip()
        stream = (payload.get("stream") or "").strip().upper()
        semester = (payload.get("semester") or "").strip()
        batch = (payload.get("batch") or "").strip()
        division = (payload.get("division") or "").strip().upper()

        if role not in ("student", "teacher"):
            return jsonify({"error": "Role must be student or teacher"}), 400
        if not username or not password or not name or not email:
            return jsonify({"error": "username, password, name and email are required"}), 400
        if "@" not in email:
            return jsonify({"error": "Invalid email"}), 400
        if role == "student":
            if not division:
                division = "A"
            stream_key = stream.replace(" ", "")
            if stream_key in ("AIML", "AI&ML", "AI/ML"):
                stream_key = "AI&ML"

            if stream_key == "CSE":
                sem_label = to_roman_semester(semester)
                batch_label = (batch or "Batch-1").strip()
                section = f"B.TECH CSE {sem_label} Sem {batch_label} - {division}"
            elif stream_key == "IT":
                sem_label = to_roman_semester(semester)
                section = f"B.TECH IT {sem_label} Sem - {division}"
            elif stream_key == "AI&ML":
                sem_label = (semester or "6th").strip()
                section = f"AI & ML {sem_label} Sem - {division}"
            elif stream and semester and division:
                section = f"{stream} {semester} Sem - {division}"
            if not section:
                return jsonify({"error": "Provide section or stream + semester + division for student registration"}), 400

        if is_username_taken(username):
            return jsonify({"error": "Username already exists"}), 409
        if is_email_taken(email):
            return jsonify({
                "error": "Email already exists",
                "details": email_taken_source(email)
            }), 409

        now = datetime.utcnow()
        registration_id = int(now.timestamp() * 1000) + random.randint(10, 999)
        code = f"{random.randint(100000, 999999)}"
        expires_at = now + timedelta(minutes=15)

        reg = {
            "id": registration_id,
            "role": role,
            "username": username,
            "password": password,
            "name": name,
            "email": email,
            "teacher_name": teacher_name or name,
            "section": section,
            "stream": stream,
            "semester": semester,
            "batch": batch,
            "division": division,
            "status": "pending_email_verification",
            "verification_code": code,
            "verification_expires_at": expires_at.isoformat() + "Z",
            "created_at": now.isoformat() + "Z"
        }

        regs = get_latest_pending_registrations()
        regs.append(reg)
        save_pending_registrations()

        sent = False
        email_message = ""
        try:
            sent, email_message = send_verification_email(email, code)
        except Exception as mail_error:
            email_message = f"Failed to send email: {mail_error}"

        show_dev_code = os.environ.get("SHOW_DEV_VERIFICATION_CODE", "1") == "1"
        if not sent and not show_dev_code:
            regs[:] = [r for r in regs if r.get("id") != registration_id]
            save_pending_registrations()
            return jsonify({
                "error": email_message or "Failed to send verification email. Please try again."
            }), 502

        response = {
            "success": True,
            "registration_id": registration_id,
            "email_sent": sent,
            "message": "Verification code sent to your email" if sent else (email_message or "Email delivery failed. Using dev preview code.")
        }

        # Dev fallback: expose code if email is not configured.
        if not sent and show_dev_code:
            response["verification_code_preview"] = code

        return jsonify(response)
    except Exception as e:
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500


@app.route('/auth/register/verify', methods=['POST'])
def auth_register_verify():
    try:
        payload = request.json or {}
        registration_id = payload.get("registration_id")
        code = (payload.get("code") or "").strip()

        if not registration_id or not code:
            return jsonify({"error": "registration_id and code are required"}), 400

        regs = get_latest_pending_registrations()
        reg = next((r for r in regs if r.get("id") == int(registration_id)), None)
        if not reg:
            return jsonify({"error": "Registration request not found"}), 404

        if reg.get("status") != "pending_email_verification":
            return jsonify({"error": f"Registration already {reg.get('status')}"}), 400

        expires = parse_iso_utc(reg.get("verification_expires_at"))
        if not expires or expires <= datetime.utcnow():
            return jsonify({"error": "Verification code expired. Please register again."}), 400

        if code != str(reg.get("verification_code")):
            return jsonify({"error": "Invalid verification code"}), 400

        reg["email_verified"] = True
        reg["verified_at"] = datetime.utcnow().isoformat() + "Z"
        reg.pop("verification_code", None)
        reg.pop("verification_expires_at", None)

        if reg.get("role") == "student":
            if reg.get("username") in USERS:
                return jsonify({"error": "Username already exists"}), 409
            USERS[reg["username"]] = build_user_from_registration(reg)
            save_users()
            add_activity_log(
                "student_registration_approved",
                f"Student account created: {reg.get('username')}",
                {"username": reg.get("username")}
            )
            regs[:] = [r for r in regs if r.get("id") != reg.get("id")]
            save_pending_registrations()
            return jsonify({
                "success": True,
                "status": "approved",
                "message": "Student registration approved. Please login."
            })

        reg["status"] = "pending_admin_approval"
        add_activity_log(
            "teacher_registration_pending",
            f"Teacher registration pending approval: {reg.get('username')}",
            {"username": reg.get("username")}
        )
        save_pending_registrations()
        return jsonify({
            "success": True,
            "status": "pending_admin_approval",
            "message": "Email verified. Teacher registration sent to admin for approval."
        })
    except Exception as e:
        return jsonify({"error": f"Verification failed: {str(e)}"}), 500


@app.route('/admin/registration_requests', methods=['GET'])
@require_roles('admin')
def admin_registration_requests_api():
    regs = get_latest_pending_registrations()
    teacher_regs = [r for r in regs if r.get("role") == "teacher" and r.get("status") == "pending_admin_approval"]
    teacher_regs.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return jsonify({"requests": teacher_regs})


@app.route('/admin/registration_requests/<int:registration_id>/approve', methods=['POST'])
@require_roles('admin')
def admin_approve_registration_request_api(registration_id):
    try:
        regs = get_latest_pending_registrations()
        reg = next((r for r in regs if r.get("id") == registration_id), None)
        if not reg:
            return jsonify({"error": "Registration request not found"}), 404
        if reg.get("role") != "teacher":
            return jsonify({"error": "Only teacher requests require admin approval"}), 400
        if reg.get("status") != "pending_admin_approval":
            return jsonify({"error": f"Request already {reg.get('status')}"}), 400

        if reg.get("username") in USERS:
            return jsonify({"error": "Username already exists"}), 409

        USERS[reg["username"]] = build_user_from_registration(reg)
        save_users()
        resolved = {
            "id": reg.get("id"),
            "username": reg.get("username"),
            "role": reg.get("role"),
            "status": "approved",
            "resolved_by": session.get("username"),
            "resolved_at": datetime.utcnow().isoformat() + "Z"
        }
        add_activity_log(
            "teacher_registration_approved",
            f"Teacher registration approved: {reg.get('username')}",
            {"username": reg.get("username"), "approvedBy": session.get("username")}
        )
        regs[:] = [r for r in regs if r.get("id") != reg.get("id")]
        save_pending_registrations()

        return jsonify({"success": True, "request": resolved})
    except Exception as e:
        return jsonify({"error": f"Approval failed: {str(e)}"}), 500


@app.route('/admin/registration_requests/<int:registration_id>/reject', methods=['POST'])
@require_roles('admin')
def admin_reject_registration_request_api(registration_id):
    try:
        regs = get_latest_pending_registrations()
        reg = next((r for r in regs if r.get("id") == registration_id), None)
        if not reg:
            return jsonify({"error": "Registration request not found"}), 404
        if reg.get("role") != "teacher":
            return jsonify({"error": "Only teacher requests require admin approval"}), 400
        if reg.get("status") != "pending_admin_approval":
            return jsonify({"error": f"Request already {reg.get('status')}"}), 400

        payload = request.json or {}
        reason = (payload.get("reason") or "Rejected by admin").strip()

        rejected = {
            "id": reg.get("id"),
            "username": reg.get("username"),
            "role": reg.get("role"),
            "status": "rejected",
            "reason": reason,
            "resolved_by": session.get("username"),
            "resolved_at": datetime.utcnow().isoformat() + "Z"
        }
        add_activity_log(
            "teacher_registration_rejected",
            f"Teacher registration rejected: {reg.get('username')}",
            {"username": reg.get("username"), "rejectedBy": session.get("username"), "reason": reason}
        )
        regs[:] = [r for r in regs if r.get("id") != reg.get("id")]
        save_pending_registrations()

        return jsonify({"success": True, "request": rejected})
    except Exception as e:
        return jsonify({"error": f"Rejection failed: {str(e)}"}), 500


@app.route('/generate_timetable', methods=['POST'])
@require_roles('admin')
def generate_timetable_api():
    try:
        request_data = request.json
        if not request_data:
            return jsonify({"error": "No input data"}), 400

        # Validate input data structure
        validation_result = validate_input_data(request_data)
        if not validation_result['valid']:
            return jsonify({
                "error": "Invalid input data",
                "validation_errors": validation_result['errors'],
                "validation_warnings": validation_result['warnings']
            }), 400

        # Transform classes-based structure to sections-based structure
        data = transform_classes_to_sections(request_data)

        print(f"Processing {len(data['sections'])} sections from {len(request_data.get('classes', []))} classes")

        fixed_classrooms = assign_fixed_classrooms(data)
        fixed_teachers = create_fixed_teacher_mapping(data)
        timetable = make_empty_timetable(data)

        # Assign labs first
        timetable = assign_all_labs(data, timetable, fixed_teachers, fixed_classrooms)
        # Assign theory
        timetable, unfulfilled = assign_theory_subjects(data, timetable, fixed_teachers, fixed_classrooms)

        # If some unfulfilled, do a relaxed re-try (existing logic)
        if unfulfilled:
            for sec in timetable:
                for day in data["days"]:
                    for slot in data["slots"]:
                        if slot == "Lunch Break":
                            continue
                        new_entries = []
                        for entry in timetable[sec][day][slot]:
                            if len(entry) > 3:
                                new_entries.append(entry)
                        timetable[sec][day][slot] = new_entries
            data_relaxed = copy.deepcopy(data)
            if "constraints" not in data_relaxed:
                data_relaxed["constraints"] = {}
            data_relaxed["constraints"]["max_lectures_per_subject_per_day"] = data_relaxed["constraints"].get("max_lectures_per_subject_per_day", 2) + 1
            timetable, unfulfilled2 = assign_theory_subjects(data_relaxed, timetable, fixed_teachers, fixed_classrooms)
            unfulfilled = unfulfilled2

        # Final fallback: if still unfulfilled, allow teacher daily-hour overflow to maximize placement.
        if unfulfilled:
            for sec in timetable:
                for day in data["days"]:
                    for slot in data["slots"]:
                        if slot == "Lunch Break":
                            continue
                        timetable[sec][day][slot] = [entry for entry in timetable[sec][day][slot] if len(entry) > 3]

            data_overflow = copy.deepcopy(data)
            if "constraints" not in data_overflow:
                data_overflow["constraints"] = {}
            data_overflow["constraints"]["max_lectures_per_subject_per_day"] = data_overflow["constraints"].get("max_lectures_per_subject_per_day", 2) + 1
            data_overflow["constraints"]["max_lectures_per_day_section"] = data_overflow["constraints"].get("max_lectures_per_day_section", 6) + 1
            timetable, unfulfilled = assign_theory_subjects(
                data_overflow,
                timetable,
                fixed_teachers,
                fixed_classrooms,
                ignore_teacher_daily_limit=True
            )

        # Generate suggestions if any unfulfilled remain
        suggestions = {}
        if unfulfilled:
            suggestions = generate_suggestions(data, timetable, unfulfilled, fixed_teachers)

        # Calculate statistics
        stats = calculate_timetable_stats(timetable, request_data)

        result = timetable_to_result(timetable, data)
        
        return jsonify({
            "success": True,
            "timetable": result, 
            "unfulfilled": unfulfilled, 
            "suggestions": suggestions,
            "statistics": stats,
            "validation_warnings": validation_result.get('warnings', [])
        })

    except Exception as e:
        print(f"Error generating timetable: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


def calculate_timetable_stats(timetable, original_data):
    """Calculate statistics for the generated timetable"""
    stats = {
        'total_sections': len(timetable),
        'total_classes': len(original_data.get('classes', [])),
        'total_slots_used': 0,
        'total_slots_available': 0,
        'teacher_utilization': {},
        'room_utilization': {},
        'subject_distribution': {}
    }
    
    # Calculate total slots
    days = original_data.get('days', [])
    slots = [s for s in original_data.get('slots', []) if s != 'Lunch Break']
    total_slots_per_section = len(days) * len(slots)
    stats['total_slots_available'] = total_slots_per_section * len(timetable)
    
    # Count used slots and gather statistics
    teacher_hours = defaultdict(int)
    room_hours = defaultdict(int)
    subject_count = defaultdict(int)
    
    for section_name, section_schedule in timetable.items():
        for day, day_schedule in section_schedule.items():
            for slot, entries in day_schedule.items():
                if slot == 'Lunch Break':
                    continue
                    
                for entry in entries:
                    if not entry or entry[0] in ('FREE', 'LUNCH'):
                        continue
                        
                    stats['total_slots_used'] += 1
                    
                    if len(entry) > 1 and entry[1]:  # teacher
                        teacher_hours[entry[1]] += 1
                    
                    if len(entry) > 2 and entry[2]:  # room  
                        room_hours[entry[2]] += 1
                    
                    if entry[0]:  # subject
                        subject_count[entry[0]] += 1
    
    # Calculate utilization percentages
    stats['utilization_percentage'] = (stats['total_slots_used'] / stats['total_slots_available'] * 100) if stats['total_slots_available'] > 0 else 0
    stats['teacher_utilization'] = dict(teacher_hours)
    stats['room_utilization'] = dict(room_hours)
    stats['subject_distribution'] = dict(subject_count)
    
    return stats


@app.route('/validate_input', methods=['POST'])
@require_roles('admin')
def validate_input_api():
    """Validate the input data structure"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        validation_result = validate_input_data(data)
        return jsonify(validation_result)
        
    except Exception as e:
        return jsonify({
            'valid': False,
            'errors': [f'Validation error: {str(e)}'],
            'warnings': []
        }), 500


@app.route('/reset_teacher', methods=['POST'])
@require_roles('admin', 'teacher')
def reset_teacher_api():
    try:
        user = get_current_user()
        request_data = request.json
        teacher = request_data.get('teacher')
        day = request_data.get('day')
        slot = request_data.get('slot')
        original_input_data = request_data.get('inputData')  # Original classes-based data
        current_list = request_data.get('timetable', [])

        if not original_input_data:
            return jsonify({"error": "inputData missing"}), 400

        if user and user.get("role") == "teacher":
            current_teacher_name = teacher_display_name(user)
            if (teacher or "").strip().lower() != current_teacher_name.strip().lower():
                return jsonify({"error": "Teachers can only request reset for their own schedule"}), 403

        result = run_teacher_reset(original_input_data, current_list, teacher, day, slot)
        return jsonify({"timetable": result})

    except Exception as e:
        print(f"Error in reset_teacher: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.route('/admin/publish_timetable', methods=['POST'])
@require_roles('admin')
def publish_timetable_api():
    try:
        global PUBLISHED_TIMETABLE
        if get_latest_published_timetable():
            return jsonify({
                "error": "A timetable is already published. Delete it before publishing a new one."
            }), 409

        payload = request.json or {}
        input_data = payload.get("inputData")
        timetable_data = payload.get("timetableData")

        if not input_data or not timetable_data:
            return jsonify({"error": "inputData and timetableData are required"}), 400
        if not timetable_data.get("timetable"):
            return jsonify({"error": "timetableData.timetable is required"}), 400

        PUBLISHED_TIMETABLE = {
            "inputData": input_data,
            "timetableData": timetable_data,
            "baseTimetableData": copy.deepcopy(timetable_data),
            "temporary_changes": [],
            "publishedAt": datetime.utcnow().isoformat() + "Z",
            "publishedBy": session.get("username")
        }
        save_published_timetable()
        sync_users_from_timetable(timetable_data.get("timetable", []))

        return jsonify({"success": True, "publishedAt": PUBLISHED_TIMETABLE["publishedAt"]})
    except Exception as e:
        return jsonify({"error": f"Publish failed: {str(e)}"}), 500


@app.route('/admin/published_timetable', methods=['GET'])
@require_roles('admin')
def get_published_timetable_api():
    latest = get_latest_published_timetable()
    if not latest:
        return jsonify({"error": "No published timetable found"}), 404
    return jsonify(latest)


@app.route('/admin/published_timetable', methods=['DELETE'])
@require_roles('admin')
def delete_published_timetable_api():
    try:
        global PUBLISHED_TIMETABLE, RESCHEDULE_REQUESTS
        get_latest_published_timetable()
        PUBLISHED_TIMETABLE = None
        save_published_timetable()
        RESCHEDULE_REQUESTS = []
        save_reschedule_requests()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": f"Delete failed: {str(e)}"}), 500


@app.route('/teacher/timetable', methods=['GET'])
@require_roles('teacher')
def teacher_timetable_api():
    try:
        latest = get_latest_published_timetable()
        if not latest:
            return jsonify({"error": "No published timetable found"}), 404

        user = get_current_user()
        teacher_name = teacher_display_name(user)
        all_rows = latest["timetableData"].get("timetable", [])
        rows = filter_teacher_timetable(all_rows, teacher_name)

        return jsonify({
            "teacher": teacher_name,
            "days": latest["inputData"].get("days", []),
            "slots": latest["inputData"].get("slots", []),
            "classes": latest["inputData"].get("classes", []),
            "timetable": rows,
            "publishedAt": latest.get("publishedAt")
        })
    except Exception as e:
        return jsonify({"error": f"Unable to load teacher timetable: {str(e)}"}), 500


@app.route('/teacher/available_theory_slots', methods=['POST'])
@require_roles('teacher')
def teacher_available_theory_slots_api():
    try:
        latest = get_latest_published_timetable()
        if not latest:
            return jsonify({"error": "No published timetable found"}), 404

        payload = request.json or {}
        day = payload.get("day")
        slot = payload.get("slot")
        if not day or not slot:
            return jsonify({"error": "day and slot are required"}), 400

        user = get_current_user()
        teacher_name = teacher_display_name(user)
        current_rows = latest["timetableData"].get("timetable", [])
        available_slots, err = get_teacher_available_theory_slots(
            current_rows,
            teacher_name,
            day,
            slot,
            latest["inputData"].get("slots", [])
        )
        if err:
            return jsonify({"error": err}), 400
        return jsonify({"availableSlots": available_slots})
    except Exception as e:
        return jsonify({"error": f"Unable to fetch available slots: {str(e)}"}), 500


@app.route('/teacher/request_reschedule', methods=['POST'])
@require_roles('teacher')
def teacher_request_reschedule_api():
    try:
        latest = get_latest_published_timetable()
        if not latest:
            return jsonify({"error": "No published timetable found"}), 404

        payload = request.json or {}
        day = payload.get("day")
        slot = payload.get("slot")
        request_type = (payload.get("request_type") or "unavailable").strip().lower()
        preferred_slot = payload.get("preferred_slot")
        reason = (payload.get("reason") or "Teacher unavailable").strip()
        if not day or not slot:
            return jsonify({"error": "day and slot are required"}), 400
        if request_type not in ("unavailable", "reslot_theory"):
            return jsonify({"error": "request_type must be unavailable or reslot_theory"}), 400

        user = get_current_user()
        teacher_name = teacher_display_name(user)
        current_rows = latest["timetableData"].get("timetable", [])
        assignment = next((
            row for row in current_rows
            if (row.get("teacher") or "").strip().lower() == teacher_name.strip().lower()
            and row.get("day") == day
            and row.get("slot") == slot
        ), None)
        if not assignment:
            return jsonify({"error": "No assignment found for this teacher at the selected slot"}), 400

        requests = get_latest_reschedule_requests()
        duplicate = any(
            r.get("status") == "pending"
            and r.get("requestType", "unavailable") == request_type
            and (r.get("teacher") or "").strip().lower() == teacher_name.strip().lower()
            and r.get("day") == day
            and r.get("slot") == slot
            for r in requests
        )
        if duplicate:
            return jsonify({"error": "A pending request already exists for this day/slot"}), 409

        if request_type == "reslot_theory":
            if assignment.get("group"):
                return jsonify({"error": "Lab sessions cannot use theory re-slot option"}), 400
            if not preferred_slot:
                return jsonify({"error": "preferred_slot is required for reslot_theory"}), 400
            available_slots, err = get_teacher_available_theory_slots(
                current_rows,
                teacher_name,
                day,
                slot,
                latest["inputData"].get("slots", [])
            )
            if err:
                return jsonify({"error": err}), 400
            if preferred_slot not in available_slots:
                return jsonify({"error": "Selected preferred_slot is not available"}), 400

        request_id = int(datetime.utcnow().timestamp() * 1000)
        new_request = {
            "id": request_id,
            "teacher": teacher_name,
            "day": day,
            "slot": slot,
            "requestType": request_type,
            "preferredSlot": preferred_slot if request_type == "reslot_theory" else None,
            "section": assignment.get("section"),
            "subject": assignment.get("subject"),
            "group": assignment.get("group"),
            "reason": reason,
            "status": "pending",
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "createdBy": user.get("username")
        }
        requests.append(new_request)
        save_reschedule_requests()
        add_activity_log(
            "reschedule_request_created",
            f"{teacher_name} requested reschedule on {day} ({slot})",
            {"teacher": teacher_name, "day": day, "slot": slot}
        )

        teacher_rows = filter_teacher_timetable(current_rows, teacher_name)
        return jsonify({
            "success": True,
            "request": new_request,
            "teacher": teacher_name,
            "timetable": teacher_rows,
            "publishedAt": latest.get("publishedAt")
        })
    except Exception as e:
        return jsonify({"error": f"Reschedule failed: {str(e)}"}), 500


@app.route('/student/timetable', methods=['GET'])
@require_roles('student')
def student_timetable_api():
    try:
        latest = get_latest_published_timetable()
        if not latest:
            return jsonify({"error": "No published timetable found"}), 404

        user = get_current_user()
        section = user.get("section")
        if not section:
            return jsonify({"error": "Student section is not configured"}), 400

        all_rows = latest["timetableData"].get("timetable", [])
        rows = filter_student_timetable(all_rows, section)

        return jsonify({
            "section": section,
            "days": latest["inputData"].get("days", []),
            "slots": latest["inputData"].get("slots", []),
            "classes": latest["inputData"].get("classes", []),
            "timetable": rows,
            "publishedAt": latest.get("publishedAt")
        })
    except Exception as e:
        return jsonify({"error": f"Unable to load student timetable: {str(e)}"}), 500


@app.route('/admin/reschedule_requests', methods=['GET'])
@require_roles('admin')
def admin_reschedule_requests_api():
    requests = get_latest_reschedule_requests()
    requests = [r for r in requests if r.get("status") == "pending"]
    requests_sorted = sorted(requests, key=lambda r: r.get("createdAt", ""), reverse=True)
    return jsonify({"requests": requests_sorted})


@app.route('/admin/reschedule_requests/<int:request_id>/approve', methods=['POST'])
@require_roles('admin')
def admin_approve_reschedule_request_api(request_id):
    try:
        global PUBLISHED_TIMETABLE
        latest = get_latest_published_timetable()
        if not latest:
            return jsonify({"error": "No published timetable found"}), 404

        requests = get_latest_reschedule_requests()
        req = next((r for r in requests if r.get("id") == request_id), None)
        if not req:
            return jsonify({"error": "Request not found"}), 404
        if req.get("status") != "pending":
            return jsonify({"error": f"Request already {req.get('status')}"}), 400

        PUBLISHED_TIMETABLE = latest
        if "baseTimetableData" not in PUBLISHED_TIMETABLE and PUBLISHED_TIMETABLE.get("timetableData"):
            PUBLISHED_TIMETABLE["baseTimetableData"] = copy.deepcopy(PUBLISHED_TIMETABLE["timetableData"])

        now = datetime.utcnow()
        expires_at = datetime.combine((now + timedelta(days=1)).date(), datetime.min.time())
        request_type = req.get("requestType", "unavailable")
        temp_change = None
        if request_type == "reslot_theory":
            from_slot = req.get("slot")
            to_slot = req.get("preferredSlot")
            rows = PUBLISHED_TIMETABLE["timetableData"].get("timetable", [])
            updated_rows = apply_theory_reslot(
                rows,
                req.get("teacher"),
                req.get("day"),
                from_slot,
                to_slot,
                PUBLISHED_TIMETABLE.get("inputData", {}).get("slots", [])
            )
            PUBLISHED_TIMETABLE["timetableData"]["timetable"] = updated_rows
            temp_change = {
                "type": "reslot_theory",
                "requestId": request_id,
                "teacher": req.get("teacher"),
                "day": req.get("day"),
                "fromSlot": from_slot,
                "toSlot": to_slot,
                "appliedAt": now.isoformat() + "Z",
                "expiresAt": expires_at.isoformat() + "Z"
            }
        else:
            temp_change = {
                "type": "unavailable",
                "requestId": request_id,
                "teacher": req.get("teacher"),
                "day": req.get("day"),
                "slot": req.get("slot"),
                "appliedAt": now.isoformat() + "Z",
                "expiresAt": expires_at.isoformat() + "Z"
            }

        PUBLISHED_TIMETABLE.setdefault("temporary_changes", []).append(temp_change)
        if request_type == "unavailable":
            rebuild_timetable_from_active_changes()
        PUBLISHED_TIMETABLE["publishedAt"] = datetime.utcnow().isoformat() + "Z"
        save_published_timetable()

        req["status"] = "approved"
        req["expiresAt"] = temp_change["expiresAt"]
        req["resolvedAt"] = datetime.utcnow().isoformat() + "Z"
        req["resolvedBy"] = session.get("username")
        resolved = copy.deepcopy(req)
        requests[:] = [r for r in requests if r.get("id") != request_id]
        save_reschedule_requests()
        add_activity_log(
            "reschedule_request_approved",
            f"Reschedule approved for {resolved.get('teacher')} on {resolved.get('day')} ({resolved.get('slot')})",
            {
                "teacher": resolved.get("teacher"),
                "day": resolved.get("day"),
                "slot": resolved.get("slot"),
                "approvedBy": session.get("username")
            }
        )

        return jsonify({"success": True, "request": resolved, "publishedAt": PUBLISHED_TIMETABLE["publishedAt"]})
    except Exception as e:
        return jsonify({"error": f"Approve failed: {str(e)}"}), 500


@app.route('/admin/reschedule_requests/<int:request_id>/reject', methods=['POST'])
@require_roles('admin')
def admin_reject_reschedule_request_api(request_id):
    try:
        requests = get_latest_reschedule_requests()
        req = next((r for r in requests if r.get("id") == request_id), None)
        if not req:
            return jsonify({"error": "Request not found"}), 404
        if req.get("status") != "pending":
            return jsonify({"error": f"Request already {req.get('status')}"}), 400

        payload = request.json or {}
        admin_note = (payload.get("admin_note") or "Rejected by admin").strip()

        req["status"] = "rejected"
        req["adminNote"] = admin_note
        req["resolvedAt"] = datetime.utcnow().isoformat() + "Z"
        req["resolvedBy"] = session.get("username")
        rejected = copy.deepcopy(req)
        requests[:] = [r for r in requests if r.get("id") != request_id]
        save_reschedule_requests()
        add_activity_log(
            "reschedule_request_rejected",
            f"Reschedule rejected for {rejected.get('teacher')} on {rejected.get('day')} ({rejected.get('slot')})",
            {
                "teacher": rejected.get("teacher"),
                "day": rejected.get("day"),
                "slot": rejected.get("slot"),
                "rejectedBy": session.get("username"),
                "reason": admin_note
            }
        )

        return jsonify({"success": True, "request": rejected})
    except Exception as e:
        return jsonify({"error": f"Reject failed: {str(e)}"}), 500


@app.route('/admin/activity_feed', methods=['GET'])
@require_roles('admin')
def admin_activity_feed_api():
    try:
        cleanup_activity_logs()
        logs = get_latest_activity_logs()
        now = datetime.utcnow().date()
        today_logs = []
        for entry in logs:
            ts = parse_iso_utc(entry.get("createdAt"))
            if ts and ts.date() == now:
                today_logs.append(entry)
        today_logs.sort(key=lambda e: e.get("createdAt", ""), reverse=True)

        pending_reschedule_items = sorted(
            [r for r in get_latest_reschedule_requests() if r.get("status") == "pending"],
            key=lambda r: r.get("createdAt", ""),
            reverse=True
        )
        pending_teacher_items = sorted(
            [r for r in get_latest_pending_registrations() if r.get("role") == "teacher" and r.get("status") == "pending_admin_approval"],
            key=lambda r: r.get("created_at", ""),
            reverse=True
        )
        pending_reschedules = len(pending_reschedule_items)
        pending_teacher_regs = len(pending_teacher_items)

        return jsonify({
            "date": now.isoformat(),
            "events": today_logs,
            "pending": {
                "rescheduleRequests": pending_reschedule_items,
                "teacherRegistrations": pending_teacher_items
            },
            "counts": {
                "pendingRescheduleRequests": pending_reschedules,
                "pendingTeacherRegistrations": pending_teacher_regs,
                "totalPending": pending_reschedules + pending_teacher_regs
            }
        })
    except Exception as e:
        return jsonify({"error": f"Unable to load activity feed: {str(e)}"}), 500


@app.route('/admin/users', methods=['GET'])
@require_roles('admin')
def admin_users_api():
    return jsonify({
        "users": [
            {
                "username": u.get("username"),
                "role": u.get("role"),
                "name": u.get("name"),
                "teacher_name": u.get("teacher_name"),
                "section": u.get("section"),
                "email": u.get("email"),
                "status": u.get("status")
            }
            for u in USERS.values()
        ]
    })


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Timetable Generator API is running',
        'version': '2.0',
        'supports': 'classes-based input structure'
    })


# Replace the bottom section of your app.py file with this production-ready code:

# Serve React static files and index.html for client-side routing
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    build_dir = app.static_folder
    file_path = os.path.join(build_dir, path)
    if path != '' and os.path.exists(file_path):
        return send_from_directory(build_dir, path)
    return send_from_directory(build_dir, 'index.html')


init_mongo()
USERS = load_users()
PUBLISHED_TIMETABLE = load_published_timetable()
RESCHEDULE_REQUESTS = load_reschedule_requests()
PENDING_REGISTRATIONS = load_pending_registrations()
ACTIVITY_LOGS = load_activity_logs()
cleanup_pending_registrations()
cleanup_reschedule_requests()
cleanup_activity_logs()


if __name__ == "__main__":
    print("Starting Enhanced Timetable Generator API...")
    print("Supports new classes-based input structure")
    print("Available endpoints:")
    print("- POST /auth/login - Login")
    print("- POST /auth/register/start - Start registration")
    print("- POST /auth/register/verify - Verify email for registration")
    print("- POST /auth/logout - Logout")
    print("- GET /auth/me - Current user")
    print("- POST /generate_timetable - Generate a timetable")
    print("- POST /admin/publish_timetable - Publish timetable")
    print("- GET /admin/published_timetable - Get published timetable")
    print("- DELETE /admin/published_timetable - Delete published timetable")
    print("- GET /admin/reschedule_requests - List teacher requests")
    print("- GET /admin/registration_requests - List teacher registration requests")
    print("- GET /admin/activity_feed - Daily activity feed for bell icon")
    print("- POST /admin/registration_requests/<id>/approve - Approve teacher registration")
    print("- POST /admin/registration_requests/<id>/reject - Reject teacher registration")
    print("- POST /admin/reschedule_requests/<id>/approve - Approve and apply request")
    print("- POST /admin/reschedule_requests/<id>/reject - Reject request")
    print("- GET /teacher/timetable - Teacher schedule")
    print("- POST /teacher/request_reschedule - Teacher reschedule request")
    print("- GET /student/timetable - Student schedule")
    print("- POST /validate_input - Validate input data")
    print("- POST /reset_teacher - Reset teacher assignment")
    print("- GET /health - Health check")
    
    # Production-ready configuration
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_ENV') != 'production'
    
    # Only seed random in development
    if debug_mode:
        random.seed(42)
    
    app.run(
        debug=debug_mode,
        host='0.0.0.0', 
        port=port
    )




