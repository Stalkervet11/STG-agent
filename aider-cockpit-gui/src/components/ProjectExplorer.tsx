import React, { useState, useEffect } from "react";
import { 
  Folder, 
  FileCode, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Save, 
  HelpCircle,
  Code2,
  Terminal,
  RotateCcw
} from "lucide-react";
import { VirtualProject, VirtualFile, UnitTest } from "../types";

interface ProjectExplorerProps {
  project: VirtualProject;
  onFileUpdate: (filePath: string, content: string) => void;
  onRunTests: () => void;
  lang?: 'en' | 'ru';
}

export default function ProjectExplorer({ 
  project, 
  onFileUpdate, 
  onRunTests,
  lang = 'en'
}: ProjectExplorerProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string>("");
  const [editorContent, setEditorContent] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'assertions'>('editor');

  const files = Object.values(project.files);

  // Auto-select first file on project mount
  useEffect(() => {
    if (files.length > 0) {
      setSelectedFilePath(files[0].path);
      setEditorContent(files[0].content);
      setHasUnsavedChanges(false);
    }
  }, [project]);

  // Sync editor if file content changes from backend (e.g. Aider writes code)
  useEffect(() => {
    const activeFile = project.files[selectedFilePath];
    if (activeFile) {
      setEditorContent(activeFile.content);
      setHasUnsavedChanges(false);
    }
  }, [project.files, selectedFilePath]);

  const handleFileClick = (path: string) => {
    if (hasUnsavedChanges) {
      if (!confirm("Discard unsaved changes?")) return;
    }
    const file = project.files[path];
    setSelectedFilePath(path);
    setEditorContent(file.content);
    setHasUnsavedChanges(false);
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditorContent(e.target.value);
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    onFileUpdate(selectedFilePath, editorContent);
    setHasUnsavedChanges(false);
  };

  const getTestStatusBadge = (status: UnitTest['status']) => {
    switch (status) {
      case "passed":
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-1.5 py-0.5 rounded">
            <CheckCircle2 className="w-3.5 h-3.5" /> {lang === 'ru' ? "ПРОЙДЕН" : "PASSED"}
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-950/40 border border-rose-900/60 px-1.5 py-0.5 rounded animate-pulse">
            <XCircle className="w-3.5 h-3.5" /> {lang === 'ru' ? "ОШИБКА" : "FAILED"}
          </span>
        );
      case "running":
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-950/40 border border-amber-900/60 px-1.5 py-0.5 rounded">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" /> {lang === 'ru' ? "ТЕСТ..." : "TESTING..."}
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
            <HelpCircle className="w-3.5 h-3.5" /> {lang === 'ru' ? "НЕ ПРОВЕРЕН" : "UNTESTED"}
          </span>
        );
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Left Column: Explorer tree & tests */}
      <div className="lg:col-span-4 space-y-6">
        
        {/* Workspace directory tree */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{lang === 'ru' ? "Проводник файлов" : "File Explorer"}</h4>
          </div>

          <div className="space-y-1 bg-slate-950/60 p-2 rounded border border-slate-850">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono px-2 py-1">
              <span>root /</span>
              <span>src /</span>
            </div>
            
            <div className="space-y-1">
              {files.map(file => (
                <button
                  key={file.path}
                  onClick={() => handleFileClick(file.path)}
                  className={`w-full text-left font-mono text-xs px-3 py-2 rounded flex items-center justify-between transition-all ${
                    selectedFilePath === file.path
                      ? "bg-cyan-950/30 text-cyan-400 border border-cyan-900/50"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <FileCode className="w-3.5 h-3.5 text-slate-500" />
                    {file.name}
                  </span>
                  <span className="text-[10px] text-slate-600 uppercase font-sans">
                    {file.language}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic unit test suite panel */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{lang === 'ru' ? "Запуск юнит-тестов" : "Unit Test Runner"}</h4>
              </div>
              <button
                onClick={onRunTests}
                className="py-1 px-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-emerald-50 flex items-center gap-1 shadow-sm transition-all"
              >
                <Play className="w-3 h-3 fill-emerald-50" /> {lang === 'ru' ? "Запустить тесты" : "Run Tests"}
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {project.tests.map(test => (
                <div 
                  key={test.id} 
                  className={`p-3 rounded border text-xs space-y-2 transition-all ${
                    test.status === "passed" 
                      ? "bg-emerald-950/10 border-emerald-900/30" 
                      : test.status === "failed" 
                        ? "bg-rose-950/10 border-rose-900/30" 
                        : "bg-slate-950/40 border-slate-850"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h5 className="font-semibold text-slate-200">{test.name}</h5>
                      <p className="text-[11px] text-slate-500">{test.description}</p>
                    </div>
                    {getTestStatusBadge(test.status)}
                  </div>

                  {/* Assertion assertion log */}
                  <div className="p-2 bg-slate-950/80 rounded border border-slate-900 font-mono text-[10px] text-slate-400">
                    <p className="text-slate-500">// assertion check:</p>
                    <p className="text-cyan-400">{test.assertCode}</p>
                    {test.errorMessage && (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-900 text-rose-400">
                        <span className="font-bold flex items-center gap-1 uppercase text-[9px] text-rose-500">
                          <AlertCircle className="w-3 h-3" /> trace:
                        </span>
                        <p className="mt-0.5 leading-relaxed">{test.errorMessage}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-850 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>{lang === 'ru' ? "Тесты: " : "Tests: "}{project.tests.length}</span>
            <span>{lang === 'ru' ? "Успешно: " : "Green: "}{project.tests.filter(t => t.status === "passed").length} / {project.tests.length}</span>
          </div>
        </div>

      </div>

      {/* Right Column: Code editor workspace */}
      <div className="lg:col-span-8 p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        
        {/* Editor controls tab bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-1.5 rounded bg-slate-950 border border-slate-800">
              <FileCode className="w-4 h-4 text-cyan-400" />
            </span>
            <div>
              <h3 className="text-xs font-semibold text-slate-300 font-mono">
                {selectedFilePath || "Loading workspace..."}
              </h3>
              <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {lang === 'ru' ? "Записываемый поток песочницы" : "Writeable sandbox thread"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 block" /> {lang === 'ru' ? "Несохраненные изменения" : "Unsaved changes"}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges}
              className={`py-1.5 px-3 rounded text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all ${
                hasUnsavedChanges
                  ? "bg-cyan-600 hover:bg-cyan-500 text-cyan-50 cursor-pointer"
                  : "bg-slate-950 text-slate-500 border border-slate-850 cursor-not-allowed"
              }`}
            >
              <Save className="w-3.5 h-3.5" /> {lang === 'ru' ? "Сохранить и скомпилировать" : "Save & Compile"}
            </button>
          </div>
        </div>

        {/* Code edit panel with line numbers */}
        <div className="relative border border-slate-800 rounded bg-slate-950 p-1 flex">
          {/* Simulated Line numbers */}
          <div className="w-10 text-right pr-3 pt-3 font-mono text-xs text-slate-600 select-none border-r border-slate-900 space-y-1">
            {Array.from({ length: editorContent.split("\n").length || 1 }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Code Textarea */}
          <textarea
            value={editorContent}
            onChange={handleEditorChange}
            spellCheck="false"
            className="flex-1 min-h-[350px] max-h-[500px] p-3 font-mono text-xs text-slate-200 bg-transparent resize-y focus:outline-none leading-relaxed"
            placeholder="// Loading file content..."
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Lines: {editorContent.split("\n").length}</span>
          <span>Syntax: TypeScript</span>
        </div>

      </div>

    </div>
  );
}
