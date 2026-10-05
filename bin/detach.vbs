' detach.vbs - run a program hidden, without handing it any of our open handles (bin/detach.js explains why).
' Usage: wscript //B //Nologo detach.vbs <program> [args...]   Each argument is passed on in double quotes.
Set sh = CreateObject("WScript.Shell")
cmd = ""
For i = 0 To WScript.Arguments.Count - 1
  cmd = cmd & " """ & WScript.Arguments(i) & """"
Next
sh.Run Trim(cmd), 0, False
