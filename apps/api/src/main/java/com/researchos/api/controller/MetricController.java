package com.researchos.api.controller;

import com.researchos.api.service.MetricEngineService;
import com.researchos.api.entity.MetricValue;
import com.researchos.api.repository.MetricValueRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/metrics")
public class MetricController {

    private final MetricEngineService metricEngineService;
    private final MetricValueRepository metricValueRepository;

    @Autowired
    public MetricController(MetricEngineService metricEngineService, MetricValueRepository metricValueRepository) {
        this.metricEngineService = metricEngineService;
        this.metricValueRepository = metricValueRepository;
    }

    @PostMapping("/{ticker}/calculate")
    public void calculateMetrics(@PathVariable String ticker) {
        metricEngineService.calculateMetrics(ticker);
    }

    @GetMapping("/{ticker}")
    public List<MetricValue> getMetrics(@PathVariable String ticker) {
        return metricValueRepository.findByCompanyTicker(ticker);
    }
}
