from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin


class BoardPost(TimestampMixin, Base):
    __tablename__ = "board_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    board_type: Mapped[str] = mapped_column(String(24), nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[Optional[str]] = mapped_column(String(16))
    post_type: Mapped[Optional[str]] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    is_secret: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    secret_password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    workflow_status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="received")
    admin_reply: Mapped[Optional[str]] = mapped_column(Text)
    admin_replied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    admin_replier_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("admin_users.id", ondelete="SET NULL")
    )

    comments: Mapped[list["BoardComment"]] = relationship(
        "BoardComment", back_populates="post", cascade="all, delete-orphan"
    )


class BoardComment(Base):
    __tablename__ = "board_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    board_post_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("board_posts.id", ondelete="CASCADE"), nullable=False
    )
    parent_comment_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("board_comments.id", ondelete="CASCADE")
    )
    author_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL")
    )
    author_admin_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_secret: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    post: Mapped["BoardPost"] = relationship("BoardPost", back_populates="comments")
