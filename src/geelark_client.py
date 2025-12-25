import hashlib
import mimetypes
import os
import time
import uuid
from typing import Dict, List, Optional, Any

import requests


class GeeLarkError(Exception):
    pass


class GeeLarkClient:
    def __init__(self, api_base: str, api_key: str, app_id: str = None):
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.app_id = app_id
        # Determine auth mode: if app_id provided, use key verification; else token verification
        self.use_key_auth = app_id is not None

    def _generate_trace_id(self) -> str:
        """Generate a UUID trace ID with dashes for request tracking"""
        return str(uuid.uuid4())

    def _generate_signature(self, trace_id: str, ts: str, nonce: str) -> str:
        """Generate SHA256 signature for key verification"""
        # sign = SHA256(appId + traceId + ts + nonce + apiKey)
        concat = f"{self.app_id}{trace_id}{ts}{nonce}{self.api_key}"
        return hashlib.sha256(concat.encode()).hexdigest().upper()

    def _headers(self) -> Dict[str, str]:
        trace_id = self._generate_trace_id()
        
        if self.use_key_auth:
            # Key verification mode
            ts = str(int(time.time() * 1000))  # milliseconds
            nonce = trace_id.replace("-", "")[:6]  # first 6 chars without dashes
            sign = self._generate_signature(trace_id, ts, nonce)
            
            return {
                "Content-Type": "application/json",
                "appId": self.app_id,
                "traceId": trace_id,
                "ts": ts,
                "nonce": nonce,
                "sign": sign,
            }
        else:
            # Token verification mode (simpler)
            return {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "traceId": trace_id,
            }

    def _post(self, path: str, json: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.api_base}{path}"
        resp = requests.post(url, json=json, headers=self._headers(), timeout=60)
        try:
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001
            raise GeeLarkError(f"Non-JSON response: {resp.status_code} {resp.text}") from exc

        if resp.status_code != 200 or payload.get("code") != 0:
            raise GeeLarkError(f"API error: status={resp.status_code} code={payload.get('code')} msg={payload.get('msg')}")
        return payload["data"]

    def get_upload_url(self, file_type: str) -> Dict[str, str]:
        data = self._post("/open/v1/upload/getUrl", {"fileType": file_type})
        # returns { uploadUrl, resourceUrl }
        return data

    def upload_file_via_put(self, upload_url: str, file_path: str) -> None:
        with open(file_path, "rb") as f:
            resp = requests.put(upload_url, data=f, timeout=120)
        if resp.status_code not in (200, 201):
            raise GeeLarkError(f"Upload failed: {resp.status_code} {resp.text}")

    def add_tasks(self, task_type: int, tasks: List[Dict[str, Any]], plan_name: Optional[str] = None, remark: Optional[str] = None) -> List[str]:
        body: Dict[str, Any] = {
            "taskType": task_type,
            "list": tasks,
        }
        if plan_name:
            body["planName"] = plan_name
        if remark:
            body["remark"] = remark
        data = self._post("/open/v1/task/add", body)
        return data.get("taskIds", [])

    def list_phones(
        self,
        page: int = 1,
        page_size: int = 100,
        ids: Optional[List[str]] = None,
        serial_name: Optional[str] = None,
        remark: Optional[str] = None,
        group_name: Optional[str] = None,
        tags: Optional[List[str]] = None,
        charge_mode: Optional[int] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "page": max(1, page),
            "pageSize": min(100, max(1, page_size)),
        }
        if ids:
            payload["ids"] = ids[:100]
        if serial_name:
            payload["serialName"] = serial_name
        if remark:
            payload["remark"] = remark
        if group_name:
            payload["groupName"] = group_name
        if tags:
            payload["tags"] = tags
        if charge_mode is not None:
            payload["chargeMode"] = int(charge_mode)
        return self._post("/open/v1/phone/list", payload)

    @staticmethod
    def infer_file_type(path: str) -> str:
        ext = os.path.splitext(path)[1].lower().lstrip(".")
        if ext:
            return ext
        guessed, _ = mimetypes.guess_type(path)
        if guessed and "/" in guessed:
            return guessed.split("/")[-1]
        return "jpg"

    @staticmethod
    def schedule_timestamp(minutes_from_now: int) -> int:
        return int(time.time()) + minutes_from_now * 60

