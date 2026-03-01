import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.database import PipelineTemplate
from app.models.schemas import DAGDefinition, TemplateResponse

router = APIRouter(prefix="/templates", tags=["templates"])


def _parse_dag(raw: str) -> DAGDefinition:
    data = json.loads(raw)
    return DAGDefinition.model_validate(data)


def _to_response(template: PipelineTemplate) -> TemplateResponse:
    return TemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        dag=_parse_dag(template.dag_definition),
    )


@router.get("", response_model=list[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)) -> list[TemplateResponse]:
    result = await db.execute(select(PipelineTemplate))
    templates = result.scalars().all()
    return [_to_response(t) for t in templates]


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
) -> TemplateResponse:
    template = await db.scalar(select(PipelineTemplate).where(PipelineTemplate.id == template_id))
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return _to_response(template)
