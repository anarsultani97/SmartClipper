from alembic import context
from smartclipper_api.config import Settings
from smartclipper_api.database import Base
from sqlalchemy import engine_from_config, pool

settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
configuration = context.config
configuration.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
if context.is_offline_mode():
    context.configure(url=settings.database_url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = engine_from_config(
        configuration.get_section(configuration.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
