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

"""
Teachable OAuth Integration

This module handles OAuth authentication with Teachable to verify
that users are enrolled in paid courses before granting access.

Required environment variables:
- TEACHABLE_SCHOOL_ID: Your Teachable school ID (from login URLs)
- TEACHABLE_CLIENT_ID: OAuth app client ID from Teachable admin
- TEACHABLE_CLIENT_SECRET: OAuth app client secret
- TEACHABLE_REDIRECT_URI: Must match what's registered in Teachable (e.g., https://conversation.smartergerman.com/api/teachable/callback)
- TEACHABLE_REQUIRED_COURSES: Comma-separated list of course IDs that grant access (optional, if not set any paid enrollment works)
"""

import os
import logging
import hashlib
import secrets
import time
import hmac
from typing import Dict, Any, Optional, List
from urllib.parse import urlencode
import requests

from server.redis_storage import get_storage

logger = logging.getLogger(__name__)

# Configuration from environment
TEACHABLE_SCHOOL_ID = os.getenv("TEACHABLE_SCHOOL_ID", "")
TEACHABLE_CLIENT_ID = os.getenv("TEACHABLE_CLIENT_ID", "")
TEACHABLE_CLIENT_SECRET = os.getenv("TEACHABLE_CLIENT_SECRET", "")
TEACHABLE_REDIRECT_URI = os.getenv("TEACHABLE_REDIRECT_URI", "")
TEACHABLE_REQUIRED_COURSES = os.getenv("TEACHABLE_REQUIRED_COURSES", "")  # Comma-separated course IDs

# JWT secret for signing our own tokens
JWT_SECRET = os.getenv("JWT_SECRET", "")

# Teachable OAuth endpoints
TEACHABLE_AUTH_URL = f"https://sso.teachable.com/secure/{TEACHABLE_SCHOOL_ID}/identity/oauth_provider/authorize"
TEACHABLE_TOKEN_URL = "https://developers.teachable.com/v1/current_user/oauth2/token"
TEACHABLE_USER_URL = "https://developers.teachable.com/v1/current_user/me"
TEACHABLE_COURSES_URL = "https://developers.teachable.com/v1/current_user/enrolled_courses"

# OAuth state storage - uses Redis when available for multi-instance support
OAUTH_STATE_PREFIX = "oauth_state:"
OAUTH_STATE_TTL = 600  # 10 minutes


def _store_oauth_state(state: str, data: Dict) -> None:
    """Store OAuth state in Redis with TTL"""
    storage = get_storage()
    storage.set_json(f"{OAUTH_STATE_PREFIX}{state}", data, ttl=OAUTH_STATE_TTL)


def _get_and_delete_oauth_state(state: str) -> Optional[Dict]:
    """Get and delete OAuth state atomically (prevents replay attacks)"""
    storage = get_storage()
    key = f"{OAUTH_STATE_PREFIX}{state}"
    data = storage.get_json(key)
    if data:
        storage.delete(key)
    return data


class TeachableAuth:
    """Handles Teachable OAuth flow and enrollment verification"""

    def __init__(self):
        self.school_id = TEACHABLE_SCHOOL_ID
        self.client_id = TEACHABLE_CLIENT_ID
        self.client_secret = TEACHABLE_CLIENT_SECRET
        self.redirect_uri = TEACHABLE_REDIRECT_URI
        self.required_courses = [c.strip() for c in TEACHABLE_REQUIRED_COURSES.split(",") if c.strip()]

    def is_enabled(self) -> bool:
        """Check if Teachable OAuth is configured"""
        return bool(self.school_id and self.client_id and self.client_secret and self.redirect_uri)

    def get_authorization_url(self, final_redirect: str = "") -> Dict[str, str]:
        """
        Generate the Teachable OAuth authorization URL.

        Args:
            final_redirect: Where to redirect after successful auth (stored in state)

        Returns:
            Dict with 'url' and 'state' keys
        """
        if not self.is_enabled():
            raise ValueError("Teachable OAuth is not configured")

        # Generate state and PKCE code verifier
        state = secrets.token_urlsafe(32)
        code_verifier = secrets.token_urlsafe(64)

        # Generate code challenge (S256)
        code_challenge = hashlib.sha256(code_verifier.encode()).digest()
        import base64
        code_challenge = base64.urlsafe_b64encode(code_challenge).decode().rstrip("=")

        # Store state in Redis with TTL (auto-expires, no cleanup needed)
        _store_oauth_state(state, {
            "created_at": time.time(),
            "code_verifier": code_verifier,
            "final_redirect": final_redirect
        })

        # Build authorization URL
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri,
            "required_scopes": "name:read email:read",
            "optional_scopes": "courses:read",
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state
        }

        url = f"{TEACHABLE_AUTH_URL}?{urlencode(params)}"

        return {"url": url, "state": state}

    def handle_callback(self, code: str, state: str) -> Dict[str, Any]:
        """
        Handle the OAuth callback from Teachable.

        Args:
            code: Authorization code from Teachable
            state: State parameter to verify

        Returns:
            Dict with user info and enrollment status
        """
        if not self.is_enabled():
            return {"valid": False, "error": "Teachable OAuth not configured"}

        # Verify and consume state atomically (prevents replay attacks)
        state_data = _get_and_delete_oauth_state(state)
        if not state_data:
            return {"valid": False, "error": "Invalid or expired state"}

        code_verifier = state_data.get("code_verifier")
        final_redirect = state_data.get("final_redirect", "")

        # Exchange code for access token
        token_data = {
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": code_verifier
        }

        try:
            response = requests.post(TEACHABLE_TOKEN_URL, data=token_data, timeout=10)
            if response.status_code != 200:
                logger.error("Teachable token exchange failed: %s", response.text)
                return {"valid": False, "error": "Token exchange failed"}

            tokens = response.json()
            access_token = tokens.get("access_token")

            if not access_token:
                return {"valid": False, "error": "No access token received"}

            # Get user info
            headers = {"Authorization": f"Bearer {access_token}"}
            user_response = requests.get(TEACHABLE_USER_URL, headers=headers, timeout=10)

            if user_response.status_code != 200:
                logger.error("Teachable user info failed: %s", user_response.text)
                return {"valid": False, "error": "Failed to get user info"}

            user_data = user_response.json()
            user_email = user_data.get("email", "")
            user_name = user_data.get("name", "")

            # Check course enrollment
            is_enrolled = self._check_enrollment(access_token)

            if not is_enrolled:
                return {
                    "valid": False,
                    "error": "Not enrolled in required course",
                    "user_email": user_email,
                    "user_name": user_name
                }

            return {
                "valid": True,
                "user_email": user_email,
                "user_name": user_name,
                "final_redirect": final_redirect,
                "platform": "teachable"
            }

        except requests.RequestException as e:
            logger.error("Teachable API error: %s", e)
            return {"valid": False, "error": f"API error: {str(e)}"}

    def _check_enrollment(self, access_token: str) -> bool:
        """
        Check if user is enrolled in a paid course.

        Args:
            access_token: Teachable access token with courses:read scope

        Returns:
            True if enrolled in required course (or any paid course if no specific courses required)
        """
        try:
            headers = {"Authorization": f"Bearer {access_token}"}
            response = requests.get(TEACHABLE_COURSES_URL, headers=headers, timeout=10)

            if response.status_code != 200:
                logger.warning("Could not fetch enrollments: %s", response.text)
                # If we can't check courses but user authenticated, allow access
                # This handles cases where courses:read scope was denied
                return True

            enrollments = response.json()
            courses = enrollments.get("courses", [])

            if not courses:
                return False

            # If specific courses are required, check for them
            if self.required_courses:
                for course in courses:
                    course_id = str(course.get("id", ""))
                    if course_id in self.required_courses:
                        # Check if it's an active paid enrollment
                        if course.get("is_active", False):
                            return True
                return False

            # No specific courses required - any active enrollment counts
            for course in courses:
                if course.get("is_active", False):
                    return True

            return False

        except Exception as e:
            logger.error("Enrollment check error: %s", e)
            # On error, be permissive - user already authenticated
            return True

    def generate_signed_url(self, user_email: str, course: str = "teachable") -> str:
        """
        Generate a signed URL for the conversation tool.

        Args:
            user_email: User's email from Teachable
            course: Course identifier

        Returns:
            Signed URL for the conversation tool
        """
        if not JWT_SECRET:
            raise ValueError("JWT_SECRET not configured")

        exp = int(time.time()) + 3600  # 1 hour
        message = f"{user_email}|{exp}|{course}"
        sig = hmac.new(JWT_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()

        from urllib.parse import urlencode
        params = urlencode({
            "user": user_email,
            "exp": exp,
            "course": course,
            "sig": sig
        })

        return f"https://conversation.smartergerman.com?{params}"


# Create singleton instance
teachable_auth = TeachableAuth()
