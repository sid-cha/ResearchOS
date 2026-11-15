package com.researchos.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.util.UUID;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "scenario_phase")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScenarioPhase {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scenario_id")
    @JsonIgnore
    private Scenario scenario;

    private String name;

    @Column(name = "start_offset_days")
    private Integer startOffsetDays;

    @Column(name = "end_offset_days")
    private Integer endOffsetDays;
}
