CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE company (
    ticker VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    industry VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE security (
    symbol VARCHAR(20) PRIMARY KEY,
    company_ticker VARCHAR(10) REFERENCES company(ticker),
    type VARCHAR(50) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    exchange VARCHAR(50)
);

CREATE TABLE price_eod (
    security_symbol VARCHAR(20) REFERENCES security(symbol),
    date DATE NOT NULL,
    open DECIMAL(15, 4),
    high DECIMAL(15, 4),
    low DECIMAL(15, 4),
    close DECIMAL(15, 4),
    volume BIGINT,
    adjusted_close DECIMAL(15, 4),
    PRIMARY KEY (security_symbol, date)
);

CREATE TABLE statement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_ticker VARCHAR(10) REFERENCES company(ticker),
    type VARCHAR(50) NOT NULL, -- INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW
    period VARCHAR(20) NOT NULL, -- Q1, Q2, Q3, Q4, FY
    year INT NOT NULL,
    date DATE NOT NULL,
    source_url TEXT,
    UNIQUE (company_ticker, type, year, period)
);

CREATE TABLE statement_line (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID REFERENCES statement(id),
    line_item VARCHAR(255) NOT NULL,
    value DECIMAL(20, 4),
    display_order INT
);

CREATE TABLE metric (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT
);

CREATE TABLE metric_value (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_code VARCHAR(50) REFERENCES metric(code),
    company_ticker VARCHAR(10) REFERENCES company(ticker),
    date DATE NOT NULL,
    value DECIMAL(20, 6)
);

CREATE TABLE document (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_ticker VARCHAR(10) REFERENCES company(ticker),
    type VARCHAR(50) NOT NULL, -- 10-K, 10-Q, EARNINGS_CALL_TRANSCRIPT
    date DATE NOT NULL,
    title VARCHAR(255),
    url TEXT,
    s3_key TEXT,
    processed BOOLEAN DEFAULT FALSE
);

CREATE TABLE doc_chunk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES document(id),
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536) -- OpenAI embedding size
);

CREATE TABLE screen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    dsl TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE research_note (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_ticker VARCHAR(10) REFERENCES company(ticker),
    title VARCHAR(255),
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assumption (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    value DECIMAL(20, 6)
);

CREATE TABLE scenario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_year INT
);

CREATE TABLE scenario_phase (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID REFERENCES scenario(id),
    name VARCHAR(255),
    start_offset_days INT,
    end_offset_days INT
);

CREATE TABLE scenario_impact (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID REFERENCES scenario(id),
    factor_name VARCHAR(255),
    impact_coefficient DECIMAL(10, 4)
);

CREATE TABLE behavior_signal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE capital_flow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    sector VARCHAR(100),
    amount DECIMAL(20, 2),
    direction VARCHAR(10) -- INFLOW, OUTFLOW
);

CREATE TABLE scenario_feature_set (
    scenario_id UUID REFERENCES scenario(id),
    feature_vector VECTOR(1536),
    PRIMARY KEY (scenario_id)
);
