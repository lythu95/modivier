# Generate the NSIS installer header bitmap (150x57 BMP) with the MoDiViEr logo mark.
# Keep ASCII-only: PowerShell 5.1 on zh-CN Windows reads BOM-less .ps1 as GBK.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$w = 150
$h = 57
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::White)

# logo mark: dark rounded square + white M + blue accent bar (same design as the app icon)
$size = 41
$x = 8
$y = [int](($h - $size) / 2)
$r = 10
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc([single]$x, [single]$y, [single]$r, [single]$r, [single]180, [single]90)
$path.AddArc([single]($x + $size - $r), [single]$y, [single]$r, [single]$r, [single]270, [single]90)
$path.AddArc([single]($x + $size - $r), [single]($y + $size - $r), [single]$r, [single]$r, [single]0, [single]90)
$path.AddArc([single]$x, [single]($y + $size - $r), [single]$r, [single]$r, [single]90, [single]90)
$path.CloseFigure()
$bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 45, 52, 55))
$g.FillPath($bg, $path)

$font = New-Object System.Drawing.Font('Segoe UI', 17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = [System.Drawing.RectangleF]::new([single]$x, [single]($y - 3), [single]$size, [single]$size)
$g.DrawString('M', $font, [System.Drawing.Brushes]::White, $rect, $fmt)

$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 68, 147, 248))
$g.FillRectangle($accent, ($x + 9), ($y + 31), 23, 4)

# wordmark
$wf = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 36, 41, 47))
$g.DrawString('MoDiViEr', $wf, $ink, ($x + $size + 8), 18)

$outDir = Split-Path -Parent $PSScriptRoot
$out = Join-Path (Join-Path $outDir 'src-tauri') 'icons\nsis-header.bmp'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $bmp.Dispose()
Write-Output "header saved: $out"
