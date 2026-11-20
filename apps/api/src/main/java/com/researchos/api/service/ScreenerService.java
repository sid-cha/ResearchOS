package com.researchos.api.service;

import com.researchos.api.dto.ScreenCriterion;
import com.researchos.api.dto.ScreenRequest;
import com.researchos.api.entity.Company;
import com.researchos.api.entity.MetricValue;
import com.researchos.api.repository.CompanyRepository;
import com.researchos.api.repository.MetricValueRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Objects;
import java.time.LocalDate;
import java.util.stream.Collectors;

@Service
public class ScreenerService {

    private final CompanyRepository companyRepository;
    private final MetricValueRepository metricValueRepository;

    @Autowired
    public ScreenerService(CompanyRepository companyRepository, MetricValueRepository metricValueRepository) {
        this.companyRepository = companyRepository;
        this.metricValueRepository = metricValueRepository;
    }

    public List<Company> executeScreen(ScreenRequest request) {
        List<Company> allCompanies = companyRepository.findAll();
        List<Company> matches = new ArrayList<>();

        for (Company company : allCompanies) {
            if (matchesCriteria(company, request.getCriteria())) {
                matches.add(company);
            }
        }
        return matches;
    }

    private boolean matchesCriteria(Company company, List<ScreenCriterion> criteria) {
        // Fetch all metrics for this company
        // Optimization: In a real app we'd fetch this in bulk or use SQL
        List<MetricValue> metrics = metricValueRepository.findByCompanyTicker(company.getTicker());
        Map<String,MetricValue> metricMap=new HashMap<>();
        metrics.stream().filter(m->m.getMetricCode()!=null&&m.getDate()!=null)
                .collect(Collectors.groupingBy(MetricValue::getMetricCode)).forEach((code,history)->{
                    LocalDate latest=history.stream().map(MetricValue::getDate).max(LocalDate::compareTo).orElseThrow();
                    List<MetricValue> current=history.stream().filter(m->m.getDate().equals(latest)).toList();
                    MetricValue candidate=current.getFirst();
                    // Duplicate equal calculations are safe; conflicting latest values are unknown.
                    if(candidate.getValue()!=null&&current.stream().allMatch(m->m.getValue()!=null&&m.getValue().compareTo(candidate.getValue())==0))metricMap.put(code,candidate);
                });

        for (ScreenCriterion c : criteria) {
            if (c.getField().startsWith("metric:")) {
                String metricCode = c.getField().substring(7);
                MetricValue mv = metricMap.get(metricCode);

                if (mv == null)
                    return false; // Metric not found -> fail

                int compare = mv.getValue().compareTo(c.getValue());
                boolean pass = switch (c.getOperator()) {
                    case "GT" -> compare > 0;
                    case "LT" -> compare < 0;
                    case "EQ" -> compare == 0;
                    case "GTE" -> compare >= 0;
                    case "LTE" -> compare <= 0;
                    default -> false;
                };

                if (!pass)
                    return false;
            }
            // Add other field handlers here (e.g. industry)
        }
        return true;
    }
}
