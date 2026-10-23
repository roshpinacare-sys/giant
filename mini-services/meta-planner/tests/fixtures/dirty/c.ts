import { a } from "./a";
import { todo } from "./todo";
import { leaked } from "./secret";
import { handled } from "./silent";
export const c = (): Record<string, unknown> => ({ a: a(), todo: todo(), leaked, handled: handled() });
