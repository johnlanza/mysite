import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export async function importTypeScript(relativePath) {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = await readFile(fileUrl, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: fileUrl.pathname,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020
    }
  });
  const encoded = Buffer.from(`${outputText}\n//# sourceURL=${fileUrl.href}`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}
