from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

engine = create_engine(settings.database_url, future=True, pool_pre_ping=True, pool_recycle=1800, connect_args={"prepare_threshold": None})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
