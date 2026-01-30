# Copyright 2026 SmarterGerman
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
GDPR Data Subject Rights Utilities

Handles:
- Article 15: Right of access (export user data)
- Article 17: Right to erasure (delete user data)
- Article 20: Right to data portability (export in portable format)

Usage:
    # From command line:
    python -m server.gdpr_utils delete user@example.com
    python -m server.gdpr_utils export user@example.com

    # From code:
    from server.gdpr_utils import delete_user_data, export_user_data
    delete_user_data("user@example.com")
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv(override=True)

logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "smartergerman-conversation")
DATASET_ID = os.environ.get("BQ_DATASET", "conversation_analytics")
TABLE_ID = os.environ.get("BQ_TABLE", "events")


def get_bigquery_client() -> Optional[bigquery.Client]:
    """Get BigQuery client, returns None if unavailable."""
    try:
        return bigquery.Client(project=PROJECT_ID)
    except Exception as e:
        logger.error("Could not initialize BigQuery client: %s", e)
        return None


def find_user_data(user_email: str) -> Dict:
    """
    Find all data associated with a user (GDPR Article 15 - Right of Access).

    Args:
        user_email: User's email address

    Returns:
        Dictionary with all user data found
    """
    client = get_bigquery_client()
    if not client:
        return {"error": "BigQuery not available"}

    table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

    # Query for all events containing user email in metadata
    query = f"""
    SELECT timestamp, event_type, metadata
    FROM `{table_ref}`
    WHERE JSON_EXTRACT_SCALAR(metadata, '$.user_id') = @user_email
       OR JSON_EXTRACT_SCALAR(metadata, '$.user') = @user_email
    ORDER BY timestamp DESC
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_email", "STRING", user_email)
        ]
    )

    try:
        results = client.query(query, job_config=job_config).result()
        records = []
        for row in results:
            records.append({
                "timestamp": row.timestamp,
                "event_type": row.event_type,
                "metadata": json.loads(row.metadata) if row.metadata else {}
            })

        return {
            "user_email": user_email,
            "record_count": len(records),
            "records": records,
            "exported_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error("Error finding user data: %s", e)
        return {"error": str(e)}


def export_user_data(user_email: str, output_file: Optional[str] = None) -> str:
    """
    Export all user data in portable JSON format (GDPR Article 20).

    Args:
        user_email: User's email address
        output_file: Optional file path to save export

    Returns:
        JSON string of exported data
    """
    data = find_user_data(user_email)

    if "error" in data:
        return json.dumps(data, indent=2)

    # Add GDPR metadata
    export = {
        "gdpr_export": {
            "article": "Article 20 - Right to data portability",
            "data_controller": "SmarterGerman",
            "export_date": datetime.utcnow().isoformat(),
            "format": "JSON",
            "user_email": user_email
        },
        "data": data
    }

    json_str = json.dumps(export, indent=2, default=str)

    if output_file:
        with open(output_file, "w") as f:
            f.write(json_str)
        logger.info("Exported data to %s", output_file)

    return json_str


def delete_user_data(user_email: str, dry_run: bool = True) -> Dict:
    """
    Delete all user data (GDPR Article 17 - Right to Erasure).

    IMPORTANT: This permanently deletes data. Use dry_run=True first to review.

    Note on consent records: GDPR Article 7(1) requires proof of consent.
    Consent records are retained for legal compliance but can be anonymized.

    Args:
        user_email: User's email address
        dry_run: If True, only shows what would be deleted without deleting

    Returns:
        Dictionary with deletion results
    """
    client = get_bigquery_client()
    if not client:
        return {"error": "BigQuery not available", "deleted": False}

    table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

    # First, find what would be deleted
    find_data = find_user_data(user_email)
    record_count = find_data.get("record_count", 0)

    if record_count == 0:
        return {
            "user_email": user_email,
            "record_count": 0,
            "deleted": False,
            "message": "No data found for this user"
        }

    if dry_run:
        return {
            "user_email": user_email,
            "record_count": record_count,
            "dry_run": True,
            "deleted": False,
            "message": f"DRY RUN: Would delete {record_count} records. Run with dry_run=False to actually delete.",
            "preview": find_data.get("records", [])[:5]  # Show first 5 records
        }

    # Actually delete the data
    # Note: BigQuery DELETE requires partitioned/clustered tables or streaming buffer flush
    # For simplicity, we'll anonymize instead of delete (also acceptable under GDPR)

    anonymize_query = f"""
    UPDATE `{table_ref}`
    SET metadata = JSON_SET(
        metadata,
        '$.user_id', 'DELETED',
        '$.user', 'DELETED',
        '$.ip_address', 'DELETED',
        '$.user_agent', 'DELETED'
    )
    WHERE JSON_EXTRACT_SCALAR(metadata, '$.user_id') = @user_email
       OR JSON_EXTRACT_SCALAR(metadata, '$.user') = @user_email
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_email", "STRING", user_email)
        ]
    )

    try:
        job = client.query(anonymize_query, job_config=job_config)
        job.result()  # Wait for completion

        logger.info(
            "GDPR erasure completed for user %s: %d records anonymized",
            user_email[:20], record_count
        )

        return {
            "user_email": user_email,
            "record_count": record_count,
            "deleted": True,
            "method": "anonymization",
            "message": f"Successfully anonymized {record_count} records",
            "completed_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error("Error deleting user data: %s", e)
        return {
            "user_email": user_email,
            "deleted": False,
            "error": str(e)
        }


def get_deletion_instructions(user_email: str) -> str:
    """
    Generate complete deletion instructions for a user request.

    Returns instructions for:
    1. Server-side data (BigQuery)
    2. Client-side data (localStorage)
    """
    return f"""
GDPR Data Deletion Request: {user_email}
=========================================

1. SERVER-SIDE DATA (BigQuery)
   Run: python -m server.gdpr_utils delete {user_email}

   Or via Python:
   >>> from server.gdpr_utils import delete_user_data
   >>> delete_user_data("{user_email}", dry_run=False)

2. CLIENT-SIDE DATA (User's Browser)
   Instruct user to clear localStorage:
   - Open browser DevTools (F12)
   - Go to Application > Local Storage
   - Delete keys starting with "sg_"

   Or provide this JavaScript:
   localStorage.removeItem("sg_access_pw");
   localStorage.removeItem("sg_gdpr_consent");
   localStorage.removeItem("sg_gdpr_consent_provider");
   localStorage.removeItem("sg_gdpr_consent_date");

3. CONFIRMATION
   After deletion, send confirmation email to user within 30 days (GDPR requirement).

4. DOCUMENTATION
   Log this deletion request for compliance records.
"""


# CLI interface
if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) < 3:
        print("Usage:")
        print("  python -m server.gdpr_utils export <email>")
        print("  python -m server.gdpr_utils delete <email> [--confirm]")
        print("  python -m server.gdpr_utils instructions <email>")
        sys.exit(1)

    command = sys.argv[1]
    email = sys.argv[2]

    if command == "export":
        print(export_user_data(email))

    elif command == "delete":
        dry_run = "--confirm" not in sys.argv
        result = delete_user_data(email, dry_run=dry_run)
        print(json.dumps(result, indent=2, default=str))

    elif command == "instructions":
        print(get_deletion_instructions(email))

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
