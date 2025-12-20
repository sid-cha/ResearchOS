package com.researchos.api.controller;

import com.researchos.api.entity.Document;
import com.researchos.api.service.DocumentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documentService;

    @Autowired
    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @PostMapping("/upload")
    public ResponseEntity<Document> uploadDocument(@RequestParam("file") MultipartFile file,
            @RequestParam("ticker") String ticker,
            @RequestParam("type") String type) {
        try {
            Document doc = documentService.processDocument(file, ticker, type);
            return ResponseEntity.ok(doc);
        } catch (IOException e) {
            return ResponseEntity.status(500).build();
        }
    }
}
