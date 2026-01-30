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
Course Platform Authentication Module

Supports JWT-based authentication from course platforms like:
- LifterLMS (WordPress)
- Teachable
- Any platform that can generate signed JWTs

JWT Payload should include:
{
    "sub": "user_id_or_email",
    "exp": 1234567890,  # Expiration timestamp
    "iat": 1234567890,  # Issued at timestamp
    "course": "german-a1",  # Optional: course identifier
    "platform": "lifterlms"  # Optional: platform identifier
}
"""

import os
import jwt
import time
import hmac
import hashlib
import logging
from typing import Optional, Dict, Any
from urllib.parse import parse_qs, urlencode

logger = logging.getLogger(__name__)

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "")  # Shared secret with course platform
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ISSUER = os.getenv("JWT_ISSUER", "")  # Optional: validate issuer
JWT_MAX_AGE = int(os.getenv("JWT_MAX_AGE", "3600"))  # Max token age in seconds (1 hour default)

# Alternative: Simple signed URL for iframe embedding
SIGNED_URL_SECRET = os.getenv("SIGNED_URL_SECRET", "")  # For simple HMAC-signed URLs


class CourseAuthenticator:
    """Handles authentication from course platforms."""

    def __init__(self):
        self.jwt_secret = JWT_SECRET
        self.signed_url_secret = SIGNED_URL_SECRET or JWT_SECRET

    def is_enabled(self) -> bool:
        """Check if course authentication is configured."""
        return bool(self.jwt_secret or self.signed_url_secret)

    def validate_jwt(self, token: str) -> Dict[str, Any]:
        """
        Validate a JWT token from a course platform.

        Returns:
            Dict with user info if valid

        Raises:
            ValueError: If token is invalid or expired
        """
        if not self.jwt_secret:
            raise ValueError("JWT authentication not configured")

        try:
            options = {"require": ["exp", "sub"]}
            if JWT_ISSUER:
                options["require"].append("iss")

            payload = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=[JWT_ALGORITHM],
                options=options
            )

            # Validate issuer if configured
            if JWT_ISSUER and payload.get("iss") != JWT_ISSUER:
                raise ValueError(f"Invalid issuer: {payload.get('iss')}")

            # Check token age (in case exp is too far in future)
            iat = payload.get("iat", 0)
            if iat and (time.time() - iat) > JWT_MAX_AGE:
                raise ValueError("Token too old")

            logger.info(f"JWT validated for user: {payload.get('sub')}")
            return {
                "valid": True,
                "user_id": payload.get("sub"),
                "course": payload.get("course"),
                "platform": payload.get("platform"),
                "payload": payload
            }

        except jwt.ExpiredSignatureError:
            logger.warning("JWT token expired")
            raise ValueError("Token expired")
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT: {e}")
            raise ValueError(f"Invalid token: {e}")

    def validate_signed_url(self, params: Dict[str, str]) -> Dict[str, Any]:
        """
        Validate a signed URL for iframe embedding.

        URL format: ?user=xxx&exp=timestamp&sig=hmac_signature

        Returns:
            Dict with user info if valid

        Raises:
            ValueError: If signature is invalid or expired
        """
        if not self.signed_url_secret:
            raise ValueError("Signed URL authentication not configured")

        user = params.get("user", "")
        exp = params.get("exp", "")
        sig = params.get("sig", "")
        course = params.get("course", "")

        if not all([user, exp, sig]):
            raise ValueError("Missing required parameters (user, exp, sig)")

        # Check expiration
        try:
            exp_time = int(exp)
            if time.time() > exp_time:
                raise ValueError("URL expired")
        except (ValueError, TypeError):
            raise ValueError("Invalid expiration timestamp")

        # Verify signature
        # Signature is HMAC-SHA256 of: user|exp|course
        message = f"{user}|{exp}|{course}"
        expected_sig = hmac.new(
            self.signed_url_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(sig, expected_sig):
            logger.warning(f"Invalid signature for user: {user}")
            raise ValueError("Invalid signature")

        logger.info(f"Signed URL validated for user: {user}")
        return {
            "valid": True,
            "user_id": user,
            "course": course,
            "platform": "signed_url"
        }

    def generate_signed_url(self, user: str, course: str = "", ttl: int = 3600) -> str:
        """
        Generate a signed URL for testing or for course platform integration.

        Args:
            user: User identifier
            course: Course identifier (optional)
            ttl: Time to live in seconds (default 1 hour)

        Returns:
            Query string parameters to append to URL
        """
        if not self.signed_url_secret:
            raise ValueError("Signed URL secret not configured")

        exp = int(time.time()) + ttl
        message = f"{user}|{exp}|{course}"
        sig = hmac.new(
            self.signed_url_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()

        params = {
            "user": user,
            "exp": str(exp),
            "sig": sig
        }
        if course:
            params["course"] = course

        return urlencode(params)


# Singleton instance
course_auth = CourseAuthenticator()


# Helper function to generate tokens for WordPress/LifterLMS integration
def generate_wordpress_integration_code() -> str:
    """
    Returns PHP code snippet for WordPress/LifterLMS integration.
    """
    return '''
<?php
/**
 * SmarterGerman Conversation Tool Integration
 * Add this to your WordPress theme's functions.php or a custom plugin
 */

// Configuration - set these to match your conversation tool settings
define('SG_CONVERSATION_URL', 'https://conversation.smartergerman.com');
define('SG_JWT_SECRET', 'your-shared-secret-here');  // Must match JWT_SECRET env var

/**
 * Generate a signed URL for the conversation tool
 */
function sg_generate_conversation_url($course = '') {
    if (!is_user_logged_in()) {
        return '';
    }

    $user = wp_get_current_user();
    $exp = time() + 3600; // 1 hour

    $message = $user->user_email . '|' . $exp . '|' . $course;
    $sig = hash_hmac('sha256', $message, SG_JWT_SECRET);

    $params = http_build_query([
        'user' => $user->user_email,
        'exp' => $exp,
        'course' => $course,
        'sig' => $sig
    ]);

    return SG_CONVERSATION_URL . '?' . $params;
}

/**
 * Generate a JWT token for the conversation tool
 */
function sg_generate_jwt($course = '') {
    if (!is_user_logged_in()) {
        return '';
    }

    $user = wp_get_current_user();

    // Check if user is enrolled (LifterLMS)
    if (function_exists('llms_is_user_enrolled') && $course) {
        $course_id = get_page_by_path($course, OBJECT, 'course');
        if ($course_id && !llms_is_user_enrolled($user->ID, $course_id->ID)) {
            return ''; // Not enrolled
        }
    }

    $payload = [
        'sub' => $user->user_email,
        'iat' => time(),
        'exp' => time() + 3600,
        'course' => $course,
        'platform' => 'lifterlms',
        'name' => $user->display_name
    ];

    // Requires firebase/php-jwt package
    return \\Firebase\\JWT\\JWT::encode($payload, SG_JWT_SECRET, 'HS256');
}

/**
 * Shortcode to embed the conversation tool
 * Usage: [sg_conversation course="german-a1"]
 */
function sg_conversation_shortcode($atts) {
    $atts = shortcode_atts(['course' => ''], $atts);

    if (!is_user_logged_in()) {
        return '<p>Please log in to access the conversation practice tool.</p>';
    }

    $url = sg_generate_conversation_url($atts['course']);
    if (!$url) {
        return '<p>You need to be enrolled in this course to access the conversation tool.</p>';
    }

    return sprintf(
        '<iframe src="%s" width="100%%" height="700" frameborder="0" allow="microphone"></iframe>',
        esc_url($url)
    );
}
add_shortcode('sg_conversation', 'sg_conversation_shortcode');
'''
