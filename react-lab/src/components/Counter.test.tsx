import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Counter } from './Counter';

describe('Counter', () => {
  it('shows the initial value and increments by the step', async () => {
    const user = userEvent.setup();
    render(<Counter initial={3} step={2} label="Items" />);

    expect(screen.getByText(/Items:/)).toBeInTheDocument();
    expect(screen.getByTestId('count')).toHaveTextContent('3');

    await user.click(screen.getByRole('button', { name: 'Increment' }));
    expect(screen.getByTestId('count')).toHaveTextContent('5');

    await user.click(screen.getByRole('button', { name: 'Increment' }));
    expect(screen.getByTestId('count')).toHaveTextContent('7');
  });

  it('disables Reset at the initial value and re-enables it after a change', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(reset).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Increment' }));
    expect(reset).toBeEnabled();

    await user.click(reset);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(reset).toBeDisabled();
  });
});
