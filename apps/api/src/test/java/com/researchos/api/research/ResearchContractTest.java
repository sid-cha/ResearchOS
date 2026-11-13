package com.researchos.api.research;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;

class ResearchContractTest {
    private final ObjectMapper mapper=new ObjectMapper();
    private final ResearchContract contract=new ResearchContract(mapper,Clock.fixed(Instant.parse("2026-11-12T18:00:00Z"),ZoneOffset.UTC));
    static String payload(){return """
        {"schemaVersion":1,"capturedAt":"2026-11-12T18:00:00Z","instrument":{"instrumentId":"US_EQUITY:MSFT","symbol":"MSFT","name":"Microsoft","type":"equity","currency":"USD"},
        "observations":[{"id":"financial.revenueGrowthYoYPct","value":18.8,"status":"available","unit":"percent","source":"SEC_EDGAR_XBRL","asOf":"2026-11-12","availableAt":"2026-11-12T17:00:00Z","periodStart":"2026-07-01","periodEnd":"2026-09-30","methodVersion":"financial-v1","sampleCount":2,"requiredCount":2,
        "details":{"knowledgeCutoff":"2026-11-12","inputs":[{"namespace":"us-gaap","tag":"Revenues","unit":"USD","periodStart":"2026-07-01","periodEnd":"2026-09-30","filingDate":"2026-10-28","accession":"fixture"}],"secret":"PRIVATE"},"apiKey":"PRIVATE"}]}
        """;}
    ObjectNode input()throws Exception{return (ObjectNode)mapper.readTree(payload());}
    @Test void preservesDatedScalarProvenanceAndDropsRawFields()throws Exception{
        var snapshot=contract.validate(input());var observation=snapshot.observations().getFirst();
        assertEquals(18.8,observation.path("value").doubleValue());assertEquals("2026-09-30",observation.path("periodEnd").asText());
        assertEquals("us-gaap",observation.path("details").path("inputs").get(0).path("namespace").asText());assertFalse(observation.toString().contains("PRIVATE"));
    }
    @Test void rejectsUnknownMetricsUnitsNullAvailableAndInvalidPeriods()throws Exception{
        for(String field:new String[]{"id","unit","value","periodStart","asOf"}){
            var input=input();var observation=(ObjectNode)input.path("observations").get(0);
            switch(field){case "id"->observation.put("id","unknown.metric");case "unit"->observation.put("unit","ratio");case "value"->observation.putNull("value");case "periodStart"->observation.put("periodStart","2026-12-01");case "asOf"->observation.putNull("asOf");}
            assertThrows(ResponseStatusException.class,()->contract.validate(input),field);
        }
    }
    @Test void rejectsFutureUnknownSchemaAndDuplicates()throws Exception{
        var future=input();future.put("capturedAt","2099-01-01T00:00:00Z");assertThrows(ResponseStatusException.class,()->contract.validate(future));
        var schema=input();schema.put("schemaVersion",1.5);assertThrows(ResponseStatusException.class,()->contract.validate(schema));
        var repeated=input();((com.fasterxml.jackson.databind.node.ArrayNode)repeated.get("observations")).add(repeated.path("observations").get(0).deepCopy());assertThrows(ResponseStatusException.class,()->contract.validate(repeated));
    }
    @Test void preservesUnknownAsOfWithoutInventingTimeForUnavailableMetric()throws Exception{
        var input=input();var observation=(ObjectNode)input.path("observations").get(0);observation.put("status","missing_data");observation.putNull("value");observation.putNull("asOf");
        var result=contract.validate(input).observations().getFirst();assertTrue(result.path("asOf").isNull());assertEquals("~unknown",ResearchContract.asOfKey(result.get("asOf")));
        assertEquals("2026-11-11T05:00:00Z",ResearchContract.asOfKey(mapper.getNodeFactory().textNode("2026-11-11T00:00:00-05:00")));
    }
}
