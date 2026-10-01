"""Opaque, revocable sessions and provider identities. Never merge accounts by email."""

import hashlib
import re
import secrets
import time
from collections import defaultdict, deque
from urllib.parse import urlencode
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from .database import Identity, LoginSession, Project, User
from .schemas import Credentials, SignupCredentials

hasher = PasswordHasher()
# Equal-cost verification even for an unknown email.
dummy_hash = hasher.hash(secrets.token_urlsafe(32))
COOKIE = "smartclipper_session"


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def require_user(request: Request):
    token = request.cookies.get(COOKIE, "")
    with request.app.state.sessions() as db:
        login = db.get(LoginSession, digest(token)) if token else None
        if not login or login.expires_at <= time.time():
            raise HTTPException(401, "Please sign in to continue.")
        if request.method not in {"GET", "HEAD", "OPTIONS"} and not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), login.csrf
        ):
            raise HTTPException(403, "Refresh the page before trying again.")
        user = db.get(User, login.user_id)
        if not user:
            raise HTTPException(401, "Please sign in to continue.")
        return user


def require_account(request: Request):
    user = require_user(request)
    if user.is_guest:
        raise HTTPException(401, "Sign in to download your shorts.")
    return user


def safe_return_path(path):
    if path in {"/", "/activity"} or re.fullmatch(
        r"/projects/[a-zA-Z0-9-]+(?:/shorts)?(?:\?thumbnail=[a-zA-Z0-9-]+)?", path
    ):
        return path
    return "/"


def install_auth(app, settings, sessions):
    attempts = defaultdict(deque)

    def throttle(request):
        key = request.client.host if request.client else "unknown"
        bucket = attempts[key]
        now = time.time()
        while bucket and bucket[0] < now - 300:
            bucket.popleft()
        if len(bucket) >= 20:
            raise HTTPException(429, "Too many attempts. Please try again in five minutes.")
        bucket.append(now)
        if len(attempts) > 10000:
            for old in list(attempts):
                if not attempts[old] or attempts[old][-1] < now - 300:
                    del attempts[old]

    def current_guest(request, oauth=False):
        token = request.cookies.get(COOKIE, "")
        with sessions() as db:
            login = db.get(LoginSession, digest(token)) if token else None
            if not login or login.expires_at <= time.time():
                return None
            owner = db.get(User, login.user_id)
            if not owner or not owner.is_guest:
                return None
            if oauth:
                if request.session.get("guest_claim") != digest(token):
                    return None
            elif not secrets.compare_digest(request.headers.get("x-csrf-token", ""), login.csrf):
                raise HTTPException(403, "Refresh your workspace before signing in.")
            return owner.id

    def user_view(user, csrf):
        return {
            "id": user.id,
            "name": user.name,
            "email": "" if user.is_guest else user.email,
            "csrf": csrf,
            "is_guest": user.is_guest,
        }

    def sign_in(user, response, guest_id=None):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        lifetime = 86400 if user.is_guest else 7 * 86400
        with sessions() as db:
            if guest_id and guest_id != user.id:
                db.execute(
                    update(Project).where(Project.owner_id == guest_id).values(owner_id=user.id)
                )
                db.execute(delete(LoginSession).where(LoginSession.user_id == guest_id))
            db.add(
                LoginSession(
                    token_hash=digest(token),
                    user_id=user.id,
                    csrf=csrf,
                    expires_at=time.time() + lifetime,
                )
            )
            db.commit()
        response.set_cookie(
            COOKIE,
            token,
            httponly=True,
            secure=settings.secure_cookies,
            samesite="lax",
            max_age=lifetime,
        )
        return user_view(user, csrf)

    @app.post("/api/v1/auth/guest", status_code=201)
    def guest(request: Request, response: Response):
        try:
            user = require_user(request)
        except HTTPException as exc:
            if exc.status_code != 401:
                raise
        else:
            with sessions() as db:
                login = db.get(LoginSession, digest(request.cookies[COOKIE]))
                return user_view(user, login.csrf)
        throttle(request)
        user = User(
            id=str(uuid4()), email=f"{uuid4()}@guest.invalid", name="Guest workspace", is_guest=True
        )
        with sessions() as db:
            db.add(user)
            db.commit()
        return sign_in(user, response)

    @app.get("/api/v1/auth/me")
    def me(request: Request):
        user = require_user(request)
        with sessions() as db:
            login = db.get(LoginSession, digest(request.cookies[COOKIE]))
            return user_view(user, login.csrf)

    @app.post("/api/v1/auth/signup", status_code=201)
    def signup(credentials: SignupCredentials, request: Request, response: Response):
        throttle(request)
        guest_id = current_guest(request)
        user = User(
            id=str(uuid4()),
            email=str(credentials.email).lower(),
            name=credentials.name.strip() or "Creator",
            password_hash=hasher.hash(credentials.password),
        )
        with sessions() as db:
            db.add(user)
            try:
                db.commit()
            except IntegrityError as exc:
                raise HTTPException(409, "Unable to create account. Try signing in.") from exc
        return sign_in(user, response, guest_id)

    @app.post("/api/v1/auth/login")
    def login(credentials: Credentials, request: Request, response: Response):
        throttle(request)
        with sessions() as db:
            user = db.scalar(select(User).where(User.email == str(credentials.email).lower()))
            try:
                hasher.verify(
                    user.password_hash if user and user.password_hash else dummy_hash,
                    credentials.password,
                )
            except VerificationError as exc:
                raise HTTPException(401, "Email or password is incorrect.") from exc
            if not user or not user.password_hash:
                raise HTTPException(401, "Email or password is incorrect.")
        return sign_in(user, response, current_guest(request))

    @app.post("/api/v1/auth/logout")
    def logout(request: Request, response: Response):
        require_user(request)
        with sessions() as db:
            login = db.get(LoginSession, digest(request.cookies[COOKIE]))
            db.delete(login)
            db.commit()
        response.delete_cookie(COOKIE)
        return {"status": "signed-out"}

    oauth = OAuth()
    enabled = []
    if settings.google_client_id and settings.google_client_secret:
        oauth.register(
            "google",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile", "code_challenge_method": "S256"},
        )
        enabled.append("google")
    if (
        settings.facebook_client_id
        and settings.facebook_client_secret
        and settings.facebook_api_version
    ):
        version = settings.facebook_api_version
        oauth.register(
            "facebook",
            client_id=settings.facebook_client_id,
            client_secret=settings.facebook_client_secret,
            authorize_url=f"https://www.facebook.com/{version}/dialog/oauth",
            access_token_url=f"https://graph.facebook.com/{version}/oauth/access_token",
            api_base_url=f"https://graph.facebook.com/{version}/",
            client_kwargs={"scope": "email public_profile"},
        )
        enabled.append("facebook")
    app.state.oauth = oauth

    @app.get("/api/v1/auth/providers")
    def providers():
        return {"google": "google" in enabled, "facebook": "facebook" in enabled}

    def oauth_failure(request, code):
        destination = safe_return_path(request.session.get("return_to", "/"))
        origin = request.session.get("oauth_origin", settings.public_url)
        origin = origin if origin in settings.allowed_origins else settings.public_url
        separator = "&" if "?" in destination else "?"
        request.session.clear()
        return RedirectResponse(
            origin + destination + separator + urlencode({"signin": "1", "auth_error": code}),
            status_code=303,
        )

    @app.get("/api/v1/auth/{provider}/start")
    async def start(provider: str, request: Request, return_to: str = "/"):
        if provider not in enabled:
            raise HTTPException(503, "This sign-in provider has not been configured yet.")
        throttle(request)
        request.session["return_to"] = safe_return_path(return_to)
        request.session["guest_claim"] = digest(request.cookies.get(COOKIE, ""))
        origin = f"{request.url.scheme}://{request.url.netloc}"
        origin = origin if origin in settings.allowed_origins else settings.public_url
        request.session["oauth_origin"] = origin
        # Only explicitly allowed public origins; reject arbitrary Host-derived redirects.
        callback = f"{origin}/api/v1/auth/{provider}/callback"
        return await oauth.create_client(provider).authorize_redirect(request, callback)

    @app.get("/api/v1/auth/{provider}/callback")
    async def callback(provider: str, request: Request):
        if provider not in enabled:
            raise HTTPException(503, "This sign-in provider is not configured.")
        client = oauth.create_client(provider)
        try:
            # Authlib verifies single-use state; Google also verifies ID-token signature,
            # audience, issuer and the nonce held in the signed, short-lived OAuth cookie.
            token = await client.authorize_access_token(request)
            if provider == "google":
                info = token.get("userinfo")
                if not info or not info.get("email_verified"):
                    raise HTTPException(401, "A verified Google email is required.")
                subject = str(info["sub"])
            else:
                reply = await client.get("me?fields=id,name,email", token=token)
                reply.raise_for_status()
                info = reply.json()
                subject = str(info["id"])
            email = str(info.get("email", "")).lower()
            if not email or len(email) > 254 or len(subject) > 255:
                raise HTTPException(401, "Your provider did not return a usable email.")
        except (OAuthError, KeyError, ValueError):
            return oauth_failure(request, "cancelled")
        except HTTPException:
            return oauth_failure(request, "provider_email")
        with sessions() as db:
            identity = db.scalar(
                select(Identity).where(
                    Identity.provider == provider,
                    Identity.subject == subject,
                )
            )
            if identity:
                user = db.get(User, identity.user_id)
            else:
                # Provider email collisions need explicit linking in a later account flow.
                if db.scalar(select(User).where(User.email == email)):
                    return oauth_failure(request, "account_exists")
                user = User(
                    id=str(uuid4()), email=email, name=str(info.get("name", "Creator"))[:80]
                )
                db.add(user)
                db.flush()
                db.add(
                    Identity(id=str(uuid4()), user_id=user.id, provider=provider, subject=subject)
                )
                try:
                    db.commit()
                except IntegrityError:
                    return oauth_failure(request, "retry")
        guest_id = current_guest(request, oauth=True)
        destination = safe_return_path(request.session.get("return_to", "/"))
        origin = request.session.get("oauth_origin", settings.public_url)
        origin = origin if origin in settings.allowed_origins else settings.public_url
        response = RedirectResponse(origin + destination, status_code=303)
        sign_in(user, response, guest_id)
        request.session.clear()
        return response
