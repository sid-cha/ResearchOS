package com.researchos.api.repository;

import com.researchos.api.entity.DocChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface DocChunkRepository extends JpaRepository<DocChunk, UUID> {
}
