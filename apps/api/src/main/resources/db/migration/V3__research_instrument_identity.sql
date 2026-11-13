-- Directory metadata is a server-side attestation, not a permanent security master.
ALTER TABLE research_instrument
    ADD COLUMN cik VARCHAR(10),
    ADD COLUMN issuer_id VARCHAR(32),
    ADD COLUMN identity_source VARCHAR(64),
    ADD COLUMN source_url VARCHAR(512),
    ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN exchange VARCHAR(40),
    ADD CONSTRAINT research_instrument_cik_format CHECK (cik IS NULL OR (cik ~ '^[0-9]{10}$' AND cik <> '0000000000')),
    ADD CONSTRAINT research_instrument_issuer_link CHECK (issuer_id IS NULL OR (cik IS NOT NULL AND issuer_id = 'SEC_CIK:' || cik));

UPDATE research_instrument SET cik = mappings.cik, issuer_id = 'SEC_CIK:' || mappings.cik,
    identity_source = 'TRADESCOPE_SEED_MAPPING'
FROM (VALUES ('NVDA','0001045810'),('AAPL','0000320193'),('MSFT','0000789019'),('TSLA','0001318605'),
    ('AMD','0000002488'),('META','0001326801'),('AMZN','0001018724'),('PLTR','0001321655')) AS mappings(symbol,cik)
WHERE research_instrument.symbol = mappings.symbol;
UPDATE research_instrument SET identity_source = 'TRADESCOPE_SEED_MAPPING'
WHERE symbol IN ('SPY','QQQ');
