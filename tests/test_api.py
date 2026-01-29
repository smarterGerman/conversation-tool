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

"""Tests for the FastAPI backend endpoints."""

import os
import pytest
from unittest.mock import patch, MagicMock

# Set test environment variables before importing the app
os.environ["DEV_MODE"] = "true"
os.environ["PROJECT_ID"] = "test-project"

from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client with mocked dependencies."""
    # Mock the Google Cloud dependencies
    with patch("server.main.get_project_id", return_value="test-project"):
        with patch("server.main.RecaptchaValidator"):
            from server.main import app
            yield TestClient(app)


class TestStatusEndpoint:
    """Tests for /api/status endpoint."""

    def test_status_returns_mode(self, client):
        """Test that status endpoint returns configuration mode."""
        response = client.get("/api/status")
        assert response.status_code == 200
        data = response.json()
        assert "mode" in data
        assert "missing" in data
        assert data["mode"] in ["simple", "production"]

    def test_status_includes_session_time_limit(self, client):
        """Test that status includes session time limit."""
        response = client.get("/api/status")
        assert response.status_code == 200
        data = response.json()
        assert "session_time_limit" in data
        assert isinstance(data["session_time_limit"], int)


class TestAuthEndpoint:
    """Tests for /api/auth endpoint."""

    def test_auth_returns_session_token(self, client):
        """Test that auth endpoint returns a session token in dev mode."""
        response = client.post("/api/auth", json={})
        assert response.status_code == 200
        data = response.json()
        assert "session_token" in data
        assert "session_time_limit" in data
        # Token should be a URL-safe base64 string (from secrets.token_urlsafe)
        assert len(data["session_token"]) > 20

    def test_auth_token_is_unique(self, client):
        """Test that each auth call returns a unique token."""
        response1 = client.post("/api/auth", json={})
        response2 = client.post("/api/auth", json={})
        assert response1.json()["session_token"] != response2.json()["session_token"]


class TestSecurityHeaders:
    """Tests for security headers."""

    def test_security_headers_present(self, client):
        """Test that security headers are present in responses."""
        response = client.get("/api/status")
        assert response.status_code == 200

        # Check security headers
        assert response.headers.get("X-Frame-Options") == "DENY"
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
        assert response.headers.get("X-XSS-Protection") == "1; mode=block"
        assert "Referrer-Policy" in response.headers


class TestWebSocketEndpoint:
    """Tests for WebSocket endpoint."""

    def test_websocket_requires_token(self, client):
        """Test that WebSocket endpoint rejects connections without token."""
        with pytest.raises(Exception):
            # This should fail because no valid token is provided
            with client.websocket_connect("/ws"):
                pass

    def test_websocket_rejects_invalid_token(self, client):
        """Test that WebSocket endpoint rejects invalid tokens."""
        with pytest.raises(Exception):
            with client.websocket_connect("/ws?token=invalid-token"):
                pass


class TestTokenManagement:
    """Tests for token management functions."""

    def test_token_functions_are_thread_safe(self):
        """Test that token functions use proper locking."""
        from server.main import add_token, consume_token, cleanup_tokens

        # Add a token
        test_token = "test-token-123"
        add_token(test_token)

        # Consume should return True first time
        assert consume_token(test_token) is True

        # Consume should return False second time (one-time use)
        assert consume_token(test_token) is False

    def test_cleanup_removes_expired_tokens(self):
        """Test that cleanup removes expired tokens."""
        import time
        from server.main import valid_tokens, add_token, cleanup_tokens, TOKEN_EXPIRY_SECONDS, _token_lock

        # Add a token with old timestamp
        old_token = "old-token"
        with _token_lock:
            valid_tokens[old_token] = time.time() - TOKEN_EXPIRY_SECONDS - 10

        cleanup_tokens()

        with _token_lock:
            assert old_token not in valid_tokens
