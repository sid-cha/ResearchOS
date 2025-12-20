package com.researchos.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.util.UUID;

@Entity
@Table(name = "doc_chunk")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DocChunk {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id")
    private Document document;

    @Column(name = "chunk_index")
    private Integer chunkIndex;

    @Column(columnDefinition = "TEXT")
    private String content;

    // pgvector support would typically use a custom Type or native query
    // For this prototype, we'll store it but interacting with it via JPA
    // often requires a specific library (like hibernate-vector) or native queries.
    // We will assume native queries for insertion if needed, or use a simplified
    // approach.
    // Here we treat it as a double array for mapping, though strict pgvector
    // support needs more config.
    // To avoid compilation issues without the pgvector lib, we might skip the field
    // traversal
    // or use a transient field for now.

    // Simplification for the Agent: We omit the mapped field and use JDBC/Native
    // Query
    // or assume the library `io.hypersistence:hypersistence-utils-hibernate-63` is
    // present if we want proper mapping.
    // Given the pom/gradle didn't explicitly include hypersistence, we'll leave it
    // as a placeholder/Todo
    // or simple array if supported.
    // Let's use a simple byte[] or String to avoid build errors, or just omit if we
    // aren't querying it via JPA yet.
    // Better: Add the dependency or just leave it out of JPA and insert via JDBC.
    // Decision: Omit from Entity to avoid build errors, insert via Service using
    // native query.
}
