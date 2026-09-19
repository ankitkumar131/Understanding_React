// Project 6 — server state: query keys, one hook per operation, optimistic status changes.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from './api';
import type { Task, TaskDraft, TaskStatus } from '../../types';

export const taskKeys = {
  all: ['tasks'] as const,
  list: () => [...taskKeys.all, 'list'] as const,
};

export function useTasks() {
  return useQuery({ queryKey: taskKeys.list(), queryFn: ({ signal }) => tasksApi.list(signal) });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: TaskDraft) => tasksApi.create(draft),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: taskKeys.list() }); },
  });
}

export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => tasksApi.setStatus(id, status),
    // Optimistic: the UI changes immediately, and rolls back if the request fails.
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.list() });
      const previous = queryClient.getQueryData<Task[]>(taskKeys.list());
      queryClient.setQueryData<Task[]>(taskKeys.list(), (current = []) =>
        current.map((task) => (task.id === id ? { ...task, status } : task)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(taskKeys.list(), context.previous);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: taskKeys.list() }); },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: taskKeys.list() }); },
  });
}
