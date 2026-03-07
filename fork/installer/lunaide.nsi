; ============================================================================
; LunaIDE Windows Installer — NSIS Script
; Installs LunaIDE and sets up Aftman + Rojo toolchain.
; ============================================================================
; Build:  makensis /DBUILD_DIR="path\to\LunaIDE" fork\installer\lunaide.nsi
; ============================================================================

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "WinMessages.nsh"

; ── Product metadata ─────────────────────────────────────────────────────────
!define PRODUCT_NAME      "LunaIDE"
!define PRODUCT_PUBLISHER  "LunaIDE"
!define PRODUCT_WEB_SITE   "https://github.com/AustinBarikdar/LunaIDE"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"

; BUILD_DIR must be passed via /D on the makensis command line.
; It should point to the prepared LunaIDE portable directory.
!ifndef BUILD_DIR
  !error "BUILD_DIR must be defined. Pass /DBUILD_DIR=... to makensis."
!endif

Name "${PRODUCT_NAME}"
OutFile "LunaIDE-Setup-win32-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\LunaIDE"
InstallDirRegKey HKCU "${PRODUCT_UNINST_KEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Unicode True

; ── MUI configuration ────────────────────────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_ICON "${__FILEDIR__}\..\assets\lunaide-icon.ico"
!define MUI_UNICON "${__FILEDIR__}\..\assets\lunaide-icon.ico"

!define MUI_WELCOMEPAGE_TITLE "Welcome to LunaIDE Setup"
!define MUI_WELCOMEPAGE_TEXT "\
This wizard will install LunaIDE and set up your Roblox development environment.$\r$\n$\r$\n\
The following will be configured:$\r$\n\
  - LunaIDE editor$\r$\n\
  - Aftman toolchain manager$\r$\n\
  - Rojo file sync tool$\r$\n\
  - Roblox Studio plugins$\r$\n$\r$\n\
Click Next to continue."

!define MUI_FINISHPAGE_RUN "$INSTDIR\LunaIDE.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch LunaIDE"

; ── Pages ────────────────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ============================================================================
; Section: Core Install (required)
; ============================================================================
Section "LunaIDE Editor (required)" SecCore
  SectionIn RO

  SetOutPath "$INSTDIR"
  File /r "${BUILD_DIR}\*.*"

  ; Bundle the setup-tools script for optional use later / re-run
  SetOutPath "$INSTDIR"
  File "${__FILEDIR__}\setup-tools.ps1"

  ; ── Start Menu shortcuts ──
  CreateDirectory "$SMPROGRAMS\LunaIDE"
  CreateShortcut "$SMPROGRAMS\LunaIDE\LunaIDE.lnk" "$INSTDIR\LunaIDE.exe"
  CreateShortcut "$SMPROGRAMS\LunaIDE\Uninstall LunaIDE.lnk" "$INSTDIR\Uninstall.exe"

  ; ── Add bin\ to user PATH ──
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCpy $1 "$INSTDIR\bin"

  ; If PATH is empty, just set it
  StrCmp $0 "" 0 _path_check
    WriteRegExpandStr HKCU "Environment" "Path" "$1"
    Goto _path_done

  _path_check:
  ; Check if already in PATH using simple string search
  StrLen $2 $1
  StrLen $3 $0
  StrCpy $4 0
  _path_loop:
    IntCmp $4 $3 _path_append _path_append
    StrCpy $5 $0 $2 $4
    StrCmp $5 $1 _path_done
    IntOp $4 $4 + 1
    Goto _path_loop

  _path_append:
  WriteRegExpandStr HKCU "Environment" "Path" "$0;$1"

  _path_done:
  ; Broadcast so running programs pick up the change
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  ; ── Uninstaller + Add/Remove Programs entry ──
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr   HKCU "${PRODUCT_UNINST_KEY}" "DisplayName"     "${PRODUCT_NAME}"
  WriteRegStr   HKCU "${PRODUCT_UNINST_KEY}" "UninstallString"  '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKCU "${PRODUCT_UNINST_KEY}" "InstallLocation"  "$INSTDIR"
  WriteRegStr   HKCU "${PRODUCT_UNINST_KEY}" "Publisher"         "${PRODUCT_PUBLISHER}"
  WriteRegStr   HKCU "${PRODUCT_UNINST_KEY}" "URLInfoAbout"      "${PRODUCT_WEB_SITE}"
  WriteRegStr   HKCU "${PRODUCT_UNINST_KEY}" "DisplayIcon"       "$INSTDIR\LunaIDE.exe"
  WriteRegDWORD HKCU "${PRODUCT_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${PRODUCT_UNINST_KEY}" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

; ============================================================================
; Section: Desktop shortcut (optional, default on)
; ============================================================================
Section "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\LunaIDE.lnk" "$INSTDIR\LunaIDE.exe"
SectionEnd

; ============================================================================
; Section: Aftman + Rojo toolchain
; ============================================================================
Section "Install Aftman + Rojo" SecToolchain
  SectionIn RO
  DetailPrint "Running toolchain setup (Aftman + Rojo)..."
  DetailPrint "This may take a minute — downloading from GitHub..."

  ; Run the PowerShell setup script
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\setup-tools.ps1" -Action toolchain'
  Pop $0
  StrCmp $0 "0" +2
    DetailPrint "Toolchain setup completed with warnings (exit code: $0). You can re-run setup from LunaIDE."
SectionEnd

; ============================================================================
; Section: Roblox Studio plugins
; ============================================================================
Section "Install Studio Plugins" SecPlugins
  SectionIn RO
  DetailPrint "Installing Roblox Studio plugins..."

  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\setup-tools.ps1" -Action plugins'
  Pop $0
  StrCmp $0 "0" +2
    DetailPrint "Plugin install completed with warnings (exit code: $0)."
SectionEnd

; ============================================================================
; Uninstaller
; ============================================================================
Section "Uninstall"
  ; Remove files
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$DESKTOP\LunaIDE.lnk"
  RMDir /r "$SMPROGRAMS\LunaIDE"

  ; Remove from PATH
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCmp $0 "" _unpath_done

  ; Use PowerShell to cleanly remove our path entry (avoids NSIS stack issues)
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "\
    $$path = [Environment]::GetEnvironmentVariable(\"Path\", \"User\"); \
    $$parts = $$path -split \";\" | Where-Object { $$_ -ne \"$INSTDIR\bin\" -and $$_ -ne \"\" }; \
    [Environment]::SetEnvironmentVariable(\"Path\", ($$parts -join \";\"), \"User\")"'
  Pop $0

  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  _unpath_done:

  ; Remove registry keys
  DeleteRegKey HKCU "${PRODUCT_UNINST_KEY}"
SectionEnd
