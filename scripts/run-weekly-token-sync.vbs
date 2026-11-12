Dim WshShell, fso, scriptDir, batPath
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(scriptDir, "run-weekly-token-sync.bat")
WshShell.Run """" & batPath & """", 0, False
