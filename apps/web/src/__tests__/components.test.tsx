import { fireEvent, render, screen } from '@testing-library/react';
import type { StepView, VerifyData } from '@designloop/shared';
import { CodePanel } from '@/components/CodePanel';
import { CompareView } from '@/components/CompareView';
import { DesignReading } from '@/components/DesignReading';
import { RevisionForm } from '@/components/RevisionForm';
import { StatusPill } from '@/components/StatusPill';
import { UploadForm } from '@/components/UploadForm';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const verify = (passed: boolean, similarity: number): VerifyData => ({
  compiled: true,
  compileErrors: [],
  typeErrors: [],
  consoleErrors: [],
  similarity,
  regions: [],
  a11y: [],
  blocking: 0,
  passed
});

const step = (partial: Partial<StepView>): StepView => ({
  id: 'x',
  index: 0,
  type: 'analysis',
  name: 'analyze_design',
  summary: '',
  iteration: null,
  data: null,
  tokensIn: 0,
  tokensOut: 0,
  cost: 0,
  durationMs: 0,
  ...partial
});

describe('StatusPill', () => {
  it('shows a readable label and exposes the status', () => {
    render(<StatusPill status="budget_exceeded" />);
    expect(screen.getByText('Budget reached')).toHaveAttribute('data-status', 'budget_exceeded');
  });
});

describe('CodePanel', () => {
  it('switches between the component and its styles', () => {
    render(<CodePanel tsx="const a = 1;" css=".a{color:red}" framework="react" />);
    expect(screen.getByText('const a = 1;')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'styles.css' }));
    expect(screen.getByText('.a{color:red}')).toBeInTheDocument();
  });

  it('hides the styles tab when there is no css and names angular files', () => {
    render(<CodePanel tsx="export class AppComponent {}" css="" framework="angular" />);
    expect(screen.queryByRole('button', { name: 'styles.css' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'app.component.ts' })).toBeInTheDocument();
  });
});

describe('CompareView', () => {
  it('lists the passes and reports the one the user picks', () => {
    const onSelect = jest.fn();
    render(
      <CompareView
        imageUrl={(name) => `/img/${name}`}
        iterations={[
          { iteration: 1, data: verify(false, 0.62) },
          { iteration: 2, data: verify(true, 0.95) }
        ]}
        selected={1}
        onSelect={onSelect}
      />
    );
    expect(screen.getByAltText('Render from pass 1')).toHaveAttribute('src', '/img/render-1.png');
    fireEvent.click(screen.getByRole('button', { name: /Pass 2/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

describe('DesignReading', () => {
  it('shows the measured colors and the description', () => {
    render(
      <DesignReading
        steps={[
          step({ index: 0, type: 'tool', name: 'extract_tokens', data: { palette: ['#ffffff', '#17233a'], background: '#ffffff' } }),
          step({ index: 1, data: { summary: 'A pricing card', palette: ['#ffffff', '#17233a'], fonts: 'System sans', texts: ['Team', '$29'] } })
        ]}
      />
    );
    expect(screen.getByText('A pricing card')).toBeInTheDocument();
    expect(screen.getByText('#17233a')).toBeInTheDocument();
    expect(screen.getByText('Team · $29')).toBeInTheDocument();
  });

  it('renders nothing before the agent has read the design', () => {
    const { container } = render(<DesignReading steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('UploadForm', () => {
  it('offers all three outputs', () => {
    render(<UploadForm />);
    for (const label of ['React', 'React + Tailwind', 'Angular']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('rejects files that are not PNG or JPEG', () => {
    render(<UploadForm />);
    const file = new File(['x'], 'design.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText('Design image'), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent('PNG or JPEG');
  });

  it('asks for a design before starting', () => {
    render(<UploadForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Build component' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a design');
  });
});

describe('RevisionForm', () => {
  it('requires a description of the change', () => {
    render(<RevisionForm runId="abc" />);
    fireEvent.click(screen.getByRole('button', { name: 'Revise component' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Describe what should change.');
  });
});
