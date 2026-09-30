import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select, update
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .database import Project, make_database
from .schemas import ClipSelection, ProjectView


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine, sessions = make_database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(title="SmartClipper local review API", version="0.1.0", lifespan=lifespan)
    app.state.settings, app.state.sessions = settings, sessions
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )

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

    def get_project(session, project_id):
        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(404, "Project not found.")
        return project

    @app.get("/api/v1/health")
    def health():
        return {
            "status": "ok",
            "mode": "local-review",
            "max_upload_bytes": settings.max_upload_bytes,
        }

    @app.get("/api/v1/projects", response_model=list[ProjectView])
    def list_projects():
        with sessions() as session:
            return session.scalars(select(Project).order_by(Project.created_at.desc())).all()

    @app.get("/api/v1/projects/{project_id}", response_model=ProjectView)
    def project_detail(project_id: str):
        with sessions() as session:
            return get_project(session, project_id)

    @app.post("/api/v1/projects", status_code=202, response_model=ProjectView)
    async def upload(request: Request, filename: str):
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
                project = Project(
                    id=project_id, filename=filename, size_bytes=size, status="queued"
                )
                session.add(project)
                session.commit()
                session.refresh(project)
                return project
        except BaseException:
            shutil.rmtree(folder, ignore_errors=True)
            raise

    @app.patch("/api/v1/projects/{project_id}/selection", response_model=ProjectView)
    def selection(project_id: str, edit: ClipSelection):
        with sessions() as session:
            project = get_project(session, project_id)
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
            return get_project(session, project_id)

    @app.post("/api/v1/projects/{project_id}/retry", response_model=ProjectView)
    def retry(project_id: str):
        with sessions() as session:
            project = get_project(session, project_id)
            if project.status != "failed":
                raise HTTPException(409, "Only failed imports can be retried.")
            project.status, project.error = "queued", None
            session.commit()
            return project

    @app.get("/api/v1/projects/{project_id}/media/{kind}")
    def media(project_id: str, kind: str):
        names = {
            "preview": ("preview.mp4", "video/mp4"),
            "thumbnail": ("thumbnail.jpg", "image/jpeg"),
            "audio": ("audio.mp3", "audio/mpeg"),
        }
        if kind not in names:
            raise HTTPException(404, "Media not found.")
        with sessions() as session:
            project = get_project(session, project_id)
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

    return app


app = create_app()
