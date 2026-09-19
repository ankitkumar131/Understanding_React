// Project 1 tests — behaviour through the user's eyes: roles, labels, output.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Counter } from './Counter';

describe('<Counter />', () => {
  it('renders the initial value', () => {
    render(<Counter initial={5} />);
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 5');
  });

  it('increments and decrements by the step', async () => {
    const user = userEvent.setup();
    render(<Counter initial={5} step={2} />);

    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 7');

    await user.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 5');
  });

  it('cannot go below the minimum (the button is disabled)', async () => {
    const user = userEvent.setup();
    render(<Counter initial={0} min={0} />);

    const decrease = screen.getByRole('button', { name: 'Decrease' });
    expect(decrease).toBeDisabled();
    await user.click(decrease);
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 0');
  });

  it('cannot go above the maximum', async () => {
    const user = userEvent.setup();
    render(<Counter initial={9} max={10} />);

    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 10');
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
  });

  it('reports every change through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Counter initial={0} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Increase' }));
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).toHaveBeenNthCalledWith(1, 1);
    expect(onChange).toHaveBeenNthCalledWith(2, 2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('resets to the initial value and disables Reset when unchanged', async () => {
    const user = userEvent.setup();
    render(<Counter initial={3} />);

    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(reset).toBeDisabled();                    // nothing to reset yet

    await user.click(screen.getByRole('button', { name: 'Increase' }));
    await user.click(reset);
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 3');
  });

  it('loses no clicks when pressed rapidly (functional updater)', async () => {
    const user = userEvent.setup();
    render(<Counter />);
    const increase = screen.getByRole('button', { name: 'Increase' });

    await Promise.all([user.click(increase), user.click(increase), user.click(increase)]);
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 3');
  });
});
