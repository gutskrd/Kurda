/**
 * Ids as a request may send them. Postgres reads a uuid in either letter case, but the code compares ids as strings (in
 * sets, maps and with ===) against the lower-case ids the database returns, so the same id spelled in upper case would
 * pass as somebody else and slip past a rule keyed on that person. Every id a client sends is read through `lowerUuid`.
 */
import { z } from 'zod';

/** A uuid in any letter case, read as its one lower-case spelling. */
export const lowerUuid = () => z.uuid().transform((id) => id.toLowerCase());
