$websiteDir = "c:\Users\brett\OneDrive\Interactive Projects\website"

# The code to insert - drawn on textCanvas so glitch shader affects it
$progressBarCode = @'

            // Loading progress bar - drawn on canvas so glitch shader affects it
            const allImages = document.querySelectorAll('.artwork-image');
            if (allImages.length > 0) {
                const loadedCount = Array.from(allImages).filter(img => img.complete && img.naturalWidth !== 0).length;
                const loadProgress = loadedCount / allImages.length;
                if (loadProgress < 1) {
                    const barY = Math.floor(textCanvas.height * 0.03);
                    tCtx.fillStyle = '#FFFFFF';
                    tCtx.fillRect(0, barY, Math.floor(textCanvas.width * loadProgress), 1);
                }
            }
'@

$insertBefore = "            textTexture.needsUpdate = true;"

# Apply to all curation HTML files
Get-ChildItem "$websiteDir\curation_*.html" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw -Encoding UTF8
    if ($content -notmatch 'Loading progress bar') {
        $content = $content.Replace($insertBefore, $progressBarCode + "`n" + $insertBefore)
        Set-Content $_.FullName -Value $content -Encoding UTF8 -NoNewline
        Write-Host "Updated: $($_.Name)"
    } else {
        Write-Host "Skipped (already has bar): $($_.Name)"
    }
}

# Apply to regenerate.js template too
$regen = "$websiteDir\regenerate.js"
$rc = Get-Content $regen -Raw -Encoding UTF8
if ($rc -notmatch 'Loading progress bar') {
    $rc = $rc.Replace($insertBefore, $progressBarCode + "`n" + $insertBefore)
    Set-Content $regen -Value $rc -Encoding UTF8 -NoNewline
    Write-Host "Updated: regenerate.js"
}

Write-Host "Done."
