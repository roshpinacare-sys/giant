// fixture — סמני דיכוי-טיפוסים למבחן rule 6 (התוכן מילולי בכוונה; fixtures מוחרגים מהסריקה-העצמית)
// @ts-ignore
export const a: number = 1;

// @ts-expect-error
export const b = 2 as unknown as string;

// @ts-nocheck
export const c = a + b;
