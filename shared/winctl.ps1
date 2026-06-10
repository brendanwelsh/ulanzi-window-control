# winctl.ps1 — Win32 window helper for the Ulanzi window-control plugin.
#   -List           emit visible top-level windows as a compact JSON array [{hwnd,pid,proc,title}]
#   -Focus -Hwnd N  bring window with handle N to the foreground
# No native Node deps — the engine shells out to this.
param(
  [switch]$List,
  [switch]$Focus,
  [switch]$AltTabServer,
  [long]$Hwnd = 0
)

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public class WinCtl {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

  const int GWL_EXSTYLE = -20;
  const long WS_EX_TOOLWINDOW = 0x00000080L;
  const int SW_RESTORE = 9;
  const int SW_SHOW = 5;

  public struct Win { public long hwnd; public uint pid; public string title; }

  public static List<Win> ListWindows() {
    IntPtr shell = GetShellWindow();
    var result = new List<Win>();
    EnumWindows((h, l) => {
      if (h == shell) return true;
      if (!IsWindowVisible(h)) return true;
      long ex = (long)(uint)GetWindowLong(h, GWL_EXSTYLE);
      if ((ex & WS_EX_TOOLWINDOW) != 0) return true; // skip tool windows / tray helpers
      int len = GetWindowTextLength(h);
      if (len == 0) return true; // skip titleless windows
      var sb = new StringBuilder(len + 1);
      GetWindowText(h, sb, sb.Capacity);
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      result.Add(new Win { hwnd = h.ToInt64(), pid = pid, title = sb.ToString() });
      return true;
    }, IntPtr.Zero);
    return result;
  }

  public static void Activate(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, SW_RESTORE);
    IntPtr fg = GetForegroundWindow();
    uint dummy;
    uint fgThread = GetWindowThreadProcessId(fg, out dummy); // thread id is the return value
    uint cur = GetCurrentThreadId();
    // a synthetic ALT tap makes Windows treat this as user-initiated, so SetForegroundWindow
    // actually raises the window instead of just flashing the taskbar button.
    keybd_event(0x12, 0, 0, UIntPtr.Zero);       // VK_MENU (ALT) down
    keybd_event(0x12, 0, 0x0002, UIntPtr.Zero);  // VK_MENU up (KEYEVENTF_KEYUP)
    bool attached = false;
    if (fgThread != 0 && fgThread != cur) attached = AttachThreadInput(cur, fgThread, true);
    BringWindowToTop(h);
    ShowWindow(h, SW_SHOW);
    SetForegroundWindow(h);
    if (attached) AttachThreadInput(cur, fgThread, false);
  }
}
"@

if ($AltTabServer) {
  # Persistent helper: drives the NATIVE Windows Alt-Tab via injected keystrokes. The plugin
  # writes commands to our stdin (one per line). Holding Alt keeps the switcher overlay up;
  # 'commit' releases Alt and switches to the highlighted window. Windows owns the focus, so
  # there's no foreground-lock to fight.
  $ALT = [byte]0x12; $TAB = [byte]0x09; $SHIFT = [byte]0x10
  $KEYUP = [uint32]2
  $altDown = $false
  function Tap($vk, $shift) {
    if ($shift) { [WinCtl]::keybd_event($SHIFT, 0, 0, [UIntPtr]::Zero) }
    [WinCtl]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
    [WinCtl]::keybd_event($vk, 0, $KEYUP, [UIntPtr]::Zero)
    if ($shift) { [WinCtl]::keybd_event($SHIFT, 0, $KEYUP, [UIntPtr]::Zero) }
  }
  try {
    while ($true) {
      $line = [Console]::In.ReadLine()
      if ($null -eq $line) { break } # stdin closed (plugin exited)
      switch ($line.Trim().ToLower()) {
        "next" { if (-not $altDown) { [WinCtl]::keybd_event($ALT, 0, 0, [UIntPtr]::Zero); $altDown = $true; Start-Sleep -Milliseconds 25 }; Tap $TAB $false }
        "prev" { if (-not $altDown) { [WinCtl]::keybd_event($ALT, 0, 0, [UIntPtr]::Zero); $altDown = $true; Start-Sleep -Milliseconds 25 }; Tap $TAB $true }
        "commit" { if ($altDown) { [WinCtl]::keybd_event($ALT, 0, $KEYUP, [UIntPtr]::Zero); $altDown = $false } }
        "quit" { break }
      }
    }
  }
  finally { if ($altDown) { [WinCtl]::keybd_event($ALT, 0, $KEYUP, [UIntPtr]::Zero) } }
  exit 0
}

if ($Focus) {
  [WinCtl]::Activate([IntPtr]$Hwnd)
  exit 0
}

# default action: list windows as JSON (proc name resolved from pid)
$procById = @{}
Get-Process | ForEach-Object { $procById[[uint32]$_.Id] = $_.ProcessName }
$rows = [WinCtl]::ListWindows() | ForEach-Object {
  [pscustomobject]@{
    hwnd  = $_.hwnd
    pid   = [int64]$_.pid
    proc  = $procById[[uint32]$_.pid]
    title = $_.title
  }
}
# force a JSON array even for 0 or 1 windows, single line
[Console]::Out.Write((ConvertTo-Json @($rows) -Compress))
