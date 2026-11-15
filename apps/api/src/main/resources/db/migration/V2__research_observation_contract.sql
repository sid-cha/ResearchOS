-- New source-aware research observations deliberately do not reuse legacy fractions.
CREATE TABLE research_instrument (
    instrument_id VARCHAR(80) PRIMARY KEY,
    symbol VARCHAR(12) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    instrument_type VARCHAR(20) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    coverage VARCHAR(255),
    classification VARCHAR(100),
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE research_metric_snapshot (
    instrument_id VARCHAR(80) NOT NULL REFERENCES research_instrument(instrument_id),
    metric_id VARCHAR(100) NOT NULL,
    as_of_key VARCHAR(60) NOT NULL,
    method_version VARCHAR(100) NOT NULL,
    as_of VARCHAR(45),
    status VARCHAR(40) NOT NULL,
    numeric_value NUMERIC,
    boolean_value BOOLEAN,
    unit VARCHAR(40) NOT NULL,
    source VARCHAR(100) NOT NULL,
    available_at VARCHAR(45),
    period_start DATE,
    period_end DATE,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (instrument_id, metric_id, as_of_key, method_version, source),
    CHECK (numeric_value IS NULL OR boolean_value IS NULL),
    CHECK ((status = 'available' AND (numeric_value IS NOT NULL OR boolean_value IS NOT NULL))
        OR (status <> 'available' AND numeric_value IS NULL AND boolean_value IS NULL))
);
CREATE INDEX research_metric_snapshot_recent ON research_metric_snapshot(instrument_id, captured_at DESC, metric_id);
