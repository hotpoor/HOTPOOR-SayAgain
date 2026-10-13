"""Run through sudo on the host. Publish only the staged release and a narrow nginx route."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

PREFIX = "/hotpoor/sayagain/updates/android-watch/"
DESTINATION = Path("/var/www/sayagain-updates/android-watch")
NGINX = Path("/etc/nginx/conf.d/api.xialiwei.com.conf")
BLOCK = '''    # SayAgain watch updates: separate from API application services.
    location = /hotpoor/sayagain/updates/android-watch/stable.json {
        alias /var/www/sayagain-updates/android-watch/stable.json;
        default_type application/json;
        add_header Cache-Control "no-store" always;
        add_header Strict-Transport-Security "max-age=31536000" always;
        limit_except GET { deny all; }
    }
    location ^~ /hotpoor/sayagain/updates/android-watch/ {
        alias /var/www/sayagain-updates/android-watch/;
        autoindex off;
        default_type application/vnd.android.package-archive;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Strict-Transport-Security "max-age=31536000" always;
        limit_except GET { deny all; }
    }

'''


def deploy(stage):
    stage = stage.resolve(strict=True)
    if stage.parent != Path("/home/ubuntu") or not stage.name.startswith("sayagain-update-stage-"):
        raise ValueError("Unexpected staging directory")
    manifest = json.loads((stage / "stable.json").read_text(encoding="utf-8"))
    name, code = manifest["version_name"], manifest["version_code"]
    import re
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", name) or not isinstance(code, int) or code < 1:
        raise ValueError("Invalid release version")
    filename = f"sayagain-watch-{name}.apk"
    if manifest["apk_url"] != "https://api.xialiwei.com" + PREFIX + filename:
        raise ValueError("Invalid download address")
    apk = stage / filename
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    if apk.stat().st_size != manifest["size"] or digest != manifest["sha256"]:
        raise ValueError("Staged APK verification failed")
    DESTINATION.mkdir(parents=True, exist_ok=True)
    DESTINATION.chmod(0o755)
    existing = DESTINATION / "stable.json"
    if existing.exists():
        previous = json.loads(existing.read_text())
        if previous["version_code"] > code:
            raise ValueError("Refusing to publish an older version")
        if previous["version_code"] == code and previous["sha256"] != digest:
            raise ValueError("Same versionCode must not change APK bytes")
    final_apk = DESTINATION / filename
    if final_apk.exists() and hashlib.sha256(final_apk.read_bytes()).hexdigest() != digest:
        raise ValueError("Existing versioned APK must not be overwritten")
    if not final_apk.exists():
        temporary = DESTINATION / (filename + ".tmp")
        shutil.copyfile(apk, temporary); temporary.chmod(0o644)
        with temporary.open("rb") as stream: os.fsync(stream.fileno())
        os.replace(temporary, final_apk)
    temporary = DESTINATION / "stable.json.tmp"
    shutil.copyfile(stage / "stable.json", temporary); temporary.chmod(0o644)
    with temporary.open("rb") as stream: os.fsync(stream.fileno())
    os.replace(temporary, existing)
    # Extend the current live configuration; never reuse an earlier snapshot of other API routes.
    before = NGINX.read_text()
    if PREFIX not in before:
        marker = "    location / {"
        if before.count(marker) != 1:
            raise ValueError("Ambiguous nginx configuration")
        backup = NGINX.with_name(NGINX.name + ".before-sayagain-" + uuid.uuid4().hex)
        shutil.copy2(NGINX, backup)
        NGINX.write_text(before.replace(marker, BLOCK + marker, 1))
        try:
            subprocess.run(["nginx", "-t"], check=True)
            subprocess.run(["systemctl", "reload", "nginx"], check=True)
        except BaseException:
            shutil.copy2(backup, NGINX)
            subprocess.run(["nginx", "-t"], check=True)
            raise
    print(f"Published SayAgain {name} ({code}), SHA256 {digest}")


if __name__ == "__main__":
    with open("/run/lock/sayagain-update.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        deploy(Path(sys.argv[1]))
