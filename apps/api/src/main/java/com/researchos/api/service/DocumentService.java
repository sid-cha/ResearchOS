package com.researchos.api.service;

import com.researchos.api.dto.MlDto;
import com.researchos.api.entity.DocChunk;
import com.researchos.api.entity.Document;
import com.researchos.api.repository.DocChunkRepository;
import com.researchos.api.repository.DocumentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

@Service
public class DocumentService {

    private final DocumentRepository documentRepository;
    private final DocChunkRepository docChunkRepository;
    private final RestTemplate restTemplate;

    // In a real app, from config
    private final String ML_SERVICE_URL = "http://localhost:8000";

    @Autowired
    public DocumentService(DocumentRepository documentRepository,
            DocChunkRepository docChunkRepository,
            RestTemplateBuilder builder) {
        this.documentRepository = documentRepository;
        this.docChunkRepository = docChunkRepository;
        this.restTemplate = builder.build();
    }

    public Document processDocument(MultipartFile file, String ticker, String type) throws IOException {
        // 1. Save metadata
        Document doc = new Document();
        doc.setCompanyTicker(ticker);
        doc.setType(type);
        doc.setDate(LocalDate.now());
        doc.setTitle(file.getOriginalFilename());
        doc.setProcessed(false);

        doc = documentRepository.save(doc); // Save first to get ID

        // 2. Extract Text (Simplified: assume text/plain or naive PDF read)
        String content = new String(file.getBytes(), StandardCharsets.UTF_8);

        // 3. Call ML Service
        MlDto.ProcessDocRequest req = new MlDto.ProcessDocRequest(content, ticker);
        try {
            MlDto.ProcessDocResponse resp = restTemplate.postForObject(
                    ML_SERVICE_URL + "/process_document",
                    req,
                    MlDto.ProcessDocResponse.class);

            // 4. Save Chunks
            if (resp != null && resp.getChunks() != null) {
                for (MlDto.Chunk responseChunk : resp.getChunks()) {
                    DocChunk chunk = new DocChunk();
                    chunk.setDocument(doc);
                    chunk.setChunkIndex(responseChunk.getIndex());
                    chunk.setContent(responseChunk.getText());
                    // chunk.setEmbedding(responseChunk.getEmbedding()); // See Note in Entity

                    docChunkRepository.save(chunk);
                }
                doc.setProcessed(true);
                return documentRepository.save(doc);
            }
        } catch (Exception e) {
            e.printStackTrace();
            // Fallback: processed=false
        }

        return doc;
    }
}
