# Cek progres `ollama pull` yang sedang berjalan.
#   powershell -ExecutionPolicy Bypass -File scripts\windows\check-ollama-pull.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows\check-ollama-pull.ps1 -Watch      # ulang tiap 10 detik
#   powershell -ExecutionPolicy Bypass -File scripts\windows\check-ollama-pull.ps1 -Log <file>  # baca file log tertentu
param(
  [string]$Log = "",
  [switch]$Watch
)

function Read-Shared([string]$path) {
  # File log masih ditulis proses lain, jadi dibuka dengan FileShare.ReadWrite.
  $fs = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
  try { (New-Object IO.StreamReader($fs)).ReadToEnd() } finally { $fs.Close() }
}

function Find-PullLog {
  if ($Log) { return $Log }
  # Default: output `ollama pull` terbaru yang dijalankan dari sesi Claude Code proyek ini.
  $dir = Join-Path $env:LOCALAPPDATA "Temp\claude\D--Portfolio-threads-lead-hunter"
  Get-ChildItem $dir -Recurse -Filter *.output -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Where-Object { (Read-Shared $_.FullName) -match 'pulling [0-9a-f]{12}:' } |
    Select-Object -First 1 -ExpandProperty FullName
}

function Show-Status {
  $path = Find-PullLog
  $now = Get-Date -Format "HH:mm:ss"
  if (-not $path) { Write-Output "[$now] Tidak ada log ollama pull yang ditemukan."; return }

  $full = (Read-Shared $path) -replace '\x1b\[[0-9;?]*[a-zA-Z]', ''
  # Satu log bisa berisi beberapa pull berurutan; yang relevan hanya bagian setelah "success" terakhir.
  $lastSuccess = $full.LastIndexOf('success')
  $text = if ($lastSuccess -ge 0) { $full.Substring($lastSuccess + 7) } else { $full }
  $m = [regex]::Matches($text, 'pulling ([0-9a-f]{12}):\s+(\d+)%\D+?([\d.]+ [KMG]?B/[\d.]+ [KMG]B)\s*([\d.]+ [KMG]?B/s)?\s*(\S*?)(?=pulling|\r|\n|$)')
  if ($m.Count -eq 0 -and $lastSuccess -ge 0) {
    $models = & "D:\Ollama\ollama.exe" list 2>$null | Select-Object -Skip 1 | ForEach-Object { ($_ -split '\s+')[0] }
    Write-Output "[$now] Selesai. Model terpasang: $($models -join ', ')"
  } elseif ($m.Count -gt 0) {
    $l = $m[$m.Count - 1]
    $speed = if ($l.Groups[4].Value) { $l.Groups[4].Value } else { "-" }
    $eta = if ($l.Groups[5].Value) { "sisa $($l.Groups[5].Value)" } else { "" }
    Write-Output ("[{0}] {1}%  {2}  {3}  {4}" -f $now, $l.Groups[2].Value, $l.Groups[3].Value, $speed, $eta)
  } elseif ($text -match 'Error[^\r\n]*') {
    Write-Output "[$now] Gagal: $($Matches[0])"
  } else {
    Write-Output "[$now] Menunggu progres..."
  }

  # Peringatan koneksi dari log server Ollama (5 menit terakhir).
  $serverLog = Join-Path $env:LOCALAPPDATA "Ollama\server.log"
  if (Test-Path $serverLog) {
    $since = (Get-Date).AddMinutes(-5)
    $stalls = (Read-Shared $serverLog) -split "`n" | Where-Object { $_ -match 'stalled|attempt \d+ failed' } |
      Where-Object { $_ -match 'time=(\S+?)\.\d+' -and [datetime]::Parse($Matches[1]) -gt $since }
    if ($stalls) { Write-Output "          Peringatan: $(@($stalls).Count) koneksi macet/gagal dalam 5 menit terakhir (jaringan tidak stabil)" }
  }
}

if ($Watch) {
  while ($true) { Show-Status; Start-Sleep -Seconds 10 }
} else {
  Show-Status
}
