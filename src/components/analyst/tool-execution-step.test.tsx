/**
 * Tests for ToolExecutionStep component.
 * @module components/analyst/tool-execution-step.test
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolExecutionStep } from './tool-execution-step';

describe('ToolExecutionStep', () => {
  describe('code_execution tool', () => {
    it('renders collapsed with first line of code', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="code_execution"
          input={{ code: 'import pandas as pd\ndf = pd.read_json("/uploads/data.json")' }}
          output={{ stdout: 'Success' }}
        />
      );

      expect(screen.getByText('Code Sandbox')).toBeInTheDocument();
      expect(screen.getByText('import pandas as pd')).toBeInTheDocument();
    });

    it('shows spinner when input-streaming', () => {
      render(
        <ToolExecutionStep
          state="input-streaming"
          toolName="code_execution"
          input={{ code: 'print("hello")' }}
        />
      );

      expect(screen.getByTestId('status-loading')).toBeInTheDocument();
    });

    it('shows green checkmark when output-available', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="code_execution"
          input={{ code: 'print("hello")' }}
          output={{ stdout: 'hello' }}
        />
      );

      expect(screen.getByTestId('status-success')).toBeInTheDocument();
    });

    it('shows red X when output-error', () => {
      render(
        <ToolExecutionStep
          state="output-error"
          toolName="code_execution"
          input={{ code: 'raise Exception()' }}
          error="Exception raised"
        />
      );

      expect(screen.getByTestId('status-error')).toBeInTheDocument();
    });

    it('shows full code and output when expanded', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="code_execution"
          input={{ code: 'import pandas as pd\ndf = pd.read_json("/uploads/data.json")' }}
          output={{ stdout: 'DataFrame loaded: 100 rows' }}
        />
      );

      // Initially collapsed - output not visible
      expect(screen.queryByText('DataFrame loaded: 100 rows')).not.toBeInTheDocument();

      // Click to expand
      await user.click(screen.getByRole('button'));

      // Now full code and output visible
      expect(screen.getByText('DataFrame loaded: 100 rows')).toBeInTheDocument();
      // Full code is in the expanded pre block (also appears in collapsed code tag)
      expect(screen.getAllByText(/import pandas as pd/).length).toBeGreaterThan(0);
    });
  });

  describe('bash tool', () => {
    it('renders with Code Sandbox label', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="bash"
          input={{ command: 'ls -la /uploads' }}
          output={{ stdout: 'total 4\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .' }}
        />
      );

      expect(screen.getByText('Code Sandbox')).toBeInTheDocument();
      expect(screen.getByText('ls -la /uploads')).toBeInTheDocument();
    });

    it('shows command when expanded', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="bash"
          input={{ command: 'python create_excel.py' }}
          output={{ stdout: 'Excel file created successfully' }}
        />
      );

      await user.click(screen.getByRole('button'));

      // Command appears in collapsed header code tag and expanded pre block
      expect(screen.getAllByText('python create_excel.py').length).toBeGreaterThan(0);
      expect(screen.getByText('Excel file created successfully')).toBeInTheDocument();
    });

    it('shows error state correctly', () => {
      render(
        <ToolExecutionStep
          state="output-error"
          toolName="bash"
          input={{ command: 'rm /nonexistent' }}
          error="rm: cannot remove '/nonexistent': No such file or directory"
        />
      );

      expect(screen.getByTestId('status-error')).toBeInTheDocument();
    });

    it('shows Output section when expanded (bash only)', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="bash"
          input={{ command: 'ls -la' }}
          output={{ stdout: 'total 0\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .' }}
        />
      );

      await user.click(screen.getByRole('button'));

      // Bash should show the Output section
      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText(/total 0/)).toBeInTheDocument();
    });
  });

  describe('str_replace_editor tool', () => {
    it('renders with Code Sandbox label', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="str_replace_editor"
          input={{ file_text: 'const x = 1;\nconst y = 2;' }}
        />
      );

      expect(screen.getByText('Code Sandbox')).toBeInTheDocument();
      expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    });

    it('extracts code from new_str for edits', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="str_replace_editor"
          input={{ new_str: 'const updated = true;' }}
        />
      );

      expect(screen.getByText('const updated = true;')).toBeInTheDocument();
    });

    it('shows file_text for create operations (not "create")', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="str_replace_editor"
          input={{ command: 'create', path: '/tmp/script.py', file_text: 'import openpyxl\nfrom pathlib import Path' }}
        />
      );

      // Should show first line of file_text, not "create"
      expect(screen.getByText('import openpyxl')).toBeInTheDocument();
      expect(screen.queryByText('create')).not.toBeInTheDocument();
    });

    it('shows "view path" for view operations', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="str_replace_editor"
          input={{ command: 'view', path: '/uploads/data.json' }}
          output={{ content: '{"key": "value"}' }}
        />
      );

      // Should show "view /uploads/data.json" in preview
      expect(screen.getByText('view /uploads/data.json')).toBeInTheDocument();
    });

    it('shows viewed file content when expanded', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="str_replace_editor"
          input={{ command: 'view', path: '/uploads/data.json' }}
          output={{ content: '{"name": "test", "value": 42}' }}
        />
      );

      await user.click(screen.getByRole('button'));

      // Should show the file content from output, not "view /path"
      expect(screen.getByText('{"name": "test", "value": 42}')).toBeInTheDocument();
    });

    it('shows full code in expanded create operation', async () => {
      const user = userEvent.setup();
      const code = 'import pandas as pd\nimport numpy as np\n\ndf = pd.DataFrame()';

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="str_replace_editor"
          input={{ command: 'create', path: '/tmp/analysis.py', file_text: code }}
        />
      );

      await user.click(screen.getByRole('button'));

      // Full code should be visible in expanded view (may appear in multiple places)
      expect(screen.getAllByText(/import pandas as pd/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/import numpy as np/).length).toBeGreaterThan(0);
    });

    it('does not show Output section for create operations', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="str_replace_editor"
          input={{ command: 'create', path: '/tmp/script.py', file_text: 'print("hello")' }}
          output={{ stdout: 'File created successfully' }}
        />
      );

      await user.click(screen.getByRole('button'));

      // Should NOT show Output section for create operations
      expect(screen.queryByText('Output')).not.toBeInTheDocument();
      expect(screen.queryByText('File created successfully')).not.toBeInTheDocument();
    });
  });

  describe('text_editor_code_execution tool (API name)', () => {
    it('shows file_text for create operations', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="text_editor_code_execution"
          input={{ command: 'create', path: '/tmp/script.py', file_text: 'import json\nimport os' }}
        />
      );

      // Should show first line of file_text, not "create"
      expect(screen.getByText('import json')).toBeInTheDocument();
    });

    it('shows "view path" for view operations', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="text_editor_code_execution"
          input={{ command: 'view', path: '$INPUT_DIR/data.json' }}
        />
      );

      expect(screen.getByText('view $INPUT_DIR/data.json')).toBeInTheDocument();
    });

    it('does not show Output section for create operations', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="text_editor_code_execution"
          input={{ command: 'create', path: '/tmp/script.py', file_text: 'print("hello")' }}
          output={{ stdout: 'File created' }}
        />
      );

      await user.click(screen.getByRole('button'));

      expect(screen.queryByText('Output')).not.toBeInTheDocument();
    });
  });

  describe('bash_code_execution tool (API name)', () => {
    it('shows command in preview', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="bash_code_execution"
          input={{ command: 'echo $INPUT_DIR' }}
        />
      );

      expect(screen.getByText('echo $INPUT_DIR')).toBeInTheDocument();
    });

    it('shows Output section when expanded', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="bash_code_execution"
          input={{ command: 'cd /tmp && python script.py' }}
          output={{ stdout: 'Excel file created successfully!' }}
        />
      );

      await user.click(screen.getByRole('button'));

      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('Excel file created successfully!')).toBeInTheDocument();
    });
  });

  describe('unknown tool', () => {
    it('renders with Code Sandbox label', () => {
      render(
        <ToolExecutionStep
          state="output-available"
          toolName="some_custom_tool"
          input={{ data: 'test' }}
        />
      );

      expect(screen.getByText('Code Sandbox')).toBeInTheDocument();
    });

    it('stringifies input for unknown tools', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="some_custom_tool"
          input={{ foo: 'bar', num: 42 }}
        />
      );

      await user.click(screen.getByRole('button'));

      // JSON stringified input should be visible
      expect(screen.getByText(/foo/)).toBeInTheDocument();
      expect(screen.getByText(/bar/)).toBeInTheDocument();
    });
  });

  describe('copy button', () => {
    it('shows copy button when expanded', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="bash"
          input={{ command: 'echo hello' }}
        />
      );

      await user.click(screen.getByRole('button'));

      expect(screen.getByTitle('Copy code')).toBeInTheDocument();
    });
  });

  describe('output sections', () => {
    it('shows separate stdout and stderr sections', async () => {
      const user = userEvent.setup();

      render(
        <ToolExecutionStep
          state="output-available"
          toolName="bash"
          input={{ command: 'some command' }}
          output={{ stdout: 'standard output', stderr: 'warning message' }}
        />
      );

      await user.click(screen.getByRole('button'));

      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('standard output')).toBeInTheDocument();
      expect(screen.getByText('Stderr:')).toBeInTheDocument();
      expect(screen.getByText('warning message')).toBeInTheDocument();
    });
  });
});
