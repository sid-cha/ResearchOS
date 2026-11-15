package com.researchos.api.controller;

import com.researchos.api.entity.Company;
import com.researchos.api.service.CompanyService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/companies")
public class CompanyController {

    private final CompanyService companyService;
    private final com.researchos.api.service.MarketDataService marketDataService;

    @Autowired
    public CompanyController(CompanyService companyService,
            com.researchos.api.service.MarketDataService marketDataService) {
        this.companyService = companyService;
        this.marketDataService = marketDataService;
    }

    @GetMapping
    public List<Company> getAllCompanies() {
        return companyService.getAllCompanies();
    }

    @GetMapping("/{ticker}")
    public ResponseEntity<Company> getCompany(@PathVariable String ticker) {
        return companyService.getCompanyByTicker(ticker)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Company createCompany(@RequestBody Company company) {
        return companyService.createCompany(company);
    }

    @PostMapping("/fetch/{ticker}")
    public ResponseEntity<Company> fetchAndCreateCompany(@PathVariable String ticker) {
        try {
            Company fetchedCompany = marketDataService.fetchCompanyProfile(ticker);
            Company savedCompany = companyService.createCompany(fetchedCompany);
            return ResponseEntity.ok(savedCompany);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.badRequest().build();
        }
    }
}
