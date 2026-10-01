"""On-demand aggregates, without trackers, video contents, emails or session tokens."""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import Depends, HTTPException
from sqlalchemy import distinct, func, select

from .auth import require_user
from .database import Job, Project, Short, User

CurrentUser = Annotated[User, Depends(require_user)]


def install_analytics(app, settings, sessions):
    @app.get("/api/v1/analytics")
    def analytics(user: CurrentUser, scope: Literal["me", "team"] = "me"):
        admin = user.id in settings.analytics_admin_user_ids
        if scope == "team" and not admin:
            raise HTTPException(403, "Operator analytics requires an authorized account ID.")
        owner = [] if scope == "team" else [Project.owner_id == user.id]
        since = datetime.now(timezone.utc) - timedelta(days=30)
        with sessions() as db:

            def count(query):
                return db.scalar(query) or 0

            imports = count(select(func.count(Project.id)).where(*owner))
            ready = count(select(func.count(Project.id)).where(*owner, Project.status == "ready"))
            with_shorts = count(
                select(func.count(distinct(Job.project_id)))
                .join(Project)
                .where(*owner, Job.kind == "generate", Job.status == "ready")
            )
            with_exports = count(
                select(func.count(distinct(Job.project_id)))
                .join(Project)
                .where(*owner, Job.kind == "export", Job.status == "ready")
            )
            clips = count(
                select(func.count(Short.id))
                .join(Project)
                .join(Job, Short.job_id == Job.id)
                .where(*owner, Job.status == "ready")
            )
            exports = count(
                select(func.count(Job.id))
                .join(Project)
                .where(*owner, Job.kind == "export", Job.status == "ready")
            )
            edits = count(
                select(func.count(Short.id)).join(Project).where(*owner, Short.revision > 1)
            )
            failures = count(
                select(func.count(Job.id)).join(Project).where(*owner, Job.status == "failed")
            )
            grouped = db.execute(
                select(Job.kind, Job.status, func.count(Job.id))
                .join(Project)
                .where(*owner)
                .group_by(Job.kind, Job.status)
            ).all()
            days = db.execute(
                select(func.date(Job.created_at), Job.kind, func.count(Job.id))
                .join(Project)
                .where(*owner, Job.created_at >= since)
                .group_by(func.date(Job.created_at), Job.kind)
                .order_by(func.date(Job.created_at).desc())
            ).all()
            # Return only aggregates. No filenames, transcript text or account identities.
            return {
                "scope": scope,
                "can_view_team": admin,
                "user_id": user.id,
                "totals": {
                    "videos": imports,
                    "shorts": clips,
                    "exports": exports,
                    "customized_shorts": edits,
                    "failed_jobs": failures,
                    "registered_users": count(select(func.count(User.id)))
                    if scope == "team"
                    else None,
                },
                "funnel": [
                    {"label": "Videos imported", "count": imports},
                    {"label": "Videos prepared", "count": ready},
                    {"label": "Videos with shorts", "count": with_shorts},
                    {"label": "Videos with exports", "count": with_exports},
                ],
                "jobs": [
                    {"kind": kind, "status": status, "count": n} for kind, status, n in grouped
                ],
                "daily": [{"day": day, "kind": kind, "count": n} for day, kind, n in days],
                "note": "Totals are all-time. Daily job requests cover the last 30 days. "
                "Retries and repeated exports count as separate requests. "
                "Downloads, playback, clicks and social shares are not tracked.",
            }
