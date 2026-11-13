package com.researchos.api.research;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Repository
public class ResearchSnapshotRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public ResearchSnapshotRepository(JdbcTemplate jdbc,ObjectMapper mapper){this.jdbc=jdbc;this.mapper=mapper;}
    private static String string(ObjectNode value,String field){return value.path(field).isNull()||value.path(field).isMissingNode()?null:value.path(field).asText();}
    private static LocalDate date(ObjectNode value,String field){String result=string(value,field);return result==null?null:LocalDate.parse(result);}
    @Transactional
    public int save(ResearchContract.Snapshot snapshot){
        ObjectNode instrument=snapshot.instrument().deepCopy();Timestamp captured=Timestamp.from(snapshot.capturedAt());
        // The transaction lock serializes registry capacity and identity checks across API workers.
        jdbc.query("SELECT pg_advisory_xact_lock(1381191507, 50)",row->{});
        var existing=jdbc.queryForList("""
            SELECT cik,issuer_id,identity_source,source_url,exchange,
            to_char(verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS verified_at,
            COALESCE(verified_at > CAST(? AS timestamptz),verified_at IS NOT NULL) AS retain_identity
            FROM research_instrument WHERE instrument_id=? FOR UPDATE
            """,string(instrument,"verifiedAt"),string(instrument,"instrumentId"));
        if(existing.isEmpty()){
            if(jdbc.queryForObject("SELECT count(*) FROM research_instrument",Integer.class)>=50)throw new ResponseStatusException(HttpStatus.CONFLICT,"Research instrument registry is full (50)");
        }else{
            Map<String,Object> previous=existing.getFirst();String previousCik=(String)previous.get("cik"),incomingCik=string(instrument,"cik");
            if(previousCik!=null&&incomingCik!=null&&!previousCik.equals(incomingCik))throw new ResponseStatusException(HttpStatus.CONFLICT,"Stored issuer identity differs; an explicit identity migration is required");
            if(previousCik!=null&&incomingCik==null||Boolean.TRUE.equals(previous.get("retain_identity"))){
                for(String[] field:new String[][]{{"cik","cik"},{"issuerId","issuer_id"},{"identitySource","identity_source"},{"sourceUrl","source_url"},{"verifiedAt","verified_at"},{"exchange","exchange"}}){Object value=previous.get(field[1]);if(value==null)instrument.putNull(field[0]);else instrument.put(field[0],value.toString());}
            }
        }
        jdbc.update("""
            INSERT INTO research_instrument(instrument_id,symbol,name,instrument_type,currency,coverage,classification,captured_at,cik,issuer_id,identity_source,source_url,verified_at,exchange)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS timestamptz),?) ON CONFLICT(instrument_id) DO UPDATE SET
            name=EXCLUDED.name,instrument_type=EXCLUDED.instrument_type,currency=EXCLUDED.currency,coverage=EXCLUDED.coverage,
            classification=EXCLUDED.classification,captured_at=EXCLUDED.captured_at,cik=EXCLUDED.cik,issuer_id=EXCLUDED.issuer_id,
            identity_source=EXCLUDED.identity_source,source_url=EXCLUDED.source_url,verified_at=EXCLUDED.verified_at,exchange=EXCLUDED.exchange
            WHERE EXCLUDED.captured_at>=research_instrument.captured_at
            """,string(instrument,"instrumentId"),string(instrument,"symbol"),string(instrument,"name"),string(instrument,"type"),string(instrument,"currency"),string(instrument,"coverage"),string(instrument,"classification"),captured,
            string(instrument,"cik"),string(instrument,"issuerId"),string(instrument,"identitySource"),string(instrument,"sourceUrl"),string(instrument,"verifiedAt"),string(instrument,"exchange"));
        int saved=0;
        for(ObjectNode value:snapshot.observations()){
            var measurement=value.path("value");
            saved+=jdbc.update("""
                INSERT INTO research_metric_snapshot(instrument_id,metric_id,as_of_key,method_version,as_of,status,numeric_value,boolean_value,
                unit,source,available_at,period_start,period_end,captured_at,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS JSONB))
                ON CONFLICT(instrument_id,metric_id,as_of_key,method_version,source) DO UPDATE SET as_of=EXCLUDED.as_of,status=EXCLUDED.status,
                numeric_value=EXCLUDED.numeric_value,boolean_value=EXCLUDED.boolean_value,unit=EXCLUDED.unit,source=EXCLUDED.source,
                available_at=EXCLUDED.available_at,period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end,captured_at=EXCLUDED.captured_at,
                payload=EXCLUDED.payload WHERE EXCLUDED.captured_at>=research_metric_snapshot.captured_at
                """,string(instrument,"instrumentId"),string(value,"id"),ResearchContract.asOfKey(value.get("asOf")),string(value,"methodVersion"),
                string(value,"asOf"),string(value,"status"),measurement.isNumber()?measurement.decimalValue():null,measurement.isBoolean()?measurement.booleanValue():null,
                string(value,"unit"),string(value,"source"),string(value,"availableAt"),date(value,"periodStart"),date(value,"periodEnd"),captured,value.toString());
        }return saved;
    }
    public List<Map<String,Object>> instruments(){return jdbc.queryForList("SELECT instrument_id AS \"instrumentId\",symbol,name,instrument_type AS type,currency,coverage,classification,captured_at AS \"capturedAt\",cik,issuer_id AS \"issuerId\",identity_source AS \"identitySource\",source_url AS \"sourceUrl\",verified_at AS \"verifiedAt\",exchange FROM research_instrument ORDER BY symbol LIMIT 50");}
    public boolean hasInstrument(String symbol){return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM research_instrument WHERE symbol=?)",Boolean.class,symbol));}
    public List<ObjectNode> observations(String symbol,int limit){
        return jdbc.query("""
            SELECT s.payload FROM research_metric_snapshot s JOIN research_instrument i ON i.instrument_id=s.instrument_id
            WHERE i.symbol=? ORDER BY s.captured_at DESC,s.metric_id,s.as_of_key DESC LIMIT ?
            """,(row,index)->{try{return (ObjectNode)mapper.readTree(row.getString(1));}catch(JsonProcessingException e){throw new IllegalStateException("Stored research schema is invalid");}},symbol,limit);
    }
    public boolean ready(){jdbc.queryForObject("SELECT count(*) FROM research_instrument",Integer.class);return true;}
}
