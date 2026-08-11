"""The actor performing an operation.

Every mutating service function takes an :class:`Actor`. That is what makes it
impossible to write a privileged operation that has no audit trail and no
permission check — there is nowhere to put the call that does not carry one.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models import User
from app.security import rbac


@dataclass(frozen=True)
class Actor:
    user_id: int | None
    email: str | None
    role: str
    ip_hash: str | None = None
    user_agent: str | None = None

    @classmethod
    def from_user(
        cls, user: User, *, ip_hash: str | None = None, user_agent: str | None = None
    ) -> "Actor":
        return cls(
            user_id=user.id,
            email=user.email,
            role=user.role,
            ip_hash=ip_hash,
            user_agent=user_agent,
        )

    @classmethod
    def system(cls) -> "Actor":
        """Used by seeding and background jobs. Holds no permissions."""
        return cls(user_id=None, email="system", role="system")

    @classmethod
    def anonymous(
        cls, *, ip_hash: str | None = None, user_agent: str | None = None
    ) -> "Actor":
        return cls(
            user_id=None,
            email=None,
            role="anonymous",
            ip_hash=ip_hash,
            user_agent=user_agent,
        )

    def can(self, permission: str) -> bool:
        if self.role == "system":
            return True
        return rbac.has_permission(self.role, permission)

    def require(self, permission: str) -> None:
        if self.role == "system":
            return
        rbac.require(self.role, permission)
