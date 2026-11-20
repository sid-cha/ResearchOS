package com.researchos.api.service;
import com.researchos.api.dto.*;
import com.researchos.api.entity.*;
import com.researchos.api.repository.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class ScreenerServiceTest {
    private MetricValue metric(String date,String value){return new MetricValue(null,"GROSS_MARGIN","MSFT",LocalDate.parse(date),new BigDecimal(value));}
    @Test void repeatedHistoricalMetricsUseLatestCompatibleValueWithoutDuplicateKeyFailure(){
        var companies=mock(CompanyRepository.class);var values=mock(MetricValueRepository.class);var company=new Company();company.setTicker("MSFT");
        when(companies.findAll()).thenReturn(List.of(company));when(values.findByCompanyTicker("MSFT")).thenReturn(List.of(metric("2025-01-01","0.1"),metric("2026-01-01","0.5"),metric("2026-01-01","0.50")));
        var criterion=new ScreenCriterion();criterion.setField("metric:GROSS_MARGIN");criterion.setOperator("GT");criterion.setValue(new BigDecimal("0.4"));
        var request=new ScreenRequest();request.setCriteria(List.of(criterion));
        assertEquals(1,new ScreenerService(companies,values).executeScreen(request).size());
        when(values.findByCompanyTicker("MSFT")).thenReturn(List.of(metric("2026-01-01","0.5"),metric("2026-01-01","0.2")));
        assertTrue(new ScreenerService(companies,values).executeScreen(request).isEmpty());
    }
}
