package com.researchos.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.researchos.api.entity.Company;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;

@Service
public class MarketDataService {

    private final WebClient webClient;

    @Value("${researchos.api.key}")
    private String apiKey;

    public MarketDataService(@Value("${researchos.api.base-url}") String baseUrl) {
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    public Company fetchCompanyProfile(String ticker) {
        try {
            // endpoint: /profile/{ticker}?apikey={key}
            JsonNode response = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/profile/{ticker}")
                            .queryParam("apikey", apiKey)
                            .build(ticker))
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block();

            if (response != null && response.isArray() && !response.isEmpty()) {
                JsonNode profile = response.get(0);
                Company company = new Company();
                company.setTicker(ticker.toUpperCase());
                company.setName(profile.get("companyName").asText());
                company.setDescription(profile.get("description").asText());
                company.setIndustry(profile.get("industry").asText());
                // Sector is also available: profile.get("sector").asText()

                return company;
            }
        } catch (Exception e) {
            System.err.println("API call failed for " + ticker + ": " + e.getMessage());
            System.err.println("Falling back to MOCK data.");
            return createMockCompany(ticker);
        }

        return createMockCompany(ticker);
    }

    private Company createMockCompany(String ticker) {
        Company company = new Company();
        company.setTicker(ticker.toUpperCase());
        company.setName(ticker.toUpperCase() + " Inc. (Mock)");
        company.setDescription(
                "This is a mock description because the API Key is restricted or invalid. Real-time data unavailable.");
        company.setIndustry("Technology (Mock)");
        return company;
    }
}
