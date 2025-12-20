package com.researchos.api.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class ScreenRequest {
    private List<ScreenCriterion> criteria;
}
