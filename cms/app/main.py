"""SHY CMS — Lightweight content management for Sandpoint Hot Yoga."""

import json
import os
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
IMAGES_DIR = Path(os.getenv("IMAGES_DIR", "./images"))
SEED_DIR = Path(os.getenv("SEED_DIR", "./seed"))
ADMIN_USER = os.getenv("ADMIN_USER", "kerri")
ADMIN_PASS = os.getenv("ADMIN_PASS", "shyadmin2026")
SECRET_KEY = os.getenv("SECRET_KEY", os.urandom(32).hex())
SESSION_MAX_AGE = 86400 * 7  # 7 days

serializer = URLSafeTimedSerializer(SECRET_KEY)

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


# ---------------------------------------------------------------------------
# Startup — seed data on first run
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    if SEED_DIR.exists():
        for seed_file in SEED_DIR.glob("*.json"):
            dest = DATA_DIR / seed_file.name
            if not dest.exists():
                shutil.copy2(seed_file, dest)
    yield


app = FastAPI(lifespan=lifespan)

# Static files & templates
BASE = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE / "static")), name="static")
app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def _create_session(username: str) -> str:
    return serializer.dumps({"user": username})


def _verify_session(request: Request) -> str:
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        data = serializer.loads(token, max_age=SESSION_MAX_AGE)
        return data["user"]
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=401, detail="Session expired")


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------
def _read_json(filename: str):
    path = DATA_DIR / filename
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _write_json(filename: str, data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DATA_DIR / f".{filename}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    tmp.replace(DATA_DIR / filename)


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    token = request.cookies.get("session")
    if token:
        try:
            serializer.loads(token, max_age=SESSION_MAX_AGE)
            return RedirectResponse("/admin", status_code=302)
        except Exception:
            pass
    return templates.TemplateResponse("login.html", {"request": request, "error": ""})


@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request, user: str = Depends(_verify_session)):
    return templates.TemplateResponse("admin.html", {"request": request, "user": user})


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@app.post("/api/login")
async def login(request: Request):
    form = await request.form()
    username = str(form.get("username", "")).strip()
    password = str(form.get("password", ""))
    if username.lower() == ADMIN_USER.lower() and password == ADMIN_PASS:
        response = RedirectResponse("/admin", status_code=302)
        response.set_cookie(
            "session",
            _create_session(username),
            max_age=SESSION_MAX_AGE,
            httponly=True,
            samesite="lax",
        )
        return response
    return templates.TemplateResponse(
        "login.html",
        {"request": request, "error": "Invalid username or password"},
    )


@app.get("/api/logout")
async def logout():
    response = RedirectResponse("/", status_code=302)
    response.delete_cookie("session")
    return response


# ---------------------------------------------------------------------------
# Bios CRUD
# ---------------------------------------------------------------------------
@app.get("/api/bios")
async def get_bios(user: str = Depends(_verify_session)):
    return _read_json("bios.json")


@app.post("/api/bios")
async def add_bio(request: Request, user: str = Depends(_verify_session)):
    data = await request.json()
    bios = _read_json("bios.json")
    new_id = (
        data.get("id")
        or data.get("name", "").lower().replace(" ", "-")
        or str(uuid.uuid4())[:8]
    )
    if any(b["id"] == new_id for b in bios):
        new_id = f"{new_id}-{uuid.uuid4().hex[:4]}"
    new_bio = {
        "id": new_id,
        "name": data.get("name", ""),
        "title": data.get("title", ""),
        "image": data.get("image", ""),
        "bio": data.get("bio", ""),
        "order": len(bios),
    }
    bios.append(new_bio)
    _write_json("bios.json", bios)
    return new_bio


@app.put("/api/bios/{bio_id}")
async def update_bio(bio_id: str, request: Request, user: str = Depends(_verify_session)):
    data = await request.json()
    bios = _read_json("bios.json")
    for bio in bios:
        if bio["id"] == bio_id:
            for k, v in data.items():
                if k != "id":
                    bio[k] = v
            _write_json("bios.json", bios)
            return bio
    raise HTTPException(404, "Instructor not found")


@app.delete("/api/bios/{bio_id}")
async def delete_bio(bio_id: str, user: str = Depends(_verify_session)):
    bios = _read_json("bios.json")
    bios = [b for b in bios if b["id"] != bio_id]
    for i, b in enumerate(bios):
        b["order"] = i
    _write_json("bios.json", bios)
    return {"ok": True}


@app.post("/api/bios/reorder")
async def reorder_bios(request: Request, user: str = Depends(_verify_session)):
    data = await request.json()
    order = data.get("order", [])
    bios = _read_json("bios.json")
    bio_map = {b["id"]: b for b in bios}
    reordered = []
    for i, bio_id in enumerate(order):
        if bio_id in bio_map:
            bio_map[bio_id]["order"] = i
            reordered.append(bio_map[bio_id])
    seen = set(order)
    for b in bios:
        if b["id"] not in seen:
            b["order"] = len(reordered)
            reordered.append(b)
    _write_json("bios.json", reordered)
    return reordered


# ---------------------------------------------------------------------------
# Image upload
# ---------------------------------------------------------------------------
@app.post("/api/upload/image")
async def upload_image(
    file: UploadFile = File(...), user: str = Depends(_verify_session)
):
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "upload.jpg").suffix.lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(
            400, f"Invalid format. Allowed: {', '.join(ALLOWED_IMAGE_EXT)}"
        )
    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "Image too large (max 10 MB)")
    stem = Path(file.filename or "upload").stem
    safe_stem = "".join(c for c in stem if c.isalnum() or c in "-_ ")
    safe_name = f"{safe_stem}{ext}"
    dest = IMAGES_DIR / safe_name
    with open(dest, "wb") as f:
        f.write(content)
    return {"filename": safe_name}


# ---------------------------------------------------------------------------
# Pricing CRUD
# ---------------------------------------------------------------------------
@app.get("/api/pricing")
async def get_pricing(user: str = Depends(_verify_session)):
    return _read_json("pricing.json")


@app.put("/api/pricing")
async def update_pricing(request: Request, user: str = Depends(_verify_session)):
    data = await request.json()
    _write_json("pricing.json", data)
    return data


# ---------------------------------------------------------------------------
# Events CRUD
# ---------------------------------------------------------------------------
@app.get("/api/events")
async def get_events(user: str = Depends(_verify_session)):
    return _read_json("events.json")


@app.post("/api/events")
async def add_event(request: Request, user: str = Depends(_verify_session)):
    data = await request.json()
    events = _read_json("events.json")
    event = {
        "id": uuid.uuid4().hex[:8],
        "title": data.get("title", "New Event"),
        "image": data.get("image", ""),
        "dates": data.get("dates", ""),
        "description": data.get("description", ""),
        "details": data.get("details", []),
        "signupLink": data.get("signupLink", ""),
        "resources": data.get("resources", []),
        "active": data.get("active", True),
    }
    events.append(event)
    _write_json("events.json", events)
    return event


@app.put("/api/events/{event_id}")
async def update_event(
    event_id: str, request: Request, user: str = Depends(_verify_session)
):
    data = await request.json()
    events = _read_json("events.json")
    for event in events:
        if event["id"] == event_id:
            for k, v in data.items():
                if k != "id":
                    event[k] = v
            _write_json("events.json", events)
            return event
    raise HTTPException(404, "Event not found")


@app.delete("/api/events/{event_id}")
async def delete_event(event_id: str, user: str = Depends(_verify_session)):
    events = _read_json("events.json")
    events = [e for e in events if e["id"] != event_id]
    _write_json("events.json", events)
    return {"ok": True}
