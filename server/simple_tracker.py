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
