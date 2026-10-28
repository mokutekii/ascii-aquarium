' Start Node without allocating a PowerShell or Windows Terminal console.
Option Explicit
Dim shell, files, root, entry, candidate, node, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
node = ""
For Each entry In Split(shell.ExpandEnvironmentStrings("%PATH%"), ";")
  entry = Replace(Trim(entry), """", "")
  If Len(entry) > 0 Then
    candidate = files.BuildPath(shell.ExpandEnvironmentStrings(entry), "node.exe")
    If files.FileExists(candidate) Then
      node = candidate
      Exit For
    End If
  End If
Next
If Len(node) = 0 Then
  MsgBox "Node.js was not found. Install it from https://nodejs.org, then open the aquarium again.", 48, "ASCII Aquarium"
  WScript.Quit 1
End If
shell.CurrentDirectory = root
command = """" & node & """ """ & files.BuildPath(root, "start.cjs") & """"
shell.Run command, 0, False
