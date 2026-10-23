// fixture entry — מייבא את flagged.ts כדי שלא ייחשב יתום (מבודד את rule 6 מ-rule 1)
import { a, b, c } from "./flagged";

export const sum = a + b.length + c;
