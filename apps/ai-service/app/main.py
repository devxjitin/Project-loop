import json
import logging
import os
import re
import asyncio
from typing import Any, Literal, cast

import hdbscan
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

app = FastAPI(title="LOOP AI Service")

Sentiment = Literal["positive", "neutral", "negative"]

class SentimentItem(BaseModel):
    id: str
    text: str = Field(min_length=1, max_length=20_000)

class ClassifyRequest(BaseModel):
    items: list[SentimentItem] = Field(min_length=1, max_length=100)

class Classification(BaseModel):
    id: str
    sentiment: Sentiment

class ClassifyResponse(BaseModel):
    classifications: list[Classification]

class EmbeddingItem(BaseModel):
    id: str
    text: str = Field(min_length=1, max_length=20_000)

class EmbedRequest(BaseModel):
    items: list[EmbeddingItem] = Field(min_length=1, max_length=100)

class Embedding(BaseModel):
    id: str
    embedding: list[float]

class EmbedResponse(BaseModel):
    embeddings: list[Embedding]

class AnswerSource(BaseModel):
    id: str
    text: str = Field(min_length=1, max_length=20_000)
    source: str
    occurred_at: str | None = None

class AnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)
    sources: list[AnswerSource] = Field(min_length=1, max_length=12)

class Citation(BaseModel):
    feedback_id: str

class AnswerResponse(BaseModel):
    answer: str = Field(min_length=1, max_length=8_000)
    citations: list[Citation] = Field(min_length=1, max_length=12)

class ReportRequest(BaseModel):
    period_start: str
    period_end: str
    metrics: dict
    top_themes: list[dict]
    notable_quotes: list[dict]

class ReportResponse(BaseModel):
    content: str = Field(min_length=1, max_length=12_000)

class ThemeItem(BaseModel):
    id: str
    text: str = Field(min_length=1, max_length=20_000)
    embedding: list[float] = Field(min_length=1536, max_length=1536)

class ClusterRequest(BaseModel):
    items: list[ThemeItem] = Field(min_length=3, max_length=5_000)

class ThemeCluster(BaseModel):
    name: str
    feedback_ids: list[str] = Field(min_length=3)

class ClusterResponse(BaseModel):
    themes: list[ThemeCluster]

def require_internal_token(token: str | None) -> None:
    expected = os.environ.get("AI_SERVICE_TOKEN")
    if not expected or token != expected:
        raise HTTPException(status_code=401, detail="Invalid internal service token")

def parse_classifications(content: str, expected_ids: set[str]) -> list[Classification]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(cleaned)
        values = parsed["classifications"] if isinstance(parsed, dict) else parsed
        classifications = [Classification.model_validate(value) for value in values]
    except (json.JSONDecodeError, KeyError, ValueError) as error:
        raise HTTPException(status_code=502, detail="Gemini returned an invalid sentiment response") from error
    if {item.id for item in classifications} != expected_ids or len(classifications) != len(expected_ids):
        raise HTTPException(status_code=502, detail="Gemini response did not classify every item exactly once")
    return classifications

def gemini_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")
    return genai.Client(api_key=api_key)

def provider_error(error: Exception, message: str) -> HTTPException:
    logging.getLogger("uvicorn.error").error("%s: %s: %s", message, type(error).__name__, error)
    return HTTPException(status_code=429 if getattr(error, "code", None) == 429 else 502, detail=message)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service"}

@app.post("/v1/sentiment/classify", response_model=ClassifyResponse)
async def classify_sentiment(request: ClassifyRequest, x_internal_token: str | None = Header(default=None)) -> ClassifyResponse:
    require_internal_token(x_internal_token)
    prompt = """Classify each customer-feedback item as exactly one of positive, neutral, or negative.
Return JSON only, in the form {\"classifications\":[{\"id\":\"...\",\"sentiment\":\"positive|neutral|negative\"}]}.
Use neutral for factual, mixed, or unclear feedback; do not add explanation.\n\nItems:\n""" + json.dumps([item.model_dump() for item in request.items])
    try:
        response = await asyncio.to_thread(gemini_client().models.generate_content, model=os.environ.get("GEMINI_GENERATION_MODEL", "gemini-2.5-flash"), contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=ClassifyResponse, temperature=0))
        content = response.text or ''
        return ClassifyResponse(classifications=parse_classifications(content, {item.id for item in request.items}))
    except HTTPException: raise
    except Exception as error: raise provider_error(error, "Gemini classification request failed") from error

@app.post("/v1/embeddings", response_model=EmbedResponse)
async def create_embeddings(request: EmbedRequest, x_internal_token: str | None = Header(default=None)) -> EmbedResponse:
    require_internal_token(x_internal_token)
    try:
        response = await asyncio.to_thread(gemini_client().models.embed_content, model=os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"), contents=cast(Any, [item.text for item in request.items]), config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT", output_dimensionality=1536))
        embeddings = response.embeddings or []
        if len(embeddings) != len(request.items):
            raise HTTPException(status_code=502, detail="Embedding provider returned an incomplete batch")
        return EmbedResponse(embeddings=[Embedding(id=item.id, embedding=result.values or []) for item, result in zip(request.items, embeddings)])
    except HTTPException: raise
    except Exception as error: raise provider_error(error, "Gemini embedding request failed") from error

@app.post("/v1/embeddings/query", response_model=EmbedResponse)
async def create_query_embedding(request: EmbedRequest, x_internal_token: str | None = Header(default=None)) -> EmbedResponse:
    require_internal_token(x_internal_token)
    try:
        response = await asyncio.to_thread(gemini_client().models.embed_content, model=os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"), contents=cast(Any, [item.text for item in request.items]), config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY", output_dimensionality=1536))
        embeddings = response.embeddings or []
        if len(embeddings) != len(request.items):
            raise HTTPException(status_code=502, detail="Embedding provider returned an incomplete query embedding")
        return EmbedResponse(embeddings=[Embedding(id=item.id, embedding=result.values or []) for item, result in zip(request.items, embeddings)])
    except HTTPException: raise
    except Exception as error: raise provider_error(error, "Gemini query embedding request failed") from error

@app.post("/v1/qa/answer", response_model=AnswerResponse)
async def answer_question(request: AnswerRequest, x_internal_token: str | None = Header(default=None)) -> AnswerResponse:
    require_internal_token(x_internal_token)
    source_ids = {source.id for source in request.sources}
    prompt = """Answer the question using ONLY the supplied customer-feedback sources. Do not use outside knowledge.
Every factual claim must be immediately followed by one or more source markers in the exact form [source:<feedback_id>].
If the sources do not support an answer, say exactly: "I don't know based on the available feedback." Return JSON with `answer` and `citations`; citations must list every source ID used.
Question:\n""" + request.question + "\n\nSources:\n" + json.dumps([source.model_dump() for source in request.sources])
    try:
        response = await asyncio.to_thread(gemini_client().models.generate_content, model=os.environ.get("GEMINI_GENERATION_MODEL", "gemini-2.5-flash"), contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=AnswerResponse, temperature=0))
        answer = AnswerResponse.model_validate_json(response.text or '')
        cited = {citation.feedback_id for citation in answer.citations}
        markers = set(re.findall(r"\[source:([^\]]+)\]", answer.answer))
        if not cited or not cited.issubset(source_ids) or not markers or not markers.issubset(source_ids) or not markers.issubset(cited):
            raise HTTPException(status_code=502, detail="Gemini answer did not provide valid grounded citations")
        return answer
    except HTTPException: raise
    except Exception as error: raise provider_error(error, "Gemini grounded answer request failed") from error

@app.post("/v1/reports/summarize", response_model=ReportResponse)
async def summarize_report(request: ReportRequest, x_internal_token: str | None = Header(default=None)) -> ReportResponse:
    require_internal_token(x_internal_token)
    prompt = """Write a concise executive Voice-of-Customer report in Markdown from the supplied period data only.
Use headings: Executive summary, Sentiment, Top themes, Customer voices, Recommended focus.
Explain changes and tradeoffs in plain language for a non-technical executive. Do not invent metrics, quotes, causes, or recommendations not supported by the input. Keep it under 700 words.
Data:\n""" + json.dumps(request.model_dump())
    try:
        response = await asyncio.to_thread(gemini_client().models.generate_content, model=os.environ.get("GEMINI_GENERATION_MODEL", "gemini-2.5-flash"), contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=ReportResponse, temperature=0.2))
        return ReportResponse.model_validate_json(response.text or '')
    except HTTPException: raise
    except Exception as error: raise provider_error(error, "Gemini report generation failed") from error

async def label_clusters(clusters: list[list[ThemeItem]]) -> list[str]:
    examples = [[item.text[:500] for item in cluster[:8]] for cluster in clusters]
    prompt = """Name each customer-feedback cluster with a concise, stable product theme (2-6 words).
Return JSON only: {\"labels\":[\"...\"]}. Use specific plain-language themes, never cluster numbers.
Clusters:\n""" + json.dumps(examples)
    try:
        response = await asyncio.to_thread(gemini_client().models.generate_content, model=os.environ.get("GEMINI_GENERATION_MODEL", "gemini-2.5-flash"), contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0))
        text = (response.text or '').strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        labels = json.loads(text)["labels"]
        if not isinstance(labels, list) or len(labels) != len(clusters) or not all(isinstance(label, str) and label.strip() for label in labels):
            raise ValueError("invalid label count")
        return [re.sub(r"\s+", " ", label.strip())[:120] for label in labels]
    except HTTPException: raise
    except Exception as error: raise provider_error(error, "Gemini theme labeling failed") from error

@app.post("/v1/themes/cluster", response_model=ClusterResponse)
async def cluster_themes(request: ClusterRequest, x_internal_token: str | None = Header(default=None)) -> ClusterResponse:
    require_internal_token(x_internal_token)
    matrix = np.array([item.embedding for item in request.items], dtype=np.float32)
    labels = hdbscan.HDBSCAN(min_cluster_size=3, min_samples=2, metric="euclidean", cluster_selection_method="eom").fit_predict(matrix)
    groups: dict[int, list[ThemeItem]] = {}
    for label, item in zip(labels, request.items):
        if int(label) >= 0:
            groups.setdefault(int(label), []).append(item)
    clusters = list(groups.values())
    if not clusters:
        return ClusterResponse(themes=[])
    names = await label_clusters(clusters)
    return ClusterResponse(themes=[ThemeCluster(name=name, feedback_ids=[item.id for item in cluster]) for name, cluster in zip(names, clusters)])
