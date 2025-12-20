package com.researchos.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.util.UUID;
import java.math.BigDecimal;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "scenario_impact")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScenarioImpact {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scenario_id")
    @JsonIgnore
    private Scenario scenario;

    @Column(name = "factor_name")
    private String factorName; // e.g., "Technology Sector", "Oil Price"

    @Column(name = "impact_coefficient")
    private BigDecimal impactCoefficient; // e.g., -0.20 for 20% drop
}
