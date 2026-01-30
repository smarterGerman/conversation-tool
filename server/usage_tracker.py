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
Per-User Usage Tracking

Tracks how much time each user has spent in conversation sessions
and enforces daily limits.
"""

import os
import time
import logging
from typing import Dict, Optional
from datetime import datetime, timezone
from collections import defaultdict

logger = logging.getLogger(__name__)

# Daily limit in seconds (default 1 hour = 3600 seconds)
DAILY_USER_LIMIT = int(os.getenv("DAILY_USER_LIMIT", "3600"))

# In-memory storage for usage tracking
# In production, consider using Redis for multi-instance support
# Format: {user_id: {date: total_seconds_used}}
_user_usage: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))

# Active sessions tracking
# Format: {session_id: {user_id, start_time}}
_active_sessions: Dict[str, Dict] = {}


def _get_today() -> str:
    """Get today's date string in UTC"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _cleanup_old_data():
    """Remove usage data older than 7 days to prevent memory growth"""
    today = datetime.now(timezone.utc)
    for user_id in list(_user_usage.keys()):
        for date_str in list(_user_usage[user_id].keys()):
            try:
                date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if (today - date).days > 7:
                    del _user_usage[user_id][date_str]
            except ValueError:
                pass
        # Remove user if no usage data left
        if not _user_usage[user_id]:
            del _user_usage[user_id]


def get_user_usage_today(user_id: str) -> float:
    """Get total seconds used by user today"""
    today = _get_today()
    return _user_usage[user_id][today]


def get_user_remaining_today(user_id: str) -> float:
    """Get remaining seconds available for user today"""
    used = get_user_usage_today(user_id)
    remaining = max(0, DAILY_USER_LIMIT - used)
    return remaining


def can_user_start_session(user_id: str) -> tuple[bool, str]:
    """
    Check if user can start a new session.

    Returns:
        (allowed: bool, message: str)
    """
    if not user_id:
        return True, "No user tracking (anonymous)"

    remaining = get_user_remaining_today(user_id)

    if remaining <= 0:
        return False, f"Daily limit of {DAILY_USER_LIMIT // 60} minutes reached. Try again tomorrow."

    if remaining < 60:  # Less than 1 minute remaining
        return False, f"Only {int(remaining)} seconds remaining today. Try again tomorrow."

    return True, f"{int(remaining // 60)} minutes remaining today"


def start_session(session_id: str, user_id: str) -> None:
    """Record the start of a session"""
    _cleanup_old_data()

    _active_sessions[session_id] = {
        "user_id": user_id,
        "start_time": time.time()
    }
    logger.info(f"Session started for user {user_id[:20]}... (session: {session_id[:8]})")


def end_session(session_id: str) -> Optional[float]:
    """
    Record the end of a session and return duration.

    Returns:
        Duration in seconds, or None if session not found
    """
    session = _active_sessions.pop(session_id, None)
    if not session:
        return None

    user_id = session["user_id"]
    start_time = session["start_time"]
    duration = time.time() - start_time

    # Record usage
    today = _get_today()
    _user_usage[user_id][today] += duration

    total_today = _user_usage[user_id][today]
    logger.info(
        f"Session ended for user {user_id[:20]}... "
        f"Duration: {duration:.0f}s, Total today: {total_today:.0f}s"
    )

    return duration


def get_max_session_duration(user_id: str, session_time_limit: int = 300) -> int:
    """
    Get the maximum allowed session duration for a user based on remaining time.

    Args:
        user_id: User identifier
        session_time_limit: Maximum session time in seconds (default 300)

    Returns:
        Maximum seconds allowed (capped at session_time_limit)
    """
    if not user_id:
        return session_time_limit

    remaining = get_user_remaining_today(user_id)
    return min(int(remaining), session_time_limit)


# Singleton-like access
class UsageTracker:
    """Wrapper class for usage tracking functions"""

    @staticmethod
    def can_start(user_id: str) -> tuple[bool, str]:
        return can_user_start_session(user_id)

    @staticmethod
    def start(session_id: str, user_id: str) -> None:
        start_session(session_id, user_id)

    @staticmethod
    def end(session_id: str) -> Optional[float]:
        return end_session(session_id)

    @staticmethod
    def get_remaining(user_id: str) -> float:
        return get_user_remaining_today(user_id)

    @staticmethod
    def get_max_duration(user_id: str) -> int:
        return get_max_session_duration(user_id)


usage_tracker = UsageTracker()
