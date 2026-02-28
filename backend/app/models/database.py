from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(64), default="created", nullable=False)
    user_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    dataset_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    dataset_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    conversation_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    dag_config: Mapped[str | None] = mapped_column(Text, nullable=True)
    eda_results: Mapped[str | None] = mapped_column(Text, nullable=True)
    algorithm_recommendations: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    validation_results: Mapped[str | None] = mapped_column(Text, nullable=True)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
