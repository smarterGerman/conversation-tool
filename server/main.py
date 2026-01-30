# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import base64
import asyncio
import json
import os
import logging
import secrets
import time
from typing import Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse, Response, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from dotenv import load_dotenv
from server.recaptcha_validator import RecaptchaValidator
from server.gemini_live import GeminiLive
from server.fingerprint import generate_fingerprint
from server.simple_tracker import simpletrack
from server.config_utils import get_project_id
from server.course_auth import course_auth
from server.teachable_auth import teachable_auth
from server.usage_tracker import usage_tracker


# Rate Limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import redis

# Load environment variables
load_dotenv(override=True)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Configuration
PROJECT_ID = get_project_id()
LOCATION = os.getenv("LOCATION", "us-central1")
MODEL = os.getenv("MODEL", "gemini-live-2.5-flash-native-audio")
# Session time limit in seconds (default 5 minutes)
SESSION_TIME_LIMIT = int(os.getenv("SESSION_TIME_LIMIT", "300"))
# Access password for the tool (optional but recommended)
ACCESS_PASSWORD = os.getenv("ACCESS_PASSWORD", "")
RECAPTCHA_SITE_KEY = os.getenv("RECAPTCHA_SITE_KEY")
REDIS_URL = os.getenv("REDIS_URL")
GLOBAL_RATE_LIMIT = os.getenv("GLOBAL_RATE_LIMIT", "1000 per hour")
PER_USER_RATE_LIMIT = os.getenv("PER_USER_RATE_LIMIT", "2 per minute")
DEV_MODE = os.getenv("DEV_MODE", "false") == "true"
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")  # Comma-separated list of allowed origins
MAX_MESSAGE_SIZE = int(os.getenv("MAX_MESSAGE_SIZE", "1048576"))  # 1MB default
# Allowed frame ancestors for CSP (comma-separated) - controls which sites can embed this app in an iframe
ALLOWED_FRAME_ANCESTORS = os.getenv("ALLOWED_FRAME_ANCESTORS", "")

# Initialize FastAPI
app = FastAPI()

# Initialize Recaptcha Validator
recaptcha_validator = RecaptchaValidator(
    project_id=PROJECT_ID,
    recaptcha_key=RECAPTCHA_SITE_KEY
)

def get_fingerprint_key(request: Request):
    return generate_fingerprint(request)

def get_global_key(request: Request):
    return "global"

# Initialize Rate Limiter
if DEV_MODE:
    logger.info("DEV_MODE enabled: Rate limiting disabled (using memory storage)")
    limiter = Limiter(key_func=get_global_key) # Defaults to memory
elif not REDIS_URL:
    logger.warning("REDIS_URL not set: Using memory storage for rate limiting (not suitable for multi-instance)")
    limiter = Limiter(key_func=get_fingerprint_key)
else:
    limiter = Limiter(key_func=get_fingerprint_key, storage_uri=REDIS_URL)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.on_event("startup")
async def startup_event():
    """Test Redis connection on startup."""
    if REDIS_URL and not DEV_MODE:
        try:
            logger.info(f"Testing Redis connection to: {REDIS_URL.split('@')[-1] if '@' in REDIS_URL else REDIS_URL}")
            
            r = redis.from_url(REDIS_URL)
            r.ping()
            logger.info("Redis connection successful")
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            logger.error("Ensure Cloud Run is configured with a VPC Connector if using a private IP.")


# Configure CORS - use specific origins in production
if CORS_ORIGINS:
    cors_origins = [origin.strip() for origin in CORS_ORIGINS.split(",")]
    logger.info(f"CORS configured for specific origins: {cors_origins}")
elif DEV_MODE:
    cors_origins = ["*"]
    logger.warning("DEV_MODE: CORS allowing all origins (not for production)")
else:
    # In production without explicit CORS_ORIGINS, only allow same-origin
    cors_origins = []
    logger.info("CORS: No origins configured, same-origin only")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True if cors_origins and cors_origins != ["*"] else False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        # Content-Security-Policy with frame-ancestors (controls iframe embedding)
        if ALLOWED_FRAME_ANCESTORS:
            frame_ancestors = " ".join([a.strip() for a in ALLOWED_FRAME_ANCESTORS.split(",")])
            response.headers["Content-Security-Policy"] = f"frame-ancestors 'self' {frame_ancestors}"
        elif DEV_MODE:
            # Allow any embedding in dev mode
            response.headers["Content-Security-Policy"] = "frame-ancestors *"
        else:
            # Block all iframe embedding by default in production
            response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
            response.headers["X-Frame-Options"] = "DENY"

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # XSS protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissions policy (restrict sensitive APIs)
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(self), camera=(self)"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Serve static files
# app.mount("/static", StaticFiles(directory="frontend"), name="static")

# Mount assets and other static directories from dist
if os.path.exists("dist/assets"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
if os.path.exists("dist/audio-processors"):
    app.mount("/audio-processors", StaticFiles(directory="dist/audio-processors"), name="audio-processors")
# In-memory storage for valid session tokens (Token -> {timestamp, user_id})
# Note: For multi-instance deployments, consider using Redis for token storage
import threading
_token_lock = threading.Lock()
valid_tokens: Dict[str, Dict] = {}
TOKEN_EXPIRY_SECONDS = 30

def cleanup_tokens():
    """Remove expired tokens (thread-safe)."""
    current_time = time.time()
    with _token_lock:
        expired = [token for token, data in valid_tokens.items() if current_time - data.get("timestamp", 0) > TOKEN_EXPIRY_SECONDS]
        for token in expired:
            valid_tokens.pop(token, None)

def add_token(token: str, user_id: str = "") -> None:
    """Add a new token with optional user_id (thread-safe)."""
    with _token_lock:
        valid_tokens[token] = {"timestamp": time.time(), "user_id": user_id}

def consume_token(token: str) -> Optional[Dict]:
    """Consume a token if valid (thread-safe). Returns token data if valid, None otherwise."""
    with _token_lock:
        if token in valid_tokens:
            data = valid_tokens.pop(token)
            return data
        return None

@app.get("/api/status")
async def get_status():
    """Returns the current configuration mode and public configuration."""
    missing = []
    if not RECAPTCHA_SITE_KEY:
        missing.append("recaptcha")
    if not REDIS_URL:
        missing.append("redis")

    mode = "simple" if missing else "production"

    return {
        "mode": mode,
        "missing": missing,
        "recaptcha_site_key": RECAPTCHA_SITE_KEY if RECAPTCHA_SITE_KEY else None,
        "session_time_limit": SESSION_TIME_LIMIT,
        "password_required": bool(ACCESS_PASSWORD),
        "course_auth_enabled": course_auth.is_enabled(),
        "teachable_auth_enabled": teachable_auth.is_enabled()
    }

@app.get("/api/teachable/authorize")
async def teachable_authorize(redirect: str = ""):
    """
    Initiates Teachable OAuth flow.
    Redirects user to Teachable login page.
    """
    if not teachable_auth.is_enabled():
        raise HTTPException(status_code=503, detail="Teachable OAuth not configured")

    try:
        result = teachable_auth.get_authorization_url(final_redirect=redirect)
        return RedirectResponse(url=result["url"], status_code=302)
    except Exception as e:
        logger.error("Teachable OAuth error: %s", e)
        raise HTTPException(status_code=500, detail="OAuth initialization failed")

@app.get("/api/teachable/callback")
async def teachable_callback(code: str = "", state: str = "", error: str = ""):
    """
    Handles Teachable OAuth callback.
    Exchanges code for token, verifies enrollment, and redirects with signed URL.
    """
    if not teachable_auth.is_enabled():
        raise HTTPException(status_code=503, detail="Teachable OAuth not configured")

    if error:
        logger.warning("Teachable OAuth error: %s", error)
        return RedirectResponse(
            url="/?error=oauth_denied&message=Access+was+denied",
            status_code=302
        )

    if not code or not state:
        return RedirectResponse(
            url="/?error=oauth_invalid&message=Invalid+OAuth+response",
            status_code=302
        )

    result = teachable_auth.handle_callback(code, state)

    if not result.get("valid"):
        error_msg = result.get("error", "Authentication failed")
        # URL encode the error message
        from urllib.parse import quote
        return RedirectResponse(
            url=f"/?error=oauth_failed&message={quote(error_msg)}",
            status_code=302
        )

    # Generate signed URL and redirect
    try:
        signed_url = teachable_auth.generate_signed_url(
            user_email=result.get("user_email", ""),
            course="teachable"
        )
        return RedirectResponse(url=signed_url, status_code=302)
    except Exception as e:
        logger.error("Failed to generate signed URL: %s", e)
        return RedirectResponse(
            url="/?error=auth_error&message=Failed+to+complete+authentication",
            status_code=302
        )

@app.get("/{full_path:path}")
@simpletrack("page_view")
async def serve_spa(full_path: str):
    # Serve file from dist if it exists
    file_path = f"dist/{full_path}"
    if full_path and os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # Fallback to index.html for SPA routing
    return FileResponse("dist/index.html")

@app.post("/api/auth")
@simpletrack("session_start")
@limiter.limit(GLOBAL_RATE_LIMIT, key_func=get_global_key)
@limiter.limit(PER_USER_RATE_LIMIT, key_func=get_fingerprint_key)
async def authenticate(request: Request):
    """
    Validates authentication and issues a temporary session token for WebSocket connection.

    Supports multiple auth methods (in priority order):
    1. JWT token from course platform (bypasses password and reCAPTCHA)
    2. Signed URL params (for iframe embedding)
    3. Password + reCAPTCHA (fallback)
    """
    try:
        data = await request.json()
        recaptcha_token = data.get("recaptcha_token")
        password = data.get("password")
        jwt_token = data.get("jwt_token")
        signed_params = data.get("signed_params")  # {user, exp, sig, course}

        course_user = None

        # Method 1: JWT token from course platform
        if jwt_token and course_auth.is_enabled():
            try:
                result = course_auth.validate_jwt(jwt_token)
                course_user = result.get("user_id")
                logger.info(f"Authenticated via JWT: {course_user}")
                # JWT auth bypasses password and reCAPTCHA
            except ValueError as e:
                logger.warning(f"JWT validation failed: {e}")
                raise HTTPException(status_code=403, detail=f"Invalid JWT: {e}")

        # Method 2: Signed URL params (for iframe embedding)
        elif signed_params and course_auth.is_enabled():
            try:
                result = course_auth.validate_signed_url(signed_params)
                course_user = result.get("user_id")
                logger.info(f"Authenticated via signed URL: {course_user}")
                # Signed URL auth bypasses password and reCAPTCHA
            except ValueError as e:
                logger.warning(f"Signed URL validation failed: {e}")
                raise HTTPException(status_code=403, detail=f"Invalid signed URL: {e}")

        # Method 3: Password + reCAPTCHA (traditional auth)
        else:
            # Check access password if configured
            if ACCESS_PASSWORD:
                if not password or password != ACCESS_PASSWORD:
                    logger.warning("Invalid or missing access password")
                    raise HTTPException(status_code=403, detail="Invalid access password")

            # Check if ReCAPTCHA is configured
            if not RECAPTCHA_SITE_KEY:
                 logger.warning("RECAPTCHA_SITE_KEY not set: Skipping validation (Simple Mode)")
                 # Proceed without validation
            else:
                if not recaptcha_token:
                    raise HTTPException(status_code=400, detail="Missing ReCAPTCHA token")

                if DEV_MODE:
                    logger.info("DEV_MODE enabled: Skipping ReCAPTCHA validation")
                    validation_result = {'valid': True, 'passes_threshold': True}
                else:
                    validation_result = recaptcha_validator.validate_token(
                        token=recaptcha_token,
                        recaptcha_action="LOGIN"
                    )

                if not validation_result['valid']:
                    logger.warning(f"ReCAPTCHA failed: {validation_result.get('error')}")
                    raise HTTPException(status_code=403, detail="ReCAPTCHA validation failed")
                
            if not validation_result['passes_threshold']:
                logger.warning(f"ReCAPTCHA score too low: {validation_result.get('score')}")
                raise HTTPException(status_code=403, detail="ReCAPTCHA score too low")

        # Check usage limits for authenticated users
        user_id = course_user or ""
        if user_id:
            can_start, usage_message = usage_tracker.can_start(user_id)
            if not can_start:
                logger.warning(f"User {user_id[:20]}... exceeded daily limit")
                raise HTTPException(status_code=429, detail=usage_message)
            remaining_seconds = usage_tracker.get_remaining(user_id)
        else:
            remaining_seconds = SESSION_TIME_LIMIT

        # Calculate effective session limit (minimum of configured limit and remaining quota)
        effective_session_limit = min(SESSION_TIME_LIMIT, int(remaining_seconds))

        # Generate cryptographically secure token
        session_token = secrets.token_urlsafe(32)
        cleanup_tokens()
        add_token(session_token, user_id)

        return {
            "session_token": session_token,
            "session_time_limit": effective_session_limit,
            "daily_remaining": int(remaining_seconds)
        }
        
    except Exception as e:
        logger.error(f"Auth error: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Internal server error")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    """
    WebSocket endpoint for Gemini Live.
    Requires a valid session token generated via /api/auth.
    """
    await websocket.accept()

    # Validate and consume token (one-time use, thread-safe)
    token_data = consume_token(token) if token else None
    if not token_data:
        logger.warning("Invalid or missing session token")
        await websocket.close(code=4003, reason="Unauthorized")
        return

    user_id = token_data.get("user_id", "")
    session_id = secrets.token_urlsafe(16)

    # Start usage tracking
    if user_id:
        usage_tracker.start(session_id, user_id)

    logger.info(f"WebSocket connection accepted (user: {user_id[:20] if user_id else 'anonymous'}...)")

    # Wait for initial setup message
    setup_config = None
    try:
        # We expect the first message to be the setup JSON
        message = await websocket.receive_text()
        initial_data = json.loads(message)
        if "setup" in initial_data:
            setup_config = initial_data["setup"]
            logger.info("Received setup configuration from client")
    except Exception as e:
        logger.warning(f"Error receiving setup config: {e}")

    audio_input_queue = asyncio.Queue()
    video_input_queue = asyncio.Queue()
    text_input_queue = asyncio.Queue()

    async def audio_output_callback(data):
        await websocket.send_bytes(data)

    async def audio_interrupt_callback():
        # The event queue handles the JSON message, but we might want to do something else here
        pass

    gemini_client = GeminiLive(
        project_id=PROJECT_ID,
        location=LOCATION,
        model=MODEL,
        input_sample_rate=16000
    )

    async def receive_from_client():
        try:
            while True:
                message = await websocket.receive()

                if "bytes" in message and message["bytes"]:
                    # Validate message size
                    if len(message["bytes"]) > MAX_MESSAGE_SIZE:
                        logger.warning(f"Rejecting oversized binary message: {len(message['bytes'])} bytes")
                        continue
                    await audio_input_queue.put(message["bytes"])
                elif "text" in message and message["text"]:
                    text = message["text"]
                    # Validate message size
                    if len(text) > MAX_MESSAGE_SIZE:
                        logger.warning(f"Rejecting oversized text message: {len(text)} bytes")
                        continue
                    try:
                        payload = json.loads(text)
                        if isinstance(payload, dict) and payload.get("type") == "image":
                            # Validate base64 data exists and has reasonable size
                            image_b64 = payload.get("data", "")
                            if not image_b64 or len(image_b64) > MAX_MESSAGE_SIZE * 1.4:  # base64 ~33% overhead
                                logger.warning("Rejecting invalid or oversized image data")
                                continue
                            try:
                                image_data = base64.b64decode(image_b64)
                                await video_input_queue.put(image_data)
                            except Exception as e:
                                logger.warning(f"Failed to decode base64 image: {e}")
                            continue
                        elif isinstance(payload, dict) and "realtime_input" in payload:
                             # Forward realtime input (audio/video chunks)
                             # The SDK JS sends 'realtime_input' for generic media chunks
                             # For now we handle simpler case or adapt GeminiLive class
                             pass
                    except json.JSONDecodeError:
                        pass

                    await text_input_queue.put(text)
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected")
        except Exception as e:
            logger.error(f"Error receiving from client: {e}")

    receive_task = asyncio.create_task(receive_from_client())

    async def run_session():
        async for event in gemini_client.start_session(
            audio_input_queue=audio_input_queue,
            video_input_queue=video_input_queue,
            text_input_queue=text_input_queue,
            audio_output_callback=audio_output_callback,
            audio_interrupt_callback=audio_interrupt_callback,
            setup_config=setup_config
        ):
            if event:
                # Forward events (transcriptions, etc) to client
                await websocket.send_json(event)

    # Calculate effective timeout based on user's remaining quota
    effective_timeout = SESSION_TIME_LIMIT
    if user_id:
        remaining = usage_tracker.get_remaining(user_id)
        effective_timeout = min(SESSION_TIME_LIMIT, int(remaining))
        logger.info(f"Session timeout: {effective_timeout}s (limit={SESSION_TIME_LIMIT}s, remaining={remaining:.0f}s)")
    else:
        logger.info(f"Session timeout: {effective_timeout}s (anonymous user)")

    import time
    session_start = time.time()
    try:
        await asyncio.wait_for(run_session(), timeout=effective_timeout)
        elapsed = time.time() - session_start
        logger.info(f"Session completed normally after {elapsed:.0f}s")
    except asyncio.TimeoutError:
        elapsed = time.time() - session_start
        logger.info(f"Session timeout after {elapsed:.0f}s (limit was {effective_timeout}s)")
        await websocket.close(code=1000, reason="Session time limit reached")
    except Exception as e:
        elapsed = time.time() - session_start
        logger.error(f"Session error after {elapsed:.0f}s: {type(e).__name__}: {e}")
    finally:
        receive_task.cancel()
        # End usage tracking
        if user_id:
            duration = usage_tracker.end(session_id)
            if duration:
                logger.info(f"Session duration: {duration:.0f}s for user {user_id[:20]}...")
        # Ensure websocket is closed if not already
        try:
            await websocket.close()
        except Exception:
            # WebSocket may already be closed, which is fine
            pass

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
