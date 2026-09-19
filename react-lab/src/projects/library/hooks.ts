// Project 4 — the server-state layer: one key factory, one place per endpoint.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { booksApi } from './api';
import type { Book, BookDraft } from './types';

export const bookKeys = {
  all: ['books'] as const,
  list: () => [...bookKeys.all, 'list'] as const,
  detail: (id: string) => [...bookKeys.all, 'detail', id] as const,
};

export function useBooks() {
  return useQuery({ queryKey: bookKeys.list(), queryFn: ({ signal }) => booksApi.list(signal) });
}

export function useBook(id: string) {
  return useQuery({ queryKey: bookKeys.detail(id), queryFn: ({ signal }) => booksApi.get(id, signal) });
}

export function useCreateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: BookDraft) => booksApi.create(draft),
    onSuccess: (created: Book) => {
      queryClient.setQueryData<Book[]>(bookKeys.list(), (current = []) => [...current, created]);
      void queryClient.invalidateQueries({ queryKey: bookKeys.list() });
    },
  });
}

export function useUpdateBook(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: BookDraft) => booksApi.update(id, draft),
    onSuccess: (updated: Book) => {
      queryClient.setQueryData(bookKeys.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: bookKeys.list() });
    },
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => booksApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: bookKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: bookKeys.list() });
    },
  });
}
