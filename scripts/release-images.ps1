param(
  [Parameter(Mandatory = $true)]
  [string]$DockerHubRepo,

  [Parameter(Mandatory = $true)]
  [string]$GhcrRepo,

  [string]$Tag = '',

  [switch]$Latest
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $projectRoot 'package.json'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is not installed or is not on PATH.'
}

if (-not (Test-Path $packageJsonPath)) {
  throw "Missing package.json at $packageJsonPath"
}

$packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
$resolvedTag = if ($Tag) { $Tag } else { $packageJson.version }

$dockerHubImage = "${DockerHubRepo}:${resolvedTag}"
$ghcrImage = "${GhcrRepo}:${resolvedTag}"

Write-Host "Building image with tag $resolvedTag" -ForegroundColor Cyan

Push-Location $projectRoot
try {
  docker build -t $dockerHubImage .
  docker tag $dockerHubImage $ghcrImage

  if ($Latest) {
    $dockerHubLatest = "${DockerHubRepo}:latest"
    $ghcrLatest = "${GhcrRepo}:latest"

    docker tag $dockerHubImage $dockerHubLatest
    docker tag $dockerHubImage $ghcrLatest
  }

  Write-Host "Pushing $dockerHubImage" -ForegroundColor Yellow
  docker push $dockerHubImage

  Write-Host "Pushing $ghcrImage" -ForegroundColor Yellow
  docker push $ghcrImage

  if ($Latest) {
    Write-Host "Pushing latest tags" -ForegroundColor Yellow
    docker push "${DockerHubRepo}:latest"
    docker push "${GhcrRepo}:latest"
  }
} finally {
  Pop-Location
}

Write-Host 'Release push completed.' -ForegroundColor Green
