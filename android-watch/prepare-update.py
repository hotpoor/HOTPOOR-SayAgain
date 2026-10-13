"""Create a release manifest from the APK build's actual AndroidManifest.xml."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET


def prepare(build: Path, notes: str):
    root = ET.parse(build / "AndroidManifest.xml").getroot()
    ns = "{http://schemas.android.com/apk/res/android}"
    name = root.get(ns + "versionName")
    code = int(root.get(ns + "versionCode"))
    import re
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", name):
        raise ValueError("Release version must use three numeric components")
    if root.get("package") != "world.hotpoor.sayagain.watch" or code < 1:
        raise ValueError("Wrong app identity")
    source = build / "sayagain-watch-debug.apk"
    data = source.read_bytes()
    if not 0 < len(data) <= 32 * 1024 * 1024:
        raise ValueError("APK size exceeds updater limit")
    target = build / "release"
    target.mkdir(exist_ok=True)
    filename = f"sayagain-watch-{name}.apk"
    shutil.copyfile(source, target / filename)
    manifest = {
        "schema": "sayagain-watch-update-v1", "package_name": root.get("package"),
        "version_code": code, "version_name": name,
        "min_sdk": int(root.find("uses-sdk").get(ns + "minSdkVersion")),
        "apk_url": "https://api.xialiwei.com/hotpoor/sayagain/updates/android-watch/" + filename,
        "size": len(data), "sha256": hashlib.sha256(data).hexdigest(), "notes": notes,
    }
    (target / "stable.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {name} ({code}): {len(data)} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", type=Path, default=Path(__file__).parent / "build")
    parser.add_argument("--notes", default="支持检查更新、下载校验和系统确认安装；保留本地录音。")
    args = parser.parse_args()
    prepare(args.build, args.notes)
