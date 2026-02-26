# no-mock-check.ps1
# Ensures no mock data references remain in the Mission Control codebase.

$foundMocks = @()
$searchPaths = @(
    "c:/openclaw_stack/workspace/mission-control/app",
    "c:/openclaw_stack/workspace/mission-control/components",
    "c:/openclaw_stack/workspace/mission-control/sdk"
)

$patterns = @(
    "mockTasks",
    "mockAgents",
    "mockSessions",
    "mockCrons",
    "mockAlerts",
    "mockMetrics",
    "mockData",
    "taskStore",
    "Database unavailable, using mock tasks",
    "fallbackTasks"
)

Write-Host "Checking for mock data references..."

foreach ($path in $searchPaths) {
    foreach ($pattern in $patterns) {
        $results = Get-ChildItem -Path $path -Recurse -Include *.ts,*.tsx,*.js,*.jsx,*.md -ErrorAction SilentlyContinue | Where-Object { $_.ReadLines() -join "`n" -match $pattern }
        if ($results) {
            foreach ($result in $results) {
                $foundMocks += "Found '$pattern' in $($result.FullName)"
            }
        }
    }
}

if ($foundMocks.Count -gt 0) {
    Write-Host "\nERROR: Found mock data references:"
    $foundMocks | ForEach-Object { Write-Host "- $_" }
    exit 1
} else {
    Write-Host "\nSUCCESS: No mock data references found."
    exit 0
}
