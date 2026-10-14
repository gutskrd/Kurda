import { AppError } from '../plugins/errors.js';

/** One generic rejection for every anti-abuse check at signup — never reveals
 *  whether CAPTCHA, blocklist, the banned-address registry or anything else
 *  fired (KUR-025). Shared by password signup and social sign-in. */
export function signupRejected(): AppError {
  return new AppError('SIGNUP_REJECTED', 400, 'registration could not be completed');
}
