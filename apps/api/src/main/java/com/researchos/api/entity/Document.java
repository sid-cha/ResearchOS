package com.researchos.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.util.UUID;
import java.time.LocalDate;

@Entity
@Table(name = "document")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Document {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "company_ticker")
    private String companyTicker;

    private String type; // 10-K, 10-Q, TRANSCRIPT
    private LocalDate date;
    private String title;
    private String url;

    @Column(name = "s3_key")
    private String s3Key;

    private Boolean processed = false;
}
