package com.researchos.api.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class ScreenCriterion {
    private String field; // e.g. "metric:GROSS_MARGIN"
    private String operator; // GT, LT, EQ, GTE, LTE
    private BigDecimal value;
}
