$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$environmentFile = Join-Path $projectDirectory ".env.local"
$clientId = 11044
$redirectUri = "https://vzocfxwjewspsmxbxumy.supabase.co"
$authorizationUrl = "https://sandbox.melhorenvio.com.br/oauth/authorize?client_id=$clientId&redirect_uri=$([uri]::EscapeDataString($redirectUri))&response_type=code&state=drop-skate-shop&scope=shipping-calculate%20shipping-companies"

Write-Host "Configuracao segura do Melhor Envio (Sandbox)" -ForegroundColor Cyan
$secretSecure = Read-Host "Cole o Client Secret do aplicativo 11044" -AsSecureString
$secret = [System.Net.NetworkCredential]::new("", $secretSecure).Password.Trim()
if ($secret.Length -lt 30) {
  throw "O Client Secret colado esta incompleto. Abra os detalhes do aplicativo e use o botao de copiar para obter a chave inteira."
}

Write-Host "Abrindo a autorizacao no navegador..." -ForegroundColor Cyan
Start-Process $authorizationUrl
Write-Host "Autorize o aplicativo. Na pagina de erro, pressione Ctrl+L e Ctrl+C."
$redirectSecure = Read-Host "Volte aqui e cole a URL completa ou somente o codigo" -AsSecureString
$redirectValue = [System.Net.NetworkCredential]::new("", $redirectSecure).Password.Trim()
$codeMatch = [regex]::Match($redirectValue, "[?&#]code=([^&]+)")

if ($codeMatch.Success) {
  $authorizationCode = [uri]::UnescapeDataString($codeMatch.Groups[1].Value)
} elseif ($redirectValue -notmatch "://" -and $redirectValue.Length -ge 30) {
  $authorizationCode = [uri]::UnescapeDataString(($redirectValue -split "&")[0])
} else {
  throw "O valor colado nao possui o codigo. Na pagina de erro use Ctrl+L e Ctrl+C para copiar a barra de endereco inteira."
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
    -Uri "https://sandbox.melhorenvio.com.br/oauth/token" `
    -Headers @{
      "Accept" = "application/json"
      "User-Agent" = "DROP Skate Shop (victorlopo456@gmail.com)"
    } `
    -ContentType "application/x-www-form-urlencoded" `
    -Body $body
} catch {
  $safeDetail = $_.ErrorDetails.Message
  if ($safeDetail) {
    try {
      $errorPayload = $safeDetail | ConvertFrom-Json
      $errorName = if ($errorPayload.error) { [string]$errorPayload.error } else { "erro_desconhecido" }
      $errorDescription = if ($errorPayload.message) {
        [string]$errorPayload.message
      } elseif ($errorPayload.error_description) {
        [string]$errorPayload.error_description
      } else {
        "Sem descricao adicional."
      }
      throw "Melhor Envio: $errorName - $errorDescription"
    } catch [System.ArgumentException] {
      throw "O Melhor Envio recusou os dados e nao informou o motivo. Confira o Client Secret e a URL de redirecionamento."
    }
  }
  throw "O Melhor Envio recusou os dados e nao informou o motivo. Confira o Client Secret e a URL de redirecionamento."
}

if (-not $response.access_token) {
  throw "O Melhor Envio nao retornou um token de acesso."
}

$postalCode = (Read-Host "Digite o CEP de origem da loja, somente numeros") -replace "\D", ""
if ($postalCode -notmatch "^\d{8}$") {
  throw "CEP invalido. Execute novamente e informe exatamente 8 numeros."
}

if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw "Arquivo .env.local nao encontrado em $projectDirectory"
}

$contents = Get-Content -LiteralPath $environmentFile -Raw
$settings = [ordered]@{
  "MELHOR_ENVIO_TOKEN" = $response.access_token
  "MELHOR_ENVIO_FROM_POSTAL_CODE" = $postalCode
  "MELHOR_ENVIO_USER_AGENT" = "DROP Skate Shop (victorlopo456@gmail.com)"
  "MELHOR_ENVIO_SANDBOX" = "true"
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
Set-Clipboard -Value ""

Write-Host "SUCESSO: Melhor Envio configurado no .env.local." -ForegroundColor Green
Write-Host "Agora reinicie o servidor com npm run dev."
