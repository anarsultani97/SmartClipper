import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import func, select, update
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .auth import install_auth, require_user
from .config import Settings
from .database import Project, Short, User, make_database
from .schemas import ClipSelection, ProjectView
from .storage import remove_project_files

CurrentUser = Annotated[User, Depends(require_user)]


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine, sessions = make_database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    if settings.secure_cookies and len(settings.session_secret) < 32:
        raise ValueError(
            "Configure a session secret of at least 32 characters for HTTPS deployments."
        )
    app = FastAPI(title="SmartClipper API", version="0.2.0", lifespan=lifespan)
    app.state.settings, app.state.sessions = settings, sessions
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret or secrets.token_urlsafe(32),
        session_cookie="smartclipper_oauth",
        max_age=600,
        same_site="lax",
        https_only=settings.secure_cookies,
    )
    install_auth(app, settings, sessions)

    @app.middleware("http")
    async def origin_guard(request: Request, call_next):
        # This build is local-only. Reject cross-site writes from unrelated websites.
        origin = request.headers.get("origin")
        if (
            request.method not in {"GET", "HEAD", "OPTIONS"}
            and origin
            and origin not in settings.allowed_origins
        ):
            from fastapi.responses import JSONResponse

            return JSONResponse({"detail": "Origin is not allowed."}, status_code=403)
        return await call_next(request)

    def get_project(session, project_id, user):
        project = session.get(Project, project_id)
        if project is None or project.owner_id != user.id or project.status == "deleted":
            raise HTTPException(404, "Project not found.")
        return project

    @app.get("/api/v1/health")
    def health():
        return {
            "status": "ok",
            "mode": "owned-workspaces",
            "max_upload_bytes": settings.max_upload_bytes,
        }

    @app.get("/api/v1/projects", response_model=list[ProjectView])
    def list_projects(user: CurrentUser):
        with sessions() as session:
            projects = session.scalars(
                select(Project)
                .where(Project.owner_id == user.id, Project.status != "deleted")
                .order_by(Project.created_at.desc())
            ).all()
            counts = dict(
                session.execute(
                    select(Short.project_id, func.count(Short.id))
                    .join(Project)
                    .where(Project.owner_id == user.id, Project.status != "deleted")
                    .group_by(Short.project_id)
                ).all()
            )
            for project in projects:
                project.shorts_count = counts.get(project.id, 0)
            return projects

    @app.get("/api/v1/projects/{project_id}", response_model=ProjectView)
    def project_detail(project_id: str, user: CurrentUser):
        with sessions() as session:
            return get_project(session, project_id, user)

    @app.post("/api/v1/projects", status_code=202, response_model=ProjectView)
    async def upload(request: Request, filename: str, user: CurrentUser):
        filename = filename.replace("\\", "/").split("/")[-1]
        if not filename.lower().endswith(".mp4") or len(filename) > 255:
            raise HTTPException(415, "Choose an MP4 video.")
        length = request.headers.get("content-length")
        try:
            if length and (int(length) <= 0 or int(length) > settings.max_upload_bytes):
                raise HTTPException(413, "Video exceeds the upload limit or is empty.")
        except ValueError as exc:
            raise HTTPException(400, "Invalid content length.") from exc
        project_id = str(uuid4())
        folder = settings.data_dir / project_id
        folder.mkdir()
        size = 0
        try:
            with (folder / "source.mp4").open("wb") as target:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > settings.max_upload_bytes:
                        raise HTTPException(413, "Video exceeds the upload limit.")
                    target.write(chunk)
            if size == 0:
                raise HTTPException(400, "Video is empty.")
            with sessions() as session:
                owner_id = user.id
                if user.is_guest:
                    # Lock the same guest row as sign_in(). If sign-in won, the final
                    # upload belongs to its account; if upload won, the claim transfers it.
                    claimed_by = session.scalar(
                        update(User)
                        .where(User.id == user.id)
                        .values(claimed_by=User.claimed_by)
                        .returning(User.claimed_by)
                    )
                    owner_id = claimed_by or user.id
                project = Project(
                    id=project_id,
                    filename=filename,
                    size_bytes=size,
                    status="queued",
                    owner_id=owner_id,
                )
                session.add(project)
                session.commit()
                session.refresh(project)
                return project
        except BaseException:
            remove_project_files(settings, project_id)
            raise

    @app.delete("/api/v1/projects/{project_id}", status_code=202)
    def remove_queued(project_id: str, user: CurrentUser):
        with sessions() as session:
            project = get_project(session, project_id, user)
            previous = project.status
            changed = session.execute(
                update(Project)
                .where(
                    Project.id == project_id,
                    Project.owner_id == user.id,
                    Project.status.in_(["queued", "processing"]),
                )
                .values(status="deleted", error=None)
            )
            if changed.rowcount != 1:
                raise HTTPException(
                    409, "This video has already finished preparing. Refresh the queue."
                )
            session.commit()
        # The worker observes the tombstone, stops its native process and cleans up.
        # Waiting imports have no native process and can be cleaned immediately.
        if previous == "queued":
            remove_project_files(settings, project_id)
        return {"status": "removed", "id": project_id}

    @app.patch("/api/v1/projects/{project_id}/selection", response_model=ProjectView)
    def selection(project_id: str, edit: ClipSelection, user: CurrentUser):
        with sessions() as session:
            project = get_project(session, project_id, user)
            if project.status != "ready":
                raise HTTPException(409, "Wait for video preparation to finish.")
            if edit.end_ms > int((project.duration_seconds or 0) * 1000):
                raise HTTPException(422, "Selection exceeds the video duration.")
            changed = session.execute(
                update(Project)
                .where(Project.id == project_id, Project.revision == edit.revision)
                .values(start_ms=edit.start_ms, end_ms=edit.end_ms, revision=edit.revision + 1)
            )
            if changed.rowcount != 1:
                raise HTTPException(
                    409, "This project changed in another tab. Reload before saving."
                )
            session.commit()
            session.expire_all()
            return get_project(session, project_id, user)

    @app.post("/api/v1/projects/{project_id}/retry", response_model=ProjectView)
    def retry(project_id: str, user: CurrentUser):
        with sessions() as session:
            project = get_project(session, project_id, user)
            if project.status != "failed":
                raise HTTPException(409, "Only failed imports can be retried.")
            project.status, project.error = "queued", None
            project.progress, project.stage = 0, "Waiting for worker"
            session.commit()
            return project

    @app.get("/api/v1/projects/{project_id}/media/{kind}")
    def media(project_id: str, kind: str, user: CurrentUser):
        if kind == "audio" and user.is_guest:
            raise HTTPException(401, "Sign in to download your audio.")
        names = {
            "preview": ("preview.mp4", "video/mp4"),
            "thumbnail": ("thumbnail.jpg", "image/jpeg"),
            "audio": ("audio.mp3", "audio/mpeg"),
        }
        if kind not in names:
            raise HTTPException(404, "Media not found.")
        with sessions() as session:
            project = get_project(session, project_id, user)
            if project.status != "ready":
                raise HTTPException(409, "Video is not ready.")
            name, content_type = names[kind]
            path: Path = settings.data_dir / project.id / name
            if not path.is_file():
                raise HTTPException(404, "This media asset is unavailable.")
            return FileResponse(
                path,
                media_type=content_type,
                filename=f"{Path(project.filename).stem}.mp3" if kind == "audio" else None,
            )

    from .short_routes import install_short_routes

    install_short_routes(app, settings, sessions, get_project)
    from .analytics import install_analytics

    install_analytics(app, settings, sessions)
    return app


app = create_app()
