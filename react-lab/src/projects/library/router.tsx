// Project 4 — the route table, shared by the app and the tests.
import type { RouteObject } from 'react-router';
import { BookCreatePage, BookDetailPage, BookEditPage, BookListPage } from './pages';

export const libraryRoutes: RouteObject[] = [
  { path: '/', element: <BookListPage /> },
  { path: '/books', element: <BookListPage /> },
  { path: '/books/new', element: <BookCreatePage /> },
  { path: '/books/:id', element: <BookDetailPage /> },
  { path: '/books/:id/edit', element: <BookEditPage /> },
  { path: '*', element: <p role="alert">Page not found.</p> },
];
