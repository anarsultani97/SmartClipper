"""Configure owner-provided OAuth registrations locally without printing secrets."""

import argparse
import getpass
import os
import re
import secrets
import tempfile
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env"
PREFIX = "SMARTCLIPPER_"
PROVIDERS = {
    "google": ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    "facebook": ("FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET", "FACEBOOK_API_VERSION"),
}


def quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def write_values(updates: dict[str, str]) -> None:
    original = ENV.read_text(encoding="utf-8") if ENV.exists() else ""
    lines = original.splitlines()
    for key, value in updates.items():
        pattern = re.compile(rf"^\s*(?:export\s+)?{re.escape(key)}\s*=")
        indexes = [i for i, line in enumerate(lines) if pattern.match(line)]
        if indexes:
            lines[indexes[0]] = f"{key}={quote(value)}"
            for index in reversed(indexes[1:]):
                del lines[index]
        else:
            lines.append(f"{key}={quote(value)}")
    # Replace only after the entire new file has been written successfully.
    cache = ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".oauth-", dir=cache)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("\n".join(lines) + "\n")
        os.replace(temporary, ENV)
    finally:
        Path(temporary).unlink(missing_ok=True)


def check() -> None:
    values = dotenv_values(ENV)
    for provider, keys in PROVIDERS.items():
        missing = [PREFIX + key for key in keys if not values.get(PREFIX + key)]
        status = "missing " + ", ".join(missing) if missing else "credentials present"
        print(f"{provider.title()}: {status}")
    persistent = values.get(PREFIX + "SESSION_SECRET") or ""
    status = "present (32+ characters)" if len(persistent) >= 32 else "needs setup"
    print(f"Persistent session secret: {status}")
    origin = (values.get(PREFIX + "PUBLIC_URL") or "http://127.0.0.1:5173").rstrip("/")
    for provider in PROVIDERS:
        print(f"Callback: {origin}/api/v1/auth/{provider}/callback")
    print("Presence does not verify consent. Restart the API, then test the real providers.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="Report presence only; never print secrets"
    )
    parser.add_argument("--provider", choices=["all", *PROVIDERS], default="all")
    args = parser.parse_args()
    if args.check:
        check()
        return
    print("Use your own Google Cloud / Meta app credentials. Do not paste secrets in chat.")
    selected = PROVIDERS if args.provider == "all" else {args.provider: PROVIDERS[args.provider]}
    updates = {}
    for keys in selected.values():
        for key in keys:
            prompt = key.replace("_", " ").title() + ": "
            value = (getpass.getpass(prompt) if key.endswith("SECRET") else input(prompt)).strip()
            if not value or any(c in value for c in "\n\r\x00"):
                raise SystemExit("Invalid or empty value; no changes saved.")
            if key == "GOOGLE_CLIENT_ID" and not value.endswith(".apps.googleusercontent.com"):
                raise SystemExit("Expected a Google Web application client ID; no changes saved.")
            if key == "FACEBOOK_CLIENT_ID" and not value.isascii():
                raise SystemExit("Expected a numeric Meta app ID; no changes saved.")
            if key == "FACEBOOK_CLIENT_ID" and not value.isdigit():
                raise SystemExit("Expected a numeric Meta app ID; no changes saved.")
            if key == "FACEBOOK_API_VERSION" and not re.fullmatch(r"v\d+\.\d+", value):
                raise SystemExit("Use your Meta app's supported vXX.X version; no changes saved.")
            updates[PREFIX + key] = value
    values = dotenv_values(ENV)
    if len(values.get(PREFIX + "SESSION_SECRET") or "") < 32:
        updates[PREFIX + "SESSION_SECRET"] = secrets.token_urlsafe(48)
        print("Creating a persistent session secret. Existing sessions will need to sign in again.")
    write_values(updates)
    print("Saved to ignored .env. Restart the API. Register the callbacks below in each dashboard.")
    check()


if __name__ == "__main__":
    main()
