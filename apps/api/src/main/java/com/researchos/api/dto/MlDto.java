package com.researchos.api.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import java.util.List;

public class MlDto {
    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class ProcessDocRequest {
        private String content;
        private String ticker;
    }

    @Data
    public static class ProcessDocResponse {
        private List<Chunk> chunks;
    }

    @Data
    public static class Chunk {
        private Integer index;
        private String text;
        private List<Double> embedding;
    }
}
