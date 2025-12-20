package com.researchos.api.service;

import com.researchos.api.entity.Statement;
import com.researchos.api.repository.StatementRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class StatementService {

    private final StatementRepository statementRepository;

    @Autowired
    public StatementService(StatementRepository statementRepository) {
        this.statementRepository = statementRepository;
    }

    public Statement saveStatement(Statement statement) {
        return statementRepository.save(statement);
    }

    public List<Statement> getStatementsByTicker(String ticker) {
        return statementRepository.findByCompanyTicker(ticker);
    }
}
