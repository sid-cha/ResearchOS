package com.researchos.api.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Entity
@Table(name = "metric")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Metric {
    @Id
    private String code;
    private String name;
    private String category;
    private String description;
}
