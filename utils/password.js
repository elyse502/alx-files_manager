import { createHash } from 'crypto';

function hashPassword(password) {
  const hash = createHash('sha1').update(password).digest('hex');
  return hash;
}

function unHashPassword(hashedPassword) {
  return hashedPassword;
}

export { hashPassword, unHashPassword };
