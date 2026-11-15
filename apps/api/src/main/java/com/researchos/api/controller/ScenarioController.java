package com.researchos.api.controller;

import com.researchos.api.dto.SimulationRequest;
import com.researchos.api.entity.Scenario;
import com.researchos.api.service.ScenarioService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/scenarios")
public class ScenarioController {

    private final ScenarioService scenarioService;

    @Autowired
    public ScenarioController(ScenarioService scenarioService) {
        this.scenarioService = scenarioService;
    }

    @GetMapping
    public List<Scenario> getScenarios() {
        return scenarioService.getAllScenarios();
    }

    @PostMapping("/{id}/simulate")
    public Map<String, BigDecimal> simulate(@PathVariable UUID id, @RequestBody SimulationRequest request) {
        return scenarioService.simulate(id, request);
    }
}
