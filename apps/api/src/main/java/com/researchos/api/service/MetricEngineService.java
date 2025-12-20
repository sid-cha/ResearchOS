package com.researchos.api.service;

import com.researchos.api.entity.MetricValue;
import com.researchos.api.entity.Statement;
import com.researchos.api.entity.StatementLine;
import com.researchos.api.repository.MetricValueRepository;
import com.researchos.api.repository.StatementRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
public class MetricEngineService {

    private final StatementRepository statementRepository;
    private final MetricValueRepository metricValueRepository;

    @Autowired
    public MetricEngineService(StatementRepository statementRepository, MetricValueRepository metricValueRepository) {
        this.statementRepository = statementRepository;
        this.metricValueRepository = metricValueRepository;
    }

    public void calculateMetrics(String ticker) {
        List<Statement> statements = statementRepository.findByCompanyTicker(ticker);

        for (Statement stmt : statements) {
            if ("INCOME_STATEMENT".equals(stmt.getType())) {
                calculateProfitabilityMetrics(stmt, ticker);
            }
        }
    }

    private void calculateProfitabilityMetrics(Statement stmt, String ticker) {
        BigDecimal revenue = getLineValue(stmt, "Total Revenue");
        BigDecimal cogs = getLineValue(stmt, "Cost of Goods Sold");

        if (revenue != null && cogs != null && revenue.compareTo(BigDecimal.ZERO) != 0) {
            BigDecimal grossProfit = revenue.subtract(cogs);
            BigDecimal grossMargin = grossProfit.divide(revenue, 4, RoundingMode.HALF_UP);

            saveMetric(ticker, "GROSS_MARGIN", stmt.getDate(), grossMargin);
        }
    }

    private BigDecimal getLineValue(Statement stmt, String lineItemName) {
        return stmt.getLines().stream()
                .filter(l -> l.getLineItem().equalsIgnoreCase(lineItemName))
                .findFirst()
                .map(StatementLine::getValue)
                .orElse(null);
    }

    private void saveMetric(String ticker, String code, LocalDate date, BigDecimal value) {
        MetricValue metric = new MetricValue();
        metric.setCompanyTicker(ticker);
        metric.setMetricCode(code);
        metric.setDate(date);
        metric.setValue(value);
        metricValueRepository.save(metric);
    }
}
