package com.researchos.api.service;

import com.researchos.api.dto.SimulationRequest;
import com.researchos.api.entity.Company;
import com.researchos.api.entity.Scenario;
import com.researchos.api.entity.ScenarioImpact;
import com.researchos.api.repository.CompanyRepository;
import com.researchos.api.repository.ScenarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.*;

@Service
public class ScenarioService {

    private final ScenarioRepository scenarioRepository;
    private final CompanyRepository companyRepository;

    @Autowired
    public ScenarioService(ScenarioRepository scenarioRepository, CompanyRepository companyRepository) {
        this.scenarioRepository = scenarioRepository;
        this.companyRepository = companyRepository;
    }

    public List<Scenario> getAllScenarios() {
        return scenarioRepository.findAll();
    }

    public Map<String, BigDecimal> simulate(UUID scenarioId, SimulationRequest request) {
        Optional<Scenario> scenarioOpt = scenarioRepository.findById(scenarioId);
        if (scenarioOpt.isEmpty())
            return Collections.emptyMap();

        Scenario scenario = scenarioOpt.get();
        Map<String, BigDecimal> results = new HashMap<>();

        // Fetch companies to get their industry/sector
        // In a real system, we'd batch fetch
        for (String ticker : request.getTickers()) {
            Optional<Company> companyOpt = companyRepository.findById(ticker);
            if (companyOpt.isPresent()) {
                Company company = companyOpt.get();
                BigDecimal rawImpact = BigDecimal.ZERO;

                // Naive simulation: Match company industry to impact factor
                for (ScenarioImpact impact : scenario.getImpacts()) {
                    if (company.getIndustry() != null &&
                            company.getIndustry().equalsIgnoreCase(impact.getFactorName())) {
                        rawImpact = rawImpact.add(impact.getImpactCoefficient());
                    }
                }

                results.put(ticker, rawImpact);
            }
        }

        return results;
    }
}
