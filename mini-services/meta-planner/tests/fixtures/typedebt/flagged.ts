// fixture — סמני דיכוי-טיפוסים למבחן rule 6 (התוכן מילולי בכוונה; fixtures מוחרגים מהסריקה-העצמית)
// @ts-ignore
export const a: number = 1;

// @ts-expect-error
export const b: string = 2;

// @ts-nocheck
export const c = a + b.length;
