/* הצהרות-סביבה לשירות-הכלכלה: bun-specific + תלות-השידור (steem) */
declare module "steem";

interface ImportMeta {
  /** bun: ספריית-הקובץ של-המודול (תחליף-נוח ל-dirname(import.meta.url)) */
  dir: string;
}
