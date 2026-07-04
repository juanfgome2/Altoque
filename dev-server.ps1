param(
  [int]$Port = 5173
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Listener = [System.Net.HttpListener]::new()
$Listener.Prefixes.Add("http://127.0.0.1:$Port/")
$Listener.Start()

Write-Host "ALTOQUE disponible en http://127.0.0.1:$Port/"

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $Path = $Context.Request.Url.LocalPath.TrimStart("/")

    if ([string]::IsNullOrWhiteSpace($Path)) {
      $Path = "index.html"
    }

    $File = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $Path))

    if (-not $File.StartsWith($Root)) {
      $Context.Response.StatusCode = 403
      $Context.Response.Close()
      continue
    }

    if (-not [System.IO.File]::Exists($File)) {
      $Context.Response.StatusCode = 404
      $Context.Response.Close()
      continue
    }

    $Extension = [System.IO.Path]::GetExtension($File).ToLowerInvariant()
    $Types = @{
      ".html" = "text/html; charset=utf-8"
      ".css" = "text/css; charset=utf-8"
      ".js" = "text/javascript; charset=utf-8"
      ".json" = "application/json; charset=utf-8"
      ".svg" = "image/svg+xml"
    }

    $Context.Response.ContentType = $Types[$Extension]
    if (-not $Context.Response.ContentType) {
      $Context.Response.ContentType = "application/octet-stream"
    }

    $Bytes = [System.IO.File]::ReadAllBytes($File)
    $Context.Response.ContentLength64 = $Bytes.Length
    $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Context.Response.Close()
  }
}
finally {
  $Listener.Stop()
}
