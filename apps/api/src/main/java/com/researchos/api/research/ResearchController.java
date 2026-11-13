package com.researchos.api.research;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

/** Optional local bridge. Every endpoint requires the server-side shared token. */
@RestController
@RequestMapping("/api/research/v1")
public class ResearchController {
    private final ResearchContract contract;
    private final ResearchSnapshotRepository repository;
    private final String token;
    public ResearchController(ResearchContract contract,ResearchSnapshotRepository repository,@Value("${RESEARCH_API_TOKEN:}") String token){this.contract=contract;this.repository=repository;this.token=token;}
    private void authorize(String supplied){
        if(token.length()<24||token.length()>512||token.contains("\r")||token.contains("\n"))throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Research bridge is disabled; configure a private token of 24 to 512 characters");
        if(supplied==null||supplied.length()>512||!MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8)))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Research bridge authentication failed");
    }
    @GetMapping("/health")
    public Map<String,Object> health(@RequestHeader(value="X-Research-Token",required=false) String supplied){authorize(supplied);repository.ready();return Map.of("schemaVersion",1,"ready",true,"storage","postgresql","metricCatalogVersion",1);}
    @GetMapping("/instruments")
    public Map<String,Object> instruments(@RequestHeader(value="X-Research-Token",required=false) String supplied){authorize(supplied);return Map.of("schemaVersion",1,"instruments",repository.instruments());}
    @PostMapping("/metric-snapshots")
    public Map<String,Object> save(@RequestHeader(value="X-Research-Token",required=false) String supplied,@RequestBody JsonNode body){
        authorize(supplied);var snapshot=contract.validate(body);int saved=repository.save(snapshot);
        return Map.of("schemaVersion",1,"instrumentId",snapshot.instrument().path("instrumentId").asText(),"capturedAt",snapshot.capturedAt().toString(),"receivedCount",snapshot.observations().size(),"upsertedCount",saved);
    }
    @GetMapping("/metric-snapshots")
    public Map<String,Object> list(@RequestHeader(value="X-Research-Token",required=false) String supplied,@RequestParam String symbol,@RequestParam(defaultValue="100") int limit){
        authorize(supplied);if(!ResearchContract.SYMBOLS.contains(symbol)||limit<1||limit>100)throw ResearchContract.invalid("Choose a pilot symbol and limit between one and one hundred");
        return Map.of("schemaVersion",1,"symbol",symbol,"observations",repository.observations(symbol,limit),"limit",limit);
    }
}
