$ErrorActionPreference = "Stop"
$projectDirectory = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$environmentFile = Join-Path $projectDirectory ".env.local"

Write-Host "Token pessoal do Melhor Envio (Producao)" -ForegroundColor Cyan
Write-Host "No navegador, gere o token DROP Skate Shop e use o botao COPIAR TOKEN."
$tokenSecure = Read-Host "Cole aqui o token completo" -AsSecureString
$token = [System.Net.NetworkCredential]::new("", $tokenSecure).Password.Trim()
if ($token.Length -lt 100) {
  throw "O token parece incompleto. Gere novamente e use o botao COPIAR TOKEN."
}

$postalCode = (Read-Host "Digite o CEP de origem da loja, somente numeros") -replace "\D", ""
if ($postalCode -notmatch "^\d{8}$") {
  throw "CEP invalido. Informe exatamente 8 numeros."
}

if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw "Arquivo .env.local nao encontrado."
}

$contents = Get-Content -LiteralPath $environmentFile -Raw
$settings = [ordered]@{
  "MELHOR_ENVIO_TOKEN" = $token
  "MELHOR_ENVIO_FROM_POSTAL_CODE" = $postalCode
  "MELHOR_ENVIO_USER_AGENT" = "DROP Skate Shop (victorlopo456@gmail.com)"
  "MELHOR_ENVIO_SANDBOX" = "false"
}

foreach ($entry in $settings.GetEnumerator()) {
  $escapedName = [regex]::Escape($entry.Key)
  $line = "$($entry.Key)=$($entry.Value)"
  if ($contents -match "(?m)^$escapedName=") {
    $contents = [regex]::Replace($contents, "(?m)^$escapedName=.*$", $line)
  } else {
    $contents = $contents.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
  }
}

Set-Content -LiteralPath $environmentFile -Value $contents -Encoding utf8
$token = $null
try { Set-Clipboard -Value "" } catch { }
Write-Host "SUCESSO: token de producao salvo com seguranca." -ForegroundColor Green
Write-Host "Volte ao Codex e responda somente: pronto"
