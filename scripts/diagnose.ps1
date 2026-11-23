$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$results = New-Object System.Collections.Generic.List[object]

function Add-Result([string]$Status, [string]$Check, [string]$Detail) {
    $results.Add([pscustomobject]@{ Status = $Status; Check = $Check; Detail = $Detail })
}

function Read-Text([string]$RelativePath) {
    $fullPath = Join-Path $repoRoot $RelativePath
    if (Test-Path -LiteralPath $fullPath) {
        return [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
    }
    return $null
}

function Get-JsonPayload([string[]]$Lines) {
    $joined = $Lines -join "`n"
    $start = $joined.IndexOf('{')
    $end = $joined.LastIndexOf('}')
    if ($start -lt 0 -or $end -le $start) { return $null }
    try { return $joined.Substring($start, $end - $start + 1) | ConvertFrom-Json }
    catch { return $null }
}

Write-Host 'Diagnostic SANGO YA MBONGO' -ForegroundColor Cyan
Write-Host 'Les valeurs de configuration et les secrets ne sont jamais imprimés.'

$requiredFiles = @(
    'index.html', 'actualites.html', 'analyses.html', 'favoris.html', 'sources.html',
    'connexion.html', 'inscription.html', 'css/style.css', 'css/responsive.css',
    'js/app.js', 'js/supabase.js', 'js/auth.js', 'js/actualites.js', 'js/favoris.js',
    'js/analyses.js', 'supabase/schema.sql', 'supabase/cron.sql',
    'supabase/config.toml', 'supabase/functions/collect-news/index.ts', 'supabase/functions/collect-world-bank/index.ts', 'supabase/functions/_shared/world-bank.mjs', 'tests/world-bank.test.mjs', 'tests/site-smoke.test.mjs',
    'supabase/migrations/20261123000000_add_collection_log_diagnostics.sql', 'supabase/migrations/20261123010000_dashboard_analytics.sql', 'supabase/migrations/20261123020000_world_bank_ingestion.sql',
    'README.md', 'package.json', '.env.example', '.gitignore'
)
$missing = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $repoRoot $_)) })
if ($missing.Count -eq 0) { Add-Result 'OK' 'Fichiers requis' "$($requiredFiles.Count) fichiers présents." }
else { Add-Result 'ERREUR' 'Fichiers requis' ("Manquants : " + ($missing -join ', ')) }

$envExample = Read-Text '.env.example'
$envLocalPath = Join-Path $repoRoot '.env.local'
$envLocalNames = @()
if (Test-Path -LiteralPath $envLocalPath) {
    $envLocalNames = @([System.IO.File]::ReadAllLines($envLocalPath) | Where-Object { $_ -match '^\s*(VITE_[A-Z0-9_]+)\s*=' } | ForEach-Object { ($_ -split '=', 2)[0].Trim() })
    $expectedEnv = @('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY')
    $missingEnv = @($expectedEnv | Where-Object { $_ -notin $envLocalNames })
    if ($missingEnv.Count -eq 0) { Add-Result 'OK' 'Variables frontend locales' 'Les noms des deux variables Vite requises sont présents; valeurs masquées.' }
    else { Add-Result 'ERREUR' 'Variables frontend locales' ("Noms manquants : " + ($missingEnv -join ', ')) }
} else { Add-Result 'AVERTISSEMENT' 'Variables frontend locales' '.env.local absent; le site peut compiler sans connexion Supabase.' }
if ($envExample -match '(?m)^VITE_SUPABASE_URL=' -and $envExample -match '(?m)^VITE_SUPABASE_ANON_KEY=') {
    Add-Result 'OK' 'Modèle .env.example' 'Les noms des variables attendues sont documentés.'
} else { Add-Result 'ERREUR' 'Modèle .env.example' 'Les noms des variables frontend attendues sont incomplets.' }

$gitignore = Read-Text '.gitignore'
if ($gitignore -match '(?m)^\.env\.local\s*$' -or $gitignore -match '(?m)^\.env\.\*\.local\s*$') {
    Add-Result 'OK' 'Protection Git des variables locales' '.env.local est visé par .gitignore.'
} else { Add-Result 'ERREUR' 'Protection Git des variables locales' '.gitignore ne couvre pas explicitement .env.local.' }

$cron = Read-Text 'supabase/cron.sql'
$function = Read-Text 'supabase/functions/collect-news/index.ts'
$worldBankFunction = Read-Text 'supabase/functions/collect-world-bank/index.ts'
$worldBankShared = Read-Text 'supabase/functions/_shared/world-bank.mjs'
$migrationWorldBank = Read-Text 'supabase/migrations/20261123020000_world_bank_ingestion.sql'
$config = Read-Text 'supabase/config.toml'
$schema = Read-Text 'supabase/schema.sql'
$package = Read-Text 'package.json'
$readme = Read-Text 'README.md'
$migration = Read-Text 'supabase/migrations/20261123000000_add_collection_log_diagnostics.sql'

if ($cron -match "'x-cron-secret'" -and $function -match 'req\.headers\.get\("x-cron-secret"\)') {
    Add-Result 'OK' 'En-tête Cron' 'cron.sql envoie x-cron-secret et la fonction le lit.'
} else { Add-Result 'ERREUR' 'En-tête Cron' 'Les noms d-en-tête ne concordent pas.' }
if ($cron -match 'sango_collect_news_cron_secret' -and $function -match 'COLLECT_NEWS_CRON_SECRET') {
    Add-Result 'OK' 'Noms du secret Cron' 'Le nom Vault et la variable serveur attendue sont présents; leurs valeurs ne sont pas consultées.'
} else { Add-Result 'ERREUR' 'Noms du secret Cron' 'Le nom Vault ou la variable serveur attendue manque.' }
$authCodeStart = $function.IndexOf('async function validateCaller')
$authCodeEnd = $function.IndexOf('const clean')
$authCode = ''
if ($authCodeStart -ge 0 -and $authCodeEnd -gt $authCodeStart) { $authCode = $function.Substring($authCodeStart, $authCodeEnd - $authCodeStart) }
$cronAuthIndex = $authCode.IndexOf('secretMatches')
$sessionAuthIndex = $authCode.IndexOf('authorization')
$hasExpectedEnvSecret = $authCode.Contains('COLLECT_NEWS_CRON_SECRET')
$hasCronHeader = $authCode.Contains('x-cron-secret')
$authOrderIsCorrect = $false
if ($cronAuthIndex -ge 0 -and $sessionAuthIndex -gt $cronAuthIndex -and $hasExpectedEnvSecret -and $hasCronHeader) { $authOrderIsCorrect = $true }
if ($authOrderIsCorrect) { Add-Result 'OK' 'Autorisation Cron sans session' 'Le secret serveur est valide avant la lecture du JWT utilisateur.' } else { Add-Result 'ERREUR' 'Autorisation Cron sans session' 'Le chemin Cron est absent ou intervient apres le controle utilisateur.' }
if ($config -match '(?s)\[functions\.collect-news\].*?verify_jwt\s*=\s*false') {
    Add-Result 'OK' 'Vérification JWT de la fonction' 'verify_jwt=false dans la configuration locale; la fonction fait sa propre autorisation.'
} else { Add-Result 'AVERTISSEMENT' 'Vérification JWT de la fonction' 'La configuration locale n-indique pas verify_jwt=false.' }

$sourceNames = @('GDELT', 'NewsData.io', 'TechCabal')
$missingSources = @($sourceNames | Where-Object { $function -notmatch [regex]::Escape($_) })
if ($missingSources.Count -eq 0 -and $function -match 'Promise\.allSettled') {
    Add-Result 'OK' 'Collecteurs indépendants' 'Les trois sources sont présentes et collectées avec Promise.allSettled.'
} else { Add-Result 'ERREUR' 'Collecteurs indépendants' 'Une source attendue ou la gestion d-échec indépendant manque.' }
if ($function -match 'Promise\.all\(names\.map\(async name' -and $function -match 'source_status_warning' -and $function -match 'collection_status') {
    Add-Result 'OK' 'Indépendance et journaux partiels' 'Les écritures sont isolées par source et un échec de statut est une alerte, pas un échec de collecte.'
} else { Add-Result 'ERREUR' 'Indépendance et journaux partiels' 'Le stockage indépendant ou la séparation erreur/avertissement manque.' }

$contextTerms = @('RDC', 'DRC', 'DR Congo', 'Congo-Kinshasa', 'Kinshasa', 'Lubumbashi', 'Goma', 'Kisangani', 'Kolwezi', 'Bukavu', 'Airtel Money', 'M-Pesa', 'Orange Money', 'Afrimoney', 'Central Bank of the DRC', 'fraude', 'fraud', 'security', 'cybersecurity')
$missingTerms = @($contextTerms | Where-Object { $function -notmatch [regex]::Escape($_) })
if ($missingTerms.Count -eq 0) { Add-Result 'OK' 'Couverture congolaise et thématique' 'Les termes RDC, villes, opérateurs, régulation, fraude et sécurité sont présents.' } else { Add-Result 'AVERTISSEMENT' 'Couverture congolaise et thématique' ("Termes absents du collecteur : " + ($missingTerms -join ', ')) }

$worldBankConfigStart = $config.IndexOf('[functions.collect-world-bank]')
$worldBankConfig = ''
if ($worldBankConfigStart -ge 0) { $worldBankConfig = $config.Substring($worldBankConfigStart) }
if ($worldBankFunction -match 'Promise\.allSettled' -and $worldBankFunction -match 'AbortSignal\.timeout\(15000\)' -and $worldBankFunction -match 'acquire_collector_lock' -and $worldBankFunction -match 'release_collector_lock' -and $worldBankShared -match 'FX.OWN.TOTL.ZS' -and $worldBankShared -match 'IT.CEL.SETS.P2' -and $worldBankShared -match 'IT.NET.USER.ZS' -and $worldBankShared -match 'FB.ATM.TOTL.P5' -and $worldBankShared -match 'NY.GDP.MKTP.KD.ZG') {
    Add-Result 'OK' 'World Bank collector' 'Five reviewed series, per-series requests, independent failures and concurrency lock are present.'
} else { Add-Result 'ERREUR' 'World Bank collector' 'Collector, indicator codes or concurrency protection are missing.' }
if ($cron.Contains('sango-world-bank-indicators-weekly') -and $cron.Contains('/functions/v1/collect-world-bank') -and $worldBankConfig.Contains('verify_jwt = false') -and $migrationWorldBank.Contains('indicator_collection_logs') -and $migrationWorldBank.Contains('acquire_collector_lock')) {
    Add-Result 'OK' 'World Bank schedule and storage' 'Weekly Cron, private logs and SQL lock are configured locally.'
} else { Add-Result 'ERREUR' 'World Bank schedule and storage' 'Cron, log/lock migration or Edge configuration is missing.' }

$expectedTables = @('sources', 'articles', 'collection_logs', 'favorites', 'indicator_data')
$missingTables = @($expectedTables | Where-Object { $schema -notmatch "(?i)create table if not exists public\.$_\b" })
if ($missingTables.Count -eq 0 -and $schema -match 'enable row level security' -and $schema -match 'sy_favorites_read_own') {
    Add-Result 'OK' 'Schéma et RLS' 'Les cinq tables attendues et les activations RLS sont présentes.'
} else { Add-Result 'ERREUR' 'Schéma et RLS' ("Tables absentes ou règles RLS à revoir : " + ($missingTables -join ', ')) }
if ($schema -match '(?i)error_code text' -and $schema -match '(?i)warning_message text' -and $migration -match 'add column if not exists error_code' -and $migration -match 'add column if not exists warning_message') {
    Add-Result 'OK' 'Diagnostic SQL versionné' 'Les colonnes de diagnostic existent dans le schéma et la migration non destructive.'
} else { Add-Result 'ERREUR' 'Diagnostic SQL versionné' 'La migration de colonnes error_code/warning_message manque ou est incohérente.' }

$migrationPath = Join-Path $repoRoot 'supabase/migrations'
$migrationFiles = @()
if (Test-Path -LiteralPath $migrationPath) { $migrationFiles = @(Get-ChildItem -LiteralPath $migrationPath -Filter '*.sql' -File) }
if ($migrationFiles.Count -eq 0) { Add-Result 'AVERTISSEMENT' 'Migrations versionnées' 'Aucun fichier supabase/migrations/*.sql; schema.sql est le seul script de schéma local.' } else { Add-Result 'OK' 'Migrations versionnées' "$($migrationFiles.Count) fichier(s) de migration local(aux)." }
if ($readme -and $package -match '"build"\s*:\s*"vite build"') { Add-Result 'OK' 'README et script build' 'README présent et script npm build configuré.' }
else { Add-Result 'ERREUR' 'README et script build' 'README ou script npm build absent.' }

Write-Host "`nCompilation Vite : npm.cmd run build" -ForegroundColor Cyan
Push-Location $repoRoot
& npm.cmd run build
$buildExitCode = $LASTEXITCODE
Pop-Location
if ($buildExitCode -eq 0) { Add-Result 'OK' 'Compilation Vite' 'npm.cmd run build a reussi.' } else { Add-Result 'ERREUR' 'Compilation Vite' "npm.cmd run build a echoue (code $buildExitCode)." }

Write-Host ([Environment]::NewLine + 'Tests unitaires : npm.cmd test') -ForegroundColor Cyan
Push-Location $repoRoot
& npm.cmd test
$testExitCode = $LASTEXITCODE
Pop-Location
if ($testExitCode -eq 0) { Add-Result 'OK' 'Tests unitaires' 'npm.cmd test a reussi.' } else { Add-Result 'ERREUR' 'Tests unitaires' "npm.cmd test a echoue (code $testExitCode)." }

if (Test-Path -LiteralPath (Join-Path $repoRoot 'supabase/.temp/project-ref')) {
    Add-Result 'OK' 'Projet Supabase lié localement' 'Une référence de projet est présente; identifiant masqué.'
} else { Add-Result 'AVERTISSEMENT' 'Projet Supabase lié localement' 'Référence de projet locale absente.' }

Write-Host "`nRapport" -ForegroundColor Cyan
$results | ForEach-Object {
    $color = switch ($_.Status) { 'OK' { 'Green' } 'ERREUR' { 'Red' } 'AVERTISSEMENT' { 'Yellow' } default { 'Gray' } }
    Write-Host ("[{0}] {1} — {2}" -f $_.Status, $_.Check, $_.Detail) -ForegroundColor $color
}
$errorCount = @($results | Where-Object { $_.Status -eq 'ERREUR' }).Count
$warningCount = @($results | Where-Object { $_.Status -eq 'AVERTISSEMENT' }).Count
Write-Host ("`nTotal : {0} erreur(s), {1} avertissement(s)." -f $errorCount, $warningCount)
if ($errorCount -gt 0) { exit 1 }

