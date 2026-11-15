package com.researchos.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.util.UUID;
import java.util.List;

@Entity
@Table(name = "scenario")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Scenario {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String name;
    private String description;

    @Column(name = "base_year")
    private Integer baseYear;

    @OneToMany(mappedBy = "scenario", cascade = CascadeType.ALL)
    private List<ScenarioPhase> phases;

    @OneToMany(mappedBy = "scenario", cascade = CascadeType.ALL)
    private List<ScenarioImpact> impacts;
}
