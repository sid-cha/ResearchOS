package com.researchos.api.controller;

import com.researchos.api.entity.Statement;
import com.researchos.api.service.StatementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/statements")
public class StatementController {

    private final StatementService statementService;

    @Autowired
    public StatementController(StatementService statementService) {
        this.statementService = statementService;
    }

    @GetMapping("/{ticker}")
    public List<Statement> getStatements(@PathVariable String ticker) {
        return statementService.getStatementsByTicker(ticker);
    }

    @PostMapping
    public Statement createStatement(@RequestBody Statement statement) {
        return statementService.saveStatement(statement);
    }
}
