import { render, screen } from '@testing-library/react';
import { StaticHome } from '@/components/StaticHome';

describe('StaticHome', () => {
  it('explains the project and links to the replays, the evals and the source', () => {
    render(<StaticHome />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('turns a design into a checked component');
    expect(screen.getByRole('link', { name: 'Watch saved runs' })).toHaveAttribute('href', '/demo');
    expect(screen.getByRole('link', { name: 'See the evals' })).toHaveAttribute('href', '/evals');
    expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', expect.stringContaining('github.com'));
  });

  it('offers no upload form', () => {
    render(<StaticHome />);
    expect(screen.queryByLabelText('Design image')).not.toBeInTheDocument();
  });
});

describe('static data loading', () => {
  const original = process.env.NEXT_PUBLIC_STATIC_DEMO;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_STATIC_DEMO;
    else process.env.NEXT_PUBLIC_STATIC_DEMO = original;
    jest.resetModules();
  });

  it('reads eval reports from the exported files', async () => {
    process.env.NEXT_PUBLIC_STATIC_DEMO = 'true';
    jest.resetModules();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    const api = await import('@/lib/api');
    await api.listEvals();
    await api.getEval('report one.json');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/data/evals/index.json');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/data/evals/report%20one.json');
    expect(await api.getEvalHistory()).toEqual([]);
  });

  it('reports missing static data clearly', async () => {
    process.env.NEXT_PUBLIC_STATIC_DEMO = 'true';
    jest.resetModules();
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({ ok: false });
    const api = await import('@/lib/api');
    await expect(api.listEvals()).rejects.toThrow('not available in the static demo');
  });
});
