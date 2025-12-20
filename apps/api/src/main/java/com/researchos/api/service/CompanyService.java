package com.researchos.api.service;

import com.researchos.api.entity.Company;
import com.researchos.api.repository.CompanyRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class CompanyService {

    private final CompanyRepository companyRepository;

    @Autowired
    public CompanyService(CompanyRepository companyRepository) {
        this.companyRepository = companyRepository;
    }

    public List<Company> getAllCompanies() {
        return companyRepository.findAll();
    }

    public Optional<Company> getCompanyByTicker(String ticker) {
        return companyRepository.findById(ticker);
    }

    public Company createCompany(Company company) {
        return companyRepository.save(company);
    }
}
