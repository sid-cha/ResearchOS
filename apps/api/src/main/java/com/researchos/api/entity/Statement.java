package com.researchos.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDate;
import java.util.UUID;
import java.util.List;

@Entity
@Table(name = "statement")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Statement {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "company_ticker")
    private String companyTicker;

    private String type; // INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW
    private String period; // Q1, Q2, Q3, Q4, FY
    private Integer year;
    private LocalDate date;

    @Column(name = "source_url")
    private String sourceUrl;

    @OneToMany(mappedBy = "statement", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<StatementLine> lines;
}
