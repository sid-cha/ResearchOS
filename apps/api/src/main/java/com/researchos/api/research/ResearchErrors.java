package com.researchos.api.research;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.beans.TypeMismatchException;
import java.util.Map;

@RestControllerAdvice(assignableTypes=ResearchController.class)
public class ResearchErrors {
    @ExceptionHandler({ServletRequestBindingException.class,TypeMismatchException.class})
    ResponseEntity<Map<String,String>> parameters(Exception error){return ResponseEntity.badRequest().body(Map.of("error","Invalid research request parameters"));}
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String,String>> malformed(HttpMessageNotReadableException error){return ResponseEntity.badRequest().body(Map.of("error","Expected a valid research JSON object"));}
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String,String>> request(ResponseStatusException error){return ResponseEntity.status(error.getStatusCode()).body(Map.of("error",error.getReason()==null?"Research request rejected":error.getReason()));}
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String,String>> unexpected(Exception error){return ResponseEntity.status(500).body(Map.of("error","Research persistence is unavailable"));}
}
