// state.js — cover state plus undo / redo history. The state is plain JSON
// (photos live outside it, in the photo registry), so a snapshot is a clone.

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** A bounded undo/redo stack over cloned states. */
export class History {
  constructor(initial) {
    this.current = cloneState(initial);
    this.past = [];
    this.future = [];
  }

  /** Records a new state; identical states are not stacked twice. */
  push(next) {
    const snap = cloneState(next);
    if (JSON.stringify(snap) === JSON.stringify(this.current)) return false;
    this.past.push(this.current);
    if (this.past.length > 60) this.past.shift();
    this.current = snap;
    this.future = [];
    return true;
  }

  undo() {
    if (!this.past.length) return null;
    this.future.push(this.current);
    this.current = this.past.pop();
    return cloneState(this.current);
  }

  redo() {
    if (!this.future.length) return null;
    this.past.push(this.current);
    this.current = this.future.pop();
    return cloneState(this.current);
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
