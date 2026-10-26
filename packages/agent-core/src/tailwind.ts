import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

export async function compileTailwind(tsx: string): Promise<string> {
  const plugin = tailwindcss({ content: [{ raw: tsx, extension: 'tsx' }] }) as unknown as postcss.AcceptedPlugin;
  const result = await postcss([plugin]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;', {
    from: undefined
  });
  return result.css;
}
