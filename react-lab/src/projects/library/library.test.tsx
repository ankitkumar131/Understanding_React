// Project 4 tests — routing, forms and server state together, with MSW holding the data.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { libraryRoutes } from './router';
import type { Book } from './types';

const seed: Book[] = [
  { id: '1', title: 'Refactoring UI', author: 'Wathan & Schoger', year: 2018, status: 'available' },
  { id: '2', title: 'Thinking in Systems', author: 'Donella Meadows', year: 2008, status: 'borrowed' },
];

function renderApp(initialPath = '/books') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const router = createMemoryRouter(libraryRoutes, { initialEntries: [initialPath] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}

/** A tiny in-memory API: exactly how the real endpoints behave, including status codes. */
function useInMemoryApi(startWith: Book[] = seed) {
  let books = [...startWith];
  server.use(
    http.get('/api/books', () => HttpResponse.json(books)),
    http.get('/api/books/:id', ({ params }) => {
      const book = books.find((candidate) => candidate.id === params.id);
      return book === undefined
        ? HttpResponse.json({ message: 'Book not found' }, { status: 404 })
        : HttpResponse.json(book);
    }),
    http.post('/api/books', async ({ request }) => {
      const draft = (await request.json()) as Omit<Book, 'id'>;
      const created: Book = { ...draft, id: String(books.length + 1) };
      books = [...books, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.put('/api/books/:id', async ({ params, request }) => {
      const draft = (await request.json()) as Omit<Book, 'id'>;
      const updated: Book = { ...draft, id: String(params.id) };
      books = books.map((book) => (book.id === params.id ? updated : book));
      return HttpResponse.json(updated);
    }),
    http.delete('/api/books/:id', ({ params }) => {
      books = books.filter((book) => book.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { current: () => books };
}

describe('library app', () => {
  it('lists the books from the API', async () => {
    useInMemoryApi();
    renderApp();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Refactoring UI' })).toBeInTheDocument();
    expect(screen.getByText('2 books')).toBeInTheDocument();
  });

  it('shows an empty state when there are no books', async () => {
    useInMemoryApi([]);
    renderApp();

    expect(await screen.findByText('No books yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add the first book' })).toBeInTheDocument();
  });

  it('creates a book through the form and lands on its detail page', async () => {
    const api = useInMemoryApi();
    const user = userEvent.setup();
    const { router } = renderApp();

    await user.click(await screen.findByRole('link', { name: 'Add a book' }));
    await user.type(screen.getByLabelText('Title'), 'The Pragmatic Programmer');
    await user.type(screen.getByLabelText('Author'), 'Hunt & Thomas');
    await user.clear(screen.getByLabelText('Year'));
    await user.type(screen.getByLabelText('Year'), '1999');
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    expect(await screen.findByRole('heading', { name: 'The Pragmatic Programmer' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/books/3');
    expect(api.current()).toHaveLength(3);
  });

  it('blocks submission with validation errors instead of calling the API', async () => {
    const api = useInMemoryApi();
    const user = userEvent.setup();
    renderApp('/books/new');

    await user.clear(screen.getByLabelText('Year'));
    await user.type(screen.getByLabelText('Year'), '1200');
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    expect(await screen.findByText('Give the book a title of at least 2 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(api.current()).toHaveLength(2);                    // nothing was created
  });

  it('prefills the edit form and saves changes', async () => {
    const api = useInMemoryApi();
    const user = userEvent.setup();
    renderApp('/books/2/edit');

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('Thinking in Systems');

    await user.clear(title);
    await user.type(title, 'Thinking in Systems (2nd ed.)');
    await user.selectOptions(screen.getByLabelText('Status'), 'available');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('heading', { name: 'Thinking in Systems (2nd ed.)' })).toBeInTheDocument();
    expect(api.current().find((book) => book.id === '2')?.status).toBe('available');
  });

  it('deletes a book from the list', async () => {
    const api = useInMemoryApi();
    const user = userEvent.setup();
    renderApp();

    const row = (await screen.findByRole('link', { name: 'Thinking in Systems' })).closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Delete Thinking in Systems' }));

    expect(await screen.findByText('1 books')).toBeInTheDocument();
    expect(api.current()).toHaveLength(1);
  });

  it('explains a missing book and offers a way back', async () => {
    useInMemoryApi();
    renderApp('/books/999');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That book does not exist.');
    expect(within(alert).getByRole('button', { name: 'Back to the list' })).toBeInTheDocument();
  });

  it('renders the not-found route for an unknown path', async () => {
    useInMemoryApi();
    renderApp('/nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('Page not found.');
  });
});
