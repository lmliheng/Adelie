# Hermetic Windows installer tests with tiny fixtures: offline upgrade rollback, canonical
# bundle installs (local, sibling and online), both checksum layers, no-fallback failures, and
# pre-0.1.6 legacy archives from pinned versions.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Installer = Join-Path $RepoRoot "install.ps1"
$WorkDir = Join-Path ([IO.Path]::GetTempPath()) "penguin-installer-tests-$PID"
$OriginalPath = $env:Path
$OriginalOs = $env:OS
$OriginalDownloadBaseUrl = $env:PENGUIN_DOWNLOAD_BASE_URL
$OriginalDownloadFallbackBaseUrl = $env:PENGUIN_DOWNLOAD_FALLBACK_BASE_URL
$OriginalDownloadSource = $env:PENGUIN_DOWNLOAD_SOURCE
$OriginalArchive = $env:PENGUIN_ARCHIVE
$OriginalInstallDir = $env:PENGUIN_INSTALL_DIR
$OriginalVersion = $env:PENGUIN_VERSION
$Fixture = @{
  Requests = [Collections.Generic.List[string]]::new()
  Mode = "canonical"
  GoodBundle = $null
  BadInnerBundle = $null
  LegacyArchive = $null
  Installer = $Installer
}
$global:PenguinInstallerFixture = $Fixture

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "test failure: $Message" }
}

function New-FixtureArchive([string]$Name, [bool]$Fails = $false) {
  $SourceDir = Join-Path $WorkDir "$Name-source"
  $PenguinDir = Join-Path $SourceDir "penguin"
  New-Item -ItemType Directory -Path (Join-Path $PenguinDir "bin") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $PenguinDir "lib") -Force | Out-Null
  $VersionLines = if ($Fails) {
    @("echo fixture runtime failure 1>&2", "exit /b 42")
  } else {
    @("echo fixture-old", "exit /b 0")
  }
  @("@echo off", "if `"%~1`"==`"--version`" (") + $VersionLines + @(")", "exit /b 0") |
    Set-Content -LiteralPath (Join-Path $PenguinDir "bin\penguin.cmd") -Encoding ascii
  "fixture" | Set-Content -LiteralPath (Join-Path $PenguinDir "lib\fixture.txt") -Encoding ascii
  @{ schemaVersion = 1; target = "win32-x64" } | ConvertTo-Json -Compress |
    Set-Content -LiteralPath (Join-Path $PenguinDir "package-manifest.json") -Encoding ascii
  $Archive = Join-Path $WorkDir "$Name.zip"
  Compress-Archive -Path $PenguinDir -DestinationPath $Archive -CompressionLevel Fastest
  $Hash = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash
  "$Hash  $([IO.Path]::GetFileName($Archive))" |
    Set-Content -LiteralPath "$Archive.sha256" -Encoding ascii
  return $Archive
}

# Serves release assets for the online cases. The new installer never inspects HTTP status
# codes, so failure modes are plain throws.
function global:Invoke-WebRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [switch]$UseBasicParsing,
    [int]$TimeoutSec = 0
  )
  $f = $global:PenguinInstallerFixture
  $f.Requests.Add($Uri)
  if ($f.Mode -eq "404") { throw "fixture 404: $Uri" }
  if ($f.Mode -eq "network") { throw "fixture network failure: $Uri" }
  if ($f.Mode -eq "primary-network" -and $Uri -like "https://primary.example.test/*") {
    throw "fixture primary network failure"
  }
  switch -Wildcard ($Uri) {
    "*/penguin-win32-x64.zip.sha256" {
      switch ($f.Mode) {
        "outer-sha-mismatch" {
          ("0" * 64) + "  penguin-win32-x64.zip" | Set-Content -LiteralPath $OutFile -Encoding ascii
        }
        "inner-sha-mismatch" { Copy-Item -LiteralPath "$($f.BadInnerBundle).sha256" -Destination $OutFile }
        "legacy" { Copy-Item -LiteralPath "$($f.LegacyArchive).sha256" -Destination $OutFile }
        default { Copy-Item -LiteralPath "$($f.GoodBundle).sha256" -Destination $OutFile }
      }
    }
    "*/penguin-win32-x64.zip" {
      switch ($f.Mode) {
        "inner-sha-mismatch" { Copy-Item -LiteralPath $f.BadInnerBundle -Destination $OutFile }
        "legacy" { Copy-Item -LiteralPath $f.LegacyArchive -Destination $OutFile }
        default { Copy-Item -LiteralPath $f.GoodBundle -Destination $OutFile }
      }
    }
    default { throw "unexpected fixture request: $Uri" }
  }
}

function Invoke-OnlineCase(
  [string]$Name,
  [string]$Mode,
  [string]$Version,
  [bool]$ShouldSucceed,
  [int]$ExpectedRequests,
  [string]$InstallerPath = ""
) {
  $Fixture.Mode = $Mode
  $Fixture.Requests.Clear()
  $InstallDir = Join-Path $WorkDir "$Name-install"
  $Arguments = @{ InstallDir = $InstallDir }
  if ($Version) { $Arguments.Version = $Version }
  if (-not $InstallerPath) { $InstallerPath = $Installer }
  $Succeeded = $true
  $Output = @()
  try { $Output = @(& $InstallerPath @Arguments *>&1) } catch { $Succeeded = $false; $Output += $_ }
  Assert-True ($Succeeded -eq $ShouldSucceed) "$Name returned an unexpected result: $(($Output | Out-String).Trim())"
  Assert-True ($Fixture.Requests.Count -eq $ExpectedRequests) `
    "$Name made $($Fixture.Requests.Count) requests, expected $ExpectedRequests"
  [PSCustomObject]@{ InstallDir = $InstallDir; Requests = @($Fixture.Requests); Output = @($Output) }
}

try {
  New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
  # Keep the fixture tests away from the runner's user registry Path.
  $env:OS = "PenguinInstallerFixtureTest"
  Remove-Item Env:\PENGUIN_DOWNLOAD_BASE_URL, Env:\PENGUIN_DOWNLOAD_FALLBACK_BASE_URL, `
    Env:\PENGUIN_DOWNLOAD_SOURCE, Env:\PENGUIN_ARCHIVE, Env:\PENGUIN_INSTALL_DIR, `
    Env:\PENGUIN_VERSION -ErrorAction SilentlyContinue

  # --- Offline program archive: good install, then a failing upgrade must roll back. ---
  $InstallDir = Join-Path $WorkDir "offline-installed"
  $GoodArchive = New-FixtureArchive "valid"
  & $Installer -InstallDir $InstallDir -ArchivePath $GoodArchive *>&1 | Out-Null

  $FailedArchive = New-FixtureArchive "failure" $true
  $Failed = $false
  try {
    & $Installer -InstallDir $InstallDir -ArchivePath $FailedArchive *>&1 | Out-Null
  } catch {
    $Failed = $true
  }
  Assert-True $Failed "failing Windows upgrade unexpectedly succeeded"
  $Version = & (Join-Path $InstallDir "bin\penguin.cmd") --version
  Assert-True ($Version -eq "fixture-old") "previous Windows installation was not restored"

  # --- A second installation beside the first leaves `penguin` with the first: with
  #     -NoModifyPath its bin directory is not put on the Path. ---
  $SecondDir = Join-Path $WorkDir "offline-second"
  $SecondBin = Join-Path $SecondDir "bin"
  & $Installer -InstallDir $SecondDir -ArchivePath $GoodArchive -NoModifyPath *>&1 | Out-Null
  $Version = & (Join-Path $SecondBin "penguin.cmd") --version
  Assert-True ($Version -eq "fixture-old") "second Windows installation did not produce a working command"
  Assert-True (($env:Path -split ";") -notcontains $SecondBin) "-NoModifyPath still put the second installation on the Path"

  # --- Canonical bundle fixtures: flat outer layer sealing payload.zip + checksum + installers. ---
  $BundleDir = Join-Path $WorkDir "bundle"
  New-Item -ItemType Directory -Path $BundleDir | Out-Null
  Copy-Item $GoodArchive (Join-Path $BundleDir "payload.zip")
  $PayloadHash = (Get-FileHash -LiteralPath (Join-Path $BundleDir "payload.zip") -Algorithm SHA256).Hash
  "$PayloadHash  payload.zip" |
    Set-Content -LiteralPath (Join-Path $BundleDir "payload.zip.sha256") -Encoding ascii
  Copy-Item (Join-Path $RepoRoot "install.ps1"), (Join-Path $RepoRoot "install.cmd") $BundleDir
  $Fixture.GoodBundle = Join-Path $WorkDir "penguin-win32-x64.zip"
  Compress-Archive -Path (Join-Path $BundleDir "*") -DestinationPath $Fixture.GoodBundle -CompressionLevel Fastest
  $GoodHash = (Get-FileHash $Fixture.GoodBundle -Algorithm SHA256).Hash
  "$GoodHash  penguin-win32-x64.zip" |
    Set-Content -LiteralPath "$($Fixture.GoodBundle).sha256" -Encoding ascii

  $BadBundleDir = Join-Path $WorkDir "bad-bundle"
  Copy-Item $BundleDir $BadBundleDir -Recurse
  (("0" * 64) + "  payload.zip") |
    Set-Content (Join-Path $BadBundleDir "payload.zip.sha256") -Encoding ascii
  $Fixture.BadInnerBundle = Join-Path $WorkDir "bad-inner.zip"
  Compress-Archive -Path (Join-Path $BadBundleDir "*") -DestinationPath $Fixture.BadInnerBundle
  $BadHash = (Get-FileHash $Fixture.BadInnerBundle -Algorithm SHA256).Hash
  "$BadHash  penguin-win32-x64.zip" |
    Set-Content -LiteralPath "$($Fixture.BadInnerBundle).sha256" -Encoding ascii

  $Fixture.LegacyArchive = $GoodArchive

  # Model the release workflow's installer stamping without changing the source installer.
  $StampedInstaller = Join-Path $WorkDir "install-v0.0.0-test.ps1"
  $InstallerText = [IO.File]::ReadAllText($Installer, [Text.UTF8Encoding]::new($false))
  Assert-True ($InstallerText.Contains('__PENGUIN_RELEASE_VERSION__')) `
    "Windows installer release-version token is missing"
  $InstallerText = $InstallerText.Replace('__PENGUIN_RELEASE_VERSION__', 'v0.0.0-test')
  [IO.File]::WriteAllText($StampedInstaller, $InstallerText, [Text.UTF8Encoding]::new($false))

  # --- Local bundle via -ArchivePath: opened flat, sealed payload checksum verified. ---
  $BundleInstall = Join-Path $WorkDir "bundle-install"
  & $Installer -InstallDir $BundleInstall -ArchivePath $Fixture.GoodBundle *>&1 | Out-Null
  $Version = & (Join-Path $BundleInstall "bin\penguin.cmd") --version
  Assert-True ($Version -eq "fixture-old") "local bundle install did not produce a working command"

  # --- Extracted bundle: install.ps1 next to payload.zip installs it with no network. ---
  $SiblingDir = Join-Path $WorkDir "sibling"
  New-Item -ItemType Directory -Path $SiblingDir | Out-Null
  Expand-Archive -LiteralPath $Fixture.GoodBundle -DestinationPath $SiblingDir
  $SiblingInstall = Join-Path $WorkDir "sibling-install"
  $Fixture.Requests.Clear()
  & (Join-Path $SiblingDir "install.ps1") -InstallDir $SiblingInstall *>&1 | Out-Null
  Assert-True ($Fixture.Requests.Count -eq 0) "sibling install unexpectedly touched the network"
  $Version = & (Join-Path $SiblingInstall "bin\penguin.cmd") --version
  Assert-True ($Version -eq "fixture-old") "sibling install did not produce a working command"

  # --- Online cases. ---
  # Unstamped source-tree installer: no embedded tag, so it follows GitHub's "latest" release.
  $canonical = Invoke-OnlineCase "canonical" "canonical" "" $true 2
  Assert-True ($canonical.Requests[0] -eq "https://github.com/lmliheng/Adelie/releases/latest/download/penguin-win32-x64.zip") `
    "unstamped installer did not use the latest GitHub release"
  Assert-True (-not (($canonical.Requests | Out-String) -match 'aliyuncs')) `
    "installer still reaches the retired OSS mirror"
  $Version = & (Join-Path $canonical.InstallDir "bin\penguin.cmd") --version
  Assert-True ($Version -eq "fixture-old") "canonical bundle was not installed"

  # A stamped release installer uses its own immutable tag and never resolves "latest".
  $stamped = Invoke-OnlineCase "stamped" "canonical" "" $true 2 $StampedInstaller
  Assert-True ($stamped.Requests[0] -eq "https://github.com/lmliheng/Adelie/releases/download/v0.0.0-test/penguin-win32-x64.zip") `
    "stamped installer did not select its own immutable release"
  Assert-True (-not (($stamped.Requests | Out-String) -match '/latest/')) `
    "stamped installer unexpectedly resolved the latest release"

  # GitHub is an accepted explicit source mode and behaves like auto.
  $env:PENGUIN_DOWNLOAD_SOURCE = "github"
  $stampedGitHub = Invoke-OnlineCase "stamped-github" "canonical" "" $true 2 $StampedInstaller
  Assert-True ($stampedGitHub.Requests[0] -like "https://github.com/*/releases/download/v0.0.0-test/penguin-win32-x64.zip") `
    "stamped installer did not honor forced GitHub mode"
  Remove-Item Env:\PENGUIN_DOWNLOAD_SOURCE

  # The retired OSS mode is rejected before any request leaves the process.
  $env:PENGUIN_DOWNLOAD_SOURCE = "oss"
  $ossRejected = Invoke-OnlineCase "source-mode-oss" "canonical" "" $false 0
  Assert-True (($ossRejected.Output | Out-String) -match 'PENGUIN_DOWNLOAD_SOURCE must be auto or github') `
    "retired PENGUIN_DOWNLOAD_SOURCE=oss was not rejected"
  Remove-Item Env:\PENGUIN_DOWNLOAD_SOURCE

  # An explicit base URL overrides source selection entirely.
  $env:PENGUIN_DOWNLOAD_BASE_URL = "https://mirror.example.test/releases/v0.0.0-test"
  $override = Invoke-OnlineCase "download-base-override" "canonical" "" $true 2
  Assert-True ($override.Requests[0] -eq "https://mirror.example.test/releases/v0.0.0-test/penguin-win32-x64.zip") `
    "download base override did not request the configured asset directory"
  Assert-True (($override.Output | Out-String) -match 'configured mirror') `
    "download base override did not label the configured mirror"
  Remove-Item Env:\PENGUIN_DOWNLOAD_BASE_URL

  # A transport failure on the primary base URL falls back to the configured fallback.
  $env:PENGUIN_DOWNLOAD_BASE_URL = "https://primary.example.test/releases/v0.0.0-test"
  $env:PENGUIN_DOWNLOAD_FALLBACK_BASE_URL = "https://fallback.example.test/releases/v0.0.0-test"
  $fallback = Invoke-OnlineCase "download-fallback" "primary-network" "" $true 3
  Assert-True ($fallback.Requests[0] -eq "https://primary.example.test/releases/v0.0.0-test/penguin-win32-x64.zip") `
    "download fallback did not try the primary source first"
  Assert-True ($fallback.Requests[1] -eq "https://fallback.example.test/releases/v0.0.0-test/penguin-win32-x64.zip") `
    "download fallback did not use the configured fallback"
  Remove-Item Env:\PENGUIN_DOWNLOAD_FALLBACK_BASE_URL
  Remove-Item Env:\PENGUIN_DOWNLOAD_BASE_URL

  # A fallback without a base URL is ignored: the stamped installer keeps its own tag.
  $env:PENGUIN_DOWNLOAD_FALLBACK_BASE_URL = "https://example.invalid/releases/v0.0.0-test"
  $fallbackWithoutBase = Invoke-OnlineCase "fallback-without-base" "canonical" "" $true 2 $StampedInstaller
  Assert-True (-not (($fallbackWithoutBase.Requests | Out-String) -match 'example\.invalid')) `
    "fallback without base should not override the source-mode download"
  Assert-True (($fallbackWithoutBase.Requests | Out-String) -match 'github\.com/.*/releases/download/v0\.0\.0-test/penguin-win32-x64\.zip') `
    "fallback without base did not keep the release's own tag"
  Remove-Item Env:\PENGUIN_DOWNLOAD_FALLBACK_BASE_URL

  Remove-Item Env:\PENGUIN_ARCHIVE, Env:\PENGUIN_INSTALL_DIR, Env:\PENGUIN_DOWNLOAD_SOURCE, Env:\PENGUIN_VERSION -ErrorAction SilentlyContinue

  Invoke-OnlineCase "outer-mismatch" "outer-sha-mismatch" "" $false 2 | Out-Null
  Invoke-OnlineCase "inner-mismatch" "inner-sha-mismatch" "" $false 2 | Out-Null
  Invoke-OnlineCase "latest-404" "404" "" $false 1 | Out-Null
  Invoke-OnlineCase "pinned-network" "network" "v0.1.4" $false 1 | Out-Null
  $pinned = Invoke-OnlineCase "pinned-legacy" "legacy" "v0.1.4" $true 2
  Assert-True ($pinned.Requests[0] -eq "https://github.com/lmliheng/Adelie/releases/download/v0.1.4/penguin-win32-x64.zip") `
    "pinned legacy did not prefer the pinned release asset"

  Write-Host "Windows installer bundle, offline, rollback and online tests passed."
} finally {
  $env:Path = $OriginalPath
  $env:OS = $OriginalOs
  if ($null -eq $OriginalDownloadBaseUrl) {
    Remove-Item Env:\PENGUIN_DOWNLOAD_BASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:PENGUIN_DOWNLOAD_BASE_URL = $OriginalDownloadBaseUrl
  }
  if ($null -eq $OriginalDownloadFallbackBaseUrl) {
    Remove-Item Env:\PENGUIN_DOWNLOAD_FALLBACK_BASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:PENGUIN_DOWNLOAD_FALLBACK_BASE_URL = $OriginalDownloadFallbackBaseUrl
  }
  if ($null -eq $OriginalDownloadSource) {
    Remove-Item Env:\PENGUIN_DOWNLOAD_SOURCE -ErrorAction SilentlyContinue
  } else {
    $env:PENGUIN_DOWNLOAD_SOURCE = $OriginalDownloadSource
  }
  if ($null -eq $OriginalArchive) {
    Remove-Item Env:\PENGUIN_ARCHIVE -ErrorAction SilentlyContinue
  } else {
    $env:PENGUIN_ARCHIVE = $OriginalArchive
  }
  if ($null -eq $OriginalInstallDir) {
    Remove-Item Env:\PENGUIN_INSTALL_DIR -ErrorAction SilentlyContinue
  } else {
    $env:PENGUIN_INSTALL_DIR = $OriginalInstallDir
  }
  if ($null -eq $OriginalVersion) {
    Remove-Item Env:\PENGUIN_VERSION -ErrorAction SilentlyContinue
  } else {
    $env:PENGUIN_VERSION = $OriginalVersion
  }
  Remove-Item Function:\Invoke-WebRequest -ErrorAction SilentlyContinue
  Remove-Variable PenguinInstallerFixture -Scope Global -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force }
}
