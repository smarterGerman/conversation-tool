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
Redis Storage Abstraction

Provides Redis-backed storage with automatic fallback to in-memory storage
when Redis is unavailable. Designed for multi-instance Cloud Run deployments.

Usage:
    from server.redis_storage import get_storage
    storage = get_storage()

    # Key-value with TTL
    storage.set("key", "value", ttl=60)
    value = storage.get("key")
    storage.delete("key")

    # Atomic increment (for counters/rate limiting)
    count = storage.incr("counter", ttl=60)
"""

import os
import json
import time
import logging
import threading
from typing import Any, Dict, Optional
from collections import defaultdict

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "")


class MemoryStorage:
    """In-memory storage fallback (not shared across instances)"""

    def __init__(self):
        self._data: Dict[str, tuple[Any, float]] = {}  # key -> (value, expires_at)
        self._lock = threading.Lock()
        self._is_redis = False
        logger.warning("Using in-memory storage (not suitable for multi-instance deployments)")

    def _cleanup(self):
        """Remove expired keys"""
        now = time.time()
        with self._lock:
            expired = [k for k, (v, exp) in self._data.items() if exp and exp < now]
            for k in expired:
                del self._data[k]

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a key with optional TTL (seconds)"""
        self._cleanup()
        expires_at = time.time() + ttl if ttl else None
        with self._lock:
            self._data[key] = (value, expires_at)
        return True

    def get(self, key: str) -> Optional[Any]:
        """Get a key value, returns None if not found or expired"""
        self._cleanup()
        with self._lock:
            if key not in self._data:
                return None
            value, expires_at = self._data[key]
            if expires_at and expires_at < time.time():
                del self._data[key]
                return None
            return value

    def delete(self, key: str) -> bool:
        """Delete a key, returns True if key existed"""
        with self._lock:
            if key in self._data:
                del self._data[key]
                return True
            return False

    def get_and_delete(self, key: str) -> Optional[Any]:
        """Get a key and delete it atomically (for one-time tokens)"""
        with self._lock:
            if key not in self._data:
                return None
            value, expires_at = self._data.pop(key)
            if expires_at and expires_at < time.time():
                return None
            return value

    def incr(self, key: str, ttl: Optional[int] = None) -> int:
        """Atomically increment a counter, initializing to 0 if not exists"""
        with self._lock:
            current = 0
            if key in self._data:
                value, expires_at = self._data[key]
                if not expires_at or expires_at >= time.time():
                    current = int(value)
            new_value = current + 1
            expires_at = time.time() + ttl if ttl else None
            self._data[key] = (new_value, expires_at)
            return new_value

    def incrby(self, key: str, amount: float, ttl: Optional[int] = None) -> float:
        """Atomically increment by amount (for usage tracking)"""
        with self._lock:
            current = 0.0
            if key in self._data:
                value, expires_at = self._data[key]
                if not expires_at or expires_at >= time.time():
                    current = float(value)
            new_value = current + amount
            expires_at = time.time() + ttl if ttl else None
            self._data[key] = (new_value, expires_at)
            return new_value

    def get_float(self, key: str) -> float:
        """Get a float value, returns 0.0 if not found"""
        value = self.get(key)
        if value is None:
            return 0.0
        return float(value)

    def set_json(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a JSON-serializable value"""
        return self.set(key, json.dumps(value), ttl)

    def get_json(self, key: str) -> Optional[Any]:
        """Get a JSON value"""
        value = self.get(key)
        if value is None:
            return None
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return None


class RedisStorage:
    """Redis-backed storage for multi-instance deployments"""

    def __init__(self, redis_url: str):
        import redis
        self._client = redis.from_url(redis_url, decode_responses=True)
        self._is_redis = True
        # Test connection
        self._client.ping()
        logger.info("Redis storage initialized successfully")

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a key with optional TTL (seconds)"""
        try:
            if ttl:
                self._client.setex(key, ttl, str(value))
            else:
                self._client.set(key, str(value))
            return True
        except Exception as e:
            logger.error(f"Redis SET error: {e}")
            return False

    def get(self, key: str) -> Optional[str]:
        """Get a key value"""
        try:
            return self._client.get(key)
        except Exception as e:
            logger.error(f"Redis GET error: {e}")
            return None

    def delete(self, key: str) -> bool:
        """Delete a key"""
        try:
            return self._client.delete(key) > 0
        except Exception as e:
            logger.error(f"Redis DELETE error: {e}")
            return False

    def get_and_delete(self, key: str) -> Optional[str]:
        """Get a key and delete it atomically (for one-time tokens)"""
        try:
            # Use GETDEL command (Redis 6.2+) or pipeline
            pipe = self._client.pipeline()
            pipe.get(key)
            pipe.delete(key)
            result = pipe.execute()
            return result[0]
        except Exception as e:
            logger.error(f"Redis GET_AND_DELETE error: {e}")
            return None

    def incr(self, key: str, ttl: Optional[int] = None) -> int:
        """Atomically increment a counter"""
        try:
            pipe = self._client.pipeline()
            pipe.incr(key)
            if ttl:
                pipe.expire(key, ttl)
            result = pipe.execute()
            return result[0]
        except Exception as e:
            logger.error(f"Redis INCR error: {e}")
            return 0

    def incrby(self, key: str, amount: float, ttl: Optional[int] = None) -> float:
        """Atomically increment by amount (for usage tracking)"""
        try:
            pipe = self._client.pipeline()
            pipe.incrbyfloat(key, amount)
            if ttl:
                pipe.expire(key, ttl)
            result = pipe.execute()
            return result[0]
        except Exception as e:
            logger.error(f"Redis INCRBYFLOAT error: {e}")
            return 0.0

    def get_float(self, key: str) -> float:
        """Get a float value, returns 0.0 if not found"""
        value = self.get(key)
        if value is None:
            return 0.0
        try:
            return float(value)
        except (ValueError, TypeError):
            return 0.0

    def set_json(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a JSON-serializable value"""
        return self.set(key, json.dumps(value), ttl)

    def get_json(self, key: str) -> Optional[Any]:
        """Get a JSON value"""
        value = self.get(key)
        if value is None:
            return None
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return None


# Singleton storage instance
_storage_instance = None
_storage_lock = threading.Lock()


def get_storage():
    """Get the storage instance (Redis if available, memory fallback)"""
    global _storage_instance

    if _storage_instance is not None:
        return _storage_instance

    with _storage_lock:
        if _storage_instance is not None:
            return _storage_instance

        if REDIS_URL:
            try:
                _storage_instance = RedisStorage(REDIS_URL)
                return _storage_instance
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                logger.warning("Falling back to in-memory storage")

        _storage_instance = MemoryStorage()
        return _storage_instance


def is_redis_available() -> bool:
    """Check if Redis storage is being used"""
    storage = get_storage()
    return getattr(storage, '_is_redis', False)
