package com.researchos.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.util.UUID;
import java.math.BigDecimal;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "statement_line")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class StatementLine {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "statement_id")
    @JsonIgnore
    private Statement statement;

    @Column(name = "line_item")
    private String lineItem;

    private BigDecimal value;

    @Column(name = "display_order")
    private Integer displayOrder;
}
