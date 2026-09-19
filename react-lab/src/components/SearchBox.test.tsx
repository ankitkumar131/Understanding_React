import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SearchBox } from './SearchBox';

const items = ['Desk Lamp', 'Floor Lamp', 'Wireless Mouse'];

describe('SearchBox', () => {
  it('filters the list as the user types', async () => {
    const user = userEvent.setup();
    render(<SearchBox items={items} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    await user.type(screen.getByLabelText('Search products'), 'lamp');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Desk Lamp')).toBeInTheDocument();
    expect(screen.queryByText('Wireless Mouse')).not.toBeInTheDocument();
  });

  it('announces an empty result instead of showing an empty list', async () => {
    const user = userEvent.setup();
    render(<SearchBox items={items} />);

    await user.type(screen.getByRole('searchbox'), 'keyboard');
    expect(screen.getByRole('status')).toHaveTextContent('No products match');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('clears back to the full list when the query is emptied', async () => {
    const user = userEvent.setup();
    render(<SearchBox items={items} />);

    const input = screen.getByLabelText('Search products');
    await user.type(input, 'mouse');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    await user.clear(input);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
