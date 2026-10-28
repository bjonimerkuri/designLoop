import { fireEvent, render, screen } from '@testing-library/react';
import { KeySettings } from '@/components/KeySettings';
import { testKey } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  getConfig: jest.fn().mockResolvedValue({ serverKeyAvailable: false, personalKeysEnabled: true, demoMode: false }),
  testKey: jest.fn()
}));

const VALID = 'AIzaSyExampleKeyForTests123456';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  (testKey as jest.Mock).mockReset();
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('KeySettings', () => {
  it('tells the user when the server has no key of its own', async () => {
    render(<KeySettings />);
    expect(await screen.findByText(/no key of its own/)).toBeInTheDocument();
  });

  it('rejects an invalid key and stores nothing', () => {
    render(<KeySettings />);
    type('API key', 'has spaces in it');
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(screen.getByRole('alert')).toHaveTextContent('8 to 400');
    expect(sessionStorage.getItem('designloop.llm')).toBeNull();
  });

  it('saves a valid key for the session and offers to remove it', () => {
    render(<KeySettings />);
    type('API key', VALID);
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(screen.getByRole('status')).toHaveTextContent('browser session');
    expect(sessionStorage.getItem('designloop.llm')).toContain(VALID);
    expect(localStorage.getItem('designloop.llm')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove key' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(sessionStorage.getItem('designloop.llm')).toBeNull();
  });

  it('stores the key on the device only when asked to', () => {
    render(<KeySettings />);
    type('API key', VALID);
    fireEvent.click(screen.getByLabelText(/Remember on this device/));
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(localStorage.getItem('designloop.llm')).toContain(VALID);
    expect(sessionStorage.getItem('designloop.llm')).toBeNull();
  });

  it('shows the default model of the chosen provider', () => {
    render(<KeySettings />);
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'gemini' } });
    expect(screen.getByLabelText('Model')).toHaveValue('gemini-2.5-flash');
  });

  it('reports a working key', async () => {
    (testKey as jest.Mock).mockResolvedValue({ ok: true, model: 'claude-sonnet-5-5' });
    render(<KeySettings />);
    type('API key', VALID);
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
    expect(await screen.findByText('The key works with claude-sonnet-5-5.')).toBeInTheDocument();
  });

  it('shows the provider error when the key is rejected', async () => {
    (testKey as jest.Mock).mockResolvedValue({ ok: false, message: 'LLM request failed (401): invalid key' });
    render(<KeySettings />);
    type('API key', VALID);
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('401');
  });
});
