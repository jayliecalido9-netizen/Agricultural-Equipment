[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$documentPath=Join-Path $PSScriptRoot 'AEAMS-Diagrams.docx'
$wordApp=$null
$document=$null
$result=$null
try {
  $wordApp=New-Object -ComObject Word.Application
  $wordApp.Visible=$false
  $wordApp.DisplayAlerts=0
  $wordApp.AutomationSecurity=3
  $document=$wordApp.Documents.Open($documentPath,$false,$true)
  $document.Repaginate()
  $pageCount=$document.ComputeStatistics(2)
  if ($pageCount -ne 19) { throw ('Expected 19 Word pages; found '+$pageCount) }
  if ($document.InlineShapes.Count -ne 18) { throw 'Expected 18 inline diagram images.' }
  $diagramPages=@()
  for ($index=1;$index -le 18;$index++) {
    $shape=$document.InlineShapes.Item($index)
    $pageNumber=$shape.Range.Information(3)
    if ($pageNumber -ne ($index+1)) { throw ('Diagram '+$index+' is on the wrong Word page: '+$pageNumber) }
    $diagramPages+=[PSCustomObject]@{diagram=$index;page=$pageNumber}
  }
  $notePages=@()
  $noteHeadingPages=@()
  foreach ($paragraph in $document.Paragraphs) {
    $text=$paragraph.Range.Text.Trim()
    if ($text.StartsWith([string][char]0x2022)) { $notePages+=$paragraph.Range.Information(3) }
    if ($text -eq 'HOW TO READ THIS DIAGRAM') { $noteHeadingPages+=$paragraph.Range.Information(3) }
  }
  if ($notePages.Count -ne 54 -or $noteHeadingPages.Count -ne 18) { throw 'Expected three detailed notes and one notes heading per diagram.' }
  for ($index=0;$index -lt 18;$index++) {
    if ($noteHeadingPages[$index] -ne ($index+2)) { throw 'A notes heading is on a different page from its diagram.' }
    foreach ($pageNumber in $notePages[($index*3)..($index*3+2)]) {
      if ($pageNumber -ne ($index+2)) { throw 'A detailed note spills onto a different page.' }
    }
  }
  $result=@{wordPages=$pageCount;diagramPages=$diagramPages;detailedNotes=54;notesStayWithDiagram=$true}
} finally {
  if ($document) { try { $document.Close(0) } catch {} }
  if ($wordApp) { try { $wordApp.Quit() } catch {} }
}
if (-not $result) { throw 'Word layout verification did not complete.' }
$reportPath=Join-Path $PSScriptRoot 'layout-report.json'
$report=Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
$report | Add-Member -MemberType NoteProperty -Name wordVerification -Value $result -Force
$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Output 'Word verified: 19 pages, one diagram on each page 2-19, and all 54 detailed notes remain with their diagrams.'
exit 0
