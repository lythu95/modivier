# Generate the app icon source (512x512 PNG), then run `npx tauri icon` to derive all platform icons.
# NOTE: keep this file ASCII-only. PowerShell 5.1 on zh-CN Windows reads BOM-less .ps1 as GBK,
# which corrupts UTF-8 Chinese comments and merges lines.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# rounded dark background
$r = 110
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc([single]0, [single]0, [single]$r, [single]$r, [single]180, [single]90)
$path.AddArc([single]($size - $r), [single]0, [single]$r, [single]$r, [single]270, [single]90)
$path.AddArc([single]($size - $r), [single]($size - $r), [single]$r, [single]$r, [single]0, [single]90)
$path.AddArc([single]0, [single]($size - $r), [single]$r, [single]$r, [single]90, [single]90)
$path.CloseFigure()
$bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 45, 52, 55))
$g.FillPath($bg, $path)

# white letter M
$font = New-Object System.Drawing.Font('Segoe UI', 260, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(0, -18, $size, $size)
$g.DrawString('M', $font, [System.Drawing.Brushes]::White, $rect, $fmt)

# blue accent bar (markdown hr) - matches the app accent color
$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 68, 147, 248))
$g.FillRectangle($accent, 116, 386, 280, 22)

$outDir = Split-Path -Parent $PSScriptRoot
$out = Join-Path (Join-Path $outDir 'src-tauri') 'icons-src\app-icon.png'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $out) | Out-Null
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "icon saved: $out"
