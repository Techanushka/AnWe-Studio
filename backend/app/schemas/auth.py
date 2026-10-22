from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.security import validate_password_strength


class _EmailIn(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def _clean(cls, v):
        return v.strip().lower() if isinstance(v, str) else v


class SignupIn(_EmailIn):
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(max_length=128)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Please tell us your name.")
        return v

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return validate_password_strength(v)


class LoginIn(_EmailIn):
    password: str = Field(min_length=1, max_length=128)
    remember: bool = False


class VerifyOtpIn(_EmailIn):
    code: str = Field(pattern=r"^\d{6}$")


class EmailOnlyIn(_EmailIn):
    pass


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(max_length=128)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return validate_password_strength(v)


class ChangePasswordIn(BaseModel):
    current_password: str | None = Field(default=None, max_length=128)  # omit for Google-only users
    new_password: str = Field(max_length=128)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return validate_password_strength(v)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    avatar_url: str | None = None
    is_verified: bool
    has_password: bool


class AuthOut(BaseModel):
    user: UserOut


class MessageOut(BaseModel):
    message: str
