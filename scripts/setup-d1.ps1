param(
  [string]$DatabaseName = "bigdata_db",
  [string]$Binding = "BIGDATA_DB",
  [string]$WranglerConfigPath = "wrangler.json",
  [string]$WorkerWranglerConfigPath = "workers/taxaipca-motor/wrangler.json",
  [string]$SchemaPath = "db/001_init.sql",
  [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"
$NilUuid = "00000000-0000-0000-0000-000000000000"

function Write-Info($Message) {
  Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Ok($Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

if (-not (Test-Path $WranglerConfigPath)) {
  throw "Arquivo '$WranglerConfigPath' não encontrado."
}

if (-not (Test-Path $SchemaPath)) {
  throw "Arquivo de schema '$SchemaPath' não encontrado."
}

Write-Info "Criando D1 '$DatabaseName' (binding $Binding) com wrangler latest..."
$createOutput = & npx --yes wrangler@latest d1 create $DatabaseName --binding $Binding --update-config 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
  if ($createOutput -match 'already exists|already configured|already has') {
    Write-Info "Banco já existe. Prosseguindo com migração e validação de config..."
  }
  else {
    Write-Host $createOutput
    throw "Falha ao criar D1 '$DatabaseName'."
  }
}

foreach ($cfgPath in @($WranglerConfigPath, $WorkerWranglerConfigPath)) {
  if (-not (Test-Path $cfgPath)) {
    Write-Info "Config '$cfgPath' não encontrado, pulando."
    continue
  }
  $cfgContent = Get-Content $cfgPath -Raw
  if ($cfgContent -match [regex]::Escape($NilUuid)) {
    Write-Host ""
    Write-Host "[ATENÇÃO] $cfgPath ainda contém o placeholder nil UUID ($NilUuid)." -ForegroundColor Yellow
    Write-Host "Substitua manualmente pelo database_id real ou rode 'npx wrangler d1 create $DatabaseName --binding $Binding --update-config'." -ForegroundColor Yellow
  }
  else {
    Write-Ok "$cfgPath aparenta ter database_id real (placeholder não encontrado)."
  }
}

if (-not $SkipMigrate) {
  Write-Info "Aplicando schema remoto em '$DatabaseName'..."
  & npx --yes wrangler@latest d1 execute $DatabaseName --remote --file $SchemaPath

  $extraSchemaPath = "db/002_tesouro_ipca_lotes.sql"
  if (Test-Path $extraSchemaPath) {
    Write-Info "Aplicando schema complementar: $extraSchemaPath"
    & npx --yes wrangler@latest d1 execute $DatabaseName --remote --file $extraSchemaPath
  }

  Write-Ok "Schemas aplicados com sucesso."
}
else {
  Write-Info "Migração ignorada via -SkipMigrate."
}

Write-Host ""
Write-Ok "Bootstrap D1 concluído."
Write-Host "Próximos passos:" -ForegroundColor Yellow
Write-Host "  1) Confirmar o binding $Binding no painel Cloudflare Pages" -ForegroundColor Yellow
Write-Host "  2) Confirmar que ambos wrangler.json (root + workers/taxaipca-motor) apontam para o database_id real" -ForegroundColor Yellow
Write-Host "  3) Commitar alteração local OU manter placeholder + injetar database_id via secret no GitHub Actions (D1_DATABASE_ID)" -ForegroundColor Yellow
