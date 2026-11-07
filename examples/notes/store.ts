// An enum and a class with a private field: TypeScript that needs a real transform, not just type removal.
export enum Priority {
  Low = "low",
  Normal = "normal",
  High = "high",
}

export interface Note {
  id: number;
  text: string;
  priority: Priority;
}

export class NoteStore {
  #notes: Note[] = [];

  add(input: Omit<Note, "id">): Note {
    const note = { id: this.#notes.length + 1, ...input };
    this.#notes.push(note);
    return note;
  }

  all(): readonly Note[] {
    return this.#notes;
  }
}
