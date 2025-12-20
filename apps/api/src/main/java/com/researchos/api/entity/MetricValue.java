package com.researchos.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.util.UUID;
import java.time.LocalDate;
import java.math.BigDecimal;

@Entity
@Table(name = "metric_value")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class MetricValue {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "metric_code")
    private String metricCode;

    @Column(name = "company_ticker")
    private String companyTicker;

    private LocalDate date;
    private BigDecimal value;
}
