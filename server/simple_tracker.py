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

import threading
import os
import datetime
import json
import inspect
import logging
from functools import wraps
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv(override=True)

logger = logging.getLogger(__name__)

# Configuration
# You can override these with environment variables
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "your-project-id")
DATASET_ID = os.environ.get("BQ_DATASET", "your-dataset-name")
TABLE_ID = os.environ.get("BQ_TABLE", "your-table-name")
DEMO_NAME = os.environ.get("DEMO_NAME", "your-app-name")
DEV_MODE = os.environ.get("DEV_MODE", "false") == "true"
class SimpleTracker:
    def __init__(self, demo_name=DEMO_NAME):
        self.demo_name = demo_name
        self.client = None
        self.table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

    def _get_client(self):
        if self.client is None:
            try:
                self.client = bigquery.Client(project=PROJECT_ID)
            except Exception as e:
                logger.warning("Could not initialize BigQuery client: %s", e)
        return self.client

    def _log_event(self, event_type, metadata=None):
        if DEV_MODE:
            logger.debug("DEV_MODE: Skipped BigQuery logging for '%s'", event_type)
            return

        client = self._get_client()
        if not client:
            logger.warning("BigQuery client not available, skipping event: %s", event_type)
            return

        rows = [{
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "demo_name": self.demo_name,
            "event_type": event_type,
            "metadata": json.dumps(metadata) if metadata else "{}"
        }]

        try:
            # insert_rows_json automatically handles the request
            errors = client.insert_rows_json(self.table_ref, rows)
            if errors:
                logger.error("BigQuery insert errors for event '%s': %s", event_type, errors)
            else:
                logger.debug("Logged event '%s' to BigQuery", event_type)
        except Exception as e:
            # Log but don't break the app - analytics shouldn't block the main flow
            logger.error("BigQuery error logging event '%s': %s", event_type, e)

    def __call__(self, event_type, metadata=None):
        def decorator(func):
            if inspect.iscoroutinefunction(func):
                @wraps(func)
                async def wrapper(*args, **kwargs):
                    # Run in background thread
                    threading.Thread(target=self._log_event, args=(event_type, metadata)).start()
                    return await func(*args, **kwargs)
                return wrapper
            else:
                @wraps(func)
                def wrapper(*args, **kwargs):
                    # Run in background thread
                    threading.Thread(target=self._log_event, args=(event_type, metadata)).start()
                    return func(*args, **kwargs)
                return wrapper
        return decorator

# Create the decorator instance
simpletrack = SimpleTracker()


def log_gdpr_consent(
    user_id: str,
    provider: str,
    jurisdiction: str,
    ip_address: str,
    user_agent: str = ""
) -> bool:
    """
    Log GDPR consent for international data transfer.

    This creates an audit trail for GDPR Article 49(1)(a) explicit consent.
    Records must be retained for minimum 3 years.

    Args:
        user_id: User identifier (email or anonymous ID)
        provider: AI provider name (e.g., "Alibaba Qwen")
        jurisdiction: Data processing jurisdiction (e.g., "China")
        ip_address: User's IP address for jurisdiction inference
        user_agent: Browser user agent string

    Returns:
        True if logged successfully, False otherwise
    """
    if DEV_MODE:
        logger.info(
            "DEV_MODE: GDPR consent logged locally - user=%s, provider=%s, jurisdiction=%s",
            user_id[:20] if user_id else "anonymous", provider, jurisdiction
        )
        return True

    tracker = SimpleTracker()
    client = tracker._get_client()

    if not client:
        logger.error("BigQuery not available - GDPR consent NOT logged for user %s", user_id[:20] if user_id else "anonymous")
        return False

    consent_data = {
        "consent_type": "gdpr_international_transfer",
        "user_id": user_id,
        "provider": provider,
        "jurisdiction": jurisdiction,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "legal_basis": "explicit_consent_art49_1a",
        "consent_text": f"User explicitly consented to data transfer to {jurisdiction} for processing by {provider}",
        "retention_years": 3
    }

    rows = [{
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "demo_name": tracker.demo_name,
        "event_type": "gdpr_consent",
        "metadata": json.dumps(consent_data)
    }]

    try:
        errors = client.insert_rows_json(tracker.table_ref, rows)
        if errors:
            logger.error("BigQuery insert errors for GDPR consent: %s", errors)
            return False
        logger.info(
            "GDPR consent logged: user=%s, provider=%s, jurisdiction=%s",
            user_id[:20] if user_id else "anonymous", provider, jurisdiction
        )
        return True
    except Exception as e:
        logger.error("BigQuery error logging GDPR consent: %s", e)
        return False
