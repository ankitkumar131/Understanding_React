// Project 2 tests — the full user journey, including persistence across a remount.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TodoApp } from './TodoApp';

async function addTodo(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.type(screen.getByLabelText('New todo'), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));
}

describe('<TodoApp />', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds a todo and clears the input', async () => {
    const user = userEvent.setup();
    render(<TodoApp />);

    await addTodo(user, 'Write the notes');

    const list = screen.getByRole('list');
    expect(within(list).getByText('Write the notes')).toBeInTheDocument();
    expect(screen.getByLabelText('New todo')).toHaveValue('');
    expect(screen.getByTestId('remaining')).toHaveTextContent('1 item left');
  });

  it('does not add an empty todo and keeps the button disabled', async () => {
    const user = userEvent.setup();
    render(<TodoApp />);

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(screen.getByLabelText('New todo'), '   ');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });

  it('toggles completion, updates the count and filters', async () => {
    const user = userEvent.setup();
    render(<TodoApp />);
    await addTodo(user, 'One');
    await addTodo(user, 'Two');

    await user.click(screen.getByLabelText('Mark "One" as done'));
    expect(screen.getByTestId('remaining')).toHaveTextContent('1 item left');

    await user.click(screen.getByRole('button', { name: 'Active' }));
    expect(screen.queryByText('One')).not.toBeInTheDocument();      // completed is hidden
    expect(screen.getByText('Two')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Completed' }));
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.queryByText('Two')).not.toBeInTheDocument();
  });

  it('deletes a todo and clears completed ones', async () => {
    const user = userEvent.setup();
    render(<TodoApp />);
    await addTodo(user, 'Keep');
    await addTodo(user, 'Remove');

    await user.click(screen.getByLabelText('Mark "Remove" as done'));
    await user.click(screen.getByRole('button', { name: 'Clear completed' }));

    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    expect(screen.getByText('Keep')).toBeInTheDocument();
  });

  it('persists todos in localStorage and reloads them', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TodoApp />);
    await addTodo(user, 'Survive a reload');
    unmount();

    render(<TodoApp />);                                            // a fresh mount, same storage
    expect(screen.getByText('Survive a reload')).toBeInTheDocument();
    expect(screen.getByTestId('remaining')).toHaveTextContent('1 item left');
  });

  it('ignores corrupt stored data instead of crashing', () => {
    localStorage.setItem('react-lab:todos', '{"not":"an array"');
    render(<TodoApp />);
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });
});
