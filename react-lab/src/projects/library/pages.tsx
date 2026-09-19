// Project 4 — three pages: list, detail, form (create + edit share one component).
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useBook, useBooks, useCreateBook, useDeleteBook, useUpdateBook } from './hooks';
import { emptyDraft, validateDraft, type Book, type BookDraft, type ValidationErrors } from './types';

function Row({ book, onDelete }: { book: Book; onDelete: (id: string) => void }) {
  return (
    <tr>
      <td><Link to={`/books/${book.id}`}>{book.title}</Link></td>
      <td>{book.author}</td>
      <td>{book.year}</td>
      <td>{book.status}</td>
      <td>
        <Link to={`/books/${book.id}/edit`} aria-label={`Edit ${book.title}`}>Edit</Link>
        <button type="button" onClick={() => onDelete(book.id)} aria-label={`Delete ${book.title}`}>Delete</button>
      </td>
    </tr>
  );
}

export function BookListPage() {
  const { data: books, error, isPending } = useBooks();
  const deleteBook = useDeleteBook();

  if (isPending) return <p role="status">Loading books…</p>;
  if (error !== null && error !== undefined) {
    return <div role="alert"><p>{(error as Error).message}</p></div>;
  }
  if (books === undefined || books.length === 0) {
    return (
      <section>
        <h2>Library</h2>
        <p>No books yet.</p>
        <Link to="/books/new">Add the first book</Link>
      </section>
    );
  }

  return (
    <section>
      <h2>Library</h2>
      <p><Link to="/books/new">Add a book</Link></p>
      {deleteBook.isError && <p role="alert">Could not delete: {(deleteBook.error as Error).message}</p>}
      <table>
        <caption>{books.length} books</caption>
        <thead>
          <tr><th scope="col">Title</th><th scope="col">Author</th><th scope="col">Year</th><th scope="col">Status</th><th scope="col">Actions</th></tr>
        </thead>
        <tbody>
          {books.map((book) => (
            <Row key={book.id} book={book} onDelete={(id) => deleteBook.mutate(id)} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function BookDetailPage() {
  const { id = '' } = useParams();
  const { data: book, error, isPending } = useBook(id);
  const navigate = useNavigate();

  if (isPending) return <p role="status">Loading book…</p>;
  if (error !== null && error !== undefined) {
    const status = (error as { status?: number }).status;
    return (
      <div role="alert">
        <p>{status === 404 ? 'That book does not exist.' : (error as Error).message}</p>
        <button type="button" onClick={() => void navigate('/books')}>Back to the list</button>
      </div>
    );
  }
  if (book === undefined) return null;

  return (
    <article>
      <h2>{book.title}</h2>
      <p>by {book.author} ({book.year})</p>
      <p>Status: {book.status}</p>
      <Link to={`/books/${book.id}/edit`}>Edit</Link>
      <Link to="/books">Back to the list</Link>
    </article>
  );
}

interface BookFormProps {
  initial?: BookDraft;
  submitLabel: string;
  onSubmit: (draft: BookDraft) => Promise<void>;
  serverError?: string | null;
  isSubmitting: boolean;
}

function BookForm({ initial = emptyDraft, submitLabel, onSubmit, serverError = null, isSubmitting }: BookFormProps) {
  const [draft, setDraft] = useState<BookDraft>(initial);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;              // the API is not called with invalid data
    await onSubmit(draft);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h2>{submitLabel}</h2>

      {serverError !== null && <p role="alert">{serverError}</p>}

      <label htmlFor="title">Title</label>
      <input
        id="title"
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        aria-invalid={errors.title !== undefined}
        aria-describedby={errors.title !== undefined ? 'title-error' : undefined}
      />
      {errors.title !== undefined && <p id="title-error" role="alert">{errors.title}</p>}

      <label htmlFor="author">Author</label>
      <input id="author" value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} />

      <label htmlFor="year">Year</label>
      <input
        id="year"
        type="number"
        value={draft.year}
        onChange={(event) => setDraft({ ...draft, year: Number(event.target.value) })}
      />

      <label htmlFor="status">Status</label>
      <select
        id="status"
        value={draft.status}
        onChange={(event) => setDraft({ ...draft, status: event.target.value as BookDraft['status'] })}
      >
        <option value="available">available</option>
        <option value="borrowed">borrowed</option>
      </select>

      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : submitLabel}</button>
      <button type="button" onClick={() => void navigate(-1)}>Cancel</button>
    </form>
  );
}

export function BookCreatePage() {
  const create = useCreateBook();
  const navigate = useNavigate();

  return (
    <BookForm
      submitLabel="Add book"
      isSubmitting={create.isPending}
      serverError={create.isError ? (create.error as Error).message : null}
      onSubmit={async (draft) => {
        const created = await create.mutateAsync(draft);
        void navigate(`/books/${created.id}`);                       // land on the new book
      }}
    />
  );
}

export function BookEditPage() {
  const { id = '' } = useParams();
  const { data: book, isPending, error } = useBook(id);
  const update = useUpdateBook(id);
  const navigate = useNavigate();

  if (isPending) return <p role="status">Loading book…</p>;
  if (error !== null && error !== undefined) return <div role="alert"><p>{(error as Error).message}</p></div>;
  if (book === undefined) return null;

  return (
    <BookForm
      initial={{ title: book.title, author: book.author, year: book.year, status: book.status }}
      submitLabel="Save changes"
      isSubmitting={update.isPending}
      serverError={update.isError ? (update.error as Error).message : null}
      onSubmit={async (draft) => {
        await update.mutateAsync(draft);
        void navigate(`/books/${id}`);
      }}
    />
  );
}
