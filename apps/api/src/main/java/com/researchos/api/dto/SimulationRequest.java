package com.researchos.api.dto;

import lombok.Data;
import java.util.List;

@Data
public class SimulationRequest {
    private List<String> tickers;
}
