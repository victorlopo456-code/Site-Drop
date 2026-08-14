$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$environmentFile = Join-Path $projectDirectory ".env.local"
$clientId = 11047
$redirectUri = "https://drop-skate-shop.vercel.app"
$authorizationUrl = "https://www.melhorenvio.com.br/oauth/authorize?client_id=$clientId&redirect_uri=$([uri]::EscapeDataString($redirectUri))&response_type=code&state=drop-skate-shop-production&scope=shipping-calculate%20shipping-companies"

Write-Host "Configuracao segura do Melhor Envio (Producao)" -ForegroundColor Cyan
Write-Host "1. O navegador sera aberto para autorizar o aplicativo 11047."
Write-Host "2. Depois da autorizacao, copie a URL completa da barra de endereco."
Write-Host "3. As chaves serao salvas apenas no arquivo .env.local, que nao e publicado."

$secretSecure = Read-Host "Cole o Client Secret completo do aplicativo 11047" -AsSecureString
$secret = [System.Net.NetworkCredential]::new("", $secretSecure).Password.Trim()
if ($secret.Length -lt 30) {
  throw "O Client Secret esta incompleto. Use o botao de copiar nos detalhes do aplicativo."
}

Start-Process $authorizationUrl
$redirectSecure = Read-Host "Apos autorizar, cole aqui a URL completa ou somente o codigo" -AsSecureString
$redirectValue = [System.Net.NetworkCredential]::new("", $redirectSecure).Password.Trim()
$codeMatch = [regex]::Match($redirectValue, "[?&#]code=([^&]+)")

if ($codeMatch.Success) {
  $authorizationCode = [uri]::UnescapeDataString($codeMatch.Groups[1].Value)
} elseif ($redirectValue -notmatch "://" -and $redirectValue.Length -ge 30) {
  $authorizationCode = [uri]::UnescapeDataString(($redirectValue -split "&")[0])
} else {
  throw "Nao encontrei o codigo. Copie toda a URL exibida depois da autorizacao."
}

$body = @{
  grant_type    = "authorization_code"
  client_id     = $clientId
  client_secret = $secret
  redirect_uri  = $redirectUri
  code          = $authorizationCode
}

try {
  $response = Invoke-RestMethod `
    -Method Post `
    -Uri "https://www.melhorenvio.com.br/oauth/token" `
    -Headers @{
      "Accept" = "application/json"
      "User-Agent" = "DROP Skate Shop (victorlopo456@gmail.com)"
    } `
    -ContentType "application/x-www-form-urlencoded" `
    -Body $body
} catch {
  $detail = $_.ErrorDetails.Message
  if ($detail) {
    try {
      $payload = $detail | ConvertFrom-Json
      $description = if ($payload.message) { $payload.message } elseif ($payload.error_description) { $payload.error_description } else { $payload.error }
      throw "Melhor Envio recusou a autorizacao: $description"
    } catch [System.ArgumentException] {
      throw "Melhor Envio recusou a autorizacao. Confirme o Client Secret e autorize novamente."
    }
  }
  throw "Melhor Envio recusou a autorizacao. Confirme o Client Secret e autorize novamente."
}

if (-not $response.access_token) {
  throw "O Melhor Envio nao retornou um token de acesso."
}

$postalCode = (Read-Host "Digite o CEP de origem da loja, somente numeros") -replace "\D", ""
if ($postalCode -notmatch "^\d{8}$") {
  throw "CEP invalido. Informe exatamente 8 numeros."
}

if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw "Arquivo .env.local nao encontrado em $projectDirectory"
}

$contents = Get-Content -LiteralPath $environmentFile -Raw
$settings = [ordered]@{
  "MELHOR_ENVIO_TOKEN" = $response.access_token
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
$secret = $null
$authorizationCode = $null
$response = $null
try { Set-Clipboard -Value "" } catch { }

Write-Host "SUCESSO: Melhor Envio de producao configurado no .env.local." -ForegroundColor Green
Write-Host "Volte ao Codex e responda somente: pronto"
