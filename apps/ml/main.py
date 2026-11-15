from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import random

app = FastAPI(title="ResearchOS ML API")

class NlQuery(BaseModel):
    query: str

class Criterion(BaseModel):
    field: str
    operator: str
    value: float

class DslResponse(BaseModel):
    criteria: List[Criterion]
    explanation: str

class ProcessDocRequest(BaseModel):
    content: str
    ticker: str

class Chunk(BaseModel):
    index: int
    text: str
    embedding: List[float]

class ProcessDocResponse(BaseModel):
    chunks: List[Chunk]

class SimRequest(BaseModel):
    ticker: str
    days: int = 30

class SimResult(BaseModel):
    date: str
    score: float
    drivers: List[str]

@app.get("/")
def read_root():
    return {"status": "ok", "service": "ml-api"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/nltodsl", response_model=DslResponse)
def nl_to_dsl(q: NlQuery):
    return {
        "criteria": [
            {
                "field": "metric:GROSS_MARGIN",
                "operator": "GT",
                "value": 0.40
            }
        ],
        "explanation": "Filtered for companies where Gross Margin is greater than 0.40"
    }

@app.post("/process_document", response_model=ProcessDocResponse)
def process_document(req: ProcessDocRequest):
    text = req.content
    chunk_size = 500
    chunks = []
    
    for i in range(0, len(text), chunk_size):
        chunk_text = text[i:i + chunk_size]
        mock_embedding = [random.random() for _ in range(1536)]
        
        chunks.append({
            "index": i // chunk_size,
            "text": chunk_text,
            "embedding": mock_embedding
        })
        
    return {"chunks": chunks}

@app.post("/similarity", response_model=List[SimResult])
def find_similar_periods(req: SimRequest):
    """
    Stub for similarity engine. 
    Returns a mock '2020 Covid Crash' similarity result.
    """
    return [
        {
            "date": "2020-03-15",
            "score": 0.89,
            "drivers": ["Volatility", "Sector:Healthcare"]
        },
        {
            "date": "2008-09-29",
            "score": 0.72,
            "drivers": ["Liquidity", "Sector:Financials"]
        }
    ]
