// Project 4 — the model shared by the API layer, the forms and the list.
export type BookStatus = 'available' | 'borrowed';

export interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  status: BookStatus;
}

export type BookDraft = Omit<Book, 'id'>;

export const emptyDraft: BookDraft = { title: '', author: '', year: new Date().getFullYear(), status: 'available' };

export interface ValidationErrors {
  title?: string;
  author?: string;
  year?: string;
  form?: string;
}

/** One validation function, used by the form (client) and testable on its own. */
export function validateDraft(draft: BookDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  if (draft.title.trim().length < 2) errors.title = 'Give the book a title of at least 2 characters.';
  if (draft.author.trim().length < 2) errors.author = 'Who wrote it? At least 2 characters.';
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(draft.year) || draft.year < 1400 || draft.year > currentYear + 1) {
    errors.year = `Enter a year between 1400 and ${currentYear + 1}.`;
  }
  return errors;
}
