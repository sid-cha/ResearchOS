$headers = @{
    "Content-Type" = "application/json"
}

$companies = @(
    @{
        ticker = "AAPL"
        name = "Apple Inc."
        description = "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide."
        industry = "Consumer Electronics"
    },
    @{
        ticker = "META"
        name = "Meta Platforms, Inc."
        description = "Meta Platforms, Inc. engages in the development of social media applications. It operates through the Family of Apps (FoA) and Reality Labs (RL) segments."
        industry = "Internet Content & Information"
    },
    @{
        ticker = "GOOGL"
        name = "Alphabet Inc."
        description = "Alphabet Inc. offers various products and platforms in the United States, Europe, the Middle East, Africa, the Asia-Pacific, Canada, and Latin America."
        industry = "Internet Content & Information"
    },
    @{
        ticker = "MSFT"
        name = "Microsoft Corporation"
        description = "Microsoft Corporation receives ample support from its cloud computing arm, Azure, which is one of the top two cloud service providers in the world."
        industry = "Software - Infrastructure"
    },
    @{
        ticker = "NVDA"
        name = "NVIDIA Corporation"
        description = "NVIDIA Corporation is the leading designer of graphics processing units that enhance the experience on computing platforms."
        industry = "Semiconductors"
    }
)

foreach ($company in $companies) {
    $body = $company | ConvertTo-Json
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8080/api/companies" -Method Post -Headers $headers -Body $body -ErrorAction Stop
        Write-Host "Successfully created $($company.ticker)" -ForegroundColor Green
    } catch {
        Write-Host "Failed to create $($company.ticker): $($_.Exception.Message)" -ForegroundColor Red
        # Check if it's a conflict (already exists)
        if ($_.Exception.Response.StatusCode -eq [System.Net.HttpStatusCode]::Conflict) {
             Write-Host "  (Company likely already exists)" -ForegroundColor Yellow
        }
    }
}

Write-Host "`nSeeding complete! View companies at:"
Write-Host "http://localhost:3000/company/AAPL"
Write-Host "http://localhost:3000/company/META"
Write-Host "http://localhost:3000/company/GOOGL"
