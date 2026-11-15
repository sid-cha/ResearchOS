package com.researchos.api.controller;

import com.researchos.api.dto.ScreenRequest;
import com.researchos.api.entity.Company;
import com.researchos.api.service.ScreenerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/screens")
public class ScreenerController {

    private final ScreenerService screenerService;

    @Autowired
    public ScreenerController(ScreenerService screenerService) {
        this.screenerService = screenerService;
    }

    @PostMapping("/execute")
    public List<Company> executeScreen(@RequestBody ScreenRequest request) {
        return screenerService.executeScreen(request);
    }
}
