package com.researchos.api.repository;

import com.researchos.api.entity.Statement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface StatementRepository extends JpaRepository<Statement, UUID> {
    List<Statement> findByCompanyTicker(String companyTicker);

    List<Statement> findByCompanyTickerAndType(String companyTicker, String type);
}
