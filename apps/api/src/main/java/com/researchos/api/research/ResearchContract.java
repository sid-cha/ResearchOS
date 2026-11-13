package com.researchos.api.research;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;

/** Versioned receiver validation. It neither computes metrics nor certifies inputs. */
@Component
public class ResearchContract {
    public static final Set<String> SYMBOLS = Set.of("NVDA","AAPL","MSFT","TSLA","SPY","AMD","QQQ","META","AMZN","PLTR");
    private static final Set<String> STATES = Set.of("available","insufficient_data","missing_data","unsupported","period_mismatch");
    private final ObjectMapper mapper;
    private final Map<String,String> units;
    private final Clock clock;
    public record Snapshot(ObjectNode instrument, Instant capturedAt, List<ObjectNode> observations) {}

    @Autowired public ResearchContract(ObjectMapper mapper) { this(mapper,Clock.systemUTC()); }
    ResearchContract(ObjectMapper mapper,Clock clock) {
        this.mapper=mapper;this.clock=clock;
        try (var stream=new ClassPathResource("research-metrics-v1.tsv").getInputStream()) {
            Map<String,String> values=new HashMap<>();
            new String(stream.readAllBytes(),StandardCharsets.UTF_8).lines().forEach(line->{String[] fields=line.split("\\t",-1);if(fields.length==2)values.put(fields[0],fields[1]);});
            units=Map.copyOf(values);
        } catch(IOException e){throw new IllegalStateException("Research metric contract is unavailable",e);}
    }
    static ResponseStatusException invalid(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    private String text(JsonNode node,String key,int max,boolean required){
        JsonNode value=node.get(key);
        if(value==null||value.isNull()){if(required)throw invalid("Missing research field: "+key);return null;}
        if(!value.isTextual()||value.textValue().length()>max)throw invalid("Invalid research field: "+key);
        String result=value.textValue().trim();if(result.isEmpty()&&required)throw invalid("Missing research field: "+key);
        return result.isEmpty()?null:result;
    }
    private String date(JsonNode node,String key,boolean timeAllowed){
        String value=text(node,key,45,false);if(value==null)return null;
        try{if(timeAllowed&&value.contains("T"))OffsetDateTime.parse(value);else LocalDate.parse(value);}catch(DateTimeParseException e){throw invalid("Invalid research date: "+key);}
        return value;
    }
    private void optionalText(ObjectNode target,JsonNode input,String field,int limit){String value=text(input,field,limit,false);if(value==null)target.putNull(field);else target.put(field,value);}
    private void optionalDate(ObjectNode target,JsonNode input,String field,boolean timeAllowed){String value=date(input,field,timeAllowed);if(value==null)target.putNull(field);else target.put(field,value);}
    public Snapshot validate(JsonNode input){
        if(input==null||!input.isObject()||!input.path("schemaVersion").isIntegralNumber()||input.path("schemaVersion").asInt(-1)!=1)throw invalid("Use research schemaVersion 1");
        JsonNode rawInstrument=input.path("instrument");if(!rawInstrument.isObject())throw invalid("A research instrument is required");
        String symbol=text(rawInstrument,"symbol",12,true),instrumentId=text(rawInstrument,"instrumentId",80,true);
        if(!SYMBOLS.contains(symbol)||!instrumentId.equals("US_EQUITY:"+symbol))throw invalid("Choose a supported pilot instrument");
        String type=text(rawInstrument,"type",20,true),currency=text(rawInstrument,"currency",10,true);
        if(!Set.of("equity","ETF").contains(type)||!"USD".equals(currency))throw invalid("Unsupported research instrument type/currency");
        ObjectNode instrument=mapper.createObjectNode();instrument.put("instrumentId",instrumentId);instrument.put("symbol",symbol);instrument.put("type",type);instrument.put("currency",currency);
        instrument.put("name",text(rawInstrument,"name",255,true));optionalText(instrument,rawInstrument,"coverage",255);optionalText(instrument,rawInstrument,"classification",100);
        Instant capturedAt;
        try{capturedAt=Instant.parse(text(input,"capturedAt",45,true));}catch(DateTimeParseException e){throw invalid("Use a full ISO capturedAt timestamp");}
        if(capturedAt.isBefore(Instant.EPOCH)||capturedAt.isAfter(clock.instant().plusSeconds(300)))throw invalid("Research capture time is outside the supported range");
        JsonNode values=input.path("observations");if(!values.isArray()||values.isEmpty()||values.size()>100)throw invalid("Send between one and one hundred metric observations");
        List<ObjectNode> observations=new ArrayList<>();Set<String> identities=new HashSet<>();
        for(JsonNode raw:values){
            if(!raw.isObject())throw invalid("Invalid metric observation");
            String id=text(raw,"id",100,true),unit=text(raw,"unit",40,true),status=text(raw,"status",40,true),method=text(raw,"methodVersion",100,true);
            if(!units.containsKey(id)||!units.get(id).equals(unit)||!STATES.contains(status)||!method.matches("[A-Za-z0-9._:/-]{1,100}"))throw invalid("Unknown metric, unit, status or method version");
            String source=text(raw,"source",100,true);ObjectNode value=mapper.createObjectNode();
            value.put("id",id);value.put("unit",unit);value.put("status",status);value.put("source",source);value.put("methodVersion",method);
            JsonNode measurement=raw.get("value");
            if("available".equals(status)){
                if(measurement==null||("boolean".equals(unit)?!measurement.isBoolean():!measurement.isNumber())||measurement.isNumber()&&!Double.isFinite(measurement.doubleValue()))throw invalid("Available metrics require a compatible finite scalar");
                value.set("value",measurement.deepCopy());
            }else{if(measurement!=null&&!measurement.isNull())throw invalid("Unavailable metrics must have a null value");value.putNull("value");}
            optionalText(value,raw,"reason",500);optionalDate(value,raw,"asOf",true);optionalDate(value,raw,"availableAt",true);optionalDate(value,raw,"periodStart",false);optionalDate(value,raw,"periodEnd",false);
            if("available".equals(status)&&value.path("asOf").isNull())throw invalid("Available research metrics require an actual asOf date");
            for(String field:List.of("asOf","availableAt")){
                String dateValue=value.path(field).isTextual()?value.path(field).asText():null;
                if(dateValue!=null){Instant known=dateValue.contains("T")?OffsetDateTime.parse(dateValue).toInstant():LocalDate.parse(dateValue).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
                    if(known.isAfter(capturedAt.plusSeconds(300)))throw invalid("Research input date is ahead of capture time");}
            }
            if(value.path("periodStart").isTextual()&&value.path("periodEnd").isTextual()&&value.path("periodStart").asText().compareTo(value.path("periodEnd").asText())>0)throw invalid("Fiscal period start must precede its end");
            for(String field:List.of("sampleCount","requiredCount")){
                JsonNode count=raw.get(field);if(count==null||count.isNull())value.putNull(field);
                else if(!count.isIntegralNumber()||!count.canConvertToInt()||count.intValue()<0||count.intValue()>1_000_000)throw invalid("Invalid research sample count");else value.put(field,count.intValue());
            }
            // Preserve dated calculation provenance, never opaque provider responses.
            JsonNode details=raw.path("details");ObjectNode safeDetails=mapper.createObjectNode();
            if(details.isObject()){
                for(String field:List.of("adjustment","calculation","knowledgePrecision"))optionalText(safeDetails,details,field,160);
                for(String field:List.of("knowledgeCutoff","priceAsOf","previousAsOf","previousPeriodEnd"))optionalDate(safeDetails,details,field,true);
                JsonNode inputs=details.path("inputs");if(inputs.isArray()){
                    if(inputs.size()>30)throw invalid("Too many filing input facts");
                    var safeInputs=mapper.createArrayNode();
                    for(JsonNode fact:inputs){if(!fact.isObject())throw invalid("Invalid filing input fact");ObjectNode clean=mapper.createObjectNode();
                        for(String field:List.of("namespace","tag","unit","form","accession"))optionalText(clean,fact,field,120);
                        for(String field:List.of("periodStart","periodEnd","filingDate"))optionalDate(clean,fact,field,false);
                        JsonNode number=fact.get("value");if(number!=null&&!number.isNull()&&(!number.isNumber()||!Double.isFinite(number.doubleValue())))throw invalid("Invalid filing input scalar");
                        clean.set("value",number!=null&&number.isNumber()?number.deepCopy():mapper.nullNode());safeInputs.add(clean);
                    }safeDetails.set("inputs",safeInputs);
                }
            }value.set("details",safeDetails);
            String identity=id+"|"+asOfKey(value.get("asOf"))+"|"+method+"|"+source;if(!identities.add(identity))throw invalid("Duplicate metric identity in one snapshot");
            observations.add(value);
        }
        return new Snapshot(instrument,capturedAt,List.copyOf(observations));
    }
    public static String asOfKey(JsonNode value){if(value==null||value.isNull())return "~unknown";String date=value.asText();return date.contains("T")?OffsetDateTime.parse(date).toInstant().toString():date;}
}
