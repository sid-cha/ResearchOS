package com.researchos.api.repository;

import com.researchos.api.entity.MetricValue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface MetricValueRepository extends JpaRepository<MetricValue, UUID> {
    List<MetricValue> findByCompanyTicker(String companyTicker);

    List<MetricValue> findByCompanyTickerAndMetricCode(String companyTicker, String metricCode);
}
