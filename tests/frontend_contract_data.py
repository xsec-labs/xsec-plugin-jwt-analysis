from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
os.environ["PLUGIN_ROOT"] = str(ROOT)

from jwt_analysis_mcp.engine import run_job
from jwt_analysis_mcp.reports import report
from jwt_analysis_mcp.settings import DEFAULTS, merge
from jwt_analysis_mcp.store import Store
from jwt_analysis_mcp.jwt_tool_adapter import diagnostics
from jwt_analysis_mcp.server import _handle


def encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="xsec-jwt-frontend-contract-") as directory:
        temporary = Path(directory)
        os.environ["PLUGIN_DATA"] = str(temporary / "data")
        store = Store(os.environ["PLUGIN_DATA"])
        secret = b"frontend-contract-local-key"
        body = encode(b'{"alg":"HS256","typ":"JWT"}') + "." + encode(
            '{"sub":"本地契约验收","exp":4102444800}'.encode()
        )
        signed = body + "." + encode(hmac.new(secret, body.encode(), hashlib.sha256).digest())
        dictionary = temporary / "dictionary.txt"
        dictionary.write_bytes(b"wrong\n" + secret + b"\n")
        source = {"items": [{"token": signed, "source": "test"}], "profile": "passive"}
        identifier = store.create_job("frontend-contract-project", "passive", source)
        run_job(identifier, source, {"wordlists": ["custom"], "custom_wordlists": [str(dictionary)]},
                store, lambda: store.cancelled(identifier))
        job = store.job("frontend-contract-project", identifier)
        weak = next(row for row in job["tests"] if row["test_id"] == "weak-secret")
        assert weak["status"] == "vulnerable"
        evidence = store.evidence_get("frontend-contract-project", weak["evidence_id"], False)
        assert evidence["evidence"]["secret"] == "[REDACTED]"
        bad_source = {"items": [{"token": "invalid-token", "source": "test"}], "profile": "passive"}
        malformed = store.create_job("frontend-contract-project", "passive", bad_source)
        run_job(malformed, bad_source, {"wordlists": []}, store, lambda: store.cancelled(malformed))
        cancelled = store.create_job("frontend-contract-project", "passive", source)
        assert store.cancel("frontend-contract-project", cancelled)
        interrupted = store.create_job("frontend-contract-project", "passive", source)
        store.recover_interrupted()
        print(json.dumps({
            "projectId": "frontend-contract-project", "jobId": identifier, "job": job,
            "jobs": {"items": store.list_jobs("frontend-contract-project", 100)},
            "emptyJobs": {"items": store.list_jobs("frontend-contract-empty", 100)},
            "events": store.events("frontend-contract-project", identifier, 0, 200),
            "evidence": evidence, "report": report(job, "markdown"), "diagnostics": diagnostics(),
            "otherJobs": [store.job("frontend-contract-project", row) for row in [malformed, cancelled, interrupted]],
            "settings": DEFAULTS, "partialSettings": merge({"rate_limit": 60}),
            "mcpDiagnostics": _handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                                      "params": {"name": "jwt_analysis_diagnostics"}})["result"],
            "mcpUnknownTool": _handle({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                                      "params": {"name": "frontend_contract_unknown"}})["result"],
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
