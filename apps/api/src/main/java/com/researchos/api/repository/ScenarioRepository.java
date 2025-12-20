package com.researchos.api.repository;

import com.researchos.api.entity.Scenario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface ScenarioRepository extends JpaRepository<Scenario, UUID> {
}
