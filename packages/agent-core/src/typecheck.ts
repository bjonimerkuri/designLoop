import path from 'node:path';
import ts from 'typescript';
import type { Framework, GeneratedCode } from './types';

const PACKAGE_ROOT = path.resolve(__dirname, '..');

export interface TypecheckResult {
  available: boolean;
  errors: string[];
}

const flatten = (message: string | ts.DiagnosticMessageChain): string => ts.flattenDiagnosticMessageText(message, ' ');

export function typecheckComponent(code: GeneratedCode, framework: Framework): TypecheckResult {
  if (process.env.TYPECHECK === 'off') return { available: false, errors: [] };
  try {
    const angular = framework === 'angular';
    const file = path.join(PACKAGE_ROOT, angular ? '__designloop_component__.ts' : '__designloop_component__.tsx');
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      experimentalDecorators: angular,
      useDefineForClassFields: false,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      types: []
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
      name === file
        ? ts.createSourceFile(name, code.tsx, languageVersion, true)
        : getSourceFile(name, languageVersion, onError, shouldCreate);
    host.readFile = (name) => (name === file ? code.tsx : readFile(name));
    host.fileExists = (name) => name === file || fileExists(name);

    const program = ts.createProgram([file], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName === file);

    const missingTypes = diagnostics.some(
      (d) => (d.code === 2307 || d.code === 7016) && /react|@angular/.test(flatten(d.messageText))
    );
    if (missingTypes) return { available: false, errors: [] };

    const errors = diagnostics
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .slice(0, 6)
      .map((d) => {
        const position = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null;
        const where = position ? `${position.line + 1}:${position.character + 1} ` : '';
        return `${where}TS${d.code}: ${flatten(d.messageText)}`;
      });
    return { available: true, errors };
  } catch {
    return { available: false, errors: [] };
  }
}
