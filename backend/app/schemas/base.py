"""Schémas Pydantic v2 — sérialisation camelCase côté API.

Le frontend (types.ts) consomme du camelCase (costPrice, minStock…).
Les schémas entrants acceptent aussi le snake_case (populate_by_name).
Exception : les champs de jetons OAuth (access_token, refresh_token,
token_type) conservent leur convention snake_case universelle.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_TOKEN_FIELDS = {"access_token", "refresh_token", "token_type"}


def _alias(name: str) -> str:
    if name in _TOKEN_FIELDS:
        return name
    return to_camel(name)


class BaseSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=_alias,
        populate_by_name=True,
        from_attributes=True,
        extra="ignore",
    )


class MessageOut(BaseSchema):
    message: str


def serialize(model_cls, doc):
    """Convertit un document Mongo brut en dict camelCase conforme au frontend."""
    data = dict(doc)
    if "_id" in data and "id" not in data:
        data["id"] = data.pop("_id")
    return model_cls.model_validate(data).model_dump(by_alias=True, mode="json")


def serialize_many(model_cls, docs):
    return [serialize(model_cls, d) for d in docs]
