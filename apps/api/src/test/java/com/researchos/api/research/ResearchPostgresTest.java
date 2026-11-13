package com.researchos.api.research;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"RESEARCH_API_TOKEN=controlled-test-token-000000000000"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="RESEARCH_TEST_JDBC_URL",matches="jdbc:postgresql://.*researchos_test")
class ResearchPostgresTest {
    static final String TOKEN="controlled-test-token-000000000000";
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){
        registry.add("spring.datasource.url",()->System.getenv("RESEARCH_TEST_JDBC_URL"));registry.add("spring.datasource.username",()->"researchos_test");registry.add("spring.datasource.password",()->"local_test_only");
    }
    @Autowired MockMvc http;
    @Autowired JdbcTemplate jdbc;
    @Autowired ResearchSnapshotRepository repository;
    @Autowired ObjectMapper mapper;
    @BeforeEach void clean(){jdbc.update("DELETE FROM research_metric_snapshot");jdbc.update("DELETE FROM research_instrument");}
    @Test void migrationsAuthenticationAndNoOriginGuard()throws Exception{
        assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success",Integer.class));
        http.perform(get("/api/research/v1/health")).andExpect(status().isUnauthorized());
        http.perform(get("/api/research/v1/health").header("X-Research-Token",TOKEN)).andExpect(status().isOk()).andExpect(jsonPath("$.storage").value("postgresql"));
        http.perform(get("/api/research/v1/health").header("X-Research-Token",TOKEN).header("Origin","https://foreign.example")).andExpect(status().isForbidden());
    }
    @Test void actualPostgresUpsertReadbackAndStaleCaptureGuard()throws Exception{
        var input=mapper.readTree(ResearchContractTest.payload());
        for(int index=0;index<2;index++)http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isOk()).andExpect(jsonPath("$.upsertedCount").value(1));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM research_metric_snapshot",Integer.class));
        ((com.fasterxml.jackson.databind.node.ObjectNode)input).put("capturedAt","2026-11-12T17:30:00Z");
        ((com.fasterxml.jackson.databind.node.ObjectNode)input.path("observations").get(0)).put("value",1);
        http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isOk()).andExpect(jsonPath("$.upsertedCount").value(0));
        http.perform(get("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).param("symbol","MSFT")).andExpect(status().isOk()).andExpect(jsonPath("$.observations[0].value").value(18.8));
        var reopened=new ResearchSnapshotRepository(jdbc,mapper);assertEquals("SEC_EDGAR_XBRL",reopened.observations("MSFT",100).getFirst().path("source").asText());
    }
    @Test void malformedAndOversizedWritesLeaveNoPartialData()throws Exception{
        var input=mapper.readTree(ResearchContractTest.payload());((com.fasterxml.jackson.databind.node.ArrayNode)input.path("observations")).add(mapper.createObjectNode().put("id","bad.metric"));
        http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isBadRequest());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM research_instrument",Integer.class));
        http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content("x".repeat(262145))).andExpect(status().isPayloadTooLarge());
        http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content("{bad json")).andExpect(status().isBadRequest());
    }
    @Test void repositoryRollsBackTheEntireBatchOnDatabaseFailure()throws Exception{
        var validated=new ResearchContract(mapper).validate(mapper.readTree(ResearchContractTest.payload()));
        var invalid=validated.observations().getFirst().deepCopy();invalid.put("id","financial.netIncomeTTM");invalid.putNull("value");
        var batch=new ResearchContract.Snapshot(validated.instrument(),validated.capturedAt(),List.of(validated.observations().getFirst(),invalid));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->repository.save(batch));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM research_metric_snapshot",Integer.class));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM research_instrument",Integer.class));
    }
    @Test void broaderRegistryIdentityPersistsAndCannotBeReassigned()throws Exception{
        var input=(com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(ResearchContractTest.payload());ResearchContractTest.registered(input,"COST","0000909832");
        http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isOk());
        http.perform(get("/api/research/v1/instruments").header("X-Research-Token",TOKEN)).andExpect(status().isOk()).andExpect(jsonPath("$.instruments[0].symbol").value("COST")).andExpect(jsonPath("$.instruments[0].type").value("unknown")).andExpect(jsonPath("$.instruments[0].issuerId").value("SEC_CIK:0000909832"));
        http.perform(get("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).param("symbol","COST")).andExpect(status().isOk()).andExpect(jsonPath("$.observations[0].value").value(18.8));
        ResearchContractTest.registered(input,"COST","0000123456");
        http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isConflict());
        assertEquals("0000909832",jdbc.queryForObject("SELECT cik FROM research_instrument WHERE symbol='COST'",String.class));
        http.perform(get("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).param("symbol","UNSAVED")).andExpect(status().isNotFound());
    }
    @Test void legacyPayloadCannotEraseExistingVerifiedIdentity()throws Exception{
        var input=(com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(ResearchContractTest.payload());ResearchContractTest.registered(input,"MSFT","0000789019");
        http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isOk());
        http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content(ResearchContractTest.payload())).andExpect(status().isOk());
        assertEquals("SEC_COMPANY_TICKERS_EXCHANGE",jdbc.queryForObject("SELECT identity_source FROM research_instrument WHERE symbol='MSFT'",String.class));assertEquals("0000789019",jdbc.queryForObject("SELECT cik FROM research_instrument WHERE symbol='MSFT'",String.class));
    }
    @Test void concurrentRegistrationsCannotExceedTheFiftyInstrumentBound()throws Exception{
        for(int index=0;index<49;index++)jdbc.update("INSERT INTO research_instrument(instrument_id,symbol,name,instrument_type,currency,captured_at) VALUES(?,?,?,?,?,now())","US_EQUITY:T"+index,"T"+index,"Controlled capacity fixture","unknown","USD");
        var first=(com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(ResearchContractTest.payload());ResearchContractTest.registered(first,"COST","0000909832");
        var second=first.deepCopy();ResearchContractTest.registered(second,"NEWCO","0000123456");
        var start=new java.util.concurrent.CountDownLatch(1);
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)){
            var responses=List.of(first,second).stream().map(body->pool.submit(()->{start.await();return http.perform(post("/api/research/v1/metric-snapshots").header("X-Research-Token",TOKEN).contentType(MediaType.APPLICATION_JSON).content(body.toString())).andReturn().getResponse().getStatus();})).toList();
            start.countDown();var codes=responses.stream().map(result->{try{return result.get();}catch(Exception e){throw new RuntimeException(e);}}).sorted().toList();assertEquals(List.of(200,409),codes);
        }
        assertEquals(50,jdbc.queryForObject("SELECT count(*) FROM research_instrument",Integer.class));
    }
}
