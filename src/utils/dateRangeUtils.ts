/**
 * The window a schedule gets when nothing else specifies one: the 1st of the
 * current month through the following year. It lives beside the load path's
 * copy so a schedule created today and one read back from storage are always
 * measured against the same window.
 */
export { createDefaultWindow as createDefaultSectionDateRange } from './migrateLegacy';
