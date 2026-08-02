#!/usr/bin/env python3
"""Fix JARVIS: add shell_exec + write_file intents and App.tsx routing."""

base = '/home/artchersh/Nor/Jarvis/jarvis-neural-core-os'

# ── Part 1: intentParser.ts ──
p = base + '/src/services/intentParser.ts'
c = open(p).read()

# Patterns to insert
patterns = '''
  // ── Shell: explicit shell commands ──
  const explicitCmdMatch = lower.match(
    /^(?:cd|mkdir|ls|echo|cat|touch|rm|cp|mv|git|npm|cargo|python|pip|dnf|systemctl|docker|curl|wget|tar|unzip|grep|find|ps|kill|df|du|whoami|pwd|env)\\b.*/i,
  );
  if (explicitCmdMatch) {
    return { action: 'shell_exec', target: explicitCmdMatch[0].trim(), raw };
  }

  // ── Shell: "vypolni komandu X" ──
  const shellMatch = lower.match(
    /^(?:vypolni|zapusti|exec|run|shell)\\s+(?:komandu\\s+|v\\s+terminale\\s+)?(.+)/i,
  );
  if (shellMatch) {
    return { action: 'shell_exec', target: shellMatch[1].trim(), raw };
  }

  // ── cd / pereydi v papku ──
  const cdMatch = lower.match(/^(?:pereydi|cd|zaydi)\\s+(?:v\\s+)?(?:papku|direktoriyu|katalog)?\\s*(.+)/i);
  if (cdMatch) {
    const dir = cdMatch[1].trim().replace(/^["\\'"]|["\\'"]$/g, "");
    return { action: 'shell_exec', target: "cd " + dir + " && pwd", raw };
  }

  // ── Write file: "zapishi v fayl PATH soderzhimoe CONTENT" ──
  const writeMatch = lower.match(
    /^(?:zapishi|dopishi|vstav)\\s+(?:v\\s+)?(?:fayl\\s+)?(.+?)\\s+(?:soderzhimoe|tekst|kontent|stroku|dannye)\\s+(.+)/i,
  );
  if (writeMatch) {
    const fp = writeMatch[1].trim().replace(/^["\\'"]|["\\'"]$/g, "");
    const fc = writeMatch[2].trim().replace(/^["\\'"]|["\\'"]$/g, "");
    return { action: 'write_file', target: fp + "|||" + fc, raw };
  }

  // ── Write file simple: "zapishi v PATH : CONTENT" ──
  const writeSimpleMatch = lower.match(/^(?:zapishi|dopishi)\\s+(?:v\\s+)?(.+?)\\s*[:]\\s*(.+)/i);
  if (writeSimpleMatch) {
    const fp = writeSimpleMatch[1].trim().replace(/^["\\'"]|["\\'"]$/g, "");
    const fc = writeSimpleMatch[2].trim().replace(/^["\\'"]|["\\'"]$/g, "");
    return { action: 'write_file', target: fp + "|||" + fc, raw };
  }

'''

marker = '  // ── Code modification'
if marker in c:
    c = c.replace(marker, patterns + marker)
    open(p, 'w').write(c)
    print('OK: intentParser.ts updated')
else:
    print('ERROR: marker not found in intentParser.ts')
    exit(1)

# ── Part 2: App.tsx ──
p2 = base + '/src/App.tsx'
c2 = open(p2).read()

old = "    if (parsed.action === 'code_modify') {"
new = """    if (parsed.action === 'shell_exec') {
      setCoreState('working', 'Shell Executor', 'Running: ' + parsed.target);
      try {
        const result = await invoke<string>('execute_shell', { command: parsed.target });
        if (isMountedRef.current) {
          setActiveMessage({ id: Date.now().toString(), sender: 'jarvis', text: '$ ' + parsed.target + '\\n' + result, timestamp: new Date().toLocaleTimeString() });
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setActiveMessage({ id: Date.now().toString(), sender: 'jarvis', text: 'Shell error: ' + errMsg, timestamp: new Date().toLocaleTimeString() });
        }
      } finally {
        if (isMountedRef.current) {
          isProcessingRef.current = false;
          setIsProcessing(false);
          if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
          commandTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) setCoreState('idle', 'System Ready', 'Awaiting next command');
          }, 2000);
        }
      }
      return;
    }
    if (parsed.action === 'write_file') {
      const parts = parsed.target.split('|||');
      const filePath = parts[0]?.trim() || '';
      const fileContent = parts.slice(1).join('|||').trim() || '';
      if (!filePath || !fileContent) {
        if (isMountedRef.current) {
          setActiveMessage({ id: Date.now().toString(), sender: 'jarvis', text: 'Specify: write to file PATH content TEXT', timestamp: new Date().toLocaleTimeString() });
        }
        isProcessingRef.current = false;
        setIsProcessing(false);
        return;
      }
      setCoreState('working', 'File Writer', 'Writing: ' + filePath);
      try {
        const result = await invoke<string>('create_file_with_content', { path: filePath, content: fileContent });
        if (isMountedRef.current) {
          setActiveMessage({ id: Date.now().toString(), sender: 'jarvis', text: 'File: ' + result, timestamp: new Date().toLocaleTimeString() });
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setActiveMessage({ id: Date.now().toString(), sender: 'jarvis', text: 'File error: ' + errMsg, timestamp: new Date().toLocaleTimeString() });
        }
      } finally {
        if (isMountedRef.current) {
          isProcessingRef.current = false;
          setIsProcessing(false);
          if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
          commandTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) setCoreState('idle', 'System Ready', 'Awaiting next command');
          }, 2000);
        }
      }
      return;
    }
    if (parsed.action === 'code_modify') {"""

if old in c2:
    c2 = c2.replace(old, new)
    open(p2, 'w').write(c2)
    print('OK: App.tsx updated')
else:
    print('ERROR: code_modify block not found in App.tsx')
    exit(1)

print('DONE - JARVIS now has shell_exec and write_file wired into chat')
